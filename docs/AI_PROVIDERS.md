# JARVIS 2.0 — AI Providers & Integration Guide

JARVIS 2.0 operates on a strict **₹0 / $0 target cost guarantee**. The system is completely decoupled from any single AI vendor or SDK and supports free cloud tiers, local inference, and offline mocks through the `IAIProvider` interface.

---

## 1. Supported AI Providers

| Provider | Type | Free Tier Policy | Authentication | Supported Features |
|---|---|---|---|---|
| **Ollama** | Local / Offline | 100% Free | None | Chat, Streaming, JSON Mode, Local Tool Calling |
| **Groq Cloud** | Public Cloud | Free Developer Tier | `GROQ_API_KEY` | Ultra-fast inference, Streaming, Tool calling, JSON Mode |
| **OpenRouter** | Public Cloud | Free Models Only (`:free`) | `OPENROUTER_API_KEY` | Streaming, Diverse open-weights models |
| **Hugging Face** | Public Cloud | Free Serverless API | `HUGGINGFACE_API_KEY` | Serverless open models, Streaming |
| **Mock Provider** | Local / In-Memory | 100% Free | None | Unit testing, Offline simulations, Fallback testing |

---

## 2. Hard Zero-Cost Guarantee

The AI subsystem guarantees zero cost through multi-layer verification:

1. **Registry Hard Stop**: If `ALLOW_PAID_PROVIDERS=false` (the default), any provider declaring `isPaid: true` is rejected during registration with a `CostLimitExceededError`.
2. **Model Metadata Verification**: Every model descriptor explicitly tracks `isFree: boolean` and per-token pricing (`costPer1kInputTokens`, `costPer1kOutputTokens`). Non-free models are pruned from the `ModelRegistry`.
3. **OpenRouter `:free` Enforcement**: The OpenRouter adapter strictly validates that requested models end with `:free`. Any attempt to target paid models (e.g., `anthropic/claude-3-5-sonnet`) is rejected before making any network request.
4. **Token Usage Verification**: Every completion reports `TokenUsage` with `estimatedCostUSD: 0.0`.

---

## 3. Provider Configuration

Configure providers in your `.env` file or environment variables:

```bash
# Ollama Local Daemon
OLLAMA_BASE_URL=http://localhost:11434

# Free Cloud Providers (Optional - leave blank if running offline or local-only)
GROQ_API_KEY=gsk_your_groq_api_key_here
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_key_here
HUGGINGFACE_API_KEY=hf_your_huggingface_token_here

# Zero-Cost Hard Guarantees
JARVIS_ALLOW_PAID_PROVIDERS=false
JARVIS_MAX_COST_PER_DAY=0.00
JARVIS_ALLOW_FREE_MODELS_ONLY=true

# Tie-Breaking Priority Order
JARVIS_PROVIDER_PRIORITY=groq,openrouter,huggingface,ollama
```

---

## 4. Local & Offline Operation

### Running with Ollama
1. Install [Ollama](https://ollama.ai) on your system.
2. Pull free models, for example:
   ```bash
   ollama pull llama3:8b
   ollama pull qwen2.5-coder:7b
   ```
3. Start the Ollama daemon. JARVIS will automatically discover and route to your installed local models.

### Running Completely Offline
To run in an air-gapped or offline environment without making any external cloud network requests:
```bash
JARVIS_OFFLINE=true
```
When offline mode is active:
* All cloud providers (Groq, OpenRouter, Hugging Face) are automatically disabled.
* Only local providers (Ollama and built-in Mock provider) are available.
* If Ollama is not installed or running, the built-in Mock provider satisfies requests for offline testing and diagnostics.

---

## 5. Health Monitoring & Rate Limits

Provider connectivity and quota health are monitored non-intrusively:
* Status states: `ONLINE`, `OFFLINE`, `DEGRADED`, `RATE_LIMITED`, `MISCONFIGURED`, `UNKNOWN`.
* **Rate Limits (HTTP 429)**: When a free cloud provider returns HTTP 429, the provider adapter parses the `Retry-After` header and marks the model as `RATE_LIMITED`. The router immediately excludes the model and falls back to an alternative healthy free provider.
* Health check results are cached in memory (TTL 60s) to prevent redundant health pings.
