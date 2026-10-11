package com.jarvis.app.ui.approvals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.app.data.repository.ApprovalRepository
import com.jarvis.app.model.Approval
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ApprovalsViewModel(private val repository: ApprovalRepository) : ViewModel() {
    private val _approvals = MutableStateFlow<List<Approval>>(emptyList())
    val approvals: StateFlow<List<Approval>> = _approvals.asStateFlow()

    init {
        loadApprovals()
        
        viewModelScope.launch {
            com.jarvis.app.JarvisApplication.eventRepository.getReconnectEvents().collect {
                // Resync state on reconnect
                loadApprovals()
            }
        }
        
        viewModelScope.launch {
            com.jarvis.app.JarvisApplication.eventRepository.getApprovalEvents().collect {
                loadApprovals()
            }
        }
    }

    fun loadApprovals() {
        viewModelScope.launch {
            try {
                val list = repository.getApprovals()
                _approvals.value = list
            } catch (e: Exception) {
                // handle error
            }
        }
    }

    fun approve(id: String) {
        viewModelScope.launch {
            try {
                repository.approve(id)
                loadApprovals()
            } catch (e: Exception) {
                // handle error
            }
        }
    }

    fun deny(id: String) {
        viewModelScope.launch {
            try {
                repository.deny(id)
                loadApprovals()
            } catch (e: Exception) {
                // handle error
            }
        }
    }
}
