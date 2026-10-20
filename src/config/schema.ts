import { z } from 'zod';

export const ConfigSchema = z.object({
  app: z.object({
    name: z.string().default('JARVIS'),
    version: z.string().default('2.0.0'),
    env: z.enum(['development', 'production', 'test']).default('development'),
    offline: z.boolean().default(false),
  }),
  database: z.object({
    path: z.string().default('data/jarvis.db'),
  }),
  logging: z.object({
    level: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).default('INFO'),
    format: z.enum(['text', 'json']).default('text'),
  }),
  security: z.object({
    mode: z.enum(['strict', 'permissive', 'autonomous']).default('strict'),
    approvalThreshold: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('HIGH'),
  }),
  privacy: z.object({
    mode: z.enum(['LOCAL_ONLY', 'PREFER_LOCAL', 'ALLOW_CLOUD', 'CLOUD_PREFERRED', 'CLOUD_ONLY']).default('CLOUD_ONLY'),
  }).default({
    mode: 'CLOUD_ONLY',
  }),
  cost: z.object({
    allowPaidProviders: z.boolean().default(false),
    maxCostPerDay: z.number().nonnegative().default(0.0),
  }),
  execution: z.object({
    defaultTaskTimeoutMs: z.number().int().positive().default(60000),
    maxTaskRetries: z.number().int().nonnegative().default(3),
  }),
  providers: z.object({
    priority: z.array(z.string()).default(['gemini', 'groq', 'openrouter', 'huggingface']),
    allowFreeModelsOnly: z.boolean().default(true),
    ollamaBaseUrl: z.string().url().default('http://localhost:11434'),
    defaultModel: z.string().optional(),
    geminiApiKey: z.string().optional(),
    geminiModel: z.string().default('gemini-3.7-flash'),
    groqApiKey: z.string().optional(),
    huggingFaceApiKey: z.string().optional(),
    openRouterApiKey: z.string().optional(),
    googleAiApiKey: z.string().optional(),
  }).default({
    priority: ['gemini', 'groq', 'openrouter', 'huggingface'],
    allowFreeModelsOnly: true,
    ollamaBaseUrl: 'http://localhost:11434',
    geminiModel: 'gemini-3.7-flash',
  }),
  api: z.object({
    enabled: z.boolean().default(true),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(8787),
    version: z.string().default('v1'),
    corsOrigins: z.array(z.string()).default(['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000']),
    accessTokenTtlSeconds: z.number().int().positive().default(3600), // 1 hour
    refreshTokenTtlSeconds: z.number().int().positive().default(86400 * 30), // 30 days
    maxBodySizeMb: z.number().int().positive().default(5),
    rateLimitRequestsPerMinute: z.number().int().positive().default(100),
    wsEnabled: z.boolean().default(true),
    wsMaxConnections: z.number().int().positive().default(100),
  }).default({
    enabled: true,
    host: '127.0.0.1',
    port: 8787,
    version: 'v1',
    corsOrigins: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'],
    accessTokenTtlSeconds: 3600,
    refreshTokenTtlSeconds: 86400 * 30,
    maxBodySizeMb: 5,
    rateLimitRequestsPerMinute: 100,
    wsEnabled: true,
    wsMaxConnections: 100,
  }),
  voice: z.object({
    enabled: z.boolean().default(true),
    sttProvider: z.string().default('system'),
    ttsProvider: z.string().default('gemini-tts'),
    wakeWordEnabled: z.boolean().default(false),
    language: z.string().default('en'),
    sttModel: z.string().default('base'),
    ttsModel: z.string().default('default'),
    geminiTtsModel: z.string().default('gemini-3.8-flash-lite-tts'),
    geminiVoice: z.string().default('Charon'),
    voiceCacheEnabled: z.boolean().default(true),
    voiceCacheTtlSeconds: z.number().int().positive().default(300),
    maxSessionSeconds: z.number().int().positive().default(60),
    maxAudioSizeMb: z.number().positive().default(10),
    whisperPath: z.string().optional(),
    piperPath: z.string().optional(),
  }).default({
    enabled: true,
    sttProvider: 'system',
    ttsProvider: 'gemini-tts',
    wakeWordEnabled: false,
    language: 'en',
    sttModel: 'base',
    ttsModel: 'default',
    geminiTtsModel: 'gemini-3.8-flash-lite-tts',
    geminiVoice: 'Charon',
    voiceCacheEnabled: true,
    voiceCacheTtlSeconds: 300,
    maxSessionSeconds: 60,
    maxAudioSizeMb: 10,
  }),
  mcp: z.object({
    configPath: z.string().default('config/mcp_servers.json'),
    autoConnect: z.boolean().default(true),
  }).default({
    configPath: 'config/mcp_servers.json',
    autoConnect: true,
  }),
});

export type JarvisConfig = z.infer<typeof ConfigSchema>;
