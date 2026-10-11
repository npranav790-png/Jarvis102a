package com.jarvis.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import com.jarvis.app.ui.theme.JarvisTheme
import com.jarvis.app.navigation.JarvisNavGraph

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Draw behind system bars
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
        setContent {
            JarvisTheme {
                JarvisNavGraph()
            }
        }
    }
}
