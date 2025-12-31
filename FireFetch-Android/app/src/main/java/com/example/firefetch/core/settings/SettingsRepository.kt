package com.example.firefetch.core.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "firefetch_settings")

class SettingsRepository(private val context: Context) {
    val settingsFlow: Flow<AppSettings> = context.dataStore.data.map { prefs ->
        AppSettings(
            defaultQuality = prefs[Keys.defaultQuality] ?: AppSettings.Defaults.defaultQuality,
            outputFormat = prefs[Keys.outputFormat] ?: AppSettings.Defaults.outputFormat,
            saveMetadata = prefs[Keys.saveMetadata] ?: AppSettings.Defaults.saveMetadata,
            connections = prefs[Keys.connections] ?: AppSettings.Defaults.connections,
            segments = prefs[Keys.segments] ?: AppSettings.Defaults.segments,
            segmentSize = prefs[Keys.segmentSize] ?: AppSettings.Defaults.segmentSize,
            autoPlay = prefs[Keys.autoPlay] ?: AppSettings.Defaults.autoPlay,
            cookieFilePath = prefs[Keys.cookieFilePath],
            maxConcurrentDownloads = prefs[Keys.maxConcurrentDownloads] ?: AppSettings.Defaults.maxConcurrentDownloads,
            queueEnabled = prefs[Keys.queueEnabled] ?: AppSettings.Defaults.queueEnabled,
            retryAttempts = prefs[Keys.retryAttempts] ?: AppSettings.Defaults.retryAttempts,
            retryDelayMs = prefs[Keys.retryDelayMs] ?: AppSettings.Defaults.retryDelayMs,
            torrentMaxConcurrent = prefs[Keys.torrentMaxConcurrent] ?: AppSettings.Defaults.torrentMaxConcurrent,
        )
    }

    suspend fun update(transform: (AppSettings) -> AppSettings) {
        context.dataStore.edit { prefs ->
            val current = prefs.toSettings()
            val next = transform(current)
            prefs[Keys.defaultQuality] = next.defaultQuality
            prefs[Keys.outputFormat] = next.outputFormat
            prefs[Keys.saveMetadata] = next.saveMetadata
            prefs[Keys.connections] = next.connections
            prefs[Keys.segments] = next.segments
            prefs[Keys.segmentSize] = next.segmentSize
            prefs[Keys.autoPlay] = next.autoPlay
            if (next.cookieFilePath == null) prefs.remove(Keys.cookieFilePath) else prefs[Keys.cookieFilePath] = next.cookieFilePath
            prefs[Keys.maxConcurrentDownloads] = next.maxConcurrentDownloads
            prefs[Keys.queueEnabled] = next.queueEnabled
            prefs[Keys.retryAttempts] = next.retryAttempts
            prefs[Keys.retryDelayMs] = next.retryDelayMs
            prefs[Keys.torrentMaxConcurrent] = next.torrentMaxConcurrent
        }
    }

    suspend fun resetToDefaults() {
        context.dataStore.edit { it.clear() }
    }

    private fun Preferences.toSettings(): AppSettings {
        return AppSettings(
            defaultQuality = this[Keys.defaultQuality] ?: AppSettings.Defaults.defaultQuality,
            outputFormat = this[Keys.outputFormat] ?: AppSettings.Defaults.outputFormat,
            saveMetadata = this[Keys.saveMetadata] ?: AppSettings.Defaults.saveMetadata,
            connections = this[Keys.connections] ?: AppSettings.Defaults.connections,
            segments = this[Keys.segments] ?: AppSettings.Defaults.segments,
            segmentSize = this[Keys.segmentSize] ?: AppSettings.Defaults.segmentSize,
            autoPlay = this[Keys.autoPlay] ?: AppSettings.Defaults.autoPlay,
            cookieFilePath = this[Keys.cookieFilePath],
            maxConcurrentDownloads = this[Keys.maxConcurrentDownloads] ?: AppSettings.Defaults.maxConcurrentDownloads,
            queueEnabled = this[Keys.queueEnabled] ?: AppSettings.Defaults.queueEnabled,
            retryAttempts = this[Keys.retryAttempts] ?: AppSettings.Defaults.retryAttempts,
            retryDelayMs = this[Keys.retryDelayMs] ?: AppSettings.Defaults.retryDelayMs,
            torrentMaxConcurrent = this[Keys.torrentMaxConcurrent] ?: AppSettings.Defaults.torrentMaxConcurrent,
        )
    }

    private object Keys {
        val defaultQuality = stringPreferencesKey("defaultQuality")
        val outputFormat = stringPreferencesKey("outputFormat")
        val saveMetadata = booleanPreferencesKey("saveMetadata")
        val connections = intPreferencesKey("connections")
        val segments = intPreferencesKey("segments")
        val segmentSize = stringPreferencesKey("segmentSize")
        val autoPlay = booleanPreferencesKey("autoPlay")
        val cookieFilePath = stringPreferencesKey("cookieFilePath")
        val maxConcurrentDownloads = intPreferencesKey("maxConcurrentDownloads")
        val queueEnabled = booleanPreferencesKey("queueEnabled")
        val retryAttempts = intPreferencesKey("retryAttempts")
        val retryDelayMs = longPreferencesKey("retryDelayMs")
        val torrentMaxConcurrent = intPreferencesKey("torrentMaxConcurrent")
    }
}






