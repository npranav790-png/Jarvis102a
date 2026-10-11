package com.jarvis.app.auth

import android.content.Context
import com.jarvis.app.data.api.ApiClient
import com.jarvis.app.data.local.TokenManager
import com.jarvis.app.model.DeviceMeta
import com.jarvis.app.model.PairCompleteRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AuthRepository(private val context: Context) {
    private val tokenManager = TokenManager(context)
    private val api = ApiClient.getApi(context)

    fun hasValidSession(): Boolean {
        return tokenManager.getAccessToken() != null
    }

    fun setServerUrl(url: String) {
        tokenManager.saveServerUrl(url)
    }

    suspend fun startPairing(): com.jarvis.app.model.PairStartResponse {
        return withContext(Dispatchers.IO) {
            api.startPairing()
        }
    }

    suspend fun completePairing(pairingId: String, code: String) {
        withContext(Dispatchers.IO) {
            val deviceMeta = DeviceMeta(
                name = android.os.Build.MODEL,
                platform = "android",
                appVersion = "1.0"
            )
            val response = api.completePairing(PairCompleteRequest(pairingId, code, deviceMeta))
            tokenManager.saveTokens(response.deviceId, response.accessToken, response.refreshToken)
        }
    }

    fun logout() {
        tokenManager.clear()
    }
}
