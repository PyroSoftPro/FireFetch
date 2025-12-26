package com.example.firefetch.ui.vm

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.firefetch.core.settings.AppSettings
import com.example.firefetch.core.settings.SettingsRepository
import com.example.firefetch.core.storage.DownloadPaths
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File
import java.io.InputStream

class SettingsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = SettingsRepository(app)

    val settings = repo.settingsFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings.Defaults)

    fun update(transform: (AppSettings) -> AppSettings) {
        viewModelScope.launch(Dispatchers.IO) { repo.update(transform) }
    }

    fun reset() {
        viewModelScope.launch(Dispatchers.IO) { repo.resetToDefaults() }
    }

    fun importCookies(filenameHint: String?, input: InputStream) {
        viewModelScope.launch(Dispatchers.IO) {
            val dir = DownloadPaths.getCookiesDir(getApplication())
            val name = filenameHint?.takeIf { it.isNotBlank() } ?: "cookies.txt"
            val out = File(dir, name)
            input.use { ins ->
                out.outputStream().use { outs -> ins.copyTo(outs) }
            }
            repo.update { it.copy(cookieFilePath = out.absolutePath) }
        }
    }

    fun clearCookies() {
        viewModelScope.launch(Dispatchers.IO) {
            repo.update { it.copy(cookieFilePath = null) }
        }
    }
}


