package com.example.firefetch.core.library

import java.io.File

enum class LibraryItemType {
    VIDEO,
    FILE,
    DIRECTORY,
}

data class LibraryItem(
    val file: File,
    val type: LibraryItemType,
    val sizeBytes: Long?,
    val modifiedEpochMs: Long,
)






