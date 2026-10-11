# JARVIS 2.0 — Persistent Memory & Context Architecture

## 1. Overview & Core Philosophy

JARVIS 2.0 treats persistent memory as **untrusted contextual data**, never as executable instructions or security policy authority. Stored memory provides historical grounding, user preferences, and project facts, but cannot override system policies, permission gates, or user instructions.

The memory subsystem is designed around four strict engineering principles:
1. **Categorized Memory Types**: Separate memory into distinct cognitive categories rather than a monolithic text dump.
2. **Zero-Cost Local Execution**: No external paid vector databases or hosted embedding APIs. Retrieval uses high-performance deterministic SQLite indexing and hybrid lexical-semantic ranking.
3. **Selective Retention & Privacy**: Ephemeral conversations are not permanently stored. Only durable facts, verified preferences, and important outcomes are retained after rigorous sensitive-data sanitization.
4. **Project Isolation**: Project-scoped memories are strictly isolated to prevent cross-project contextual pollution or information leakage.

---

## 2. Memory Types & Taxonomy

```
+-------------------------------------------------------------------------+
|                               MEMORY RECORD                             |
+-------------------------------------------------------------------------+
       |                  |                |                |
+---------------+  +---------------+  +----------+  +---------------+
|    WORKING    |  |   EPISODIC    |  | SEMANTIC |  |USER_PREFERENCE|
| Active task & |  | Past events & |  | Facts &  |  | Formats, tools|
| observations  |  | outcomes      |  | concepts |  | & conventions |
+---------------+  +---------------+  +----------+  +---------------+
```

### A. Working Memory (`WORKING`)
* **Scope**: Ephemeral, active execution context.
* **Contents**: Active task objectives, current plan step, intermediate observations, and immediate execution constraints.
* **Lifecycle**: Short-lived; automatically refreshed or cleared across session lifecycles.

### B. Episodic Memory (`EPISODIC`)
* **Scope**: Historical experiences and workflows.
* **Contents**: Summaries of past runs, build completions, task failures, missing dependencies, and verification results.
* **Integrity**: Stores concise outcome summaries and task rationales; never persists hidden chain-of-thought traces.

### C. Semantic Memory (`SEMANTIC`)
* **Scope**: Durable, verifiable knowledge units.
* **Structure**: Triplet form (`subject` + `predicate` + `content/value`).
* **Examples**:
  * `[subject: "Project", predicate: "uses_framework", content: "TypeScript with Node 24"]`
  * `[subject: "Database", predicate: "storage_engine", content: "Embedded SQLite via node:sqlite"]`

### D. Project Memory (`PROJECT`)
* **Scope**: Scoped to a specific `projectId`.
* **Contents**: Architecture decisions, dependency configurations, coding guidelines, and repository milestones.
* **Isolation**: Cannot be retrieved by requests belonging to other projects unless explicitly linked.

### E. User Preference Memory (`USER_PREFERENCE`)
* **Scope**: Global user conventions across sessions.
* **Examples**: Preferred programming languages, concise response formatting, local-first AI provider preferences.
* **Safety Filter**: Prohibited from persisting credentials, authentication secrets, or sensitive PII.

---

## 3. Data Model & Database Schema

Memories are persisted in SQLite with the following structure:

```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- WORKING, EPISODIC, SEMANTIC, PROJECT, USER_PREFERENCE
  subject TEXT NOT NULL DEFAULT '',
  predicate TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  importance TEXT NOT NULL DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, CRITICAL
  confidence REAL NOT NULL DEFAULT 1.0,      -- 0.0 to 1.0
  source TEXT NOT NULL DEFAULT 'SYSTEM',     -- USER, SYSTEM, TOOL, AGENT
  project_id TEXT,                           -- NULL for global memories
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE, EXPIRED, ARCHIVED
  expires_at TEXT,                           -- ISO8601 or NULL for permanent
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- Traceability links across tasks, plans, and events
CREATE TABLE IF NOT EXISTS memory_links (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  target_type TEXT NOT NULL,           -- TASK, PLAN, EVENT, SESSION, PROJECT
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);
```

---

## 4. Sensitive Data & Secret Sanitization

Before any memory candidate is evaluated or written to disk, it passes through `MemorySanitizer`.

```
Candidate Memory
       |
       v
+-------------------------+
|     MemorySanitizer     |  Detects API keys, passwords, bearer tokens,
|  (Regex & Heuristics)   |  OpenAI/Groq keys, private keys, auth headers
+-------------------------+
       |
       +---> Secret Detected? ---> REJECT with SensitiveDataDetectedError
       |                           (Logs safe metadata only, never secrets)
       v
  Safe Memory -> Proceed to Deduplication & Storage
```

### Detected Secret Patterns:
* Generic API keys (`api_key=...`, `apikey: ...`)
* OpenAI keys (`sk-[a-zA-Z0-9]{20,}`)
* Groq keys (`gsk_[a-zA-Z0-9]{20,}`)
* Google API keys (`AIza[0-9A-Za-z_-]{35}`)
* Passwords & secrets (`password=...`, `secret: ...`)
* Bearer & OAuth tokens (`Bearer [a-zA-Z0-9_\-\.]{20,}`)
* RSA/EC Private Keys (`-----BEGIN.*PRIVATE KEY-----`)

---

## 5. Deduplication & Conflict Resolution

### Deduplication
To prevent database bloat and repetitive knowledge accumulation:
1. Calculates token-level **Jaccard similarity** between new memory candidates and existing active records in the same scope.
2. If similarity exceeds **85%** (`>= 0.85`):
   * Reinforces the existing memory record.
   * Increments access/reinforcement count in metadata.
   * Updates `confidence` and `updated_at`.
   * Skips inserting redundant duplicate rows.

### Conflict Resolution
When new information supersedes older records (e.g., project migrated from Python to TypeScript):
1. Matches identical `subject` and `predicate` within the same project/global scope.
2. Archives the outdated record (`status = 'ARCHIVED'`).
3. Stores historical provenance in the new record's metadata (`previousContent`, `supersededMemoryId`).
4. Persists the new record with updated confidence and timestamp.

---

## 6. Multi-Factor Retrieval Pipeline

```
Query + Context (Project, Session, Types)
                     |
                     v
+------------------------------------------+
| 1. Candidate Retrieval (Indexed SQLite)  |
+------------------------------------------+
                     |
                     v
+------------------------------------------+
| 2. Scope & Project Isolation Filtering   |
+------------------------------------------+
                     |
                     v
+------------------------------------------+
| 3. Multi-Factor Scoring & Ranking Engine |
|    - Relevance (Lexical / Token overlap) |
|    - Importance Weight (CRITICAL=1.0)    |
|    - Recency Exponential Decay           |
|    - Confidence Multiplier               |
+------------------------------------------+
                     |
                     v
+------------------------------------------+
| 4. Budget Selection (Context Budget)     |
+------------------------------------------+
```

### Ranking Formula
$$\text{Score} = (0.50 \times \text{Relevance}) + (0.30 \times \text{Importance}) + (0.20 \times \text{Recency}) \times \text{Confidence}$$

* **Relevance**: Word token overlap ratio against query tokens.
* **Importance**: `CRITICAL` (1.0), `HIGH` (0.75), `NORMAL` (0.50), `LOW` (0.25).
* **Recency**: Half-life decay over 30 days: $e^{-\frac{\Delta t}{30 \text{ days}}}$.

---

## 7. CLI Usage & Diagnostics

```bash
# View brain and memory metrics
jarvis brain status

# List active memories
jarvis memory list

# Search memories by keyword or concept
jarvis memory search "TypeScript"

# Inspect detailed memory record
jarvis memory show <id>

# Delete a memory
jarvis memory delete <id>
```
