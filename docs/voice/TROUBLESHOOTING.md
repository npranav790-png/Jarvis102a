# JARVIS 2.0 Voice Troubleshooting Guide

This guide covers common issues encountered with microphone capture, local voice synthesis, speech recognition, and WebSocket session handling.

---

## 1. Browser Microphone Issues

### Symptom: "Microphone permission denied" or button remains red
- **Cause:** Browser blocked microphone access for `http://localhost:5173`.
- **Solution:**
  1. Click the lock/site settings icon in your browser address bar.
  2. Set "Microphone" to **Allow**.
  3. Reload the application. Note that modern browsers only allow microphone access on `localhost` or over secure HTTPS (`https://`).

### Symptom: Microphone button clicks but no audio recorded
- **Cause:** Default recording device in Windows is muted or disabled.
- **Solution:**
  1. Open Windows Settings -> **System** -> **Sound**.
  2. Under **Input**, verify your microphone is selected and the input volume bar responds when speaking.

---

## 2. Speech-to-Text (STT) Issues

### Symptom: Status reports `NOT_INSTALLED` for `whisper_local`
- **Cause:** JARVIS cannot locate `whisper-cli.exe` or the specified model file.
- **Solution:**
  1. Ensure the paths configured in `.env` are valid:
     ```env
     JARVIS_VOICE_WHISPER_BINARY_PATH=C:\tools\whisper\whisper-cli.exe
     JARVIS_VOICE_STT_MODEL=C:\tools\whisper\models\ggml-base.bin
     ```
  2. Or switch back to native Windows recognition:
     ```env
     JARVIS_VOICE_STT_PROVIDER=system_stt
     ```

### Symptom: Low recognition accuracy or silence
- **Cause:** Audio format mismatch or noisy input.
- **Solution:**
  JARVIS STT engines expect 16kHz, 16-bit mono PCM WAV audio. The web UI and Android clients automatically resample and encode audio to this format before sending. Ensure no background noise-cancellation filter is clipping speech.

---

## 3. Text-to-Speech (TTS) Issues

### Symptom: Status reports `NOT_INSTALLED` for `piper_local`
- **Cause:** The `piper.exe` binary or the `.onnx` voice model was not found at the configured path.
- **Solution:**
  1. Check `.env` for `JARVIS_VOICE_PIPER_BINARY_PATH` and `JARVIS_VOICE_TTS_MODEL`.
  2. Verify that both the `.onnx` file and its companion `.onnx.json` exist in the same directory.
  3. If Piper is not installed, JARVIS automatically falls back to `system_tts` (Windows SAPI).

### Symptom: Windows SAPI TTS produces no sound in browser
- **Cause:** Browser autoplay policy blocked unprompted audio playback.
- **Solution:**
  The browser requires at least one user interaction before playing audio. Clicking the microphone button or navigating the UI satisfies this requirement. Additionally, check that your browser tab is not muted.

---

## 4. Voice Session & WebSocket Issues

### Symptom: Voice session terminates unexpectedly with "Session timed out"
- **Cause:** The audio duration exceeded `JARVIS_VOICE_MAX_SESSION_SECONDS` (default: 60s).
- **Solution:**
  Adjust the timeout in your configuration if longer recording sessions are needed:
  ```env
  JARVIS_VOICE_MAX_SESSION_SECONDS=120
  ```

### Symptom: `Payload exceeds limit` error
- **Cause:** Audio upload exceeded `JARVIS_VOICE_MAX_AUDIO_SIZE_MB` (default: 15MB).
- **Solution:**
  Audio clips should normally be under 60 seconds (less than 2MB in 16kHz PCM). Keep speech commands concise, or increase `JARVIS_VOICE_MAX_AUDIO_SIZE_MB` in configuration.
