package com.jarvis.app

import android.app.Application

import com.jarvis.app.websocket.EventRepository

class JarvisApplication : Application() {
    companion object {
        lateinit var eventRepository: EventRepository
            private set
    }

    override fun onCreate() {
        super.onCreate()
        eventRepository = EventRepository(this)
    }
}
