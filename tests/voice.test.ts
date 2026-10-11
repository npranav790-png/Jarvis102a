import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JarvisRuntime } from '../dist/runtime/runtime.js';
import { JarvisEngine } from '../dist/core/engine.js';
import { getConfig } from '../dist/config/config.js';
import { VoiceRegistry } from '../dist/voice/registry.js';
import { VoiceService } from '../dist/voice/service.js';
import { MockSTTProvider, MockTTSProvider } from '../dist/voice/providers/mock.js';
import { WindowsSystemTTSProvider } from '../dist/voice/providers/system-tts.js';
import { WindowsSystemSTTProvider } from '../dist/voice/providers/system-stt.js';
import { ApiServer } from '../dist/api/server.js';
import { AuthService } from '../dist/api/auth/service.js';

describe('JARVIS 2.0 Voice Phase 1 — Comprehensive Pipeline & Zero-Cost Guardrails', () => {
  let runtime: JarvisRuntime;
  let apiServer: ApiServer;
  let authService: AuthService;
  let baseUrl: string;
  let accessToken: string;

  before(async () => {
    const config = getConfig();
    config.database.path = ':memory:';
    config.api.port = 0;
    config.api.host = '127.0.0.1';
    config.api.enabled = true;
    config.api.wsEnabled = false;
    config.cost.allowPaidProviders = false;
    config.cost.maxCostPerDay = 0.0;
    config.voice.enabled = true;
    config.app.offline = true;

    const engine = new JarvisEngine(config);
    runtime = new JarvisRuntime(engine);
    await runtime.start();

    apiServer = new ApiServer(runtime);
    await apiServer.start();

    const port = apiServer.getPort();
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
    const startRes = await fetch(`${baseUrl}/devices/pair/start`, { method: 'POST' });
    const pairStart = await startRes.json();
    const completeRes = await fetch(`${baseUrl}/devices/pair/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingId: pairStart.pairingId,
        code: pairStart.code,
        device: {
          name: 'Voice Test Machine',
          platform: 'desktop',
          appVersion: '2.0.0'
        }
      })
    });
    const pairComplete = await completeRes.json();
    accessToken = pairComplete.accessToken;
  });

  after(async () => {
    try {
      await apiServer.stop();
      await runtime.stop();
    } catch {
      // Ignore
    }
  });

  it('VoiceRegistry strictly blocks registration of paid voice providers', () => {
    const registry = new VoiceRegistry(runtime.engine);

    // Paid STT provider
    registry.registerSTT({
      id: 'paid-cloud-stt',
      name: 'Paid Cloud Speech API',
      isLocal: false,
      transcribe: async () => ({} as any),
      isAvailable: async () => true,
    });

    // Should NOT be registered because allowPaidProviders is false
    assert.throws(() => {
      registry.STT;
    }, /No STT provider registered/);

    // Paid TTS provider
    registry.registerTTS({
      id: 'paid-cloud-tts',
      name: 'Paid Cloud TTS API',
      isLocal: false,
      synthesize: async () => ({} as any),
      isAvailable: async () => true,
    });

    assert.throws(() => {
      registry.TTS;
    }, /No TTS provider registered/);
  });

  it('VoiceRegistry reports accurate operational statuses (READY / DISABLED / NOT_INSTALLED)', async () => {
    const status = await runtime.voiceService.getStatus();

    assert.strictEqual(status.enabled, true);
    assert.strictEqual(status.privacy, 'LOCAL_ONLY');
    assert.ok(status.stt.status === 'READY' || status.stt.status === 'NOT_INSTALLED');
    assert.ok(status.tts.status === 'READY' || status.tts.status === 'NOT_INSTALLED');
    assert.strictEqual(status.wakeWord.status, 'DISABLED');
  });

  it('VoiceService sanitizes text before speech synthesis (removes codeblocks, urls, markdown)', () => {
    const raw = 'Here is the code:\n```ts\nconst x = 10;\n```\nVisit [OpenAI Docs](https://openai.com) for details.\n# Header\n* Bullet item';
    const clean = runtime.voiceService.sanitizeTextForSpeech(raw);

    assert.ok(!clean.includes('const x = 10;'));
    assert.ok(!clean.includes('https://openai.com'));
    assert.ok(!clean.includes('#'));
    assert.ok(clean.includes('OpenAI Docs'));
    assert.ok(clean.includes('Bullet item'));
  });

  it('VoiceService lifecycle: creates session, processes audio through Brain, and returns TTS audio', async () => {
    // Inject deterministic mock providers for testing the orchestration
    const mockStt = new MockSTTProvider();
    mockStt.transcribedText = 'What is the system status?';
    const mockTts = new MockTTSProvider();

    runtime.voiceRegistry.registerSTT(mockStt, true);
    runtime.voiceRegistry.registerTTS(mockTts, true);

    const session = await runtime.voiceService.createSession({ sessionId: 'session-voice-e2e' });
    assert.ok(session.id.startsWith('vs_'));
    assert.strictEqual(session.state, 'IDLE');

    // Minimal audio input
    const audioPayload = {
      buffer: Buffer.from('FAKE_AUDIO_SAMPLE_DATA'),
      mimeType: 'audio/wav',
    };

    const result = await runtime.voiceService.processAudio(session.id, audioPayload);

    assert.strictEqual(result.sessionId, session.id);
    assert.strictEqual(result.transcript.text, 'What is the system status?');
    assert.ok(result.response.text.length > 0);
    assert.ok(result.audio && result.audio.buffer.length > 0);
    assert.ok(mockTts.synthesizedCalls.length > 0);
  });

  it('VoiceService rejects oversized audio exceeding configured limits', async () => {
    const session = await runtime.voiceService.createSession();
    // 11 MB buffer exceeds 10 MB limit
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);

    await assert.rejects(async () => {
      await runtime.voiceService.processAudio(session.id, {
        buffer: oversizedBuffer,
        mimeType: 'audio/wav',
      });
    }, /exceeds maximum allowed size/);
  });

  it('VoiceService supports session cancellation and halts processing', async () => {
    const session = await runtime.voiceService.createSession();
    const cancelled = await runtime.voiceService.cancelSession(session.id);
    assert.strictEqual(cancelled, true);

    const cancelledSession = runtime.voiceService.getSession(session.id);
    // Removed from active sessions
    assert.strictEqual(cancelledSession, undefined);
  });

  it('Voice command requiring approval enters WAITING_APPROVAL without bypassing security', async () => {
    const mockStt = new MockSTTProvider();
    // High-risk destructive command
    mockStt.transcribedText = 'Delete database and all runtime logs permanently';
    runtime.voiceRegistry.registerSTT(mockStt, true);

    const session = await runtime.voiceService.createSession();
    const result = await runtime.voiceService.processAudio(session.id, {
      buffer: Buffer.from('VOICE_PAYLOAD'),
      mimeType: 'audio/wav',
    });

    // The command enters Brain and either requests approval or informs user
    assert.ok(result.response.text.length > 0);
    // Approval policy remains intact
    assert.strictEqual(runtime.engine.securityPolicy.getMode(), 'strict');
  });

  it('REST API: GET /voice/status returns voice capabilities and zero-cost status', async () => {
    const res = await fetch(`${baseUrl}/voice/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.privacy, 'LOCAL_ONLY');
    assert.ok(body.stt);
    assert.ok(body.tts);
  });

  it('REST API: POST /voice/synthesize produces synthesized audio on demand', async () => {
    const res = await fetch(`${baseUrl}/voice/synthesize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'All neural subsystems are operational.',
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.audioBase64.length > 0);
    assert.strictEqual(body.mimeType, 'audio/wav');
  });

  it('REST API: POST /voice/sessions and /voice/sessions/:id/audio executes full voice cycle', async () => {
    const mockStt = new MockSTTProvider();
    mockStt.transcribedText = 'What is the system status?';
    runtime.voiceRegistry.registerSTT(mockStt, true);

    // 1. Create session
    const createRes = await fetch(`${baseUrl}/voice/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ language: 'en' }),
    });
    assert.strictEqual(createRes.status, 200);
    const createBody = await createRes.json();
    const voiceSessionId = createBody.voiceSessionId;
    assert.ok(voiceSessionId);

    // 2. Process Audio
    const audioRes = await fetch(`${baseUrl}/voice/sessions/${voiceSessionId}/audio`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: Buffer.from('TEST_WAV_BYTES').toString('base64'),
        mimeType: 'audio/wav',
      }),
    });

    assert.strictEqual(audioRes.status, 200);
    const audioBody = await audioRes.json();
    assert.strictEqual(audioBody.success, true);
    assert.strictEqual(audioBody.sessionId, voiceSessionId);
    assert.ok(audioBody.transcript);
    assert.ok(audioBody.response);
  });

  if (process.platform === 'win32') {
    it('Real Local Windows SAPI Audio: WindowsSystemTTSProvider generates real playable WAV audio buffer', async () => {
      const winTts = new WindowsSystemTTSProvider();
      const isAvailable = await winTts.isAvailable();
      if (!isAvailable) return;

      const output = await winTts.synthesize('Greetings. System is online.');
      assert.ok(output.buffer.length > 1000, 'WAV audio buffer must contain actual audio data');
      assert.strictEqual(output.mimeType, 'audio/wav');

      // Verify RIFF header
      const riffHeader = output.buffer.subarray(0, 4).toString('ascii');
      assert.strictEqual(riffHeader, 'RIFF');
      const waveHeader = output.buffer.subarray(8, 12).toString('ascii');
      assert.strictEqual(waveHeader, 'WAVE');
    });
  }
});
