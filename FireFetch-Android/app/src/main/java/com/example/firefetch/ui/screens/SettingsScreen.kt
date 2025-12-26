package com.example.firefetch.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.firefetch.ui.vm.DependenciesViewModel
import com.example.firefetch.ui.vm.SettingsViewModel

@Composable
fun SettingsScreen(vm: SettingsViewModel = viewModel()) {
    val settings by vm.settings.collectAsStateWithLifecycle()
    val depVm: DependenciesViewModel = viewModel()
    val depState by depVm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val cookiePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val name = runCatching {
            context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { c ->
                    val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
                }
        }.getOrNull()
        val input = context.contentResolver.openInputStream(uri) ?: return@rememberLauncherForActivityResult
        vm.importCookies(name, input)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Settings")

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Save metadata (.info.json)")
            Switch(
                checked = settings.saveMetadata,
                onCheckedChange = { checked -> vm.update { s -> s.copy(saveMetadata = checked) } }
            )
        }

        OutlinedTextField(
            value = settings.outputFormat,
            onValueChange = { vm.update { s -> s.copy(outputFormat = it) } },
            label = { Text("Output format (mp4/mkv/webm)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        OutlinedTextField(
            value = settings.maxConcurrentDownloads.toString(),
            onValueChange = { v ->
                v.toIntOrNull()?.let { n -> vm.update { s -> s.copy(maxConcurrentDownloads = n.coerceIn(1, 10)) } }
            },
            label = { Text("Max concurrent downloads") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        OutlinedTextField(
            value = settings.connections.toString(),
            onValueChange = { v ->
                v.toIntOrNull()?.let { n -> vm.update { s -> s.copy(connections = n.coerceIn(1, 32)) } }
            },
            label = { Text("Connections (aria2)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        OutlinedTextField(
            value = settings.segments.toString(),
            onValueChange = { v ->
                v.toIntOrNull()?.let { n -> vm.update { s -> s.copy(segments = n.coerceIn(1, 32)) } }
            },
            label = { Text("Segments (aria2)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        OutlinedTextField(
            value = settings.segmentSize,
            onValueChange = { v -> vm.update { s -> s.copy(segmentSize = v) } },
            label = { Text("Segment size (e.g. 1M, 512K)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        Text("Cookies: ${settings.cookieFilePath ?: "none"}")
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { cookiePicker.launch(arrayOf("text/plain", "text/*")) }) { Text("Import cookies.txt") }
            Button(onClick = vm::clearCookies, enabled = settings.cookieFilePath != null) { Text("Clear") }
        }

        Text("Dependencies")
        Text("yt-dlp: ${depState.ytDlpVersion ?: "—"}")
        Text("ffmpeg: ${depState.ffmpegVersion ?: "—"}")
        Text("aria2c: ${depState.aria2cVersion ?: "—"}")
        depState.error?.let { Text("Dependency error: $it") }
        depState.lastUpdateStatus?.let { Text("yt-dlp update: $it") }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = depVm::refresh, enabled = !depState.isUpdatingYtDlp) { Text("Refresh versions") }
            Button(onClick = depVm::updateYtDlpStable, enabled = !depState.isUpdatingYtDlp) {
                Text(if (depState.isUpdatingYtDlp) "Updating…" else "Update yt-dlp")
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = vm::reset) { Text("Reset to defaults") }
        }

        Text("Note: on Android 13+, you may need to grant notification permission for download progress notifications.")
        Text("Note: updating yt-dlp requires network access; ffmpeg/aria2c are bundled with the app.")
    }
}


