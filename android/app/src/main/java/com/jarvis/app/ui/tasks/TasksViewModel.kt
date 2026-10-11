package com.jarvis.app.ui.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jarvis.app.data.repository.TaskRepository
import com.jarvis.app.model.Task
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TasksViewModel(private val repository: TaskRepository) : ViewModel() {
    private val _tasks = MutableStateFlow<List<Task>>(emptyList())
    val tasks: StateFlow<List<Task>> = _tasks.asStateFlow()

    init {
        loadTasks()
        
        viewModelScope.launch {
            com.jarvis.app.JarvisApplication.eventRepository.getReconnectEvents().collect {
                // Resync state on reconnect
                loadTasks()
            }
        }
        
        viewModelScope.launch {
            com.jarvis.app.JarvisApplication.eventRepository.getTaskEvents().collect {
                // In a more complex app, update specific task. Here we just reload list.
                loadTasks()
            }
        }
    }

    fun loadTasks() {
        viewModelScope.launch {
            try {
                val list = repository.getTasks()
                _tasks.value = list
            } catch (e: Exception) {
                // handle error
            }
        }
    }

    fun cancelTask(id: String) {
        viewModelScope.launch {
            try {
                repository.cancelTask(id)
                loadTasks()
            } catch (e: Exception) {
                // handle error
            }
        }
    }
}
