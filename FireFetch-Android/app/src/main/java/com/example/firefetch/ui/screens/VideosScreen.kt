package com.example.firefetch.ui.screens

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.compose.ui.viewinterop.AndroidView
import com.example.firefetch.core.library.LibraryItemType
import com.example.firefetch.ui.vm.LibraryViewModel
import java.io.File

@Composable
fun VideosScreen(vm: LibraryViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var playing by remember { mutableStateOf<File?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            Text("Videos")
            Button(onClick = vm::refresh) { Text("Refresh") }
        }

        val videos = state.items.filter { it.type == LibraryItemType.VIDEO }
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(videos, key = { it.file.absolutePath }) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(item.file.name) },
                        supportingContent = { Text("${item.file.length() / (1024 * 1024)} MB") },
                        trailingContent = { Button(onClick = { playing = item.file }) { Text("Play") } }
                    )
                }
            }
        }
    }

    playing?.let { file ->
        val uri: Uri = file.toUri()
        val player = remember(uri) {
            ExoPlayer.Builder(context).build().apply {
                setMediaItem(MediaItem.fromUri(uri))
                prepare()
                playWhenReady = true
            }
        }
        DisposableEffect(player) {
            onDispose { player.release() }
        }

        androidx.compose.material3.AlertDialog(
            onDismissRequest = { playing = null },
            confirmButton = { Button(onClick = { playing = null }) { Text("Close") } },
            title = { Text(file.name) },
            text = {
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply { this.player = player }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        )
    }
}


