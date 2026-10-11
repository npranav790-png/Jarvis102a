# JARVIS 2.0 — System Architecture

## 1. High-Level Architecture Overview

JARVIS 2.0 is an autonomous personal AI operating and orchestration system designed for zero-cost operation, local privacy, and reliable client-server orchestration.

```text
                         JARVIS 2.0
                              │
                ┌─────────────┴─────────────┐
                │                           │
          Android Client              Backend Runtime
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

---

## 2. Core Subsystems

### 2.1 Brain & Orchestration Layer (`src/brain/`)
* **Intent Classification (`src/brain/intent.ts`)**: Fast-path conversational routing vs multi-step plan decomposition.
* **Context Engine (`src/brain/context/context-engine.ts`)**: Dynamic token budgeting and strict XML untrusted boundary encapsulation.
* **Planning Engine (`src/brain/planner.ts`)**: Directed Acyclic Graph (DAG) generation, dependency tracking, step validation.
* **Reasoning Engine (`src/brain/reasoning.ts`)**: Hypothesis evaluation, counterfactual analysis, step-by-step decision tracing.
* **Verification Engine (`src/brain/verification.ts`)**: Evaluates tool execution evidence against success criteria (`VERIFIED`, `FAILED`, `PARTIALLY_VERIFIED`).
* **Replan Manager (`src/brain/replan.ts`)**: Loop prevention limiting automated replans (`maxReplans = 3`).

### 2.2 Memory Subsystem (`src/brain/memory/`)
* **Memory Repository (`src/database/repository.ts`)**: Persistent semantic, episodic, working, user preference, and project memory.
* **Memory Sanitizer (`src/brain/memory/sanitizer.ts`)**: Regex and pattern-based blocking of API keys, private keys, passwords, and tokens.
* **Project Isolation**: Cross-project memory firewall guaranteeing Project A data is invisible to Project B searches.
* **Semantic Consolidation**: Reinforces existing items and supersedes outdated preferences.

### 2.3 AI Provider & Model Router Layer (`src/providers/`)
* **Zero-Cost Hard Enforcement**: Rejects paid providers at registry boundary (`CostLimitExceededError`).
* **Capability-Aware Router (`src/providers/router.ts`)**: Evaluates speed, context window, JSON support, tool support, and privacy mode (`LOCAL_ONLY`, `PREFER_LOCAL`, `ALLOW_CLOUD`).
* **AIService Execution Pipeline (`src/providers/ai-service.ts`)**: Automatic fallback when primary provider is degraded or rate-limited.

### 2.4 Autonomous Agents & Secure Tools (`src/agents/`, `src/tools/`, `src/mcp/`)
* **Specialized Agents**: General, Coding, Research, Analysis, Automation agents.
* **Tool Registry & Builtin Tools**: Filesystem, Process, Git, Code Test with sandbox enforcement.
* **Filesystem Sandbox (`src/security/sandbox.ts`)**: Prevents directory traversal (`../`), alternate data streams, and device file escapes.
* **Model Context Protocol (MCP)**: Dynamic tool discovery and subprocess isolation.

### 2.5 Security & Approval Gatekeeper (`src/security/`)
* **Security Policy (`src/security/policy.ts`)**: Category-based risk assessment (`READ`=LOW, `WRITE`=MEDIUM, `EXECUTE`=HIGH, `DESTRUCTIVE`=CRITICAL).
* **Approval Manager (`src/security/approval-manager.ts`)**: Interactive mobile human-in-the-loop approval, expiration validation, replay attack prevention.
* **Audit Logger (`src/security/audit.ts`)**: Append-only tamper-evident SQLite audit logs.

### 2.6 Runtime, Jobs, Automation & Reminders (`src/runtime/`)
* **Job Queue (`src/runtime/jobs/queue.ts`)**: Durable priority-based SQLite job queue with retries and exponential backoff.
* **Scheduler (`src/runtime/jobs/scheduler.ts`)**: Cron and interval scheduler.
* **Automation Engine (`src/runtime/automation/engine.ts`)**: Event-driven automation rules.
* **Reminder Service (`src/runtime/reminders/service.ts`)**: Time-delayed reminder scheduling and dispatch.

### 2.7 API & Real-Time WebSocket (`src/api/`)
* **REST Router (`src/api/router.ts`)**: Express REST endpoints with rate-limiting middleware.
* **Auth Service (`src/api/auth/service.ts`)**: 6-digit device pairing, SHA-256 code hashing, HMAC token signing, revocation tracking.
* **WebSocket Server (`src/api/websocket/server.ts`)**: Real-time event broadcasting, ping/pong keepalive, duplicate socket eviction.

### 2.8 Native Android Client (`android/app/`)
* **Modern UI**: Jetpack Compose, Material 3, Dark Theme glassmorphic design.
* **Offline-First Networking**: Retrofit REST client + OkHttp WebSocket with exponential backoff & jitter reconnect.
* **Encrypted Storage**: AndroidX Security EncryptedSharedPreferences for tokens and device ID.

### 2.9 Voice Subsystem & Gemini Cloud Voice (`src/voice/`)
* **Voice Registry & Provider Architecture (`src/voice/registry.ts`)**: Modular registry with strict zero-cost enforcement and fallback handling.
* **Google Gemini Cloud TTS (`src/voice/providers/gemini-tts.ts`)**: Low-latency neural synthesis via `gemini-3.8-flash-lite-tts` and voice `Charon`.
* **VoiceDirector Engine (`src/voice/director.ts`)**: Context-aware emotional delivery, pacing, delivery style classification, and text sanitization.
* **Barge-In Interruption (`src/voice/service.ts`)**: Mid-speech playback cancellation transitioning `SPEAKING` -> `INTERRUPTED` -> `LISTENING`.
* **Realtime Voice Readiness (`src/voice/types.ts`)**: `IRealtimeVoiceProvider` abstraction prepared for future bidirectional Gemini Live integration.
* **Detailed Architecture**: See [docs/VOICE_GEMINI_ARCHITECTURE.md](file:///c:/Users/TUF/OneDrive/Desktop/Jarvis%202.0/docs/VOICE_GEMINI_ARCHITECTURE.md).

