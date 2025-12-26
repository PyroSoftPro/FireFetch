package com.example.firefetch.core.library

import android.content.Context
import com.example.firefetch.core.storage.DownloadPaths
import java.io.File

class LibraryRepository(private val context: Context) {
    private val videoExt = setOf(
        "mp4", "mkv", "webm", "avi", "mov", "wmv", "flv", "m4v", "3gp", "ts", "mpg", "mpeg", "vob"
    )

    fun downloadDir(): File = DownloadPaths.getDownloadDir(context)

    fun scan(): List<LibraryItem> {
        val dir = downloadDir()
        val children = dir.listFiles()?.toList().orEmpty()
        return children
            .filter { it.name != ".tmp" }
            .filterNot { shouldHideFromLibrary(it) }
            .map { f ->
                val type = when {
                    f.isDirectory -> LibraryItemType.DIRECTORY
                    isVideo(f) -> LibraryItemType.VIDEO
                    else -> LibraryItemType.FILE
                }
                LibraryItem(
                    file = f,
                    type = type,
                    sizeBytes = if (f.isFile) f.length() else null,
                    modifiedEpochMs = f.lastModified(),
                )
            }
            .sortedByDescending { it.modifiedEpochMs }
    }

    private fun isVideo(file: File): Boolean {
        val ext = file.extension.lowercase()
        return ext in videoExt
    }

    private fun shouldHideFromLibrary(file: File): Boolean {
        if (file.isDirectory) return false
        val name = file.name.lowercase()
        val ext = file.extension.lowercase()

        // Hide partial/in-progress outputs and metadata sidecars.
        if (ext in setOf("part", "ytdl", "aria2", "tmp")) return true
        if (name.endsWith(".info.json")) return true
        if (name.endsWith(".description")) return true
        if (name.endsWith(".vtt") || name.endsWith(".srt") || name.endsWith(".ass")) return false // subtitles are useful
        return false
    }
}


