import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { WebSocket } from 'ws';
import { JarvisEngine } from '../dist/core/engine.js';
import { JarvisRuntime } from '../dist/runtime/runtime.js';
import { ApiServer } from '../dist/api/server.js';
import { getConfig } from '../dist/config/config.js';
import { AuthService } from '../dist/api/auth/service.js';

describe('Real-Time WebSocket Protocol & Resynchronization (Prompt 6/9/10)', () => {
  let runtime: JarvisRuntime;
  let apiServer: ApiServer;
  let wsUrl: string;
  let authService: AuthService;
  let deviceId: string;
  let accessToken: string;

  before(async () => {
    const config = getConfig();
    config.database.path = ':memory:';
    config.api.port = 0;
    config.api.host = '127.0.0.1';
    config.api.enabled = true;
    config.api.wsEnabled = true;

    const engine = new JarvisEngine(config);
    runtime = new JarvisRuntime(engine);
    await runtime.start();

    apiServer = new ApiServer(runtime);
    await apiServer.start();

    const assignedPort = apiServer.getPort();
    wsUrl = `ws://127.0.0.1:${assignedPort}/api/v1/ws`;
    authService = new AuthService(runtime);

    // Pair a test device to obtain valid token
    const pair = authService.startPairing();
    const result = authService.completePairing(pair.pairingId, pair.code, {
      name: 'WS Test Device',
      platform: 'android',
      appVersion: '2.0.0'
    });
    deviceId = result.deviceId;
    accessToken = result.accessToken;
  });

  after(async () => {
    if (apiServer) await apiServer.stop();
    if (runtime) await runtime.stop();
  });

  it('connects, authenticates and receives acknowledgement over WebSocket', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        // Send authenticate command
        ws.send(JSON.stringify({
          version: 1,
          type: 'command',
          command: 'authenticate',
          requestId: 'req_auth_1',
          data: { token: accessToken }
        }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'authenticated') {
          assert.strictEqual(msg.data.deviceId, deviceId);
          assert.strictEqual(msg.requestId, 'req_auth_1');
          ws.close();
          resolve();
        }
      });

      ws.on('error', reject);
    });
  });

  it('rejects WebSocket subscription before authentication', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          version: 1,
          type: 'command',
          command: 'subscribe',
          requestId: 'req_sub_unauth',
          data: { channels: ['tasks'] }
        }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'error') {
          assert.strictEqual(msg.error.code, 'UNAUTHORIZED');
          ws.close();
          resolve();
        }
      });

      ws.on('error', reject);
    });
  });

  it('subscribes to channels and receives real-time broadcast events', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        // Authenticate
        ws.send(JSON.stringify({
          version: 1,
          type: 'command',
          command: 'authenticate',
          requestId: 'req_auth_2',
          data: { token: accessToken }
        }));
      });

      ws.on('message', async (raw) => {
        const msg = JSON.parse(raw.toString());

        if (msg.event === 'authenticated') {
          // Subscribe to tasks channel
          ws.send(JSON.stringify({
            version: 1,
            type: 'command',
            command: 'subscribe',
            requestId: 'req_sub_1',
            data: { channels: ['tasks'] }
          }));
        } else if (msg.event === 'subscribed') {
          // Emit a task event from runtime
          await runtime.engine.eventBus.emit({
            id: 'evt_task_1',
            type: 'task.created',
            source: 'test',
            timestamp: new Date().toISOString(),
            payload: { taskId: 'task_realtime_1', title: 'Realtime Task' }
          });
        } else if (msg.event === 'task.created') {
          assert.strictEqual(msg.data.payload.taskId, 'task_realtime_1');
          ws.close();
          resolve();
        }
      });

      ws.on('error', reject);
    });
  });

  it('handles ping/pong keepalive messages', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          version: 1,
          type: 'command',
          command: 'ping',
          requestId: 'req_ping_1'
        }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'pong') {
          assert.strictEqual(msg.requestId, 'req_ping_1');
          ws.close();
          resolve();
        }
      });

      ws.on('error', reject);
    });
  });

  it('terminates old WebSocket connection when a new connection is established for same device', async () => {
    const ws1 = new WebSocket(wsUrl);
    let ws1Closed = false;

    // 1. Connect and authenticate ws1
    await new Promise<void>((resolve) => {
      ws1.on('open', () => {
        ws1.send(JSON.stringify({
          version: 1,
          type: 'command',
          command: 'authenticate',
          data: { token: accessToken }
        }));
      });
      ws1.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'authenticated') {
          resolve();
        }
      });
      ws1.on('close', () => {
        ws1Closed = true;
      });
    });

    // 2. Connect and authenticate ws2 for same device
    const ws2 = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => {
      ws2.on('open', () => {
        ws2.send(JSON.stringify({
          version: 1,
          type: 'command',
          command: 'authenticate',
          data: { token: accessToken }
        }));
      });
      ws2.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'authenticated') {
          resolve();
        }
      });
    });

    // Allow event tick for old socket cleanup
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(ws1Closed, true, 'Old WebSocket connection for device must be closed');
    ws2.close();
  });
});
