package com.example.firefetch.ui.vm

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.firefetch.core.model.DownloadType
import com.example.firefetch.core.settings.SettingsRepository
import com.example.firefetch.downloads.DownloadQueueManager
import com.example.firefetch.downloads.DownloadServiceController
import com.example.firefetch.downloads.executors.VideoInfoResult
import com.example.firefetch.downloads.executors.VideoFormat
import com.example.firefetch.downloads.executors.YtDlpExecutor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class FormatOption(
    val label: String,
    /**
     * Encodes how to build the yt-dlp `-f` selection:
     * - best
     * - height:720
     * - id:137
     */
    val spec: String,
)

data class HomeUiState(
    val url: String = "",
    val mode: DownloadType = DownloadType.VIDEO,
    val selectedFormatSpec: String = "best",
    val formatOptions: List<FormatOption> = listOf(
        FormatOption("Best (auto)", "best"),
        FormatOption("1080p (cap)", "height:1080"),
        FormatOption("720p (cap)", "height:720"),
        FormatOption("480p (cap)", "height:480"),
        FormatOption("360p (cap)", "height:360"),
    ),
    val isLoading: Boolean = false,
    val info: VideoInfoResult? = null,
    val error: String? = null,
)

class HomeViewModel(app: Application) : AndroidViewModel(app) {
    private val settingsRepo = SettingsRepository(app)
    private val queueManager = DownloadQueueManager.getInstance(app)
    private val ytDlp = YtDlpExecutor(app)

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    init {
        viewModelScope.launch(Dispatchers.IO) {
            val settings = settingsRepo.settingsFlow.first()
            _state.value = _state.value.copy(
                selectedFormatSpec = normalizeDefaultQuality(settings.defaultQuality)
            )
        }
    }

    fun setUrl(url: String) {
        val detected = when {
            url.startsWith("magnet:") -> DownloadType.MAGNET
            url.lowercase().endsWith(".torrent") -> DownloadType.TORRENT
            else -> _state.value.mode
        }
        _state.value = _state.value.copy(url = url, mode = detected, error = null)
    }

    fun setMode(mode: DownloadType) {
        _state.value = _state.value.copy(mode = mode, error = null)
    }

    fun setFormatSpec(spec: String) {
        _state.value = _state.value.copy(selectedFormatSpec = spec)
    }

    fun fetchInfo() {
        val url = _state.value.url.trim()
        if (url.isBlank()) return

        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(isLoading = true, error = null, info = null)
            try {
                val settings = settingsRepo.settingsFlow.first()
                val info = ytDlp.videoInfo(url, settings.cookieFilePath)
                val options = buildFormatOptions(info.formats)
                val current = _state.value.selectedFormatSpec
                val nextSelected = options.firstOrNull { it.spec == current }?.spec ?: options.first().spec
                _state.value = _state.value.copy(
                    isLoading = false,
                    info = info,
                    formatOptions = options,
                    selectedFormatSpec = nextSelected,
                )
            } catch (t: Throwable) {
                _state.value = _state.value.copy(isLoading = false, error = t.message ?: "Failed to fetch info")
            }
        }
    }

    fun enqueueDownload() {
        val url = _state.value.url.trim()
        if (url.isBlank()) return

        viewModelScope.launch(Dispatchers.IO) {
            try {
                val mode = _state.value.mode
                val info = _state.value.info
                val format = when (mode) {
                    DownloadType.VIDEO -> _state.value.selectedFormatSpec
                    else -> null
                }
                queueManager.enqueue(
                    url = url,
                    format = format,
                    title = info?.title,
                    type = mode,
                    thumbnailUrl = info?.thumbnail,
                    webpageUrl = info?.webpageUrl,
                    extractor = info?.extractor,
                )
                DownloadServiceController.ensureRunning(getApplication())
            } catch (t: Throwable) {
                _state.value = _state.value.copy(error = t.message ?: "Failed to start download")
            }
        }
    }
}

private fun normalizeDefaultQuality(q: String): String {
    val trimmed = q.trim()
    return if (trimmed.matches(Regex("^\\d+$"))) "height:$trimmed" else "best"
}

private fun buildFormatOptions(formats: List<VideoFormat>): List<FormatOption> {
    val base = mutableListOf(
        FormatOption("Best (auto)", "best"),
        FormatOption("1080p (cap)", "height:1080"),
        FormatOption("720p (cap)", "height:720"),
        FormatOption("480p (cap)", "height:480"),
        FormatOption("360p (cap)", "height:360"),
    )

    // Show a small curated list of actual format IDs (pre-merged first, then video-only).
    val candidates = formats
        .asSequence()
        .filter { it.formatId.isNotBlank() }
        .filter { (it.vcodec ?: "none") != "none" } // ignore audio-only here
        .sortedWith(
            compareByDescending<VideoFormat> { (it.acodec ?: "none") != "none" } // pre-merged first
                .thenByDescending { it.height ?: 0 }
                .thenByDescending { it.tbr ?: 0.0 }
        )
        .take(12)
        .toList()

    candidates.forEach { f ->
        val isMerged = (f.acodec ?: "none") != "none"
        val height = f.height?.let { "${it}p" } ?: (f.resolution ?: "unknown")
        val ext = f.ext ?: "—"
        val note = f.formatNote?.let { " ($it)" }.orEmpty()
        val prefix = if (isMerged) "Merged" else "Video+Audio"
        val spec = if (isMerged) {
            // Pre-merged format already has audio.
            "id:${f.formatId}"
        } else {
            // Video-only: force best audio so output is playable and can be merged.
            "idv:${f.formatId}"
        }
        base.add(FormatOption("$prefix $height • $ext • id:${f.formatId}$note", spec))
    }

    return base
}


