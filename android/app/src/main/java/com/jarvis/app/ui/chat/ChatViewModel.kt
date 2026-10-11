package com.jarvis.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.app.data.repository.ChatRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ChatMessageUi(
    val id: String,
    val isUser: Boolean,
    val content: String,
    val isLoading: Boolean = false
)

class ChatViewModel(private val repository: ChatRepository) : ViewModel() {
    private val _messages = MutableStateFlow<List<ChatMessageUi>>(emptyList())
    val messages: StateFlow<List<ChatMessageUi>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun sendMessage(text: String) {
        if (text.isBlank()) return
        
        val userMsg = ChatMessageUi(
            id = System.currentTimeMillis().toString(),
            isUser = true,
            content = text
        )
        
        val loadingMsg = ChatMessageUi(
            id = "loading",
            isUser = false,
            content = "Thinking...",
            isLoading = true
        )
        
        _messages.value = _messages.value + userMsg + loadingMsg
        _isLoading.value = true
        
        viewModelScope.launch {
            try {
                repository.sendMessage(text)
                // The WebSocket will push task progress and we will remove the loading message
                // For now just remove the loading message since the backend creates a task
                _messages.value = _messages.value.filter { it.id != "loading" }
                
                val aiMsg = ChatMessageUi(
                    id = System.currentTimeMillis().toString() + "_ai",
                    isUser = false,
                    content = "I have started working on your request. Check tasks for progress."
                )
                _messages.value = _messages.value + aiMsg
            } catch (e: Exception) {
                _messages.value = _messages.value.filter { it.id != "loading" }
                val errorMsg = ChatMessageUi(
                    id = System.currentTimeMillis().toString() + "_err",
                    isUser = false,
                    content = "Sorry, I encountered an error: ${e.message}"
                )
                _messages.value = _messages.value + errorMsg
            } finally {
                _isLoading.value = false
            }
        }
    }
}
