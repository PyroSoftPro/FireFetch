package com.example.firefetch.ui.vm

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.firefetch.downloads.executors.NativeToolRunner
import com.yausername.aria2c.Aria2c
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class DependenciesUiState(
    val ytDlpVersion: String? = null,
    val ffmpegVersion: String? = null,
    val aria2cVersion: String? = null,
    val isUpdatingYtDlp: Boolean = false,
    val lastUpdateStatus: String? = null,
    val error: String? = null,
)

class DependenciesViewModel(app: Application) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(DependenciesUiState())
    val state: StateFlow<DependenciesUiState> = _state

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                // Ensure bundled packages are initialized (extract dependencies).
                YoutubeDL.getInstance().init(getApplication())
                FFmpeg.getInstance().init(getApplication())
                Aria2c.getInstance().init(getApplication())

                val yt = runCatching { YoutubeDL.getInstance().versionName(getApplication()) }.getOrNull()
                val ff = runCatching { readFirstLineOfTool("ffmpeg", "libffmpeg.so", listOf("-version")) }.getOrNull()
                val ar = runCatching { readFirstLineOfTool("aria2c", "libaria2c.so", listOf("--version")) }.getOrNull()

                _state.value = _state.value.copy(
                    ytDlpVersion = yt,
                    ffmpegVersion = ff,
                    aria2cVersion = ar,
                    error = null,
                )
            } catch (t: Throwable) {
                _state.value = _state.value.copy(error = t.message ?: "Failed to read versions")
            }
        }
    }

    fun updateYtDlpStable() {
        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(isUpdatingYtDlp = true, error = null, lastUpdateStatus = null)
            try {
                val status = YoutubeDL.getInstance().updateYoutubeDL(getApplication(), YoutubeDL.UpdateChannel._STABLE)
                _state.value = _state.value.copy(lastUpdateStatus = status?.name ?: "UNKNOWN")
                refresh()
            } catch (e: YoutubeDLException) {
                _state.value = _state.value.copy(error = e.message ?: "yt-dlp update failed")
            } finally {
                _state.value = _state.value.copy(isUpdatingYtDlp = false)
            }
        }
    }

    private suspend fun readFirstLineOfTool(toolName: String, libName: String, args: List<String>): String {
        return withContext(Dispatchers.IO) {
            val ctx = getApplication<Application>()
            val exe = File(ctx.applicationInfo.nativeLibraryDir, libName)
            val extraLibDir = when (toolName) {
                "ffmpeg" -> File(ctx.noBackupFilesDir, "youtubedl-android/packages/ffmpeg/usr/lib")
                "aria2c" -> File(ctx.noBackupFilesDir, "youtubedl-android/packages/aria2c/usr/lib")
                else -> null
            }
            var firstLine: String? = null
            NativeToolRunner.run(toolName, exe, extraLibDir, args) { line ->
                if (firstLine == null && line.isNotBlank()) firstLine = line.trim()
            }
            firstLine ?: "$toolName (no output)"
        }
    }
}


