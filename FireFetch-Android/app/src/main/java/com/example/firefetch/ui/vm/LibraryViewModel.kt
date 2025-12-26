package com.example.firefetch.ui.vm

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.firefetch.core.library.LibraryItem
import com.example.firefetch.core.library.LibraryItemType
import com.example.firefetch.core.library.LibraryRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class LibraryUiState(
    val items: List<LibraryItem> = emptyList(),
)

class LibraryViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = LibraryRepository(app)

    private val _state = MutableStateFlow(LibraryUiState())
    val state: StateFlow<LibraryUiState> = _state

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch(Dispatchers.IO) {
            _state.value = LibraryUiState(items = repo.scan())
        }
    }

    fun videos(): List<LibraryItem> = _state.value.items.filter { it.type == LibraryItemType.VIDEO }

    fun files(): List<LibraryItem> = _state.value.items.filter { it.type != LibraryItemType.VIDEO }

    fun delete(item: LibraryItem) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                if (item.file.isDirectory) item.file.deleteRecursively() else item.file.delete()
            }
            refresh()
        }
    }
}


