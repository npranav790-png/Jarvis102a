import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GeminiLiveProvider } from '../dist/voice/providers/gemini-live.js';

describe('JARVIS 2.0 — Google Gemini 3.8 Live Bidirectional Streaming', () => {
  it('1. Initializes with correct defaults and free-tier properties', () => {
    const provider = new GeminiLiveProvider({
      apiKey: 'test-fake-key-12345',
      voiceName: 'Charon',
    });

    assert.strictEqual(provider.id, 'gemini-live');
    assert.strictEqual(provider.isLocal, false);
    assert.strictEqual(provider.isPaid, false);
    assert.strictEqual(provider.getVoice(), 'Charon');
    assert.strictEqual(provider.getOperationalStatus(), 'READY');
  });

  it('2. Missing API key reports MISCONFIGURED and rejects connect', async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;

    try {
      const provider = new GeminiLiveProvider({});
      assert.strictEqual(provider.getOperationalStatus(), 'MISCONFIGURED');
      await assert.rejects(provider.connect(), /GEMINI_API_KEY is not configured/);
    } finally {
      if (originalEnv) process.env.GEMINI_API_KEY = originalEnv;
    }
  });

  it('3. Connects to Live WebSocket, sends setup, streams audio/text, and processes interruption', async () => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    let receivedSetup = false;
    let receivedAudio = false;
    let receivedText = false;
    let mockClientSocket: WebSocket | null = null;

    wss.on('connection', (ws) => {
      mockClientSocket = ws;
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.setup) {
          receivedSetup = true;
        }
        if (msg.realtimeInput?.mediaChunks) {
          receivedAudio = true;
        }
        if (msg.clientContent?.turns) {
          receivedText = true;
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const wsUrl = `ws://127.0.0.1:${port}`;

    try {
      const provider = new GeminiLiveProvider({
        apiKey: 'test-key',
        endpointUrl: wsUrl,
        voiceName: 'Charon',
      });

      let audioReceived = false;
      let transcriptReceived = false;
      let interruptedReceived = false;

      provider.onAudio((chunk) => {
        if (chunk.data.length > 0) {
          audioReceived = true;
        }
      });

      provider.onTranscript((t) => {
        if (t.text.includes('Hello Sir')) {
          transcriptReceived = true;
        }
      });

      provider.onInterrupted(() => {
        interruptedReceived = true;
      });

      await provider.connect({ url: wsUrl });
      await new Promise((r) => setTimeout(r, 25));
      assert.strictEqual(receivedSetup, true, 'Provider must send setup payload upon connection');

      // Send audio chunk
      await provider.sendAudio({
        buffer: Buffer.from([1, 2, 3, 4]),
        data: Buffer.from([1, 2, 3, 4]),
        mimeType: 'audio/pcm;rate=16000',
      } as any);
      await new Promise((r) => setTimeout(r, 25));
      assert.strictEqual(receivedAudio, true, 'Provider must stream audio chunk');

      // Send text
      await provider.sendText('Status report');
      await new Promise((r) => setTimeout(r, 25));
      assert.strictEqual(receivedText, true, 'Provider must stream client text');

      // Simulate Gemini model responding with audio and transcript
      mockClientSocket!.send(
        JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [
                {
                  text: 'Hello Sir, systems nominal.',
                  inlineData: {
                    mimeType: 'audio/pcm;rate=24000',
                    data: Buffer.from([10, 20, 30]).toString('base64'),
                  },
                },
              ],
            },
            outputTranscription: { text: 'Hello Sir, systems nominal.' },
          },
        })
      );

      // Wait a tick for events to process
      await new Promise((r) => setTimeout(r, 50));
      assert.strictEqual(audioReceived, true, 'Provider should receive model audio');
      assert.strictEqual(transcriptReceived, true, 'Provider should receive output transcript');

      // Simulate user interruption event
      mockClientSocket!.send(
        JSON.stringify({
          serverContent: {
            interrupted: true,
          },
        })
      );

      await new Promise((r) => setTimeout(r, 50));
      assert.strictEqual(interruptedReceived, true, 'Provider should emit interrupted event');

      await provider.disconnect();
    } finally {
      if (mockClientSocket) {
        try {
          (mockClientSocket as WebSocket).terminate();
        } catch {
          // Ignore
        }
      }
      wss.close();
      server.close();
    }
  });
});
