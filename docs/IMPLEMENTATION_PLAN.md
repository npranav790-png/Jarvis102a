# JARVIS 2.0 — Implementation Plan

## 1. Executive Summary & Overall Architecture

JARVIS 2.0 is designed from first principles as an autonomous, provider-agnostic, headless AI operating and orchestration system. It is built to serve as an intelligent agent platform capable of multi-step task planning, controlled tool execution, project context tracking, and hierarchical multi-agent delegation.

The architecture strictly separates core orchestration and lifecycle management from external AI models, APIs, and host-level execution environments.

### Core Architectural Hierarchy
```
+-------------------------------------------------------------+
|                        JARVIS CLI / API                     |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                      JARVIS Core Engine                     |
|  - Lifecycle Orchestration  - Task Coordinator             |
|  - Session Context          - Event Bus (Async Pub/Sub)     |
+-------------------------------------------------------------+
        |                     |                     |
+---------------+     +---------------+     +---------------+
| Task Manager  |     | Session Mgr   |     | Project Mgr   |
+---------------+     +---------------+     +---------------+
        |                     |                     |
+-------------------------------------------------------------+
|                   Security & Permission Layer               |
|  - Risk Classification (LOW, MEDIUM, HIGH, CRITICAL)        |
|  - Action Types (READ, WRITE, EXECUTE, NETWORK, etc.)       |
|  - Approval Engine & Audit Trail                            |
+-------------------------------------------------------------+
        |                     |                     |
+---------------+     +---------------+     +---------------+
| Agent Registry|     | Tool Registry |     | AI Provider   |
| (Prompt 4)    |     | (Prompt 4)    |     | Interface     |
|               |     |               |     | (Prompt 2)    |
+---------------+     +---------------+     +---------------+
                              |
+-------------------------------------------------------------+
|                 Storage & Persistence (SQLite)              |
|  - Projects, Sessions, Tasks, Events, Audit Log             |
+-------------------------------------------------------------+
```

---

## 2. Technology Choices

### Primary Language & Runtime: TypeScript on Node.js (v24 LTS)
* **Rationale**:
  1. **Native Runtime Capabilities**: Node.js 24 provides built-in SQLite (`node:sqlite`) with zero external native compilation dependencies or Python/C++ build chains on Windows.
  2. **Async-First Ecosystem**: Core engine requires non-blocking asynchronous event dispatching, streaming AI responses, concurrent task tracking, and background timers.
  3. **Strict Type Safety**: TypeScript interfaces enforce rock-solid contracts for AI providers, tools, agents, tasks, and security policies.
  4. **Single-Language Cohesion**: Avoids cross-process FFI overhead or multi-language glue code in the foundation phase.
  5. **Rich CLI and Tooling**: Native ESM, built-in test runner (`node:test`), high performance CLI libraries (Commander), and industry-standard schema validation (Zod).

---

## 3. Directory Structure

```
c:\Users\TUF\OneDrive\Desktop\Jarvis 2.0\
├── docs/
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── DEVELOPMENT.md
│   └── SECURITY.md
├── src/
│   ├── config/
│   │   ├── config.ts
│   │   ├── schema.ts
│   │   └── index.ts
│   ├── core/
│   │   ├── engine.ts
│   │   ├── status.ts
│   │   └── index.ts
│   ├── database/
│   │   ├── connection.ts
│   │   ├── schema.ts
│   │   ├── repository.ts
│   │   └── index.ts
│   ├── events/
│   │   ├── bus.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── logging/
│   │   ├── logger.ts
│   │   ├── formatter.ts
│   │   └── index.ts
│   ├── errors/
│   │   ├── base.ts
│   │   └── index.ts
│   ├── security/
│   │   ├── types.ts
│   │   ├── policy.ts
│   │   ├── approval.ts
│   │   ├── audit.ts
│   │   └── index.ts
│   ├── projects/
│   │   ├── types.ts
│   │   ├── manager.ts
│   │   └── index.ts
│   ├── sessions/
│   │   ├── types.ts
│   │   ├── manager.ts
│   │   └── index.ts
│   ├── tasks/
│   │   ├── types.ts
│   │   ├── lifecycle.ts
│   │   ├── manager.ts
│   │   └── index.ts
│   ├── tools/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   └── index.ts
│   ├── agents/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   └── index.ts
│   ├── providers/
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   └── index.ts
│   ├── cli/
│   │   ├── cli.ts
│   │   └── commands/
│   │       ├── status.ts
│   │       ├── config.ts
│   │       ├── project.ts
│   │       ├── session.ts
│   │       └── task.ts
│   └── index.ts
├── tests/
│   ├── config.test.ts
│   ├── database.test.ts
│   ├── events.test.ts
│   ├── logging.test.ts
│   ├── security.test.ts
│   ├── projects.test.ts
│   ├── sessions.test.ts
│   ├── tasks.test.ts
│   ├── tools.test.ts
│   ├── agents.test.ts
│   ├── providers.test.ts
│   ├── engine.test.ts
│   └── cli.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Core Modules & Responsibilities

1. **Config (`src/config`)**:
   - Loads `.env` and environment variables.
   - Validates configuration against Zod schemas.
   - Enforces zero-cost guarantee (`allowPaidProviders: false` default).
   - Masks sensitive secrets from display and logs.

2. **Database (`src/database`)**:
   - Manages SQLite connection via `node:sqlite`.
   - Executes idempotent table initialization and schema migrations.
   - Provides transactional repositories for projects, sessions, tasks, events, and audit logs.

3. **Logging (`src/logging`)**:
   - Provides structured JSON and human-readable console logging.
   - Automatically injects correlation metadata (`taskId`, `sessionId`, `projectId`).
   - Automatically sanitizes/redacts API keys and sensitive tokens.

4. **Event Bus (`src/events`)**:
   - Asynchronous in-process Pub/Sub system.
   - Typed event hierarchy with UUIDs, timestamps, and correlation IDs.
   - Non-blocking error handling to ensure listener failures do not crash core loops.

5. **Security & Permissions (`src/security`)**:
   - Defines Action Categories: `READ`, `WRITE`, `EXECUTE`, `NETWORK`, `DESTRUCTIVE`, `SYSTEM`.
   - Defines Risk Levels: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
   - Interactive or programmatic approval gatekeeper for dangerous actions.
   - Immutable audit logging.

6. **Project System (`src/projects`)**:
   - Manages project entities (ID, name, description, workspace root, metadata).
   - Serves as the anchor for project-specific sessions, tasks, and memory.

7. **Session System (`src/sessions`)**:
   - Manages interactive dialogue and autonomous sessions.
   - Tracks session lifecycle and activity timestamps.
   - Prepares hooks for conversational memory (Prompt 3).

8. **Task System (`src/tasks`)**:
   - Explicit lifecycle states: `CREATED`, `QUEUED`, `RUNNING`, `WAITING_APPROVAL`, `WAITING_CHILD`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`.
   - Supports parent/child task hierarchy and retry counters.
   - Persistent state transitions stored in database and announced via events.

9. **Tool Architecture (`src/tools`)**:
   - Model-independent tool abstraction with JSON schema parameter validation.
   - Declares required permissions, risk levels, and timeout boundaries.
   - Registered tools are dynamically discoverable and invocable with security checks.

10. **Agent Architecture (`src/agents`)**:
    - Generic Agent interface defining identity, capabilities, allowed tools, and execution limits.
    - Base contracts for upcoming agents (CodingAgent, ResearchAgent, GeneralAgent).

11. **AI Provider Interface (`src/providers`)**:
    - Provider-agnostic abstraction (`IAIProvider`).
    - Standardized interfaces for `generate()`, `stream()`, `listModels()`, `healthCheck()`, and `capabilities()`.
    - Token accounting and cost tracking support (guaranteeing $0 limits).

12. **Core Engine (`src/core`)**:
    - Central runtime orchestrator coordinating database startup, event bus, and managers.
    - Provides centralized health check and diagnostics (`jarvis status`).

13. **CLI (`src/cli`)**:
    - Headless command-line interface for human and script interaction.
    - Commands: `status`, `version`, `config`, `project`, `session`, `task`.

---

## 5. Data Flow

```
[User CLI / API]
       │ (create-task, start session)
       ▼
[JarvisEngine] ──(load/validate)──> [ConfigManager]
       │
       ├─► [ProjectManager] ──► [Database]
       ├─► [SessionManager] ──► [Database]
       └─► [TaskManager]
                 │
                 ├── (emit TaskCreated) ──► [EventBus] ──► [AuditLogger]
                 │
                 └── [Task Execution Lifecycle]
                           │
                           ├── Validate Permissions ──► [SecurityEngine]
                           ├── (Future) Select Agent ──► [AgentRegistry]
                           ├── (Future) Run AI Model ──► [AIProviderRegistry]
                           └── Transition State ─────► [Database & EventBus]
```

---

## 6. Configuration Strategy

- **Hierarchy**: Environment variables > `.env` file > Default configuration values.
- **Validation**: Enforced at startup using strict Zod schemas. Invalid configs fail fast with clear, actionable diagnostics.
- **Cost Protection**:
  - `ALLOW_PAID_PROVIDERS`: Default `false`. If `false`, any provider with billing requirements is rejected.
  - `MAX_COST_PER_DAY`: Set to `0.0`.
- **Secret Redaction**: Config printing utilities automatically mask keys with asterisks (`***`).

---

## 7. Database Strategy

- **Storage Engine**: Embedded SQLite database (`node:sqlite`).
- **File Location**: Configurable via `JARVIS_DB_PATH`, defaulting to `data/jarvis.db` (or `:memory:` for automated tests).
- **WAL Mode**: Write-Ahead Logging enabled for concurrent read/write stability.
- **Tables**:
  - `projects`: Workspace and configuration metadata.
  - `sessions`: Interaction sessions linked to projects.
  - `tasks`: Full lifecycle state, hierarchy, retry counters, and metadata.
  - `events`: Event journal for observability and audit replay.
  - `audit_logs`: Security approvals, permission grants, and security events.

---

## 8. Logging Strategy

- **Structured Log Envelope**:
  ```json
  {
    "timestamp": "2026-09-26T14:05:00.000Z",
    "level": "INFO",
    "module": "TaskManager",
    "message": "Task transitioned to RUNNING",
    "context": {
      "taskId": "task-uuid",
      "sessionId": "session-uuid",
      "projectId": "project-uuid"
    }
  }
  ```
- **Redaction Engine**: Filters out patterns matching known API key prefixes (`sk-`, `gsk_`, `AIza`, etc.) and keys named `apiKey`, `secret`, `token`, `password`.

---

## 9. Error Handling Hierarchy

```
JarvisError (Base Error)
 ├── ConfigurationError
 ├── ValidationError
 ├── DatabaseError
 ├── SecurityError
 │    ├── PermissionDeniedError
 │    └── ApprovalRejectedError
 ├── TaskError
 │    ├── TaskNotFoundError
 │    ├── InvalidTaskStateTransitionError
 │    └── TaskTimeoutError
 ├── ToolError
 │    ├── ToolNotFoundError
 │    └── ToolExecutionError
 ├── ProviderError
 │    ├── ProviderNotFoundError
 │    ├── ProviderUnavailableError
 │    └── CostLimitExceededError
 └── AgentError
```
Every error produces a standard error code, human-readable message, and optional inner cause for deep diagnostic tracing.

---

## 10. Security Model

- **Least Privilege Principle**: All tools and agents declare exact capabilities.
- **Risk Assessment**:
  - `LOW`: Read-only queries, local environment inspection.
  - `MEDIUM`: Safe write operations within project workspace.
  - `HIGH`: Execution of scripts, external network calls.
  - `CRITICAL`: Destructive filesystem operations, system-level modifications.
- **Approval Gatekeeper**: Any action exceeding configured autonomous threshold requires explicit confirmation (`SecurityEngine.requestApproval`).

---

## 11. AI Provider Abstraction (Foundation for Prompt 2)

```typescript
export interface IAIProvider {
  readonly id: string;
  readonly name: string;
  readonly isPaid: boolean;
  
  healthCheck(): Promise<ProviderHealth>;
  listModels(): Promise<ModelDescriptor[]>;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  getCapabilities(): ProviderCapabilities;
}
```
All providers (Groq, Ollama, Google AI, OpenRouter) will implement this uniform interface in Prompt 2.

---

## 12. Agent & Tool Abstractions (Foundation for Prompt 4)

- **`ITool`**: Exposes JSON schema for parameters, risk level, required permissions, and an `execute(params, context)` method.
- **`IAgent`**: Exposes capabilities, supported tool names, required model capabilities, and an async `run(task, context)` method.

---

## 13. Future Roadmap & Prompts 2–6 Alignment

| Prompt | Scope | Foundation Built in Prompt 1 |
|---|---|---|
| **Prompt 1** | Foundation & Core Engine | Task/Session/Project models, SQLite, Event Bus, Logger, Config, Security, Interfaces |
| **Prompt 2** | AI Intelligence | `IAIProvider`, `ProviderRegistry`, zero-cost routing, fallback chaining |
| **Prompt 3** | Brain & Memory | Sessions linked to tasks, schema ready for episodic/semantic memory tables |
| **Prompt 4** | Agents & Tools | `ITool`, `IAgent`, tool validation, Security approval gatekeeper |
| **Prompt 5** | Voice & Automation | Background task lifecycle states, timer/cron scheduling hooks, event bus triggers |
| **Prompt 6** | Final Integration | Health checks, diagnostics, end-to-end orchestration, resilient CLI |

---

## 14. Major Technical Risks & Mitigation

1. **Risk: Provider Rate Limits on Free Tiers**
   - *Mitigation*: Prompt 1 config includes fallback and zero-cost flags; Prompt 2 will implement automatic provider failover.
2. **Risk: Arbitrary Host Execution Exploits**
   - *Mitigation*: Strict security architecture with risk levels and approval hooks before any execution tool runs.
3. **Risk: Corrupt or Inconsistent State on Crash**
   - *Mitigation*: ACID-compliant SQLite transactions, explicit task lifecycle state machines, and journaled events.

---

## 15. Definition of Done for Prompt 1

- [x] Clean, typed architecture with zero paid dependencies.
- [x] Comprehensive documentation in `docs/`.
- [x] Full test suite testing all core modules offline.
- [x] Interactive and scriptable CLI working smoothly.
- [x] Ready for Prompt 2 AI provider integration.

---

## 16. Prompt 2 Implementation (AI Intelligence Layer) — Completed

### Subsystems Implemented
1. **Concrete Provider Adapters (`src/providers/`)**:
   - `OllamaProvider`: Local inference via `node:fetch` with timeout, model discovery (`/api/tags`), generation, and streaming.
   - `GroqProvider`: Fast inference with rate-limit tracking (HTTP 429 backoff) and verified free tier models.
   - `OpenRouterProvider`: Curated free models (`:free` suffix only) with strict cost rejection.
   - `HuggingFaceProvider`: Serverless free inference API adapter.
   - `MockAIProvider`: Zero-cost offline provider supporting streaming, tool calling, JSON responses, and fallback testing.
2. **Model Registry (`ModelRegistry`)**:
   - Discovers, normalizes, and caches free models across all registered providers.
   - Tracks capabilities (`CODING`, `REASONING`, `RESEARCH`, `FAST`, etc.) and qualitative ratings.
3. **Capability-Aware Hybrid Model Router (`ModelRouter`)**:
   - Deterministic scoring algorithm balancing task capability fit, privacy rules, user priority, speed, and health.
   - Privacy modes: `LOCAL_ONLY`, `PREFER_LOCAL`, `ALLOW_CLOUD`, `CLOUD_PREFERRED`.
   - Generates ranked candidates and ordered `fallbackChain`.
4. **Resilient AI Pipeline (`AIService`)**:
   - Primary entrypoint for Prompt 3 & Prompt 4: `aiService.generate()` and `aiService.stream()`.
   - Automatic cascading fallback when primary provider fails or rate-limits.
   - Structured JSON validation and tool-call normalization.

### Definition of Done for Prompt 2
- [x] All 5 provider adapters operational.
- [x] Model registry and capability system active.
- [x] Model router and fallback engine verified.
- [x] Zero-cost policy strictly maintained (₹0.00 / $0.00).
- [x] Privacy modes (`LOCAL_ONLY`, etc.) fully functional.
- [x] Offline mode supported (`JARVIS_OFFLINE=true`).
- [x] 66 automated tests passing with 0 failures.
- [x] Ready for Prompt 3 Brain & Memory integration.

---

## 17. Prompt 3 Implementation (Brain, Reasoning, Planning & Memory) — Completed

### Subsystems Implemented
1. **Brain Pipeline Orchestrator (`src/brain/brain.ts`)**:
   - High-level unified interface: `engine.brain.process({ userInput, sessionId, projectId, privacyMode })`.
   - Distinguishes Fast Path (direct execution for casual chatter/trivial queries) from Complex Path (full multi-step workflow).
   - Session summarization: compresses historical turns into structured facts without exposing chain-of-thought traces.
2. **Intent Classification (`src/brain/intent.ts`)**:
   - Classifies user inputs into `INFORMATION`, `ACTION`, `RESEARCH`, `CREATION`, `ANALYSIS`, `CODING`, `AUTOMATION`, `CONVERSATION`.
   - Determines planning necessity and optimal AI task capability routing.
3. **Context Management & Budgeting (`src/brain/context/`)**:
   - `ContextBudgetManager`: Strict context limits with deterministic priority levels (`CRITICAL` > `HIGH` > `NORMAL` > `LOW`).
   - `PromptManager`: Versioned prompt templates with structural XML boundaries (`<SYSTEM_INSTRUCTIONS>`, `<USER_INPUT>`, `<MEMORY_CONTEXT>`, `<UNTRUSTED_CONTENT>`) guarding against prompt injection.
   - `ContextEngine`: Merges active project metadata, session history, and scoped memories within token budgets.
4. **Persistent Multi-Type Memory Subsystem (`src/brain/memory/`)**:
   - Concrete cognitive memory types: `WORKING`, `EPISODIC`, `SEMANTIC`, `PROJECT`, `USER_PREFERENCE`.
   - `MemorySanitizer`: Rejects persistence of secrets, API keys, passwords, bearer tokens, and private keys.
   - `MemoryService`: Full CRUD lifecycle, deduplication (Jaccard similarity >= 0.85 reinforces existing records), conflict resolution (subject+predicate matches supersede outdated facts), and expiration management.
   - `MemoryRetrievalRanker`: Zero-cost multi-factor ranking combining token relevance, importance weight, 30-day exponential recency decay, and strict project isolation.
   - `MemoryExtractor`: Heuristic and model-assisted extraction of durable facts and user preferences.
5. **Planning & DAG Decomposition (`src/brain/planner.ts`, `src/brain/decomposition.ts`)**:
   - `PlanningEngine`: Generates structured plans via `AIService` with automatic deterministic fallback.
   - `PlanValidator`: Validates Directed Acyclic Graphs (DAG), detects duplicate step IDs, missing dependencies, and circular dependency loops via DFS.
   - `TaskDecomposer`: Maps plan steps into parent workflows and child subtasks within Prompt 1's `TaskManager`.
6. **Reasoning & Private Thought Protection (`src/brain/reasoning.ts`)**:
   - Configurable modes: `FAST`, `STANDARD`, `DEEP`.
   - Evaluates objectives, constraints, and failures; generates concise operational decision summaries.
   - Prohibits persisting or exposing raw internal chain-of-thought traces.
7. **Verification & Loop Protection (`src/brain/verification.ts`, `src/brain/replan.ts`)**:
   - `VerificationEngine`: Evaluates execution evidence against declared success criteria (`VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`).
   - `ReplanManager`: Enforces strict execution bounds (`maxReplans` = 3, `maxReasoningSteps` = 10) to eliminate infinite agent loops.
8. **Database Persistence & Migrations (`src/database/`)**:
   - Extended SQLite schema with tables: `plans`, `plan_steps`, `memories`, `memory_links`, `reasoning_runs`, `verifications`, and covering indexes.
   - Repositories: `PlanRepository`, `MemoryRepository`, `ReasoningRepository`, `VerificationRepository`.
9. **CLI Diagnostics**:
   - Added commands: `brain status`, `brain plan`, `brain process`, `memory list`, `memory search`, `memory show`, `memory delete`, `plan show`, `plan validate`.

### Definition of Done for Prompt 3
- [x] Brain subsystem operational with clean high-level `process()` API.
- [x] Fast Path and Complex Path execution operational.
- [x] Planning DAG generator, validator, and cycle detection verified.
- [x] Task decomposition integrates cleanly with existing `TaskManager`.
- [x] Persistent memory types implemented with zero-cost hybrid retrieval.
- [x] Deduplication, conflict resolution, and secret sanitization verified.
- [x] Verification engine and loop protection guardrails active.
- [x] All 101 tests pass cleanly offline with zero failures (100% pass rate).
- [x] No UI components or premature tool execution introduced.

---

## 18. Prompt 4 Implementation (Agents, Tools, MCP & Secure Execution) — Completed

### Subsystems Implemented
1. **Tool Subsystem & Registry (`src/tools/`)**:
   - `ToolRegistry`: Standardized `ITool` interface with schema validation, risk evaluation, execution pipeline, timeouts, and structured `ToolResult`.
   - `ToolSelector`: Capability-based tool discovery and matching.
   - Built-in tools:
     - `filesystem`: `filesystem.list`, `filesystem.read`, `filesystem.write`, `filesystem.create`, `filesystem.delete`, `filesystem.move`, `filesystem.copy`, `filesystem.search`.
     - `shell`: `shell.execute` with argument separation, working directory sandboxing, output limits, secret redaction, and execution timeouts.
     - `git`: `git.status`, `git.diff`, `git.log`, `git.branch`, `git.add`, `git.commit`.
     - `process`: `process.start`, `process.status`, `process.stop`.
     - `code`: `code.test` with automated test runner discovery (`npm`, `pytest`, `cargo`, `go`) and output parsing.
   - `ArtifactManager`: Creates, verifies, and persists tool-generated artifacts with sha256 checksums.

2. **Security & Sandboxing (`src/security/`)**:
   - `FilesystemSandbox`: Canonical path resolution, symlink/reparse point validation, path traversal (`../`) prevention, Windows device/stream protection, and sanitized environment filtering.
   - `ApprovalManager`: Human-in-the-loop approvals, auto-approval for low risk, interactive approval support, automatic expiry, task/tool/target binding, and scoped task authorizations.
   - Secret Redaction: Integrated `MemorySanitizer.redactSecrets()` sanitizing tool results and logs.

3. **Specialized Autonomous Agents & Registry (`src/agents/`)**:
   - `AgentRegistry`: Dynamic capability-based registration, discovery, and health inspection.
   - `AgentSelector`: Explainable selection considering task type, required capabilities, and permissions.
   - Specialized agents: `GeneralAgent`, `CodingAgent`, `ResearchAgent`, `AnalysisAgent`, `AutomationAgent`.
   - `AgentExecutor`: Controlled agent loop (`THINK → PLAN → ACT → OBSERVE → VERIFY → REPLAN`), state management, workspace locking, infinite loop detection, evidence submission to `VerificationEngine`, and memory persistence.

4. **Model Context Protocol (MCP) Integration (`src/mcp/`)**:
   - `MCPClient`: Support for `stdio` process and `in_memory` mock transports.
   - `MCPToolAdapter`: Converts external MCP tools to standard `ITool` instances, encloses outputs in `<UNTRUSTED_CONTENT>`, and runs secret sanitization.
   - `MCPRegistry`: Server lifecycle management and tool discovery into `ToolRegistry`.

5. **Database Persistence & Repositories (`src/database/`)**:
   - Extended SQLite schema: `tool_calls`, `approvals`, `artifacts`, `mcp_servers`, `workspace_locks`.
   - Repositories: `ToolCallRepository`, `ApprovalRepository`, `ArtifactRepository`, `MCPRepository`, `WorkspaceLockRepository`.

6. **CLI Diagnostics**:
   - Added commands: `task execute <id>`, `agent list`, `agent status [id]`, `tool list`, `tool inspect <name>`, `tool test <name>`, `approval list`, `approval approve <id>`, `approval deny <id>`, `mcp list`, `mcp status [name]`.

### Definition of Done for Prompt 4
- [x] Standard `ITool` interface and structured `ToolResult` implemented.
- [x] Filesystem tools with path sandboxing and canonical resolution implemented.
- [x] Shell execution with argument validation, environment filtering, and timeouts implemented.
- [x] Git tools and process management implemented.
- [x] Artifact tracking with SHA-256 checksums implemented.
- [x] ApprovalManager with risk evaluation, scoped approvals, and automatic expiry implemented.
- [x] AgentRegistry, AgentSelector, and 5 specialized agents implemented.
- [x] AgentExecutor with workspace locking and loop detection implemented.
- [x] VerificationEngine and MemoryService fully integrated into execution loop.
- [x] MCP client, server registry, and untrusted boundary adapters implemented.
- [x] CLI commands for agents, tools, approvals, and MCP implemented.
- [x] 133 automated tests passing with 0 failures (100% pass rate).
- [x] Zero-cost policy strictly maintained (₹0 / $0).
- [x] No UI added (headless architecture preserved).
- [x] Ready for Prompt 5.

---

## 19. Prompt 5 Integration Points (Voice, Scheduling & Automation)

Prompt 5 will build directly on the Prompt 4 execution engine:
* **Background Worker / Scheduler**: Leverage asynchronous, cancellable `AgentExecutor` tasks and workspace locks.
* **Voice / Wake Word Gateway**: Route voice-transcribed intents directly into `JarvisEngine.brain.process()`.
* **Automation Triggers**: Periodic or event-driven execution using `AutomationAgent` and `ToolRegistry`.

