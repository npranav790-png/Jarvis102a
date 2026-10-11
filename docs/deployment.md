# JARVIS 2.0 — Deployment Architectures & Operational Guide

## 1. Supported Deployment Modes

### Mode 1: Local PC Only (Single Machine)
```text
Backend (127.0.0.1:8787)
    ↑
CLI / Browser / Local Emulator
```
* **Binding**: `JARVIS_API_HOST=127.0.0.1`
* **Access**: Only localhost applications can connect.
* **Security**: Ideal for private, single-user workstation operation.

### Mode 2: Local Area Network (LAN Home / Office Setup)
```text
PC Backend (e.g., 192.168.1.100:8787)
    ↑ (Wi-Fi / LAN)
Android Mobile Client (Pixel / Samsung / Tablet)
```
* **Binding**: `JARVIS_API_HOST=0.0.0.0` or local LAN IP.
* **Firewall Requirement**: Allow inbound TCP traffic on port `8787` on your local network profile.
* **Pairing**: Start pairing on PC CLI (`node dist/cli/bin.js auth pair`) and complete on Android app.

### Mode 3: Public Internet Deployment
> [!WARNING]
> **NOT RECOMMENDED WITHOUT REVERSE PROXY & TLS**
> Direct exposure of port `8787` to the public internet is NOT supported without a hardened reverse proxy (e.g. Nginx, Caddy, Cloudflare Tunnel) with HTTPS/WSS and IP whitelisting.

---

## 2. Production Hardening Checklist

- [x] `JARVIS_ALLOW_PAID_PROVIDERS=false` (Zero-cost enforcement)
- [x] SQLite WAL mode and transaction durability configured
- [x] Rate limiting active on authentication and chat endpoints
- [x] Replay attack protection active on approval requests
- [x] Process sandbox and path sanitization active
- [x] Android release APK minified with R8 Proguard rules
- [x] All tokens signed with HMAC SHA-256
