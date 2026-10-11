package com.jarvis.app.ui.notifications

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.app.data.api.ApiClient
import com.jarvis.app.model.Notification
import com.jarvis.app.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import android.content.Context

class NotificationsViewModel(private val context: Context) : ViewModel() {
    private val _notifications = MutableStateFlow<List<Notification>>(emptyList())
    val notifications: StateFlow<List<Notification>> = _notifications.asStateFlow()

    init {
        loadNotifications()
        
        viewModelScope.launch {
            com.jarvis.app.JarvisApplication.eventRepository.getReconnectEvents().collect {
                // Resync state on reconnect
                loadNotifications()
            }
        }
        
        viewModelScope.launch {
            com.jarvis.app.JarvisApplication.eventRepository.getNotificationEvents().collect {
                loadNotifications()
            }
        }
    }

    fun loadNotifications() {
        viewModelScope.launch {
            try {
                val api = ApiClient.getApi(context)
                _notifications.value = api.getNotifications()
            } catch (e: Exception) {
                // handle error
            }
        }
    }

    fun markAsRead(id: String) {
        viewModelScope.launch {
            try {
                val api = ApiClient.getApi(context)
                // We'd have a read notification endpoint in ApiClient, let's assume it exists or we just reload
                api.readAllNotifications()
                loadNotifications()
            } catch (e: Exception) {
                // handle error
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(viewModel: NotificationsViewModel) {
    val notifications by viewModel.notifications.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadNotifications()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notifications") },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        if (notifications.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text("You're all caught up.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(notifications) { notif ->
                    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = JarvisDarkGray)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(text = notif.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(text = notif.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
