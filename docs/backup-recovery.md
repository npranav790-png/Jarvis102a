# JARVIS 2.0 — Backup & Disaster Recovery Strategy

## 1. Data Classification

| Category | Description | Backup Recommendation |
|---|---|---|
| **SQLite Database (`data/jarvis.db`)** | Projects, sessions, tasks, persistent memories, automations, reminders, audit logs | **SAFE & ESSENTIAL TO BACK UP** |
| **Configuration (`.env`)** | Environment variables, local paths, provider settings | **BACK UP SECURELY** (contains optional API keys) |
| **Artifacts (`data/artifacts/`)** | User-generated code, analysis reports, documents | **SAFE TO BACK UP** |
| **Node Modules (`node_modules/`)** | Installed npm dependencies | **DO NOT BACK UP** (Regenerable via `npm install`) |
| **Build Outputs (`dist/`, `build/`)** | Transpiled JavaScript, compiled APKs | **DO NOT BACK UP** (Regenerable via `npm run build`) |
| **Logs (`logs/`)** | Diagnostic execution logs | **OPTIONAL** |

---

## 2. Safe Manual Backup Strategy

### Step 1: Graceful Stop
Before backing up a live SQLite database, stop the JARVIS process to ensure all WAL pages are checkpointed cleanly:
```bash
npm run jarvis -- stop
```

### Step 2: Create Timestamped Archive
```bash
tar -czvf jarvis-backup-$(date +%Y%m%d).tar.gz data/jarvis.db .env
```

---

## 3. Disaster Recovery / Restore Process

1. Install prerequisites and clone repository on new host.
2. Run `npm install && npm run build`.
3. Restore `.env` file into workspace root.
4. Restore `jarvis.db` into `data/jarvis.db`.
5. Start JARVIS: `npm start`.
6. Run `GET /api/v1/health` or `npm test` to verify database schema and runtime integrity.
