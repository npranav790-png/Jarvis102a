import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OpenWakeWordDetector } from '../dist/voice/providers/open-wakeword.js';
import { localWakeWordDetector } from '../dist/voice/providers/local-wakeword.js';

describe('JARVIS 2.0 — Offline Hands-Free Wake Word Subsystem', () => {
  it('1. OpenWakeWordDetector initializes and reports available', async () => {
    const detector = new OpenWakeWordDetector('hey jarvis');
    assert.strictEqual(detector.keyword, 'hey jarvis');
    const available = await detector.isAvailable();
    assert.strictEqual(available, true);
  });

  it('2. OpenWakeWordDetector triggers wake word callbacks upon detection', async () => {
    const detector = new OpenWakeWordDetector('hey jarvis');
    await detector.start();

    let triggered = false;
    detector.onWakeWord(() => {
      triggered = true;
    });

    detector.triggerWakeWord();
    assert.strictEqual(triggered, true);

    await detector.stop();
  });

  it('3. LocalWakeWordDetector starts, listens, and emits events cleanly', async () => {
    assert.strictEqual(localWakeWordDetector.keyword, 'hey jarvis');
    const isAvail = await localWakeWordDetector.isAvailable();
    assert.strictEqual(isAvail, true);

    await localWakeWordDetector.start();
    assert.strictEqual(localWakeWordDetector.isRunning, true);

    let wakeCount = 0;
    localWakeWordDetector.onWakeWord(() => {
      wakeCount++;
    });

    localWakeWordDetector.emitWakeWord();
    assert.strictEqual(wakeCount, 1);

    await localWakeWordDetector.stop();
    assert.strictEqual(localWakeWordDetector.isRunning, false);
  });
});
