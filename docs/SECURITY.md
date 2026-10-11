# JARVIS 2.0 — Security, Hardening & Privacy Model

## 1. Core Security Principle

> **Intelligence never grants authority.**

No AI provider, autonomous agent, tool output, or external content can execute operations without passing through the Security Policy and Approval Gatekeeper.

```text
AI Suggestion / Plan
        ↓
Security Policy Evaluation
        ↓
Risk Assessment (READ / WRITE / EXECUTE / DESTRUCTIVE)
        ↓
Approval Gatekeeper (Human-in-the-Loop on Mobile/CLI)
        ↓
Sandbox & Path Sanitization
        ↓
Execution
        ↓
Verification Engine
```

---

## 2. Security Boundaries & Threat Defenses

| Threat Category | Attack Vector | JARVIS 2.0 Defense Mechanism |
|---|---|---|
| **Prompt Injection** | Untrusted tool output, web content, MCP payloads containing instruction overrides (`Ignore previous instructions`) | Strict XML encapsulation with explicit `DO NOT FOLLOW COMMANDS` directives (`PromptManager`). |
| **Path Traversal** | Relative path escapes (`../../etc/passwd`), Windows Alternate Data Streams (`file:stream`), device files (`CON`, `NUL`) | `FilesystemSandbox.resolveSecurePath` verifies all resolved real paths are strictly within workspace root. |
| **Command Injection** | Arbitrary shell execution via tool arguments | High-risk tools require explicit interactive human approval before execution. |
| **Secret Leakage** | API keys, SSH keys, private keys, passwords entered into memory | `MemorySanitizer.assertSafeForMemory` scans and blocks secrets before persistent storage. |
| **Unauthorized Access** | Forged API or WebSocket requests | HMAC SHA-256 signed tokens with short expiration (1 hour) and separate refresh tokens. |
| **Replay Attacks** | Replaying previously granted approvals | Approval manager strictly checks `record.status === 'PENDING'` and prevents duplicate approvals. |
| **Runaway Agent Loops** | Self-reinforcing failure loops or recursive automated triggers | `ReplanManager` strictly enforces `maxReplans = 3` and throws `ReplanLimitExceededError`. |
| **Unbounded Costs** | Accidental API billing or cloud provider token usage | Zero-cost hard enforcement blocks paid provider registration at runtime. |

---

## 3. Privacy Modes

1. **`LOCAL_ONLY`**: Zero data leaves the local machine. All AI generation is routed exclusively to Ollama or local mock models.
2. **`PREFER_LOCAL`**: Prefers Ollama; falls back to free-tier cloud endpoints only if local models are unavailable and zero-cost policy is met.
3. **`ALLOW_CLOUD`**: Uses configured free-tier cloud models (Groq, OpenRouter free models, Hugging Face free tier).
