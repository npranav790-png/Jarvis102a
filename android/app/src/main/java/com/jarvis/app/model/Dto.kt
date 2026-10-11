package com.jarvis.app.model

import kotlinx.serialization.Serializable

@Serializable
data class PairStartResponse(
    val pairingId: String,
    val code: String,
    val expiresAt: String
)

@Serializable
data class DeviceMeta(
    val name: String,
    val platform: String,
    val appVersion: String? = null
)

@Serializable
data class PairCompleteRequest(
    val pairingId: String,
    val code: String,
    val device: DeviceMeta
)

@Serializable
data class PairCompleteResponse(
    val deviceId: String,
    val accessToken: String,
    val refreshToken: String
)

@Serializable
data class RefreshTokenRequest(
    val refreshToken: String
)

@Serializable
data class RuntimeStatus(
    val state: String,
    val uptime: Double,
    val activeJobs: Int,
    val queuedJobs: Int,
    val activeAutomations: Int,
    val pendingApprovals: Int,
    val voiceAvailable: Boolean,
    val schedulerRunning: Boolean,
    val workersHealthy: Boolean,
    val databaseHealthy: Boolean
)

@Serializable
data class Task(
    val id: String,
    val title: String,
    val description: String? = null,
    val type: String,
    val status: String,
    val priority: Int,
    val createdAt: String,
    val startedAt: String? = null,
    val completedAt: String? = null
)

@Serializable
data class Approval(
    val id: String,
    val taskId: String,
    val action: String,
    val resource: String,
    val riskLevel: String,
    val expiresAt: String,
    val status: String,
    val reason: String? = null
)

@Serializable
data class Notification(
    val id: String,
    val type: String,
    val title: String,
    val body: String,
    val priority: String,
    val createdAt: String,
    val readAt: String? = null
)

@Serializable
data class ChatRequest(
    val message: String,
    val sessionId: String? = null,
    val mode: String = "STANDARD"
)

@Serializable
data class ChatResponse(
    val requestId: String,
    val sessionId: String?,
    val taskId: String,
    val jobId: String,
    val status: String
)

@Serializable
data class SuccessResponse(
    val success: Boolean
)
