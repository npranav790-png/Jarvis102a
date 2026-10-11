package com.jarvis.app.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jarvis.app.ui.components.JarvisCoreOrb
import com.jarvis.app.ui.components.OrbState
import com.jarvis.app.ui.theme.JarvisDarkGray
import com.jarvis.app.ui.theme.JarvisPrimary
import com.jarvis.app.ui.theme.JarvisSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onNavigateToChat: () -> Unit,
    onNavigateToTasks: () -> Unit,
    onNavigateToApprovals: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val status by viewModel.status.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadStatus()
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(32.dp))
            
            Text(
                text = "JARVIS",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            
            Text(
                text = "Good evening, User",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(48.dp))

            // Main Orb
            JarvisCoreOrb(state = OrbState.IDLE, modifier = Modifier.size(250.dp))

            Spacer(modifier = Modifier.weight(1f))

            // Status Dashboard
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = JarvisDarkGray)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("System Status", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    val runtimeState = status?.state ?: "CONNECTING..."
                    val runtimeColor = if (runtimeState == "RUNNING") JarvisSecondary else JarvisPrimary
                    
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Runtime", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(runtimeState, color = runtimeColor, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Active Tasks", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${status?.activeJobs ?: 0}", color = MaterialTheme.colorScheme.onSurface)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Pending Approvals", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${status?.pendingApprovals ?: 0}", color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Quick Actions
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                Button(onClick = onNavigateToChat) { Text("Chat") }
                Button(onClick = onNavigateToTasks) { Text("Tasks") }
                Button(onClick = onNavigateToApprovals) { Text("Approvals") }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                Button(onClick = onNavigateToNotifications) { Text("Notifs") }
                Button(onClick = onNavigateToSettings) { Text("Settings") }
            }
        }
    }
}
