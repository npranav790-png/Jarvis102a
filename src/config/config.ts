import dotenv from 'dotenv';
import path from 'node:path';
import { ConfigSchema, JarvisConfig } from './schema.js';
import { ConfigurationError } from '../errors/base.js';
import { redactSecrets } from '../logging/formatter.js';

let cachedConfig: JarvisConfig | null = null;

export function loadConfig(customEnvPath?: string, overrides: Partial<Record<string, unknown>> = {}): JarvisConfig {
  if (customEnvPath) {
    dotenv.config({ path: customEnvPath });
  } else {
    dotenv.config();
  }

  const raw = {
    app: {
      name: process.env.JARVIS_APP_NAME || 'JARVIS',
      version: process.env.JARVIS_APP_VERSION || '2.0.0',
      env: (process.env.JARVIS_ENV || process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
      offline: process.env.JARVIS_OFFLINE === 'true' || process.env.OFFLINE === 'true',
    },
    database: {
      path: process.env.JARVIS_DB_PATH || 'data/jarvis.db',
    },
    logging: {
      level: (process.env.JARVIS_LOG_LEVEL || 'INFO').toUpperCase(),
      format: (process.env.JARVIS_LOG_FORMAT || 'text').toLowerCase(),
    },
    security: {
      mode: (process.env.JARVIS_SECURITY_MODE || 'strict').toLowerCase(),
      approvalThreshold: (process.env.JARVIS_APPROVAL_THRESHOLD || 'HIGH').toUpperCase(),
    },
    privacy: {
      mode: (process.env.JARVIS_PRIVACY_MODE || 'CLOUD_ONLY').toUpperCase(),
    },
    cost: {
      allowPaidProviders: process.env.JARVIS_ALLOW_PAID_PROVIDERS === 'true',
      maxCostPerDay: process.env.JARVIS_MAX_COST_PER_DAY ? parseFloat(process.env.JARVIS_MAX_COST_PER_DAY) : 0.0,
    },
    execution: {
      defaultTaskTimeoutMs: process.env.JARVIS_DEFAULT_TASK_TIMEOUT_MS ? parseInt(process.env.JARVIS_DEFAULT_TASK_TIMEOUT_MS, 10) : 60000,
      maxTaskRetries: process.env.JARVIS_MAX_TASK_RETRIES ? parseInt(process.env.JARVIS_MAX_TASK_RETRIES, 10) : 3,
    },
    providers: {
      priority: process.env.JARVIS_PROVIDER_PRIORITY
        ? process.env.JARVIS_PROVIDER_PRIORITY.split(',').map(s => s.trim().toLowerCase())
        : ['gemini', 'groq', 'openrouter', 'huggingface'],
      allowFreeModelsOnly: process.env.JARVIS_ALLOW_FREE_MODELS_ONLY !== 'false',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      defaultModel: process.env.JARVIS_DEFAULT_MODEL || process.env.JARVIS_MODEL || undefined,
      geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY || undefined,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
      groqApiKey: process.env.GROQ_API_KEY || undefined,
      huggingFaceApiKey: process.env.HUGGINGFACE_API_KEY || undefined,
      openRouterApiKey: process.env.OPENROUTER_API_KEY || undefined,
      googleAiApiKey: process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || undefined,
    },
    api: {
      enabled: process.env.JARVIS_API_ENABLED !== 'false',
      host: process.env.JARVIS_API_HOST || '127.0.0.1',
      port: process.env.JARVIS_API_PORT ? parseInt(process.env.JARVIS_API_PORT, 10) : 8787,
      version: process.env.JARVIS_API_VERSION || 'v1',
      corsOrigins: process.env.JARVIS_API_CORS_ORIGINS ? process.env.JARVIS_API_CORS_ORIGINS.split(',').map(s => s.trim()) : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'],
      accessTokenTtlSeconds: process.env.JARVIS_API_ACCESS_TOKEN_TTL ? parseInt(process.env.JARVIS_API_ACCESS_TOKEN_TTL, 10) : 3600,
      refreshTokenTtlSeconds: process.env.JARVIS_API_REFRESH_TOKEN_TTL ? parseInt(process.env.JARVIS_API_REFRESH_TOKEN_TTL, 10) : 86400 * 30,
      maxBodySizeMb: process.env.JARVIS_API_MAX_BODY_SIZE ? parseInt(process.env.JARVIS_API_MAX_BODY_SIZE, 10) : 5,
      rateLimitRequestsPerMinute: process.env.JARVIS_API_RATE_LIMIT ? parseInt(process.env.JARVIS_API_RATE_LIMIT, 10) : 100,
      wsEnabled: process.env.JARVIS_WS_ENABLED !== 'false',
      wsMaxConnections: process.env.JARVIS_WS_MAX_CONNECTIONS ? parseInt(process.env.JARVIS_WS_MAX_CONNECTIONS, 10) : 100,
    },
    voice: {
      enabled: process.env.JARVIS_VOICE_ENABLED !== 'false',
      sttProvider: process.env.JARVIS_VOICE_STT_PROVIDER || 'system',
      ttsProvider: process.env.JARVIS_VOICE_TTS_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini-tts' : 'system'),
      wakeWordEnabled: process.env.JARVIS_VOICE_WAKE_WORD_ENABLED === 'true',
      language: process.env.JARVIS_VOICE_LANGUAGE || 'en',
      sttModel: process.env.JARVIS_VOICE_STT_MODEL || 'base',
      ttsModel: process.env.JARVIS_VOICE_TTS_MODEL || 'default',
      geminiTtsModel: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts',
      geminiVoice: process.env.GEMINI_TTS_VOICE || 'Charon',
      voiceCacheEnabled: process.env.JARVIS_VOICE_CACHE_ENABLED !== 'false',
      voiceCacheTtlSeconds: process.env.JARVIS_VOICE_CACHE_TTL_SECONDS ? parseInt(process.env.JARVIS_VOICE_CACHE_TTL_SECONDS, 10) : 300,
      maxSessionSeconds: process.env.JARVIS_VOICE_MAX_SESSION_SECONDS ? parseInt(process.env.JARVIS_VOICE_MAX_SESSION_SECONDS, 10) : 60,
      maxAudioSizeMb: process.env.JARVIS_VOICE_MAX_AUDIO_SIZE_MB ? parseFloat(process.env.JARVIS_VOICE_MAX_AUDIO_SIZE_MB) : 10,
      whisperPath: process.env.JARVIS_VOICE_WHISPER_PATH || undefined,
      piperPath: process.env.JARVIS_VOICE_PIPER_PATH || undefined,
    },
    mcp: {
      configPath: process.env.JARVIS_MCP_CONFIG_PATH || 'config/mcp_servers.json',
      autoConnect: process.env.JARVIS_MCP_AUTO_CONNECT !== 'false',
    },
    ...overrides,
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const errorDetails = parsed.error.format();
    throw new ConfigurationError(
      `Invalid configuration: ${JSON.stringify(errorDetails)}`,
      { issues: parsed.error.issues }
    );
  }

  // Enforce zero-cost guardrail invariant
  if (!parsed.data.cost.allowPaidProviders && parsed.data.cost.maxCostPerDay > 0) {
    throw new ConfigurationError(
      'Inconsistent cost configuration: allowPaidProviders is false, but maxCostPerDay is greater than zero.'
    );
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

export function getConfig(): JarvisConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}

export function getRedactedConfig(config?: JarvisConfig): Record<string, unknown> {
  const cfg = config || getConfig();
  return redactSecrets(cfg) as Record<string, unknown>;
}
