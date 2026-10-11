# JARVIS 2.0 — REST & WebSocket API Specification

## 1. Overview & Base URLs

* **Base URL**: `http://<host>:<port>/api/v1`
* **WebSocket URL**: `ws://<host>:<port>/api/v1/ws`
* **Default Port**: `8787`

---

## 2. Authentication & Authorization

All protected routes require a valid Bearer token in the `Authorization` header:
```http
Authorization: Bearer <access_token>
```

### 2.1 Start Device Pairing
```http
POST /api/v1/devices/pair/start
```
* **Auth**: Public (Rate Limited: 5 req/min)
* **Response**:
  ```json
  {
    "pairingId": "pair_0123456789abcdef",
    "code": "849201",
    "expiresAt": "2026-09-28T08:00:00.000Z"
  }
  ```

### 2.2 Complete Device Pairing
```http
POST /api/v1/devices/pair/complete
```
* **Auth**: Public
* **Request Body**:
  ```json
  {
    "pairingId": "pair_0123456789abcdef",
    "code": "849201",
    "device": {
      "name": "Pixel 8 Pro",
      "platform": "android",
      "appVersion": "2.0.0"
    }
  }
  ```
* **Response**:
  ```json
  {
    "deviceId": "dev_9876543210abcdef",
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
  ```

### 2.3 Refresh Token
```http
POST /api/v1/auth/refresh
```
* **Auth**: Public
* **Request Body**:
  ```json
  {
    "refreshToken": "eyJ..."
  }
  ```

---

## 3. Core Endpoints

### 3.1 Health & Runtime Status
* `GET /api/v1/health` (Public): Returns `status: "HEALTHY" | "DEGRADED"` and runtime health details.
* `GET /api/v1/runtime/status` (Protected): Returns detailed runtime metrics.

### 3.2 Chat & Conversational Brain
* `POST /api/v1/chat` (Protected):
  ```json
  {
    "message": "Analyze system performance",
    "sessionId": "sess_123"
  }
  ```

### 3.3 Tasks
* `GET /api/v1/tasks`: List all tasks (supports query filtering).
* `GET /api/v1/tasks/:id`: Get task by ID.
* `POST /api/v1/tasks/:id/cancel`: Cancel active task.
* `POST /api/v1/tasks/:id/retry`: Retry failed task.

### 3.4 Approvals
* `GET /api/v1/approvals`: List pending approvals.
* `GET /api/v1/approvals/:id`: Get approval details.
* `POST /api/v1/approvals/:id/approve`: Approve dangerous operation.
* `POST /api/v1/approvals/:id/deny`: Deny dangerous operation.

### 3.5 Automations & Reminders
* `GET /api/v1/automations`: List automation rules.
* `POST /api/v1/automations`: Create new automation.
* `POST /api/v1/automations/:id/enable`: Enable automation rule.
* `POST /api/v1/automations/:id/disable`: Disable automation rule.
* `GET /api/v1/reminders`: List scheduled reminders.
* `POST /api/v1/reminders`: Create reminder (`title`, `description`, `scheduledAt`).
* `POST /api/v1/reminders/:id/cancel`: Cancel scheduled reminder.

### 3.6 Notifications
* `GET /api/v1/notifications`: List notifications.
* `POST /api/v1/notifications/:id/read`: Mark notification as read.
* `POST /api/v1/notifications/read-all`: Mark all notifications as read.

---

## 4. WebSocket Protocol

### 4.1 Authentication Command
```json
{
  "version": 1,
  "type": "command",
  "command": "authenticate",
  "requestId": "req_auth",
  "data": {
    "token": "<access_token>"
  }
}
```

### 4.2 Channel Subscription
```json
{
  "version": 1,
  "type": "command",
  "command": "subscribe",
  "data": {
    "channels": ["tasks", "approvals", "notifications", "automations"]
  }
}
```

### 4.3 Keep-Alive Ping
```json
{
  "version": 1,
  "type": "command",
  "command": "ping",
  "requestId": "req_ping"
}
```
Response:
```json
{
  "version": 1,
  "type": "event",
  "event": "pong",
  "requestId": "req_ping"
}
```
