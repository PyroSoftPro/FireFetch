package com.example.firefetch.core.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "download_jobs")
data class DownloadJobEntity(
    @PrimaryKey val id: String,
    val url: String,
    val format: String?,
    val title: String,
    val status: String,
    val progress: Int,
    val speed: String?,
    val eta: String?,
    val size: String?,
    val error: String?,
    val retryCount: Int,
    val addedAtEpochMs: Long,
    val startedAtEpochMs: Long?,
    val completedAtEpochMs: Long?,
    val type: String,
    val thumbnailUrl: String?,
    val webpageUrl: String?,
    val extractor: String?,
    val peers: Int,
    val uploadSpeed: String?,
    val ratio: Double?,
    val queuePosition: Long,
)


