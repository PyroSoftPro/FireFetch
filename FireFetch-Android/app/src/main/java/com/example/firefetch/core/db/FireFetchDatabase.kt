package com.example.firefetch.core.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [DownloadJobEntity::class],
    version = 1,
    exportSchema = false
)
abstract class FireFetchDatabase : RoomDatabase() {
    abstract fun downloadJobDao(): DownloadJobDao

    companion object {
        @Volatile private var INSTANCE: FireFetchDatabase? = null

        fun getInstance(context: Context): FireFetchDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    FireFetchDatabase::class.java,
                    "firefetch.db"
                ).build().also { INSTANCE = it }
            }
        }
    }
}


