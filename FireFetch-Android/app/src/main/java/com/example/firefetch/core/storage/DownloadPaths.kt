package com.example.firefetch.core.storage

import android.content.Context
import android.os.Environment
import java.io.File

object DownloadPaths {
    /**
     * We intentionally use a real filesystem path (not SAF URIs) because the bundled tools
     * expect POSIX-like file paths.
     */
    fun getDownloadDir(context: Context): File {
        val base = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            ?: context.filesDir
        return File(base, "firefetch-downloads").apply { mkdirs() }
    }

    fun getCookiesDir(context: Context): File {
        return File(context.filesDir, "cookies").apply { mkdirs() }
    }
}






