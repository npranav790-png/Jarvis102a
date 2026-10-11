# JARVIS 2.0 Local Voice Engine Setup Guide

This guide details how to configure and verify local Speech-to-Text (STT) and Text-to-Speech (TTS) engines for JARVIS 2.0.

All supported engines are **100% free, offline, and run locally** on your machine. No cloud API keys or subscription services are required.

---

## 1. Quick Start: Windows Native SAPI (Zero Installation)

If you are running Windows 10/11, JARVIS includes built-in native support for Windows SAPI:
- **TTS:** Windows Speech Synthesizer (`System.Speech.Synthesis`)
- **STT:** Windows Speech Recognition Engine (`System.Speech.Recognition`)

### Configuration (.env)
```env
JARVIS_VOICE_ENABLED=true
JARVIS_VOICE_TTS_PROVIDER=system_tts
JARVIS_VOICE_STT_PROVIDER=system_stt
JARVIS_VOICE_WAKE_WORD_ENABLED=false
```

### Verification
Start the backend and visit:
`GET http://localhost:3000/api/v1/voice/status`

Output:
```json
{
  "enabled": true,
  "stt": {
    "provider": "system_stt",
    "status": "READY",
    "isPaid": false
  },
  "tts": {
    "provider": "system_tts",
    "status": "READY",
    "isPaid": false
  },
  "privacy": "LOCAL_ONLY"
}
```

---

## 2. Advanced Neural TTS: Piper (Optional)

Piper is a fast, local neural text-to-speech system that produces natural, human-like voice synthesis on consumer CPUs.

### Step 1: Download Piper Binary
1. Visit the Piper GitHub Releases: `https://github.com/rhasspy/piper/releases`
2. Download the Windows archive (e.g. `piper_windows_amd64.zip`) or Linux binary.
3. Extract to your preferred local directory, for example:
   `C:\tools\piper\` (contains `piper.exe`)

### Step 2: Download a Voice Model
Download an ONNX voice model and its corresponding JSON config:
- Model repository: `https://huggingface.co/rhasspy/piper-voices`
- Recommended English voice: `en_US-lessac-medium.onnx` and `en_US-lessac-medium.onnx.json`
- Save both files in: `C:\tools\piper\models\`

### Step 3: Configure JARVIS
Add to your `.env` or system environment:
```env
JARVIS_VOICE_TTS_PROVIDER=piper_local
JARVIS_VOICE_PIPER_BINARY_PATH=C:\tools\piper\piper.exe
JARVIS_VOICE_TTS_MODEL=C:\tools\piper\models\en_US-lessac-medium.onnx
```

### Resource Usage:
- CPU: ~15-25% during active synthesis
- RAM: ~150 MB
- Synthesis Latency: ~100-250ms for typical sentences

---

## 3. High-Accuracy Local STT: Whisper.cpp (Optional)

`whisper.cpp` provides high-performance, offline transcription using OpenAI's Whisper model architecture implemented in pure C/C++.

### Step 1: Download whisper.cpp Executable
1. Visit `https://github.com/ggerganov/whisper.cpp/releases`
2. Download prebuilt Windows binaries (e.g. `whisper-bin-x64.zip`)
3. Extract `whisper-cli.exe` (or `main.exe`) to `C:\tools\whisper\`

### Step 2: Download Whisper Model
Download a quantised GGML model:
- `ggml-tiny.bin` (~75 MB, ultra-fast) or `ggml-base.bin` (~140 MB, recommended)
- Direct link from Hugging Face: `https://huggingface.co/ggerganov/whisper.cpp`
- Place model in: `C:\tools\whisper\models\ggml-base.bin`

### Step 3: Configure JARVIS
```env
JARVIS_VOICE_STT_PROVIDER=whisper_local
JARVIS_VOICE_WHISPER_BINARY_PATH=C:\tools\whisper\whisper-cli.exe
JARVIS_VOICE_STT_MODEL=C:\tools\whisper\models\ggml-base.bin
```

### Resource Usage:
- CPU: 2-4 cores during transcription
- RAM: ~300 MB (base model)
- Transcription Latency: ~300-800ms for 5s of audio

---

## 4. Local Wake Word: openWakeWord (Optional)

By default, wake-word detection is disabled (`JARVIS_VOICE_WAKE_WORD_ENABLED=false`) to preserve CPU cycles and keep microphone activation strictly user-controlled.

If enabled:
```env
JARVIS_VOICE_WAKE_WORD_ENABLED=true
JARVIS_VOICE_WAKE_WORD=hey jarvis
```
The openWakeWord engine will monitor the audio stream for the trigger phrase locally without transmitting audio outside the local machine.

---

## 5. Verification Checklist

1. **Verify Backend Status:**
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/v1/voice/status
   ```
2. **Test Audio Synthesis Endpoint:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/voice/synthesize \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"text": "JARVIS voice engine online."}' \
     --output test.wav
   ```
3. **Test in UI:**
   Navigate to **Settings -> VOICE & AUDIO** and click **Test Speaker Audio**. You should hear the spoken confirmation.
