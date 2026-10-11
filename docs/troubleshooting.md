# JARVIS 2.0 — Troubleshooting & Diagnostics Guide

## 1. Common Issues & Solutions

### 1.1 Android App Cannot Connect to Backend
* **Symptom**: Android shows `Unable to connect to server` or network timeout.
* **Remedies**:
  1. Ensure PC backend is listening on `0.0.0.0` or your LAN IP, not exclusively `127.0.0.1`.
  2. Verify your Windows Firewall allows inbound connections on TCP port `8787` for your private network.
  3. Ensure both PC and mobile phone are on the same Wi-Fi network.
  4. Verify the backend URL format in the Android app: `http://192.168.x.x:8787/api/v1`.

### 1.2 WebSocket Disconnections or Reconnect Loops
* **Symptom**: WebSocket repeatedly disconnects and attempts to reconnect.
* **Remedies**:
  1. Verify the device has not been revoked.
  2. Check backend log for `Duplicate WebSocket detected`. Connecting a second client with the same device ID automatically terminates the older socket.
  3. Ensure network proxies allow WebSocket upgrade headers (`Upgrade: websocket`).

### 1.3 AI Model / Generation Unavailable
* **Symptom**: Brain returns error `No available AI models found`.
* **Remedies**:
  1. If running offline, ensure Ollama is running (`ollama serve`) and model is pulled (`ollama pull llama3:8b`).
  2. If using free-tier cloud providers, verify API keys in `.env` (e.g. `GROQ_API_KEY`).
  3. Verify `JARVIS_PRIVACY_MODE`: If set to `LOCAL_ONLY`, cloud providers are intentionally disabled.

### 1.4 Approval Request Stuck / Unresponsive
* **Symptom**: Task is in `WAITING_APPROVAL` and does not proceed.
* **Remedies**:
  1. Check Android Approvals screen or run `node dist/cli/bin.js approvals list`.
  2. If approval has expired (default TTL 15 minutes), the task must be re-triggered.

### 1.5 Pairing Code Invalid or Expired
* **Symptom**: Android pairing fails with `Invalid pairing code`.
* **Remedies**:
  1. Pairing codes expire after 15 minutes and can only be used once.
  2. Generate a fresh pairing code on CLI: `node dist/cli/bin.js auth pair`.
