package com.example.firefetch.ui.vm

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.firefetch.core.model.DownloadType
import com.example.firefetch.core.settings.SettingsRepository
import com.example.firefetch.downloads.DownloadQueueManager
import com.example.firefetch.downloads.DownloadServiceController
import com.example.firefetch.downloads.executors.SearchResult
import com.example.firefetch.downloads.executors.YtDlpExecutor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class SearchUiState(
    val query: String = "",
    val isLoading: Boolean = false,
    val results: List<SearchResult> = emptyList(),
    val error: String? = null,
)

class SearchViewModel(app: Application) : AndroidViewModel(app) {
    private val settingsRepo = SettingsRepository(app)
    private val queueManager = DownloadQueueManager.getInstance(app)
    private val ytDlp = YtDlpExecutor(app)

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state

    fun setQuery(q: String) {
        _state.value = _state.value.copy(query = q, error = null)
    }

    fun search() {
        val q = _state.value.query.trim()
        if (q.isBlank()) return

        viewModelScope.launch(Dispatchers.IO) {
            _state.value = _state.value.copy(isLoading = true, error = null, results = emptyList())
            try {
                val settings = settingsRepo.settingsFlow.first()
                val results = ytDlp.search(q, limit = 40, cookieFilePath = settings.cookieFilePath)
                _state.value = _state.value.copy(isLoading = false, results = results)
            } catch (t: Throwable) {
                _state.value = _state.value.copy(isLoading = false, error = t.message ?: "Search failed")
            }
        }
    }

    fun enqueue(result: SearchResult) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val url = result.webpageUrl ?: return@launch
                val settings = settingsRepo.settingsFlow.first()
                queueManager.enqueue(
                    url = url,
                    format = normalizeDefaultQuality(settings.defaultQuality),
                    title = result.title,
                    type = DownloadType.VIDEO,
                    thumbnailUrl = result.thumbnail,
                    webpageUrl = result.webpageUrl,
                    extractor = result.extractor,
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


