# JARVIS 2.0 — OpenCode & Kilobyte (Kilo Code) Orchestrator Subsystem

## 1. Executive Summary

JARVIS 2.0 functions as a **High-Level Orchestrator & AI Architect**. While traditional AI assistants attempt to execute small code snippets directly or lack project-level context, JARVIS operates as an autonomous engineering director that:

1. **Receives the Objective**: Takes high-level commands from the user via text, voice, or mobile.
2. **Researches the Repository**: Dynamically scans the target workspace for manifests (`package.json`, `tsconfig.json`, `Cargo.toml`, etc.), tech stack dependencies, and relevant source files.
3. **Brainstorms the Architecture**: Analyzes edge cases, determines architectural decisions, identifies affected components, and formulates a validation strategy.
4. **Engineers the Agent Prompt**: Formulates an exhaustive, structured prompt formatted specifically for autonomous coding engines like **OpenCode** (`opencode run`) and **Kilo Code / Kilobyte** (`kilo run`).
5. **Enforces Human-in-the-Loop Approval**: Pauses at an approval gate (`AWAITING_APPROVAL`) where the developer can inspect, edit, and approve the engineered prompt before any file modifications occur.
6. **Dispatches to OpenCode / Kilo Code**: Launches the selected CLI engine in the target workspace, streaming terminal execution logs over WebSocket in real time.
7. **Captures and Verifies the Solution**: Collects git status and git diffs, verifies outputs, and reports the completed solution to the user visually and vocally.

---

## 2. Orchestration Pipeline

```text
User Command (Voice / UI / REST)
               │
               ▼
   CodebaseResearcher
 (Inspects directory, manifests, relevant files)
               │
               ▼
    SpecPromptEngine
 (Architectural brainstorming & prompt synthesis)
               │
               ▼
    Approval Gatekeeper
 (Risk: HIGH | State: AWAITING_APPROVAL)
               │
   ┌───────────┴───────────┐
   ▼                       ▼
Reject                  Approve (with optional inline prompt edit)
   │                       │
   ▼                       ▼
Job Terminated      OpenCodeBridge
                    (Spawns opencode / kilo CLI in target workspace)
                           │
                           ▼
                    Live Streaming Logs
                    (WebSocket -> Terminal UI)
                           │
                           ▼
                    Solution Diff & Verification
                    (Git Diff, modified files, voice notification)
```

---

## 3. Core Components

### 3.1 `CodebaseResearcher` (`src/orchestration/opencode/researcher.ts`)
- Automatically detects project type (Node.js, TypeScript, Python, Rust, Go, Java, etc.).
- Inspects dependencies and frameworks (React, Express, Vite, Next.js, etc.).
- Identifies key manifests and source files matching user intent keywords while ignoring heavy build artifacts (`node_modules`, `dist`, `.git`, `.gradle`).
- Generates a directory structure summary.

### 3.2 `SpecPromptEngine` (`src/orchestration/opencode/prompt-engineer.ts`)
- Brainstorms the technical solution using the zero-cost intelligence layer (`AIService` / Ollama / Gemini).
- Compiles the final **OpenCode Directive**:
  - `GOAL`: Exact user objective.
  - `REPOSITORY CONTEXT`: Target workspace root, tech stack, manifests.
  - `RELEVANT FILES`: Specific files identified during research.
  - `EXECUTION INSTRUCTIONS`: Step-by-step implementation rules.
  - `CONSTRAINTS`: Non-regression and coding standards.

### 3.3 `OpenCodeBridge` (`src/orchestration/opencode/bridge.ts`)
- Auto-detects installed host binaries:
  - OpenCode: `C:\Users\TUF\AppData\Roaming\npm\opencode.cmd`
  - Kilo Code: `C:\Users\TUF\AppData\Roaming\npm\kilo.cmd`
- Spawns background process targeting `cwd: targetWorkspace`.
- Captures stdout and stderr in real-time chunks.
- Supports instant cancellation via process tree termination (`taskkill`).
- Extracts `git diff` and changed file lists upon completion.

### 3.4 `OpenCodeOrchestrator` (`src/orchestration/opencode/orchestrator.ts`)
- Coordinates the entire job lifecycle:
  `ANALYZING -> BRAINSTORMING -> PROMPT_READY -> AWAITING_APPROVAL -> APPROVED -> DEVELOPING -> COMPLETED`.
- Integrates with `ApprovalManager` for strict human-in-the-loop authorization.
- Emits structured WebSocket events:
  - `orchestrator:created`
  - `orchestrator:analyzed`
  - `orchestrator:awaiting_approval`
  - `orchestrator:approved`
  - `orchestrator:log`
  - `orchestrator:completed`
  - `orchestrator:failed`

---

## 4. REST API & WebSocket Reference

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/orchestrator/status` | Detects installed engines (OpenCode, Kilo Code), paths, versions |
| `GET` | `/api/v1/orchestrator/jobs` | Lists all past and active orchestration jobs |
| `GET` | `/api/v1/orchestrator/jobs/:id` | Returns job details (research, brainstorm, prompt, logs, diff) |
| `POST` | `/api/v1/orchestrator/jobs` | Submits a new order, runs research, and generates prompt |
| `POST` | `/api/v1/orchestrator/jobs/:id/approve` | Approves prompt and dispatches to OpenCode/Kilo |
| `POST` | `/api/v1/orchestrator/jobs/:id/reject` | Rejects prompt with optional reason |
| `POST` | `/api/v1/orchestrator/jobs/:id/edit-prompt` | Updates prompt text prior to approval |
| `POST` | `/api/v1/orchestrator/jobs/:id/cancel` | Aborts a running execution |

---

## 5. Web Application ("OpenCode Studio")

Accessible directly in the JARVIS Command Center at:
`http://localhost:5173/orchestrator`

Features:
- **Order Panel**: Workspace selector, engine toggle (`OpenCode` vs `Kilo Code`), model override, quick templates.
- **Research & Architecture Card**: Discovered files, tech stack badges, architectural strategy.
- **Engineered Prompt Card**: Monospace formatted prompt preview, inline edit mode, and **Approve & Dispatch** / **Reject** buttons.
- **Live Terminal**: Streaming console with ANSI support, line count, and execution timer.
- **Solution & Diff Inspector**: Summary of modified files and colorized git diff viewer.
- **Session History Drawer**: Fast switching between past orchestration sessions.
