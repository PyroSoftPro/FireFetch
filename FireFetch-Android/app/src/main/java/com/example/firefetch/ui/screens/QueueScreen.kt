package com.example.firefetch.ui.screens

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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.firefetch.core.model.DownloadStatus
import com.example.firefetch.ui.vm.QueueViewModel

private enum class QueueTab { ACTIVE, QUEUED, COMPLETED, FAILED, CANCELLED, ALL }

@Composable
fun QueueScreen(vm: QueueViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()

    var tab by remember { mutableStateOf(QueueTab.ACTIVE) }

    val all = state.active + state.queued + state.failed + state.completed + state.cancelled
    val filtered = when (tab) {
        QueueTab.ACTIVE -> state.active
        QueueTab.QUEUED -> state.queued
        QueueTab.COMPLETED -> state.completed
        QueueTab.FAILED -> state.failed
        QueueTab.CANCELLED -> state.cancelled
        QueueTab.ALL -> all
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Queued: ${state.queuedCount} • Active: ${state.activeCount} • Completed: ${state.completedCount} • Failed: ${state.failedCount}")

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            Button(onClick = vm::pause) { Text("Pause") }
            Button(onClick = vm::resume) { Text("Resume") }
            Button(onClick = vm::retryFailed) { Text("Retry failed") }
            Button(onClick = vm::clearCompleted) { Text("Clear completed") }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            FilterChip(selected = tab == QueueTab.ACTIVE, onClick = { tab = QueueTab.ACTIVE }, label = { Text("Active") })
            FilterChip(selected = tab == QueueTab.QUEUED, onClick = { tab = QueueTab.QUEUED }, label = { Text("Queued") })
            FilterChip(selected = tab == QueueTab.COMPLETED, onClick = { tab = QueueTab.COMPLETED }, label = { Text("Done") })
            FilterChip(selected = tab == QueueTab.FAILED, onClick = { tab = QueueTab.FAILED }, label = { Text("Failed") })
            FilterChip(selected = tab == QueueTab.ALL, onClick = { tab = QueueTab.ALL }, label = { Text("All") })
        }

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(filtered, key = { it.id }) { job ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(job.title) },
                        supportingContent = {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("${job.type.name.lowercase()} • ${job.status.name.lowercase()}")
                                if (job.status != DownloadStatus.COMPLETED && job.status != DownloadStatus.FAILED && job.status != DownloadStatus.CANCELLED) {
                                    LinearProgressIndicator(progress = { job.progress / 100f }, modifier = Modifier.fillMaxWidth())
                                    Text("${job.progress}%  ${job.speed ?: ""}  ${job.eta ?: ""}".trim())
                                }
                                job.error?.let { Text("Error: $it") }
                            }
                        },
                        trailingContent = {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                when (job.status) {
                                    DownloadStatus.FAILED -> Button(onClick = { vm.retry(job.id) }) { Text("Retry") }
                                    DownloadStatus.COMPLETED, DownloadStatus.CANCELLED -> Button(onClick = { vm.remove(job.id) }) { Text("Remove") }
                                    else -> Button(onClick = { vm.cancel(job.id) }) { Text("Cancel") }
                                }
                            }
                        }
                    )
                }
            }
        }
    }
}


