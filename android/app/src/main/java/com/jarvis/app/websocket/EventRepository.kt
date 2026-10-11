package com.jarvis.app.websocket

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import org.json.JSONObject

class EventRepository(context: Context) {
    val webSocket = JarvisWebSocket(context)

    init {
        webSocket.connect()
    }

    fun getTaskEvents(): Flow<JSONObject> {
        return webSocket.events
            .filter { it.optString("event").startsWith("task.") }
            .map { it.getJSONObject("data") }
    }

    fun getApprovalEvents(): Flow<JSONObject> {
        return webSocket.events
            .filter { it.optString("event").startsWith("approval.") }
            .map { it.getJSONObject("data") }
    }
    
    fun getNotificationEvents(): Flow<JSONObject> {
        return webSocket.events
            .filter { it.optString("event").startsWith("notification.") }
            .map { it.getJSONObject("data") }
    }

    fun getReconnectEvents(): Flow<Unit> {
        return webSocket.events
            .filter { it.optString("type") == "internal" && it.optString("event") == "websocket_reconnected" }
            .map { }
    }

    fun disconnect() {
        webSocket.disconnect()
    }
}
