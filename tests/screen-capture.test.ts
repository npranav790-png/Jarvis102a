import { describe, it } from 'node:test';
import assert from 'node:assert';
import { screenCaptureTool } from '../dist/tools/builtin/screen-capture.js';

describe('JARVIS 2.0 — Desktop Screen Awareness & Multimodal Vision', () => {
  it('1. Initializes with correct schema and system metadata', () => {
    assert.strictEqual(screenCaptureTool.name, 'desktop_screen_capture');
    assert.strictEqual(screenCaptureTool.category, 'SYSTEM');
    assert.strictEqual(screenCaptureTool.riskLevel, 'LOW');
    assert.ok(screenCaptureTool.description.includes('screenshot'));
    assert.ok(Array.isArray(screenCaptureTool.permissions));
  });

  it('2. Captures desktop screenshot and returns valid file and dimensions', async () => {
    const result = await screenCaptureTool.execute({ format: 'png', includeBase64: true });
    assert.strictEqual(result.success, true);
    assert.ok(result.filePath);
    assert.ok(result.sizeBytes > 0);
    assert.ok(result.width > 0);
    assert.ok(result.height > 0);
    assert.strictEqual(result.format, 'png');
    assert.ok(result.base64);
    assert.ok(result.dataUrl?.startsWith('data:image/png;base64,'));
  });

  it('3. Supports options without base64 payload for high performance', async () => {
    const result = await screenCaptureTool.execute({ includeBase64: false });
    assert.strictEqual(result.success, true);
    assert.ok(result.filePath);
    assert.strictEqual(result.base64, undefined);
    assert.strictEqual(result.dataUrl, undefined);
  });
});
