package com.example.firefetch.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.firefetch.core.model.DownloadType
import com.example.firefetch.ui.vm.HomeViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: HomeViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current

    var typeMenuExpanded by remember { mutableStateOf(false) }
    var qualityMenuExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = state.url,
                onValueChange = vm::setUrl,
                label = { Text("URL / Magnet / Torrent URL") },
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                singleLine = true,
            )
            IconButton(onClick = {
                val text = clipboard.getText()?.text ?: return@IconButton
                vm.setUrl(text)
            }) {
                Icon(Icons.Default.ContentPaste, contentDescription = "Paste")
            }
            IconButton(onClick = { vm.setUrl("") }) {
                Icon(Icons.Default.Delete, contentDescription = "Clear")
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            ExposedDropdownMenuBox(
                expanded = typeMenuExpanded,
                onExpandedChange = { typeMenuExpanded = !typeMenuExpanded },
                modifier = Modifier.weight(1f)
            ) {
                OutlinedTextField(
                    readOnly = true,
                    value = state.mode.name.lowercase(),
                    onValueChange = {},
                    label = { Text("Type") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeMenuExpanded) },
                    modifier = Modifier.menuAnchor().fillMaxWidth()
                )
                DropdownMenu(
                    expanded = typeMenuExpanded,
                    onDismissRequest = { typeMenuExpanded = false },
                ) {
                    DownloadType.entries.forEach { t ->
                        DropdownMenuItem(
                            text = { Text(t.name.lowercase()) },
                            onClick = {
                                typeMenuExpanded = false
                                vm.setMode(t)
                            }
                        )
                    }
                }
            }

            ExposedDropdownMenuBox(
                expanded = qualityMenuExpanded,
                onExpandedChange = { qualityMenuExpanded = !qualityMenuExpanded },
                modifier = Modifier.weight(1f)
            ) {
                OutlinedTextField(
                    readOnly = true,
                    value = state.formatOptions.firstOrNull { it.spec == state.selectedFormatSpec }?.label ?: "Best (auto)",
                    onValueChange = {},
                    label = { Text("Quality / Format") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = qualityMenuExpanded) },
                    modifier = Modifier.menuAnchor().fillMaxWidth(),
                    enabled = state.mode == DownloadType.VIDEO
                )
                DropdownMenu(
                    expanded = qualityMenuExpanded,
                    onDismissRequest = { qualityMenuExpanded = false },
                ) {
                    state.formatOptions.forEach { opt ->
                        DropdownMenuItem(
                            text = { Text(opt.label) },
                            onClick = {
                                qualityMenuExpanded = false
                                vm.setFormatSpec(opt.spec)
                            }
                        )
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = vm::fetchInfo, enabled = !state.isLoading) {
                Text("Fetch info")
            }
            Button(onClick = vm::enqueueDownload, enabled = !state.isLoading && state.url.isNotBlank()) {
                Text("Download")
            }
        }

        if (state.isLoading) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(modifier = Modifier.height(24.dp))
                Text("Working…")
            }
        }

        state.error?.let {
            Text("Error: $it")
        }

        state.info?.let { info ->
            Spacer(modifier = Modifier.height(8.dp))
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (!info.thumbnail.isNullOrBlank()) {
                        AsyncImage(
                            model = info.thumbnail,
                            contentDescription = "Thumbnail",
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    Text(info.title ?: "—")
                    Text("Extractor: ${info.extractor ?: "—"}")
                    Text("Formats: ${info.formats.size}")
                }
            }
        }
    }
}


