package com.jarvis.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.jarvis.app.ui.theme.JarvisAccent
import com.jarvis.app.ui.theme.JarvisPrimary

enum class OrbState {
    IDLE, THINKING, SPEAKING
}

@Composable
fun JarvisCoreOrb(state: OrbState = OrbState.IDLE, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition()
    
    val scale by transition.animateFloat(
        initialValue = 0.9f,
        targetValue = if (state == OrbState.IDLE) 1.0f else 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (state == OrbState.THINKING) 800 else 2000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

    val color = if (state == OrbState.THINKING) JarvisAccent else JarvisPrimary

    Box(modifier = modifier.size(200.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
        Canvas(modifier = Modifier.size(150.dp)) {
            val radius = (size.minDimension / 2) * scale
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(color.copy(alpha = 0.5f), Color.Transparent),
                    radius = radius
                ),
                radius = radius
            )
            drawCircle(
                color = color.copy(alpha = 0.8f),
                radius = radius * 0.4f
            )
            drawCircle(
                color = color.copy(alpha = 1f),
                radius = radius * 0.45f,
                style = Stroke(width = 2.dp.toPx())
            )
        }
    }
}
