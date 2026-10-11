# JARVIS 2.0 — Android Application Reference

## 1. Architecture & Tech Stack

The JARVIS Android Application is written natively in Kotlin with modern Android architectural components:

* **UI Framework**: Jetpack Compose + Material 3 Dark Theme
* **Architecture**: Single-Activity, Navigation Compose, MVI/MVVM ViewModel state holders
* **Networking**:
  * **REST**: Retrofit 2 + OkHttp 4 with Moshi / Kotlinx Serialization
  * **Real-Time**: OkHttp WebSocket with exponential backoff & jitter reconnection
* **Security & Storage**: AndroidX Security (`EncryptedSharedPreferences`) + Jetpack DataStore Preferences
* **Coroutines & Concurrency**: Kotlin Coroutines + `StateFlow` reactive streams

---

## 2. Screens & Features

1. **Pairing Screen**: 6-digit numeric pairing code entry with server URL configuration and validation.
2. **Home Dashboard**: System health overview, active background tasks, urgent pending approvals, recent notifications, quick actions.
3. **Chat Screen**: Real-time conversational AI streaming, intent visualization, execution cards.
4. **Tasks Screen**: Real-time status cards (`CREATED`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`), retry and cancellation triggers.
5. **Approvals Screen**: Interactive human-in-the-loop approval gatekeeper. Displays action details, risk level badge (`HIGH`, `CRITICAL`), target path/command, and One-Tap Approve/Deny buttons.
6. **Notifications Screen**: Notification center with category badges and mark-as-read toggles.
7. **Settings Screen**: Backend host/port configuration, connection test utility, privacy mode selection, device revocation / logout.

---

## 3. WebSocket Resilience & Offline-First Strategy

* **Exponential Backoff**: Base delay 1s, backoff multiplier 1.5, max backoff 30s.
* **Jitter**: 15% random variance preventing reconnection stampedes on network recovery.
* **State Resynchronization**: Upon WebSocket reconnection, the client automatically queries REST `/tasks`, `/approvals`, and `/notifications` to ensure UI state is 100% consistent with the server.
* **Graceful Offline State**: Visual indicator displaying `DISCONNECTED` with background retry; no infinite polling loops.

---

## 4. Build Configurations

* **Package ID**: `com.jarvis.app`
* **Min SDK**: API 26 (Android 8.0 Oreo)
* **Target SDK / Compile SDK**: API 34 (Android 14)
* **Version Code**: 1
* **Version Name**: 2.0.0
* **Build Types**:
  * `debug`: Full logging, local cleartext LAN connectivity enabled via `network_security_config.xml`.
  * `release`: R8 Proguard minified and optimized (2.4 MB APK). Requires user signing keystore for production distribution.
