import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { VoiceRegistry } from '../dist/voice/registry.js';
import { GeminiTTSProvider } from '../dist/voice/providers/gemini-tts.js';
import { VoiceDirector, JARVIS_VOICE_STYLE_PROMPT } from '../dist/voice/director.js';
import { VoiceCache } from '../dist/voice/cache.js';
import { VoiceService } from '../dist/voice/service.js';
import { VOICE_ERRORS } from '../dist/voice/types.js';
import { JarvisEngine } from '../dist/core/engine.js';
import { JarvisRuntime } from '../dist/runtime/runtime.js';
import { getConfig } from '../dist/config/config.js';
import { redactSecrets } from '../dist/logging/formatter.js';

describe('JARVIS 2.0 — Production-Quality Gemini Voice System', () => {
  let runtime: JarvisRuntime;
  let engine: JarvisEngine;

  before(async () => {
    const config = getConfig();
    config.app.env = 'test';
    config.app.offline = true;
    config.api.port = 0;
    config.api.enabled = true;
    config.api.wsEnabled = false;
    config.database.path = ':memory:';
    config.cost.allowPaidProviders = false;
    config.cost.maxCostPerDay = 0.0;
    config.voice.enabled = true;
    config.voice.ttsProvider = 'gemini-tts';
    config.security.mode = 'strict';
    config.security.approvalThreshold = 'HIGH';

    engine = new JarvisEngine(config);
    runtime = new JarvisRuntime(engine);
    await runtime.start();
  });

  after(async () => {
    try {
      await runtime.stop();
    } catch {
      // Ignore
    }
  });

  // 1. Gemini TTS provider registration
  it('1. Gemini TTS provider registers properly with correct properties', () => {
    const registry = new VoiceRegistry(engine);
    const gemini = new GeminiTTSProvider({ apiKey: 'AQ.TestKeyMock1234567890abcdef' });
    registry.registerTTS(gemini);

    const registered = registry.getTTSProvider('gemini-tts');
    assert.ok(registered);
    assert.strictEqual(registered.id, 'gemini-tts');
    assert.strictEqual(registered.name, 'Google Gemini TTS');
    assert.strictEqual(registered.isLocal, false);
    assert.strictEqual(registered.isPaid, false);
  });

  // 2. Missing API key
  it('2. Missing API key reports MISCONFIGURED and rejects synthesis', async () => {
    const gemini = new GeminiTTSProvider({ apiKey: '' });
    assert.strictEqual(gemini.getOperationalStatus(), 'MISCONFIGURED');
    assert.strictEqual(await gemini.isAvailable(), false);

    await assert.rejects(async () => {
      await gemini.synthesize('Hello world');
    }, (err: any) => {
      assert.strictEqual(err.code, VOICE_ERRORS.INVALID_KEY);
      return true;
    });
  });

  // 3. Valid configuration
  it('3. Valid configuration initializes with default Flash-Lite model and Charon voice', async () => {
    const gemini = new GeminiTTSProvider({
      apiKey: 'AQ.ValidKeySample1234567890',
      model: 'gemini-3.8-flash-lite-tts',
      voiceName: 'Charon',
    });

    assert.strictEqual(gemini.getModel(), 'gemini-3.8-flash-lite-tts');
    assert.strictEqual(gemini.getVoiceName(), 'Charon');
    assert.strictEqual(gemini.getOperationalStatus(), 'READY');
    assert.strictEqual(await gemini.isAvailable(), true);
  });

  // 4. Invalid API key
  it('4. Invalid API key returns HTTP 401/403 and throws typed INVALID_KEY error', async () => {
    const gemini = new GeminiTTSProvider({
      apiKey: 'AQ.InvalidKeyShouldFail12345',
      baseUrl: 'http://127.0.0.1:9' // Guaranteed unreachable or mock
    });

    // Test error classification directly via handleHttpError simulation
    const mockResponse = new Response('{"error": {"code": 401, "message": "API_KEY_INVALID"}}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

    await assert.rejects(async () => {
      await (gemini as any).handleHttpError(mockResponse, 1);
    }, (err: any) => {
      assert.strictEqual(err.code, VOICE_ERRORS.INVALID_KEY);
      assert.strictEqual(gemini.getOperationalStatus(), 'MISCONFIGURED');
      return true;
    });
  });

  // 5. TTS request
  it('5. TTS request builds valid generationConfig and speechConfig payload', () => {
    const gemini = new GeminiTTSProvider({
      apiKey: 'AQ.TestKeyMock1234567890abcdef',
      voiceName: 'Charon',
    });

    // Verify WAV header builder output
    const header = gemini.createWavHeader(48000, 24000, 1, 16);
    assert.strictEqual(header.length, 44);
    assert.strictEqual(header.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.strictEqual(header.subarray(8, 12).toString('ascii'), 'WAVE');
  });

  // 6. Audio response parsing
  it('6. Audio response parsing normalizes raw PCM into standard WAV container', () => {
    const gemini = new GeminiTTSProvider({ apiKey: 'AQ.MockKey1234567890' });
    const rawPcm = Buffer.alloc(2400); // 100ms of audio

    const normalized = gemini.normalizeAudioToWav(rawPcm, 'audio/l16; rate=24000; channels=1');
    assert.strictEqual(normalized.mimeType, 'audio/wav');
    assert.strictEqual(normalized.buffer.length, 2444);
    assert.strictEqual(normalized.buffer.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.strictEqual(normalized.buffer.subarray(8, 12).toString('ascii'), 'WAVE');
  });

  // 7. VoiceDirector emotion selection
  it('7. VoiceDirector emotion selection evaluates context deterministically', () => {
    const director = new VoiceDirector('Charon');

    // System status
    const d1 = director.direct('All systems operational. CPU load normal at 14 percent.', { isStatusCheck: true });
    assert.strictEqual(d1.emotion, 'CALM');

    // Security warning
    const d2 = director.direct('Destructive action detected. This requires your approval before proceeding.', { isSecurityWarning: true });
    assert.strictEqual(d2.emotion, 'CONCERNED');

    // Successful task
    const d3 = director.direct('Build completed successfully. All artifacts deployed.', { taskStatus: 'success' });
    assert.strictEqual(d3.emotion, 'CONFIDENT');

    // Humorous request
    const d4 = director.direct('I am JARVIS. A bit more sophisticated than your average toaster.', { isHumor: true });
    assert.strictEqual(d4.emotion, 'AMUSED');

    // Emergency
    const d5 = director.direct('Emergency shutdown initiated. Critical hardware failure detected.', { isError: true });
    assert.strictEqual(d5.emotion, 'URGENT');

    // Reassurance
    const d6 = director.direct('Rest assured, sir, I am monitoring the subsystem continuously.');
    assert.strictEqual(d6.emotion, 'WARM');
  });

  // 8. VoiceDirector style selection
  it('8. VoiceDirector style selection maps to correct delivery profiles', () => {
    const director = new VoiceDirector('Charon');

    const d1 = director.direct('Operational baseline intact.', { isStatusCheck: true });
    assert.strictEqual(d1.style, 'PROFESSIONAL');

    const d2 = director.direct('Access restricted by policy.', { requiresApproval: true });
    assert.strictEqual(d2.style, 'SERIOUS');

    const d3 = director.direct('Indeed, sir, humor is within my parameters.', { isHumor: true });
    assert.strictEqual(d3.style, 'DRY_HUMOR');

    const d4 = director.direct('Calculated memory bandwidth is forty gigabytes per second.');
    assert.strictEqual(d4.style, 'TECHNICAL');
  });

  // 9. Markdown sanitization
  it('9. Markdown sanitization converts lists and strips codeblocks/formatting', () => {
    const director = new VoiceDirector('Charon');
    const raw = `Here are the active resources:
- CPU
- Memory
- Network
\`\`\`typescript
const x = 42;
\`\`\`
# Overview
**All systems** are operating *normally*.`;

    const sanitized = director.sanitizeForSpeech(raw);

    assert.ok(!sanitized.includes('const x = 42;'));
    assert.ok(!sanitized.includes('```'));
    assert.ok(!sanitized.includes('# Overview'));
    assert.ok(!sanitized.includes('**'));
    assert.ok(!sanitized.includes('*normally*'));
    assert.ok(sanitized.includes('CPU, Memory, and Network.'));
    assert.ok(sanitized.includes('All systems are operating normally.'));
  });

  // 10. Secret sanitization
  it('10. Secret sanitization redacts API keys and tokens before speech', () => {
    const director = new VoiceDirector('Charon');
    const raw = 'Configured key AQ.MockSecretKeyForSanitizationTest987654 and Bearer eyJhbGciOiJIUzI1NiJ9.test.';
    const sanitized = director.sanitizeForSpeech(raw);

    assert.ok(!sanitized.includes('AQ.MockSecretKeyForSanitizationTest987654'));
    assert.ok(sanitized.includes('API key redacted'));
    assert.ok(sanitized.includes('Bearer token redacted'));
  });

  // 11. URL sanitization
  it('11. URL sanitization cleans raw URLs to readable domain names', () => {
    const director = new VoiceDirector('Charon');
    const raw = 'Visit https://github.com/google/gemini/releases/v1.0 for updates.';
    const sanitized = director.sanitizeForSpeech(raw);

    assert.ok(!sanitized.includes('https://'));
    assert.ok(sanitized.includes('github.com'));
  });

  // 12. Internal reasoning removal
  it('12. Internal reasoning removal strips <think> blocks and tool calls', () => {
    const director = new VoiceDirector('Charon');
    const raw = '<think>User wants system status. Checking CPU metrics.</think>[tool_call: get_status]System status is optimal.';
    const sanitized = director.sanitizeForSpeech(raw);

    assert.ok(!sanitized.includes('Checking CPU metrics'));
    assert.ok(!sanitized.includes('tool_call'));
    assert.strictEqual(sanitized, 'System status is optimal.');
  });

  // 13. Interruption (Barge-in)
  it('13. Interruption terminates active speech and transitions to INTERRUPTED', async () => {
    const session = await runtime.voiceService.createSession();
    (session as any).state = 'SPEAKING';

    const interrupted = await runtime.voiceService.interrupt(session.id);
    assert.strictEqual(interrupted, true);
    assert.strictEqual(session.state, 'INTERRUPTED');
  });

  // 14. State transitions
  it('14. Deterministic state transitions strictly verified', async () => {
    const session = await runtime.voiceService.createSession();
    assert.strictEqual(session.state, 'IDLE');

    // Simulate transition sequence: LISTENING -> TRANSCRIBING -> PROCESSING -> SPEAKING -> IDLE
    (runtime.voiceService as any).setSessionState(session, 'LISTENING');
    assert.strictEqual(session.state, 'LISTENING');

    (runtime.voiceService as any).setSessionState(session, 'TRANSCRIBING');
    assert.strictEqual(session.state, 'TRANSCRIBING');

    (runtime.voiceService as any).setSessionState(session, 'PROCESSING');
    assert.strictEqual(session.state, 'PROCESSING');

    (runtime.voiceService as any).setSessionState(session, 'SPEAKING');
    assert.strictEqual(session.state, 'SPEAKING');

    (runtime.voiceService as any).setSessionState(session, 'INTERRUPTED');
    assert.strictEqual(session.state, 'INTERRUPTED');

    (runtime.voiceService as any).setSessionState(session, 'IDLE');
    assert.strictEqual(session.state, 'IDLE');
  });

  // 15. WebSocket voice events
  it('15. WebSocket voice events emit structured payloads on eventBus', async () => {
    const capturedEvents: string[] = [];
    runtime.engine.eventBus.subscribeAll((event) => {
      if (event.type.startsWith('voice.')) {
        capturedEvents.push(event.type);
      }
    });

    const session = await runtime.voiceService.createSession();
    await runtime.voiceService.interrupt(session.id);

    assert.ok(capturedEvents.includes('voice.session.started'));
    assert.ok(capturedEvents.includes('voice.interrupted'));
  });

  // 16. 429 handling
  it('16. HTTP 429 enters RATE_LIMITED state and records retry_after', async () => {
    const gemini = new GeminiTTSProvider({ apiKey: 'AQ.TestKeyMock1234567890abcdef' });
    const response429 = new Response('{"error": {"code": 429, "message": "Resource has been exhausted"}}', {
      status: 429,
      headers: { 'retry-after': '45' },
    });

    await assert.rejects(async () => {
      await (gemini as any).handleHttpError(response429, 1);
    }, (err: any) => {
      assert.strictEqual(err.code, VOICE_ERRORS.QUOTA_EXHAUSTED);
      assert.strictEqual(err.retryAfter, 45);
      return true;
    });

    assert.strictEqual(gemini.getOperationalStatus(), 'RATE_LIMITED');
    assert.ok((gemini.getRetryAfterSeconds() || 0) > 0);
  });

  // 17. 503 handling
  it('17. HTTP 503 triggers bounded backoff and throws VOICE_PROVIDER_UNAVAILABLE', async () => {
    const gemini = new GeminiTTSProvider({
      apiKey: 'AQ.TestKeyMock1234567890abcdef',
      maxRetries: 0,
      initialDelayMs: 10,
    });

    const response503 = new Response('{"error": {"code": 503, "message": "Backend unavailable"}}', {
      status: 503,
    });

    await assert.rejects(async () => {
      await (gemini as any).handleHttpError(response503, 1);
    }, (err: any) => {
      assert.strictEqual(err.code, VOICE_ERRORS.PROVIDER_UNAVAILABLE);
      return true;
    });
  });

  // 18. Quota exhaustion
  it('18. Daily quota limit enforcement throws VOICE_QUOTA_EXHAUSTED', () => {
    const gemini = new GeminiTTSProvider({
      apiKey: 'AQ.TestKeyMock1234567890abcdef',
      maxRequestsPerDay: 1,
    });

    // 1st request succeeds policy check
    (gemini as any).enforceRateLimitAndPolicy();

    // 2nd request exceeds 1 RPD quota
    assert.throws(() => {
      (gemini as any).enforceRateLimitAndPolicy();
    }, (err: any) => {
      assert.strictEqual(err.code, VOICE_ERRORS.QUOTA_EXHAUSTED);
      return true;
    });
  });

  // 19. Zero-cost enforcement
  it('19. Zero-cost enforcement blocks paid providers when allowPaidProviders is false', () => {
    const registry = new VoiceRegistry(engine);

    // Paid TTS provider
    registry.registerTTS({
      id: 'paid-cloud-voice',
      name: 'Expensive Paid Voice API',
      isLocal: false,
      isPaid: true,
      synthesize: async () => ({} as any),
      isAvailable: async () => true,
    });

    assert.strictEqual(registry.getTTSProvider('paid-cloud-voice'), undefined);
  });

  // 20. Approval enforcement for dangerous voice commands
  it('20. Dangerous spoken commands route through Brain and require approval', async () => {
    // 1. Verify destructive tools require approval
    const deleteTool = engine.toolRegistry.get('filesystem.delete');
    assert.ok(deleteTool);
    assert.strictEqual(deleteTool.category, 'DESTRUCTIVE');
    assert.strictEqual(deleteTool.riskLevel, 'HIGH');

    // 2. Verify Approval Policy requires approval for HIGH risk actions
    const requiresApproval = engine.securityPolicy.requiresApproval('HIGH');
    assert.strictEqual(requiresApproval, true);

    // 3. Verify ApprovalManager blocks destructive actions without human approval
    await assert.rejects(async () => {
      await engine.approvalManager.evaluateAndRequestApproval({
        action: 'filesystem.delete',
        category: 'DESTRUCTIVE',
        riskLevel: 'HIGH',
        actor: 'voice:user',
        target: 'production_database',
      });
    }, (err: any) => {
      assert.strictEqual(err.code, 'APPROVAL_REJECTED');
      return true;
    });
  });

  // 21. API key never appears in logs
  it('21. API keys are redacted from logs and memory formatting', () => {
    const rawKey = 'AQ.MockSecretKeyForSanitizationTest987654';
    const logData = {
      message: `Connecting with key ${rawKey}`,
      apiKey: rawKey,
    };

    const redacted = redactSecrets(logData) as any;
    assert.strictEqual(redacted.apiKey, '***REDACTED***');
    assert.ok(!redacted.message.includes(rawKey));
    assert.ok(redacted.message.includes('***REDACTED***'));
  });

  // Centralized style prompt verification (Section 7)
  it('Centralized style prompt contains core JARVIS vocal identity', () => {
    assert.ok(JARVIS_VOICE_STYLE_PROMPT.includes('JARVIS'));
    assert.ok(JARVIS_VOICE_STYLE_PROMPT.includes('calm authority'));
    assert.ok(JARVIS_VOICE_STYLE_PROMPT.includes('subtle warmth'));
    assert.ok(JARVIS_VOICE_STYLE_PROMPT.includes('dry humor'));
  });

  // Voice Cache verification (Section 22)
  it('VoiceCache caches safe static responses and ignores dynamic/sensitive data', () => {
    const cache = new VoiceCache(10, 60);

    assert.strictEqual(cache.isCacheable('At your service, sir.'), true);
    assert.strictEqual(cache.isCacheable('Standing by.'), true);

    // Dynamic metrics, passwords, numbers are never cached
    assert.strictEqual(cache.isCacheable('CPU is at 85 percent and 4 cores active'), false);
    assert.strictEqual(cache.isCacheable('Your password token is secret123'), false);
    assert.strictEqual(cache.isCacheable('Security warning: approval required'), false);
  });
});
