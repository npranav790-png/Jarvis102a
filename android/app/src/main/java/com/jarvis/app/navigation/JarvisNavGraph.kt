package com.jarvis.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.jarvis.app.data.repository.ApprovalRepository
import com.jarvis.app.data.repository.ChatRepository
import com.jarvis.app.data.repository.TaskRepository
import com.jarvis.app.ui.approvals.ApprovalsScreen
import com.jarvis.app.ui.approvals.ApprovalsViewModel
import com.jarvis.app.ui.chat.ChatScreen
import com.jarvis.app.ui.chat.ChatViewModel
import com.jarvis.app.ui.home.HomeScreen
import com.jarvis.app.ui.home.HomeViewModel
import com.jarvis.app.ui.tasks.TasksScreen
import com.jarvis.app.ui.tasks.TasksViewModel

import com.jarvis.app.ui.notifications.NotificationsScreen
import com.jarvis.app.ui.notifications.NotificationsViewModel
import com.jarvis.app.ui.settings.SettingsScreen
import com.jarvis.app.ui.settings.SettingsViewModel

@Composable
fun JarvisNavGraph() {
    val navController = rememberNavController()
    val context = LocalContext.current

    val homeViewModel = remember { HomeViewModel(context) }
    val chatViewModel = remember { ChatViewModel(ChatRepository(context)) }
    val tasksViewModel = remember { TasksViewModel(TaskRepository(context)) }
    val approvalsViewModel = remember { ApprovalsViewModel(ApprovalRepository(context)) }
    val notificationsViewModel = remember { NotificationsViewModel(context) }
    val settingsViewModel = remember { SettingsViewModel(context) }

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(
                viewModel = homeViewModel,
                onNavigateToChat = { navController.navigate("chat") },
                onNavigateToTasks = { navController.navigate("tasks") },
                onNavigateToApprovals = { navController.navigate("approvals") },
                onNavigateToNotifications = { navController.navigate("notifications") },
                onNavigateToSettings = { navController.navigate("settings") }
            )
        }
        composable("chat") {
            ChatScreen(viewModel = chatViewModel)
        }
        composable("tasks") {
            TasksScreen(viewModel = tasksViewModel)
        }
        composable("approvals") {
            ApprovalsScreen(viewModel = approvalsViewModel)
        }
        composable("notifications") {
            NotificationsScreen(viewModel = notificationsViewModel)
        }
        composable("settings") {
            SettingsScreen(viewModel = settingsViewModel, onLogout = { navController.navigate("home") })
        }
    }
}
