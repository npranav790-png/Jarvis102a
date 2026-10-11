# JARVIS 2.0 — Autonomous Personal AI Operating & Orchestration System

**JARVIS 2.0** is an autonomous, zero-cost, local-first personal AI operating system and orchestration platform. It is engineered from scratch to provide multi-step task planning, controlled sandboxed tool execution, persistent semantic memory, durable event-driven automations, real-time WebSocket communication, and an Android mobile client with interactive human-in-the-loop approvals.

---

## 🌟 Release Status: Final Release Candidate (v2.0.0)

```text
                         JARVIS 2.0
                              │
                ┌─────────────┴─────────────┐
                │                           │
          Android Client              Backend Runtime
         (Compose/M3/MVI)         (Node 24 / SQLite / TS)
                │                           │
       ┌────────┼────────┐          ┌───────┼────────┐
       │        │        │          │       │        │
     REST   WebSocket  Secure     Brain   Runtime   API
                      Storage       │       │        │
                                    │       │        │
                              ┌─────┴───┐   │   Auth/Security
                              │         │   │
                           Memory    Planning
                              │         │
                              └────┬────┘
                                   │
                                Agents
                                   │
                                 Tools
                              ┌────┴────┐
                              │         │
                            MCP      Approval
                              │         │
                              └────┬────┘
                                   │
                              Verification
                                   │
                              Model Router
                                   │
                     ┌─────────────┴─────────────┐
                     │                           │
                  Local AI                  Free AI
                 (Ollama)             (Groq/HF/OpenRouter)
```

| Subsystem | Status | Verification Details |
|---|---|---|
| **Core & Storage** | ✅ **VERIFIED** | Embedded SQLite (`node:sqlite`) with WAL mode, transactions, schema migrations |
| **Brain & Reasoning** | ✅ **VERIFIED** | Intent routing, planning DAGs, hypothesis reasoning, verification engine |
| **Memory & Safety** | ✅ **VERIFIED** | Hybrid semantic vector memory (text-embedding-004), deduplication, conflict resolution, secret filtering |
| **AI Model Router** | ✅ **VERIFIED** | Capability-aware model routing, fallback cascades, zero-cost hard enforcement ($0/₹0) |
| **Agents & Tools** | ✅ **VERIFIED** | Specialized agents (General, Coding, Research, Analysis, Automation), filesystem sandbox, MCP |
| **Security & Approvals**| ✅ **VERIFIED** | Human-in-the-loop approval gatekeeper, replay defense, audit logging |
| **Runtime & Automations**| ✅ **VERIFIED** | Priority job queue, cron scheduler, event triggers, time-delayed reminders |
| **REST & WebSocket API**| ✅ **VERIFIED** | Express v5 REST API, 6-digit device pairing, HMAC tokens, real-time WebSocket sync |
| **Android Application** | ✅ **VERIFIED** | Native Jetpack Compose UI, EncryptedSharedPreferences, exponential backoff with jitter |
| **Automated Test Suite**| ✅ **VERIFIED** | **210 / 210 backend tests passing (100%)**, Android unit tests passing |

---

## 🚀 Quick Start Guide

### 1. Backend Setup

```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Configure environment ($0 / ₹0 free defaults)
cp .env.example .env

# 4. Run full test suite
npm test

# 5. Start JARVIS Backend
npm start
```
* **REST API**: `http://127.0.0.1:8787/api/v1`
* **WebSocket**: `ws://127.0.0.1:8787/api/v1/ws`
* **Health Check**: `http://127.0.0.1:8787/api/v1/health`

### 2. Android Mobile App Setup

```bash
cd android
# Build debug APK
./gradlew assembleDebug

# Install on connected device/emulator
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 3. Device Pairing Flow

1. Open JARVIS app on Android.
2. In the terminal running the backend, generate a 6-digit pairing code:
   ```bash
   node dist/cli/bin.js auth pair
   ```
3. Enter the 6-digit pairing code on your Android device.
4. The device is securely registered, authenticated, and synced in real-time!

---

## 🔒 Security & Zero-Cost Guarantees

1. **Zero-Cost Hard Guarantee ($0 / ₹0 Mandatory Cost)**: `ALLOW_PAID_PROVIDERS=false` prevents accidental billing. Works 100% offline with local Ollama or with verified free-tier providers (Groq, OpenRouter free models, Hugging Face free tier).
2. **Intelligence Never Grants Authority**: Dangerous operations (`EXECUTE`, `DESTRUCTIVE`) trigger mandatory human approval on the mobile app or CLI before execution.
3. **Sandbox & Boundary Protection**: Untrusted web/MCP inputs are wrapped in strict XML tags; file paths are securely resolved to prevent directory breakout.
4. **Replay & Injection Defenses**: Single-use pairing codes, HMAC signed tokens, approval replay locks, and token expiration checks.

---

## 📚 Documentation Index

* [System Architecture](docs/architecture.md)
* [Setup & Installation Guide](docs/setup.md)
* [Android Application Guide](docs/android.md)
* [REST & WebSocket API Reference](docs/api.md)
* [Security, Hardening & Privacy](docs/security.md)
* [Deployment Modes](docs/deployment.md)
* [Troubleshooting Guide](docs/troubleshooting.md)
* [Backup & Disaster Recovery](docs/backup-recovery.md)
* [Testing & QA Suite](docs/testing.md)
* [Known Limitations & Scope](docs/known-limitations.md)

---

## 📄 License

Licensed under the Apache License, Version 2.0.
