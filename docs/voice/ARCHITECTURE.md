# JARVIS 2.0 Local Voice Architecture

## 1. System Overview

JARVIS 2.0 voice pipeline is built with a strictly **local-first, zero-cost** architecture. Voice is integrated as a first-class input and output modality directly alongside text, routing directly through the core JARVIS Brain without bypassing tasks, tools, memory, or security verification.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  Web Browser (React/Vite)                    Android Native Client                |
|  - MediaRecorder / getUserMedia              - AudioRecord / RECORD_AUDIO         |
|  - Real-time Interim Feedback                - WebSocket Channel "voice"          |
|  - HTML5 Audio Playback                      - AudioTrack / MediaPlayer           |
+------------------------------------+----------------------------------------------+
                                     |
                         WebSocket & REST Protocol
                                     |
+------------------------------------v----------------------------------------------+
|                             VOICE ORCHESTRATION                                  |
|                             (src/voice/service.ts)                                |
|  - Session Lifecycle: IDLE -> LISTENING -> TRANSCRIBING -> PROCESSING             |
|                       -> SPEAKING -> IDLE                                         |
|  - Event Broadcasts: voice.session.started, voice.transcript, voice.response, ...  |
|  - Max Duration & Payload Guards (Default 60s, 15MB limit)                        |
|  - Transient In-Memory Audio Buffers (No persistent disk storage)                 |
+------------------------------------+----------------------------------------------+
                                     |
          +--------------------------+--------------------------+
          |                                                     |
+---------v-----------------------+                   +---------v-------------------+
|       SPEECH-TO-TEXT            |                   |      TEXT-TO-SPEECH         |
|   (SpeechToTextProvider)        |                   |  (TextToSpeechProvider)     |
| - SystemSTTProvider (Windows)   |                   | - SystemTTSProvider         |
| - WhisperSTTProvider (Local)    |                   | - PiperTTSProvider (Local)  |
| - MockSTTProvider (CI/Tests)    |                   | - MockTTSProvider           |
+-----------------+---------------+                   +---------^-------------------+
                  | Text Transcript                             | Synthesized Audio
                  +--------------------------+------------------+
                                             |
+--------------------------------------------v--------------------------------------+
|                                 CORE BRAIN & PIPELINE                             |
|                                 (src/brain/brain.ts)                              |
|  - AIService & Prompt Generation                                                  |
|  - TaskManager & Agent Orchestration                                              |
|  - Tool Execution & ApprovalManager (High-risk operations prompt approval)        |
|  - Response Sanitization (Strips thoughts, secrets, tool artifacts before TTS)    |
|  - Zero-Cost Enforcement (ALLOW_PAID_PROVIDERS=false strictly preserved)          |
+-----------------------------------------------------------------------------------+
```

---

## 2. Voice Providers & Local Engines

JARVIS 2.0 preserves the extensible interfaces defined in [`src/voice/types.ts`](file:///c:/Users/TUF/OneDrive/Desktop/Jarvis%202.0/src/voice/types.ts):
- [`SpeechToTextProvider`](file:///c:/Users/TUF/OneDrive/Desktop/Jarvis%202.0/src/voice/types.ts): Transcribes raw audio buffers into text transcripts with confidence metadata.
- [`TextToSpeechProvider`](file:///c:/Users/TUF/OneDrive/Desktop/Jarvis%202.0/src/voice/types.ts): Synthesizes user-facing text responses into raw PCM/WAV audio buffers.
- [`WakeWordDetector`](file:///c:/Users/TUF/OneDrive/Desktop/Jarvis%202.0/src/voice/types.ts): Optional local wake-word trigger (default disabled).

### Provider Matrix

| Engine | Type | Model/Binary | Status Detection | Privacy | Zero-Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SystemTTSProvider** | Local TTS | Built-in Windows SAPI (`System.Speech`) | Native Windows API (<100ms) | 100% Local | $0.00 |
| **SystemSTTProvider** | Local STT | Windows SAPI (`System.Speech.Recognition`) | Native Windows API | 100% Local | $0.00 |
| **PiperTTSProvider** | Local TTS | `piper.exe` + `.onnx` neural model | Checks file existence on disk | 100% Local | $0.00 |
| **WhisperSTTProvider**| Local STT | `whisper.cpp` / `whisper-cli.exe` + `.bin` | Checks binary & model on disk | 100% Local | $0.00 |
| **OpenWakeWordDetector** | Wake Word | `openwakeword` engine | Optional / Disabled by default | 100% Local | $0.00 |
| **MockSTT/MockTTS** | Test Double | Deterministic memory test doubles | Always ready in test suites | In-memory | $0.00 |

---

## 3. Voice Session Lifecycle

Voice sessions transition cleanly through defined operational states:

```
[ IDLE ]
   |
   | start_session() or mic click
   v
[ LISTENING ] <----+ (interim transcription feedback)
   |                |
   | stop_listening() or audio sent
   v
[ TRANSCRIBING ] (Local STT Provider generates final transcript)
   |
   | transcript received
   v
[ PROCESSING ]  (JARVIS Brain, TaskManager, Security & Tool checks)
   |
   | user-facing response ready
   v
[ SPEAKING ]    (Local TTS synthesizes audio, client streams/plays)
   |
   | playback completed or user interrupt
   v
[ IDLE ]
```

### Cancellation and Interruptions
If the user clicks "Stop" or triggers `voice.cancel`:
1. Audio playback is halted immediately on the client.
2. The backend session transitions immediately to `IDLE`.
3. Background TTS synthesis processes are aborted via `AbortController`.

---

## 4. Response Sanitization for TTS

Raw LLM responses often contain markdown code snippets, internal chain-of-thought blocks (`<thought>...</thought>`), tool invocation payloads, or raw URLs.
[`src/voice/service.ts`](file:///c:/Users/TUF/OneDrive/Desktop/Jarvis%202.0/src/voice/service.ts) implements rigorous pre-synthesis sanitization:
1. Strips `<thought>` or `<thinking>` XML blocks.
2. Removes code fences and tool output formatting (` ```...``` `).
3. Strips raw markdown headers, bold, italics, bullets, and blockquotes.
4. Removes URLs or reduces them to readable domain names.
5. Scrubs recognized tokens and authorization headers via existing security sanitizers.

---

## 5. Security & Zero-Cost Enforcement

1. **Zero-Cost Policy:** `ALLOW_PAID_PROVIDERS=false` is enforced at startup and at registration. Any attempt to register or activate a paid cloud provider (such as OpenAI Whisper API, ElevenLabs, Amazon Polly, Google Speech) immediately throws a `ConfigurationError` and is rejected by [`src/voice/registry.ts`](file:///c:/Users/TUF/OneDrive/Desktop/Jarvis%202.0/src/voice/registry.ts).
2. **Approval Pipeline Intact:** Voice inputs enter `Brain.processMessage()`. If the user's spoken command requests a high-risk action (e.g., deleting a file, modifying system configurations, or executing destructive scripts), JARVIS flags the task as `WAITING_APPROVAL`. The approval cannot be bypassed merely because input came from voice.
3. **No Persistent Audio Storage:** Temporary audio files or buffers are processed strictly in memory or transient temp directories, scrubbed immediately upon synthesis or transcription completion.
