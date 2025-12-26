package com.example.firefetch.ui.screens

import android.content.Intent
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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.firefetch.core.library.LibraryItemType
import com.example.firefetch.ui.vm.LibraryViewModel

@Composable
fun FilesScreen(vm: LibraryViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Files")

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = vm::refresh) { Text("Refresh") }
        }

        val files = state.items.filter { it.type != LibraryItemType.VIDEO }
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(files, key = { it.file.absolutePath }) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(item.file.name) },
                        supportingContent = {
                            val meta = if (item.file.isFile) {
                                "${item.type.name.lowercase()} • ${item.file.length() / 1024} KB"
                            } else {
                                item.type.name.lowercase()
                            }
                            Text(meta)
                        },
                        trailingContent = {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (item.file.isFile) {
                                    Button(onClick = {
                                        val uri = FileProvider.getUriForFile(
                                            context,
                                            "${context.packageName}.fileprovider",
                                            item.file
                                        )
                                        val intent = Intent(Intent.ACTION_VIEW).apply {
                                            setDataAndType(uri, context.contentResolver.getType(uri) ?: "*/*")
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                        context.startActivity(Intent.createChooser(intent, "Open with"))
                                    }) { Text("Open") }

                                    Button(onClick = {
                                        val uri = FileProvider.getUriForFile(
                                            context,
                                            "${context.packageName}.fileprovider",
                                            item.file
                                        )
                                        val intent = Intent(Intent.ACTION_SEND).apply {
                                            type = context.contentResolver.getType(uri) ?: "*/*"
                                            putExtra(Intent.EXTRA_STREAM, uri)
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                        context.startActivity(Intent.createChooser(intent, "Share"))
                                    }) { Text("Share") }
                                }
                                Button(onClick = { vm.delete(item) }) { Text("Delete") }
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}


