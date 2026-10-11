# JARVIS 2.0 — Model Routing & Fallback Architecture

JARVIS 2.0 avoids hard-coding model preferences or assuming a single "best model." Instead, it uses a **capability-aware hybrid model router** (`ModelRouter`) that balances task requirements, privacy rules, speed classes, provider health, and zero-cost constraints.

---

## 1. Routing Lifecycle Overview

```
User / Agent Task Request
           │
           ▼
[ ModelRouter: Hard Filter Phase ]
  ├── Zero-Cost Check ($0 cost required)
  ├── Privacy Mode Check (LOCAL_ONLY vs Cloud)
  ├── Tool & Structured JSON Support
  ├── Context Window Requirements
  └── Availability & Rate-Limit Check
           │
           ▼
[ ModelRouter: Scoring Phase ]
  ├── Task Capability Fit (CODING, REASONING, RESEARCH, FAST)
  ├── Privacy Mode Weighting (Local vs Cloud boost)
  ├── User Provider Priority Preference
  ├── Speed Class Preference
  └── Health & Latency Rating
           │
           ▼
[ Candidate Ranking & Fallback Chain Creation ]
  ├── Selected Primary Model (Rank 1)
  └── Ordered Fallback Chain (Ranks 2..N)
           │
           ▼
[ AIService: Execution & Resilient Fallback ]
  ├── Attempt execution with Primary Candidate
  ├── (On failure / 429 rate limit) ──► Cascade to next candidate in Fallback Chain
  └── Emit 'ai:generated' or 'provider:fallback_triggered' events
```

---

## 2. Privacy Modes

Configurable via `JARVIS_PRIVACY_MODE` in `.env`:

| Mode | Behavior | Use Case |
|---|---|---|
| **`LOCAL_ONLY`** | **Strictly disqualifies all cloud providers.** Only local Ollama or offline mock models are considered. | Sensitive codebases, personal data, offline environments. |
| **`PREFER_LOCAL`** (Default) | Grants a strong scoring bonus (+25) to local models, but allows free cloud fallbacks if local daemon is unavailable. | General development with privacy preference. |
| **`ALLOW_CLOUD`** | Balances local and cloud models equally based solely on capability and speed. | Standard development where free cloud tiers are acceptable. |
| **`CLOUD_PREFERRED`** | Grants a scoring bonus (+25) to cloud models (e.g. Groq 70B, Gemini Flash Lite). | Heavy multi-step reasoning where high parameter counts are desired. |

---

## 3. Task Types & Capability Matching

The router scores candidates based on their qualitative capability classifications:

* **`CODING`**: Prioritizes models tagged with `CODING` capability (e.g. `llama-3.3-70b-versatile`, `qwen-2.5-coder-32b`). Models rated `HIGH` receive +40 points.
* **`REASONING` / `ANALYSIS`**: Prioritizes models with complex multi-step reasoning capabilities (+40 points).
* **`RESEARCH` / `SUMMARIZATION`**: Prioritizes models with long context windows (>= 32,000 tokens) and research capability (+25 points).
* **`FAST`**: Prioritizes ultra-low-latency models categorized in `speedClass: FAST` (e.g. `llama-3.1-8b-instant`, `mock-llama-3-8b`) (+35 points).
* **`GENERAL`**: Balanced evaluation (+15 points for general versatility).

---

## 4. Cascading Fallback Engine

When the primary selected model encounters an unexpected error, network timeout, or HTTP 429 rate limit:
1. The error is intercepted by `AIService`.
2. The failing model is temporarily marked as `RATE_LIMITED` or `DEGRADED` in the `ModelRegistry`.
3. An audit event (`provider:fallback_triggered`) is broadcast over the `EventBus`.
4. Execution automatically cascades to the next candidate in the `fallbackChain`.
5. This process repeats until execution succeeds or all eligible free candidates are exhausted.
6. Under no circumstances will the fallback engine select a paid model or violate the active privacy mode.

---

## 5. Inspecting Routing Decisions via CLI

You can simulate and inspect routing decisions directly from the CLI:

```bash
# Explain routing decision for a coding task
npm run jarvis -- ai route --type CODING

# Explain routing decision under strict local-only privacy
npm run jarvis -- ai route --type GENERAL --privacy LOCAL_ONLY

# Test generation with automatic fallback
npm run jarvis -- ai test "What is the difference between TCP and UDP?" --type FAST
```
