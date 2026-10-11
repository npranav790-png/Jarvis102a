import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JarvisEngine } from '../dist/core/engine.js';
import { JarvisRuntime } from '../dist/runtime/runtime.js';
import { ApiServer } from '../dist/api/server.js';
import { getConfig } from '../dist/config/config.js';
import { AuthService } from '../dist/api/auth/service.js';

describe('REST API, Authentication & Rate Limiting (Prompt 6/10)', () => {
  let runtime: JarvisRuntime;
  let apiServer: ApiServer;
  let baseUrl: string;
  let authService: AuthService;
  let deviceId: string;
  let accessToken: string;
  let refreshToken: string;

  before(async () => {
    const config = getConfig();
    config.database.path = ':memory:';
    config.api.port = 0;
    config.api.host = '127.0.0.1';
    config.api.enabled = true;
    config.api.wsEnabled = false;

    const engine = new JarvisEngine(config);
    runtime = new JarvisRuntime(engine);
    await runtime.start();

    apiServer = new ApiServer(runtime);
    await apiServer.start();

    const assignedPort = apiServer.getPort();
    baseUrl = `http://127.0.0.1:${assignedPort}/api/v1`;
    authService = new AuthService(runtime);
  });

  after(async () => {
    if (apiServer) await apiServer.stop();
    if (runtime) await runtime.stop();
  });

  it('provides public health check without authentication', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'HEALTHY');
    assert.strictEqual(body.details.runtime, 'RUNNING');
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    const res = await fetch(`${baseUrl}/tasks`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  it('executes full device pairing flow', async () => {
    // 1. Start pairing via API
    const startRes = await fetch(`${baseUrl}/devices/pair/start`, { method: 'POST' });
    assert.strictEqual(startRes.status, 200);
    const pairStart = await startRes.json();
    assert.ok(pairStart.pairingId);
    assert.ok(pairStart.code);

    // 2. Complete pairing via API
    const res = await fetch(`${baseUrl}/devices/pair/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingId: pairStart.pairingId,
        code: pairStart.code,
        device: {
          name: 'Pixel 8 Pro Test',
          platform: 'android',
          appVersion: '2.0.0'
        }
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.deviceId);
    assert.ok(body.accessToken);
    assert.ok(body.refreshToken);

    deviceId = body.deviceId;
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('rejects pairing with invalid or reused code', async () => {
    const startRes = await fetch(`${baseUrl}/devices/pair/start`, { method: 'POST' });
    const pairStart = await startRes.json();
    
    // Invalid code
    const res1 = await fetch(`${baseUrl}/devices/pair/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingId: pairStart.pairingId,
        code: '999999',
        device: { name: 'Attacker', platform: 'android' }
      })
    });
    assert.strictEqual(res1.status, 400);

    // Use valid code once
    const res2 = await fetch(`${baseUrl}/devices/pair/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingId: pairStart.pairingId,
        code: pairStart.code,
        device: { name: 'Legit', platform: 'android' }
      })
    });
    assert.strictEqual(res2.status, 200);

    // Attempt reuse (may be 400 invalid pairing or 429 rate limit exceeded)
    const res3 = await fetch(`${baseUrl}/devices/pair/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingId: pairStart.pairingId,
        code: pairStart.code,
        device: { name: 'Reuse Attempt', platform: 'android' }
      })
    });
    assert.ok(res3.status === 400 || res3.status === 429, `Expected 400 or 429 but got ${res3.status}`);
  });

  it('allows authenticated API calls with valid access token', async () => {
    const res = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
  });

  it('refreshes token successfully with refresh token', async () => {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.accessToken);
    assert.ok(body.refreshToken);

    // Update tokens
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('lists tasks and retrieves individual task via REST API', async () => {
    const createdTask = runtime.engine.taskManager.createTask({
      title: 'API Test Task',
      description: 'Testing task retrieval via REST',
      priority: 5
    });

    const getRes = await fetch(`${baseUrl}/tasks/${createdTask.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    assert.strictEqual(getRes.status, 200);
    const fetchedTask = await getRes.json();
    assert.strictEqual(fetchedTask.id, createdTask.id);
  });

  it('creates and lists reminders via REST API', async () => {
    const dueTime = new Date(Date.now() + 60000).toISOString();
    const createRes = await fetch(`${baseUrl}/reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        title: 'Review PR',
        description: 'Check security fixes',
        scheduledAt: dueTime
      })
    });
    assert.strictEqual(createRes.status, 200);
    const reminder = await createRes.json();
    assert.ok(reminder.id);
    assert.strictEqual(reminder.title, 'Review PR');

    const listRes = await fetch(`${baseUrl}/reminders`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    assert.strictEqual(listRes.status, 200);
    const body = await listRes.json();
    assert.ok(Array.isArray(body) && body.some((r: any) => r.id === reminder.id));
  });

  it('creates and lists notifications via REST API', async () => {
    const notif = await runtime.notificationService.createNotification(
      'SYSTEM_WARNING',
      'Test Alert',
      'This is an API test notification',
      'LOW'
    );

    const listRes = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    assert.strictEqual(listRes.status, 200);
    const body = await listRes.json();
    assert.ok(Array.isArray(body) && body.some((n: any) => n.id === notif.id));

    // Mark as read
    const readRes = await fetch(`${baseUrl}/notifications/${notif.id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    assert.strictEqual(readRes.status, 200);
  });

  it('rejects access after device is revoked', async () => {
    assert.ok(deviceId, 'deviceId must be populated from pairing flow');
    authService.revokeDevice(deviceId);

    const res = await fetch(`${baseUrl}/tasks`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    assert.strictEqual(res.status, 401);

    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    assert.strictEqual(refreshRes.status, 401);
  });
});
