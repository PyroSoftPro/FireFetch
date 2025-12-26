package com.example.firefetch.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.firefetch.ui.vm.SearchViewModel

@Composable
fun SearchScreen(vm: SearchViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = state.query,
                onValueChange = vm::setQuery,
                label = { Text("Search (YouTube)") },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
            Button(onClick = vm::search, enabled = !state.isLoading) {
                Text("Search")
            }
        }

        if (state.isLoading) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator()
                Text("Searching…")
            }
        }

        state.error?.let { Text("Error: $it") }
        if (!state.isLoading && state.error == null && state.results.isEmpty() && state.query.isNotBlank()) {
            Text("No results.")
        }

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(state.results) { r ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(r.title ?: "—") },
                        supportingContent = { Text(listOfNotNull(r.uploader, r.durationSeconds?.let { "${it / 60}m${it % 60}s" }).joinToString(" • ")) },
                        leadingContent = {
                            if (!r.thumbnail.isNullOrBlank()) {
                                AsyncImage(
                                    model = r.thumbnail,
                                    contentDescription = "Thumbnail",
                                    modifier = Modifier
                                        .padding(vertical = 8.dp)
                                )
                            }
                        },
                        trailingContent = {
                            Button(onClick = { vm.enqueue(r) }) { Text("Download") }
                        }
                    )
                }
            }
        }
    }
}


