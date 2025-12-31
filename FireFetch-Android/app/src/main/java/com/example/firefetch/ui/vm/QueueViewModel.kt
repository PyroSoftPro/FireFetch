package com.example.firefetch.ui.vm

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.firefetch.downloads.DownloadQueueManager
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class QueueViewModel(app: Application) : AndroidViewModel(app) {
    private val queue = DownloadQueueManager.getInstance(app)

    val state = queue.state.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), queue.state.value)

    fun pause() {
        viewModelScope.launch { queue.pauseQueue() }
    }

    fun resume() {
        viewModelScope.launch { queue.resumeQueue() }
    }

    fun reorder(fromIndex: Int, toIndex: Int) {
        viewModelScope.launch { queue.reorderQueued(fromIndex, toIndex) }
    }

    fun cancel(id: String) {
        viewModelScope.launch { queue.cancel(id) }
    }

    fun retry(id: String) {
        viewModelScope.launch { queue.retry(id) }
    }

    fun remove(id: String) {
        viewModelScope.launch { queue.remove(id) }
    }

    fun clearCompleted() {
        viewModelScope.launch { queue.clearCompletedAndCancelled() }
    }

    fun retryFailed() {
        viewModelScope.launch { queue.retryAllFailed() }
    }
}






