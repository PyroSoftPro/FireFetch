package com.example.firefetch.core.model

enum class DownloadType {
    VIDEO,
    FILE,
    TORRENT,
    MAGNET,
}

enum class DownloadStatus {
    QUEUED,
    STARTING,
    DOWNLOADING,
    PROCESSING,
    RETRYING,
    COMPLETED,
    FAILED,
    CANCELLED,
}

data class DownloadJob(
    val id: String,
    val url: String,
    val format: String?,
    val title: String,
    val status: DownloadStatus,
    val progress: Int,
    val speed: String?,
    val eta: String?,
    val size: String?,
    val error: String?,
    val retryCount: Int,
    val addedAtEpochMs: Long,
    val startedAtEpochMs: Long?,
    val completedAtEpochMs: Long?,
    val type: DownloadType,
    val thumbnailUrl: String?,
    val webpageUrl: String?,
    val extractor: String?,
    val peers: Int,
    val uploadSpeed: String?,
    val ratio: Double?,
    val queuePosition: Long,
)

data class QueueState(
    val queued: List<DownloadJob>,
    val active: List<DownloadJob>,
    val completed: List<DownloadJob>,
    val failed: List<DownloadJob>,
    val cancelled: List<DownloadJob>,
) {
    val queuedCount: Int get() = queued.size
    val activeCount: Int get() = active.size
    val completedCount: Int get() = completed.size
    val failedCount: Int get() = failed.size
}






