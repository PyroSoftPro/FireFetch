package com.example.firefetch

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.ExperimentalMaterial3AdaptiveNavigationSuiteApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.PreviewScreenSizes
import com.example.firefetch.ui.screens.FilesScreen
import com.example.firefetch.ui.screens.HomeScreen
import com.example.firefetch.ui.screens.QueueScreen
import com.example.firefetch.ui.screens.SearchScreen
import com.example.firefetch.ui.screens.SettingsScreen
import com.example.firefetch.ui.screens.VideosScreen
import com.example.firefetch.ui.theme.FireFetchTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            FireFetchTheme {
                FireFetchApp()
            }
        }
    }
}

@PreviewScreenSizes
@OptIn(ExperimentalMaterial3AdaptiveNavigationSuiteApi::class, ExperimentalMaterial3Api::class)
@Composable
fun FireFetchApp() {
    var currentDestination by rememberSaveable { mutableStateOf(AppDestination.HOME) }

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            AppDestination.entries.forEach {
                item(
                    icon = {
                        Icon(
                            it.icon,
                            contentDescription = it.label
                        )
                    },
                    label = { Text(it.label) },
                    selected = it == currentDestination,
                    onClick = { currentDestination = it }
                )
            }
        }
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = {
                TopAppBar(
                    title = { Text("FireFetch") },
                    colors = TopAppBarDefaults.topAppBarColors()
                )
            }
        ) { innerPadding ->
            Box(modifier = Modifier.padding(innerPadding)) {
                when (currentDestination) {
                    AppDestination.HOME -> HomeScreen()
                    AppDestination.SEARCH -> SearchScreen()
                    AppDestination.QUEUE -> QueueScreen()
                    AppDestination.VIDEOS -> VideosScreen()
                    AppDestination.FILES -> FilesScreen()
                    AppDestination.SETTINGS -> SettingsScreen()
                }
            }
        }
    }
}

enum class AppDestination(
    val label: String,
    val icon: ImageVector,
) {
    HOME("Home", Icons.Default.Home),
    SEARCH("Search", Icons.Default.Search),
    QUEUE("Queue", Icons.Default.Download),
    VIDEOS("Videos", Icons.Default.VideoLibrary),
    FILES("Files", Icons.Default.Folder),
    SETTINGS("Settings", Icons.Default.Settings),
}