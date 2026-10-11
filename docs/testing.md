# JARVIS 2.0 — Quality Assurance & Testing Suite

## 1. Test Architecture & Coverage

The JARVIS 2.0 automated test suite is built natively using Node.js Test Runner (`node:test`, `node:assert`) with zero external test runner bloat.

### Test Categories
* **Unit Tests**: Configuration, database schema, event bus, intent classifier, context engine, tools, agents, model registry, model router.
* **Security Regressions**: Prompt injection, path traversal, sandbox escapes, secret leakage, pairing brute-force, token expiration, approval replay, runaway loop prevention.
* **Integration Tests**: Autonomous agent task execution, multi-step plan decomposition, replan loop limits, MCP registry, REST API endpoints, WebSocket real-time messaging.
* **End-to-End Journeys**: Chat flows, task creation to verification, interactive approval lifecycles, event-triggered automations, reminder dispatch, SQLite restart recovery.

---

## 2. Executing the Test Suite

### Full Backend Suite:
```bash
npm test
```
* **Total Tests**: 172
* **Total Suites**: 41
* **Result**: 172 PASS, 0 FAIL, 0 CANCELLED, 0 SKIPPED
* **Average Execution Time**: ~2.1 seconds

### Android Test Suite:
```bash
cd android
./gradlew test
```
* **Result**: `BUILD SUCCESSFUL`

---

## 3. Key Regression Test Scenarios

1. `tests/zero-cost.test.ts`: Verifies paid providers and models are rejected at the registry boundary.
2. `tests/security-regression.test.ts`: Covers 11 security hardening criteria including token verification, replay prevention, and prompt injection XML tagging.
3. `tests/api.test.ts`: Tests pairing, bearer auth, rate limiting, and REST resource CRUD.
4. `tests/websocket.test.ts`: Tests WebSocket authentication, channel subscriptions, event broadcasts, ping/pong, and duplicate connection eviction.
5. `tests/e2e-journeys.test.ts`: Tests complete real-world user journeys and SQLite state persistence across runtime restarts.
