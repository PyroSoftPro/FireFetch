package com.example.firefetch

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import com.yausername.aria2c.Aria2c
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException

class FireFetchApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        initBundledTools()
        createNotificationChannels()
    }

    private fun initBundledTools() {
        try {
            YoutubeDL.getInstance().init(this)
            FFmpeg.getInstance().init(this)
            Aria2c.getInstance().init(this)
        } catch (e: YoutubeDLException) {
            Log.e(TAG, "Failed to initialize bundled tools", e)
        } catch (t: Throwable) {
            Log.e(TAG, "Unexpected error initializing bundled tools", t)
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            DOWNLOADS_CHANNEL_ID,
            "Downloads",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "FireFetch download progress"
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val DOWNLOADS_CHANNEL_ID = "firefetch_downloads"
        private const val TAG = "FireFetchApplication"
    }
}


