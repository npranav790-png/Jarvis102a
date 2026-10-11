package com.jarvis.app.websocket

import android.content.Context
import android.util.Log
import com.jarvis.app.data.local.TokenManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class JarvisWebSocket(private val context: Context) {
    private var client: OkHttpClient? = null
    private var webSocket: WebSocket? = null
    private val tokenManager = TokenManager(context)
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private val _events = MutableSharedFlow<JSONObject>(extraBufferCapacity = 64)
    val events = _events.asSharedFlow()

    private var isConnected = false
    private var shouldReconnect = true
    
    fun connect() {
        val serverUrl = tokenManager.getServerUrl()?.replace("http", "ws") ?: "ws://10.0.2.2:8787/api/v1/"
        val wsUrl = if (serverUrl.endsWith("/")) "${serverUrl}ws" else "$serverUrl/ws"
        
        client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
            
        val request = Request.Builder()
            .url(wsUrl)
            .build()
            
        webSocket = client?.newWebSocket(request, createListener())
    }

    private fun createListener() = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            isConnected = true
            reconnectAttempts = 0
            Log.d("JarvisWS", "Connected to WebSocket")
            
            // Authenticate
            val token = tokenManager.getAccessToken()
            if (token != null) {
                val authMsg = JSONObject().apply {
                    put("type", "command")
                    put("command", "authenticate")
                    put("data", JSONObject().put("token", token))
                }
                webSocket.send(authMsg.toString())
            }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val json = JSONObject(text)
                val type = json.optString("type")
                
                if (type == "event" && json.optString("event") == "authenticated") {
                    Log.d("JarvisWS", "Authenticated! Subscribing to channels...")
                    // Subscribe to channels
                    val subMsg = JSONObject().apply {
                        put("type", "command")
                        put("command", "subscribe")
                        put("data", JSONObject().put("channels", org.json.JSONArray(listOf("tasks", "jobs", "approvals", "notifications", "voice"))))
                    }
                    webSocket.send(subMsg.toString())
                    
                    // Emit internal event for ViewModels to resync REST state
                    scope.launch {
                        _events.emit(JSONObject().apply {
                            put("type", "internal")
                            put("event", "websocket_reconnected")
                        })
                    }
                } else if (type == "event") {
                    scope.launch {
                        _events.emit(json)
                    }
                }
            } catch (e: Exception) {
                Log.e("JarvisWS", "Error parsing message", e)
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            isConnected = false
            Log.d("JarvisWS", "WebSocket Closed: $reason")
            handleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            isConnected = false
            Log.e("JarvisWS", "WebSocket Failure", t)
            handleReconnect()
        }
    }

    private var reconnectAttempts = 0
    private val maxReconnectDelay = 60000L // 1 minute max

    private fun handleReconnect() {
        if (!shouldReconnect) return
        
        reconnectAttempts++
        val baseDelay = (1000L * Math.pow(2.0, reconnectAttempts.coerceAtMost(10).toDouble())).toLong()
        val jitter = (Math.random() * 1000).toLong()
        val delayTime = (baseDelay + jitter).coerceAtMost(maxReconnectDelay)
        
        Log.d("JarvisWS", "Reconnecting in ${delayTime}ms (Attempt $reconnectAttempts)")
        
        scope.launch {
            delay(delayTime)
            connect()
        }
    }

    fun disconnect() {
        shouldReconnect = false
        webSocket?.close(1000, "User disconnected")
        client?.dispatcher?.executorService?.shutdown()
    }
}
