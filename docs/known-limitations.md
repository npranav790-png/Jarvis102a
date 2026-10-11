# JARVIS 2.0 — Known Limitations & Scope Boundaries

## 1. Scope Boundaries & Current Status

### 1.1 Voice Pipeline Status
* **Voice Abstractions**: `SUPPORTED` (Standardized interfaces in `src/voice/types.ts`, `src/voice/registry.ts`, and Android Audio recording permissions in `AndroidManifest.xml`).
* **Full End-to-End Microphone → STT → Brain → TTS Pipeline**: `PARTIALLY IMPLEMENTED`
  * Mock and registry infrastructure are functional.
  * Native local Whisper STT and Coqui/Piper TTS integration remain deferred as optional future enhancements and are not part of the core zero-cost release mandate.

### 1.2 Deployment Scope
* **Local LAN & Workstation**: `FULLY SUPPORTED & VERIFIED`
* **Direct Public Internet Exposure**: `NOT SUPPORTED / NOT RECOMMENDED` without a dedicated reverse proxy (Nginx/Caddy) and TLS termination.

### 1.3 Android Release Signing
* **Debug APK**: `BUILD SUCCESSFUL & VERIFIED` (Generated at `android/app/build/outputs/apk/debug/app-debug.apk`, 10.15 MB).
* **Release APK**: `BUILD SUCCESSFUL & MINIFIED` (Generated at `android/app/build/outputs/apk/release/app-release-unsigned.apk`, 2.4 MB).
  * Requires user signing credentials / keystore for Google Play Store publication. Keystore credentials are intentionally not bundled.

### 1.4 AI Model Context Window
* Context budgeting is capped at configured limits (`maxContextTokens = 8192` by default) to ensure local models (e.g. Llama-3-8B on Ollama) operate without GPU out-of-memory errors.
