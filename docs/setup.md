# JARVIS 2.0 — Setup & Quickstart Guide

## 1. System Requirements

* **Operating System**: Windows 10/11, macOS (Apple Silicon or Intel), or Linux (Ubuntu 22.04+)
* **Node.js**: v22.0.0 or higher (Node v24 recommended)
* **Android Development (Optional)**: JDK 17, Android SDK API 34 (Android 8.0+ / API 26 minimum device target)
* **Local AI (Optional, Recommended)**: [Ollama](https://ollama.ai) with `llama3:8b` or `phi3:mini`

---

## 2. Backend Installation & Startup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Copy the template configuration file:
```bash
cp .env.example .env
```
Default configuration is pre-configured for 100% zero-cost operation and SQLite database persistence at `data/jarvis.db`.

### Step 3: Build Backend TypeScript
```bash
npm run build
```

### Step 4: Run Tests
Verify all 172 backend tests pass:
```bash
npm test
```

### Step 5: Start the JARVIS Backend
```bash
npm start
```
By default, the REST API & WebSocket server listens on:
* REST API: `http://127.0.0.1:8787/api/v1`
* WebSocket: `ws://127.0.0.1:8787/api/v1/ws`
* Health Check: `http://127.0.0.1:8787/api/v1/health`

---

## 3. Android Application Setup

### Step 1: Clean Build
Open a terminal in the `android/` directory:
```bash
cd android
./gradlew clean assembleDebug
```
The debug APK is output to:
`android/app/build/outputs/apk/debug/app-debug.apk`

### Step 2: Install APK to Android Device
Connect your Android phone or start an emulator:
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Pairing & First-Run Connection

1. Launch JARVIS on your mobile device.
2. In Settings or on the Pair screen, enter your PC's IP address (e.g., `http://192.168.1.50:8787/api/v1`).
3. Tap **Generate Pairing Code** on your backend CLI:
   ```bash
   node dist/cli/bin.js auth pair
   ```
4. Enter the 6-digit code on your Android device.
5. Once paired, your device securely stores the token in hardware-backed encrypted storage and opens the Home dashboard!
