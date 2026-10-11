package com.jarvis.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.app.data.api.ApiClient
import com.jarvis.app.model.RuntimeStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import android.content.Context

class HomeViewModel(private val context: Context) : ViewModel() {
    private val _status = MutableStateFlow<RuntimeStatus?>(null)
    val status: StateFlow<RuntimeStatus?> = _status.asStateFlow()

    fun loadStatus() {
        viewModelScope.launch {
            try {
                val api = ApiClient.getApi(context)
                _status.value = api.getRuntimeStatus()
            } catch (e: Exception) {
                // handle error
            }
        }
    }
}
