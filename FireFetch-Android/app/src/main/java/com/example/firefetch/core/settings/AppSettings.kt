package com.example.firefetch.core.settings

data class AppSettings(
    val defaultQuality: String,
    val outputFormat: String,
    val saveMetadata: Boolean,
    val connections: Int,
    val segments: Int,
    val segmentSize: String,
    val autoPlay: Boolean,
    val cookieFilePath: String?,
    val maxConcurrentDownloads: Int,
    val queueEnabled: Boolean,
    val retryAttempts: Int,
    val retryDelayMs: Long,
    val torrentMaxConcurrent: Int,
) {
    companion object {
        val Defaults = AppSettings(
            defaultQuality = "best",
            outputFormat = "mp4",
            saveMetadata = true,
            connections = 16,
            segments = 16,
            segmentSize = "1M",
            autoPlay = false,
            cookieFilePath = null,
            maxConcurrentDownloads = 3,
            queueEnabled = true,
            retryAttempts = 2,
            retryDelayMs = 5_000L,
            torrentMaxConcurrent = 2,
        )
    }
}


