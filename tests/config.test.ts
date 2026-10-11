import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { loadConfig, resetConfig, getRedactedConfig } from '../dist/config/config.js';
import { ConfigurationError } from '../dist/errors/base.js';

describe('Configuration System', () => {
  beforeEach(() => {
    resetConfig();
    delete process.env.JARVIS_ENV;
    delete process.env.JARVIS_ALLOW_PAID_PROVIDERS;
    delete process.env.JARVIS_MAX_COST_PER_DAY;
    delete process.env.GROQ_API_KEY;
  });

  it('loads default configuration cleanly', () => {
    const config = loadConfig();
    assert.strictEqual(config.app.name, 'JARVIS');
    assert.strictEqual(config.app.version, '2.0.0');
    assert.strictEqual(config.cost.allowPaidProviders, false);
    assert.strictEqual(config.cost.maxCostPerDay, 0.0);
    assert.strictEqual(config.security.mode, 'strict');
  });

  it('redacts sensitive secrets from config output', () => {
    process.env.GROQ_API_KEY = 'gsk_testsecretapikey1234567890abcdef';
    const config = loadConfig();
    const redacted = getRedactedConfig(config) as any;
    assert.strictEqual(redacted.providers.groqApiKey, '***REDACTED***');
  });

  it('enforces zero-cost policy consistency', () => {
    // Attempting to configure positive max cost when paid providers are disabled
    assert.throws(
      () => {
        loadConfig(undefined, {
          cost: {
            allowPaidProviders: false,
            maxCostPerDay: 5.0,
          },
        });
      },
      ConfigurationError
    );
  });
});
