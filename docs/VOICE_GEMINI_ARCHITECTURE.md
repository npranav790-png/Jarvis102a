# JARVIS 2.0 — Gemini Cloud Voice System Architecture

## 1. Executive Summary & Core Voice Architecture

The JARVIS 2.0 Voice Subsystem is a production-grade, cloud-first conversational speech layer powered by Google's official Gemini API (`gemini-3.8-flash-lite-tts`), mediated by an autonomous **VoiceDirector** engine.

It fulfills the vision of a mature, sophisticated, articulate, and emotionally expressive personal AI assistant without cloning copyrighted actor performances, without introducing paid cloud subscriptions, and without bypassing existing safety, approval, or model routing boundaries.

### End-to-End Pipeline

```text
Microphone / Audio Input
          │
          ▼
   Speech Input (STT)
   (Windows SAPI / Web Audio API)
          │
          ▼
     JARVIS Brain
  (Intent, Memory, Planner, Context)
          │
          ▼
   Response Generation
 (Gemini 3.7 Flash / Qwen 3.5 8B Local)
          │
          ▼
     VoiceDirector
 (Sanitization, Emotion, Pacing, Style)
          │
          ▼
    Gemini TTS Provider
 (gemini-3.8-flash-lite-tts, Voice: Charon)
          │
          ▼
  Normalized Audio Stream
    (RIFF/WAV, 24kHz / 16-bit PCM)
          │
          ▼
       Speaker
 (Host Audio / Web Audio / Android Player)
```

### Architectural Principles

1. **Non-Bypassing Design**: Spoken commands follow the exact same trust and verification pipeline as text commands (`Brain -> AIService -> ModelRouter -> Tool/Approval`). Spoken commands cannot execute privileged or destructive actions without human-in-the-loop approval.
2. **Strict Zero-Cost ($0.00 / ₹0)**: The entire voice system operates under `JARVIS_ALLOW_PAID_PROVIDERS=false`. If free quotas are exceeded or unavailable, it fails safely with structured errors (`VOICE_PROVIDER_UNAVAILABLE` or `VOICE_QUOTA_EXHAUSTED`) rather than silently accruing cloud bills.
3. **No Independent Pipeline**: The VoiceDirector and Gemini TTS sit strictly downstream of response generation, shaping vocal delivery without mutating factual semantics.
4. **Cloud-First with Zero Heavy Local Models**: The primary voice engine runs in Google's cloud infrastructure via low-latency REST and SSE endpoints, eliminating the requirement to download gigabytes of local neural TTS weights.

---

## 2. Gemini TTS Provider (`GeminiTTSProvider`)

The `GeminiTTSProvider` is registered into the JARVIS `VoiceRegistry` under the canonical ID:

```typescript
export class GeminiTTSProvider implements ITTSProvider {
  readonly id = 'gemini-tts';
  readonly name = 'Google Gemini TTS';
  readonly isLocal = false;
  readonly isPaid = false; // Strictly Free-Tier
  ...
}
```

### Model Configuration

- **Centralized Model ID**: Configured via `GEMINI_TTS_MODEL` (defaults to `gemini-3.8-flash-lite-tts`).
- **Endpoint**: Official Google Generative Language REST API (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` and `:streamGenerateContent?alt=sse`).
- **Voice Selection**: Prebuilt voice `Charon` — carefully chosen for its mature, articulate, low-pitch, restrained male tone fitting the classic JARVIS persona. Alternatives supported: `Puck`, `Fenrir`, `Aoede`, `Kore`.
- **Audio Output**: 24kHz mono 16-bit PCM packed in standard RIFF/WAVE containers (`audio/wav`) for universal OS playback (Windows, Linux, macOS, Android, Web).

### Key Management & Leakage Prevention

- The `GEMINI_API_KEY` is loaded exclusively on the Node.js backend.
- The provider explicitly strips query params and headers before writing to Winston logs.
- Sensitive patterns (e.g., `AIza[0-9A-Za-z-_]{35}`, `AQ\.[0-9A-Za-z-_]{40,}`) are scrubbed by `VoiceDirector.sanitizeText()` before any text enters speech or logs.
- The key is **never** sent to the Vite frontend, React state, Android client, WebSocket payloads, or telemetry.

---

## 3. VoiceDirector: Emotional Delivery & Pacing

The **VoiceDirector** (`src/voice/director.ts`) acts as the vocal conductor of JARVIS. It translates semantic context, agent state, and security posture into concrete audio direction.

### Centralized JARVIS Voice Identity Prompt

```text
"You are JARVIS, a sophisticated personal AI assistant.
Speak with calm authority, precise diction, subtle warmth,
and restrained confidence.

Maintain natural conversational pacing.

Do not sound robotic.
Do not over-emphasize words.
Do not sound excessively excited.

Use subtle emotional variation when context requires it.

For urgent situations, become concise and serious.
For successful tasks, sound quietly confident.
For humorous situations, use restrained dry humor.

Never exaggerate emotion."
```

### Emotion & Style Matrix

The VoiceDirector deterministically maps response context to one of 12 emotions and 7 styles:

| Scenario / Context | Emotion | Delivery Style | Pacing | Energy |
| :--- | :--- | :--- | :--- | :--- |
| System status, general queries | `CALM` | `PROFESSIONAL` | `NORMAL` | `MEDIUM` |
| Successful task / operation | `CONFIDENT` | `PROFESSIONAL` | `NORMAL` | `MEDIUM` |
| Greeting, assistance offer | `WARM` | `CONVERSATIONAL` | `NORMAL` | `MEDIUM` |
| Sarcastic / witty prompt | `AMUSED` | `DRY_HUMOR` | `DELIBERATE` | `LOW` |
| Security alerts, high-risk tools | `CONCERNED` | `SERIOUS` | `DELIBERATE` | `HIGH` |
| Errors, system failures | `SERIOUS` | `TECHNICAL` | `NORMAL` | `MEDIUM` |
| Critical timeouts, emergencies | `URGENT` | `URGENT` | `BRISK` | `HIGH` |
| User frustration detected | `CALM` | `REASSURING` | `DELIBERATE` | `MEDIUM` |

### Text Sanitization Rules

Before sending text to Gemini TTS, `VoiceDirector` applies multi-stage cleanup:
1. **Internal Reasoning Removal**: Strips `<think>...</think>`, `Thought:`, and model scratchpads.
2. **Code Blocks & Syntax**: Strips multi-line ``` code snippets, replacing them with natural summaries like `"[Code block omitted for speech]"`.
3. **Markdown Lists to Speech**: Converts `- CPU\n- RAM\n- GPU` into natural conversational phrasing: `"CPU, RAM, and GPU."`.
4. **URL Humanization**: Converts `https://github.com/microsoft/vscode/issues/100` into readable domain mentions: `"github.com link"`.
5. **Secret Redaction**: Redacts API keys (`AIza...`, `AQ...`), Bearer tokens, and hash digests.
6. **Factual Content Invariance**: The Director alters pitch, pacing, pauses, and tone directives, but **never** modifies the factual meaning of JARVIS responses.

---

## 4. Voice State Machine & Barge-In Interruption

Voice sessions operate through a deterministic, strictly validated finite state machine:

```text
       ┌───────────┐
       │   IDLE    │
       └─────┬─────┘
             │ (session.start / audio incoming)
             ▼
       ┌───────────┐
       │ LISTENING │
       └─────┬─────┘
             │ (speech capture finished)
             ▼
      ┌─────────────┐
      │TRANSCRIBING │
      └──────┬──────┘
             │ (transcript ready)
             ▼
      ┌─────────────┐
      │ PROCESSING  │ (Brain, AIService, ModelRouter)
      └──────┬──────┘
             │ (audio synthesis ready)
             ▼
      ┌─────────────┐ ◄──────────┐
      │  SPEAKING   │            │
      └──────┬──────┘            │
             │                   │
   ┌─────────┴─────────┐         │ (resumed playback)
   │ (user speaks /    │ (done)  │
   │  barge-in event)  ▼         │
   │              ┌─────────┐    │
   ▼              │  IDLE   │    │
┌─────────────┐   └─────────┘    │
│ INTERRUPTED │                  │
└──────┬──────┘                  │
       │ (stop playback, cancel) │
       └─────────────────────────┘
```

### Barge-In / Interruption Workflow

1. While the state is `SPEAKING`, the client (Web UI or Android) detects incoming user voice activity (or user clicks the interrupt button).
2. The client fires `POST /api/v1/voice/sessions/:id/interrupt`.
3. The server invokes `VoiceService.interrupt(sessionId)`:
   - Signals the `AbortController` linked to the active Gemini TTS request (halting in-flight cloud data).
   - Transitions session state from `SPEAKING` to `INTERRUPTED`.
   - Emits structured WebSocket event `voice.interrupted`.
4. The client halts local audio buffer playback instantaneously.
5. The session transitions cleanly to `LISTENING` to accept the new query without residual audio overlap.

---

## 5. WebSocket Event Architecture

All voice lifecycle changes are broadcast over the unified JARVIS WebSocket server (`src/api/websocket/server.ts`):

| Event Type | Payload | Meaning |
| :--- | :--- | :--- |
| `voice.session.started` | `{ sessionId, state: 'IDLE' }` | Voice session initialized |
| `voice.listening` | `{ sessionId, state: 'LISTENING' }` | Microphone active, listening |
| `voice.transcript.partial` | `{ sessionId, text: '...' }` | Real-time partial transcript |
| `voice.transcript.final` | `{ sessionId, text: '...' }` | Finalized user speech input |
| `voice.processing` | `{ sessionId, prompt: '...' }` | Sent to Brain & LLM |
| `voice.response` | `{ sessionId, responseText, direction }` | Brain completed, direction computed |
| `voice.speaking` | `{ sessionId, audioMime, durationMs }` | Gemini audio ready & streaming |
| `voice.interrupted` | `{ sessionId, state: 'INTERRUPTED' }` | Barge-in triggered, playback aborted |
| `voice.completed` | `{ sessionId, durationMs }` | Audio playback concluded cleanly |
| `voice.error` | `{ sessionId, code, message }` | Typed error occurred |

---

## 6. Rate Limiting, Backoff & Zero-Cost Policy

### Free-Tier Sliding Window Enforcement

Gemini Free-Tier limits for TTS endpoints are strictly enforced in-memory:
- **Max Requests Per Minute (RPM)**: 15
- **Max Requests Per Day (RPD)**: 1,500
- **Rate Limit Window**: 60-second sliding array + 24-hour daily quota counter.

If the limit is hit:
1. Provider state updates to `RATE_LIMITED`.
2. Provider calculates exact seconds until the next token window opens (`retry_after`).
3. Throws typed `VOICE_ERRORS.QUOTA_EXHAUSTED` or `RATE_LIMITED`.
4. **Never** switches to a paid model or alternate paid vendor.

### Resilient Exponential Backoff

For transient Google cloud errors (HTTP 503 Service Unavailable, network socket resets, HTTP 429 bursts):
- Up to 3 attempts with bounded exponential backoff (`delay = min(1000 * 2^attempt + jitter, 10000)`).
- Fatal auth errors (HTTP 401 Unauthorized, HTTP 403 Forbidden) fail immediately without retrying, logging clear guidance to check `GEMINI_API_KEY`.

---

## 7. Security & Human-in-the-Loop Safeguards

Voice input is untrusted input. Spoken commands are never allowed to execute directly.

```text
Spoken Command: "Delete the project repository"
          │
          ▼
     STT Engine
          │
          ▼
     JARVIS Brain
          │
          ▼
     Tool Selection (filesystem.delete)
          │
          ▼
   ApprovalGatekeeper
   Risk Level: HIGH / CRITICAL
          │
          ▼
   ApprovalManager
   [Action Paused - Awaiting Mobile/UI Biometric Approval]
          │
          ▼
   VoiceDirector: Emotion=CONCERNED, Style=SERIOUS
   JARVIS Spoken Output: "That action requires explicit confirmation on your device."
```

---

## 8. Short-Lived Safe Audio Cache (`VoiceCache`)

To reduce latency for common static conversational acknowledgments (e.g., *"Acknowledged, sir."*, *"Scanning system metrics now."*), `VoiceCache` maintains a 50-entry LRU in-memory cache with a 1-hour TTL.

### Strict Cache Invalidation Rules

The cache **never** stores audio containing:
- Dynamic quantities (CPU %, RAM, timestamps, numbers).
- Credentials, tokens, or masked secrets.
- Tool execution results or personal identifiable information (PII).

---

## 9. Future Gemini Live Preparation (`IRealtimeVoiceProvider`)

To ensure seamless future upgrades to the Gemini Live multimodal bidirectional API without rewriting the core voice layer, the system introduces the `IRealtimeVoiceProvider` interface:

```typescript
export interface IRealtimeVoiceProvider {
  readonly id: string;
  readonly name: string;
  startSession(options: { voice?: string; sampleRate?: number }): Promise<string>;
  sendAudioChunk(sessionId: string, chunk: Buffer): Promise<void>;
  onAudioOutput(sessionId: string, callback: (chunk: RealtimeAudioChunk) => void): void;
  onTranscript(sessionId: string, callback: (text: string, isFinal: boolean) => void): void;
  stopSession(sessionId: string): Promise<void>;
}
```

When Gemini Live WebSockets become available under the project's zero-cost tier, a `GeminiLiveProvider` can be registered into `VoiceRegistry.registerRealtime()` with zero modifications to client or Brain contracts.

---

## 10. Troubleshooting Guide

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| `VOICE_CONFIG_ERROR: Missing GEMINI_API_KEY` | `.env` does not contain valid Gemini credentials | Set `GEMINI_API_KEY=AIza...` in `.env`. |
| `HTTP 401 / 403 Invalid API Key` | API key is revoked or lacks Generative Language API access | Verify key in Google AI Studio. |
| `HTTP 429 Quota Exceeded` | Free tier 15 RPM limit reached | Wait 60 seconds; check sliding window reset. |
| `HTTP 503 Model Unavailable` | Google upstream transient capacity peak | Built-in backoff retries 3x automatically. |
| `No audio output on Windows` | Default audio device muted or SAPI unavailable | Ensure default playback device is connected; test with `SoundPlayer`. |
