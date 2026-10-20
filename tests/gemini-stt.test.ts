import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GeminiSTTProvider } from '../dist/voice/providers/gemini-stt.js';
import { VOICE_ERRORS } from '../dist/voice/types.js';

describe('JARVIS 2.0 — Google Gemini Cloud STT Provider', () => {
  it('1. Initializes with correct properties and default model', () => {
    const provider = new GeminiSTTProvider({ apiKey: 'AQ.MockKey123456789' });
    assert.strictEqual(provider.id, 'gemini-stt');
    assert.strictEqual(provider.name, 'Google Gemini Cloud STT');
    assert.strictEqual(provider.isLocal, false);
    assert.strictEqual(provider.isPaid, false);
    assert.strictEqual(provider.getModel(), 'gemini-2.5-flash');
    assert.strictEqual(provider.getOperationalStatus(), 'READY');
  });

  it('2. Missing API key reports MISCONFIGURED and rejects transcription', async () => {
    const provider = new GeminiSTTProvider({ apiKey: '' });
    assert.strictEqual(provider.getOperationalStatus(), 'MISCONFIGURED');
    assert.strictEqual(await provider.isAvailable(), false);

    const dummyAudio = {
      buffer: Buffer.from('RIFF....WAVEfmt ....data....'),
      mimeType: 'audio/wav',
    };

    await assert.rejects(async () => {
      await provider.transcribe(dummyAudio);
    }, (err: any) => {
      assert.strictEqual(err.code, VOICE_ERRORS.INVALID_KEY);
      return true;
    });
  });

  it('3. Empty audio buffer returns empty transcript without network calls', async () => {
    const provider = new GeminiSTTProvider({ apiKey: 'AQ.MockKey123456789' });
    const emptyAudio = {
      buffer: Buffer.alloc(0),
      mimeType: 'audio/wav',
    };

    const transcript = await provider.transcribe(emptyAudio);
    assert.strictEqual(transcript.text, '');
    assert.strictEqual(transcript.confidence, 0);
    assert.strictEqual(transcript.provider, 'gemini-stt');
  });

  it('4. Handles HTTP 401/403 and classifies as INVALID_KEY', async () => {
    const provider = new GeminiSTTProvider({
      apiKey: 'AQ.InvalidKey',
      baseUrl: 'http://127.0.0.1:9', // Unreachable
    });

    // Mock global fetch to return 401
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('{"error": {"code": 401, "message": "API key not valid"}}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      const dummyAudio = {
        buffer: Buffer.from('RIFF....WAVEfmt ....data....'),
        mimeType: 'audio/wav',
      };

      await assert.rejects(async () => {
        await provider.transcribe(dummyAudio);
      }, (err: any) => {
        assert.strictEqual(err.code, VOICE_ERRORS.INVALID_KEY);
        assert.strictEqual(provider.getOperationalStatus(), 'MISCONFIGURED');
        return true;
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('5. Successfully transcribes audio from valid response', async () => {
    const provider = new GeminiSTTProvider({ apiKey: 'AQ.ValidKeySample' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: 'Jarvis, run system diagnostics.' }],
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      const dummyAudio = {
        buffer: Buffer.from('RIFF....WAVEfmt ....data....'),
        mimeType: 'audio/wav',
      };

      const result = await provider.transcribe(dummyAudio);
      assert.strictEqual(result.text, 'Jarvis, run system diagnostics.');
      assert.strictEqual(result.confidence, 0.95);
      assert.strictEqual(result.provider, 'gemini-stt');
      assert.strictEqual(result.isFinal, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
