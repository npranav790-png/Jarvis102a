package com.jarvis.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = JarvisPrimary,
    secondary = JarvisSecondary,
    tertiary = JarvisAccent,
    background = JarvisBlack,
    surface = JarvisDarkGray,
    surfaceVariant = JarvisGray,
    onPrimary = JarvisBlack,
    onSecondary = JarvisBlack,
    onTertiary = JarvisBlack,
    onBackground = JarvisWhite,
    onSurface = JarvisWhite,
    onSurfaceVariant = JarvisLightGray,
    error = JarvisError
)

@Composable
fun JarvisTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = DarkColorScheme
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
