# JARVIS 2.0 — Orchestrator Studio & Desktop Client (v2.1.2)

> **Milestone 1**: Autonomous Code Orchestration, Context Memory Integration, and Real-Time Desktop HUD.

---

## 🌟 Overview

The **JARVIS 2.0 Desktop Studio** is a high-performance desktop interface built on **Electron**, **React 19**, **Three.js**, and **Vite**. It provides human-in-the-loop oversight, real-time audio-reactive neural core visualization, multi-device companion management, and seamless dispatch to autonomous coding engines (OpenCode, Kilo CLI).

---

## ⚡ Core Features (Milestone 1)

### 1. OpenCode & Autonomous Coding Orchestrator
- **Two-Gate Approval Architecture**:
  - **Gate 1 (Plan Review)**: Interactive review of multi-phase architecture plans generated with recent conversation context and semantic vector memory.
  - **Gate 2 (Terminal Authorization)**: Operator confirmation before launching external coding CLI instances in real Windows terminal sessions.
- **SpecPromptEngine**: Multi-stage prompt synthesis engine equipped with 45-second adaptive inference timeouts and zero-cost local fallback cascades (Gemini Flash $\rightarrow$ Ollama Qwen 3.5).
- **Live Terminal Bridge**: Automatically opens and directs tasks to OpenCode / Kilo CLI in native console windows.

### 2. Context & Persistent Memory Retention
- Seamlessly injects the 10 most recent conversation messages and vector memory search results directly into the autonomous brainstorming loop.
- Cross-session memory and directive registers ensure the orchestrator never loses context between prompts.

### 3. Chat Resilience & Watchdog Protection
- **Automatic Question Disambiguation**: Informational questions are answered immediately without triggering project locking.
- **Safety Watchdog Timer**: 35-second automated release protects against UI input deadlocks.
- **Manual Override**: Dedicated **"(Cancel / Unlock)"** and **Dismiss [X]** controls allow instant release of any active waiting state.

### 4. Audio-Reactive Holographic HUD
- **32-bit Interactive Three.js NeuralCore**: Visualizes voice synthesis, listening status, and AI thought processes.
- **Global Desktop Tray & Hotkey**: Press <kbd>Alt</kbd>+<kbd>J</kbd> or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Space</kbd> anytime to summon or dismiss the HUD window.
- **Session-Aware Vision**: Real-time retina screen capture using `DesktopRetinaCapture` for multimodal reasoning.

---

## 🛠️ Development & Build

### Prerequisites
- Node.js 22+ (LTS)
- npm 10+
- Running JARVIS 2.0 backend (`http://127.0.0.1:8787/api/v1`)

### Scripts

```bash
# 1. Install dependencies
npm install

# 2. Build for production (TypeScript + Vite)
npm run build

# 3. Launch Electron Desktop Client
npm run desktop

# 4. Run Vite development server (hot-reload)
npm run dev

# 5. Lint codebase
npm run lint
```

---

## 📂 Architecture Directory Map

```text
ui/src/
├── api/             # REST & WebSocket client with Bearer device token auth
├── components/
│   ├── Architecture/# Synaptic Neural Graph visualizer
│   ├── Devices/     # Android Telephony Bridge & device manager
│   ├── Layout/      # Navigation, top bar, and holographic frame
│   ├── NeuralCore/  # Three.js 3D audio-reactive neural sphere & gesture controller
│   └── Runtime/     # Desktop vision preview and system briefing modal
├── hooks/           # useVoice, useSpeech, and WebSocket hooks
├── pages/
│   ├── AI.tsx       # Model routing, zero-cost limits, and provider status
│   ├── Chat.tsx     # Chat interface with embedded Orchestration cards
│   ├── Devices.tsx  # Paired devices, remote companion QR code, telephony
│   ├── Home.tsx     # Central holographic HUD & quick action dock
│   ├── Runtime.tsx  # System logs, process monitor, job queue
│   └── Settings.tsx # Audio, security, hotkeys, and app version
├── services/        # Sound effects and offline wake word listeners
└── store/           # Zustand centralized state management
```

---

## 📄 Versioning

- **Release**: `v2.1.2`
- **Milestone**: `Milestone 1`
- **Backend Compatibility**: JARVIS Core `^2.1.2`
