package com.jarvis.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.app.auth.AuthRepository
import com.jarvis.app.data.local.TokenManager
import android.content.Context
import kotlinx.coroutines.launch

class SettingsViewModel(private val context: Context) : ViewModel() {
    val tokenManager = TokenManager(context)
    val authRepository = AuthRepository(context)

    fun logout() {
        authRepository.logout()
    }

    fun updateServerUrl(url: String) {
        authRepository.setServerUrl(url)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onLogout: () -> Unit) {
    var serverUrl by remember { mutableStateOf(viewModel.tokenManager.getServerUrl() ?: "") }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Text("Connection", style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server URL") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = { viewModel.updateServerUrl(serverUrl) }) {
                Text("Save")
            }
            Spacer(modifier = Modifier.weight(1f))
            Button(onClick = { 
                viewModel.logout()
                onLogout()
            }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) {
                Text("Logout / Revoke Device")
            }
        }
    }
}
