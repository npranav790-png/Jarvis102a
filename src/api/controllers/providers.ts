import { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { JarvisRuntime } from '../../runtime/runtime.js';
import { GeminiProvider } from '../../providers/gemini.js';
import { createEvent } from '../../events/types.js';
import { z } from 'zod';
import { PrivacyMode } from '../../providers/types.js';

function persistKeyToEnv(keyName: string, value: string): void {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf-8');
      const pattern = new RegExp(`^${keyName}=.*$`, 'm');
      if (pattern.test(content)) {
        content = content.replace(pattern, `${keyName}=${value}`);
      } else {
        content += `\n${keyName}=${value}\n`;
      }
      fs.writeFileSync(envPath, content, 'utf-8');
    }
  } catch {
    // Ignore error
  }
}

export class ProvidersController {
  constructor(private runtime: JarvisRuntime) {}

  public list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!this.runtime.engine.providerRegistry.has('gemini')) {
        this.runtime.engine.providerRegistry.initializeFromConfig(this.runtime.engine.config);
      }
      const providers = this.runtime.engine.providerRegistry.list();
      const healthMap = await this.runtime.engine.providerRegistry.checkAllHealth(true);
      const models = await this.runtime.engine.modelRegistry.listModels();

      const result = providers.map(p => {
        const health = healthMap[p.id] || { status: 'UNKNOWN' };
        const providerModels = models.filter(m => m.providerId === p.id);
        const capabilities = p.getCapabilities();
        const hasKey = typeof (p as any).getApiKey === 'function' ? Boolean((p as any).getApiKey()) : false;
        const key = typeof (p as any).getApiKey === 'function' ? (p as any).getApiKey() : undefined;
        const maskedKey = key && key.length > 4 ? '••••••••' + key.slice(-4) : undefined;

        return {
          id: p.id,
          name: p.name,
          isPaid: p.isPaid,
          isLocal: p.isLocal,
          status: health.status,
          message: health.message,
          latencyMs: health.latencyMs,
          hasKey,
          maskedKey,
          models: providerModels.map(m => ({
            id: m.id,
            name: m.name,
            contextWindow: m.contextWindow,
            isFree: m.isFree,
            speedClass: m.speedClass,
          })),
          capabilities,
        };
      });

      res.json({
        activeProviderCount: providers.length,
        zeroCostPolicy: !this.runtime.engine.config.cost.allowPaidProviders,
        privacyMode: this.runtime.engine.config.privacy.mode,
        providers: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public configure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { geminiApiKey, googleAiApiKey, groqApiKey, ollamaBaseUrl, openRouterApiKey, huggingFaceApiKey } = req.body;
      const config = this.runtime.engine.config;

      if (geminiApiKey !== undefined) {
        config.providers.geminiApiKey = geminiApiKey.trim() || undefined;
        if (geminiApiKey.trim()) {
          persistKeyToEnv('GEMINI_API_KEY', geminiApiKey.trim());
        }
      }
      if (googleAiApiKey !== undefined) {
        config.providers.googleAiApiKey = googleAiApiKey.trim() || undefined;
      }
      if (groqApiKey !== undefined) {
        config.providers.groqApiKey = groqApiKey.trim() || undefined;
      }
      if (ollamaBaseUrl !== undefined) {
        config.providers.ollamaBaseUrl = ollamaBaseUrl.trim() || 'http://localhost:11434';
      }
      if (openRouterApiKey !== undefined) {
        config.providers.openRouterApiKey = openRouterApiKey.trim() || undefined;
      }
      if (huggingFaceApiKey !== undefined) {
        config.providers.huggingFaceApiKey = huggingFaceApiKey.trim() || undefined;
      }

      // Re-initialize providers
      this.runtime.engine.providerRegistry.initializeFromConfig(config);
      await this.runtime.engine.modelRegistry.refresh();

      const healthMap = await this.runtime.engine.providerRegistry.checkAllHealth(true);

      res.json({
        success: true,
        message: 'Provider configuration updated successfully',
        health: healthMap,
      });
    } catch (err) {
      next(err);
    }
  };

  public test = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { providerId, modelId, apiKey } = req.body;
      if (!providerId) {
        return res.status(400).json({ error: 'providerId is required' });
      }

      if (!this.runtime.engine.providerRegistry.has(providerId)) {
        this.runtime.engine.providerRegistry.initializeFromConfig(this.runtime.engine.config);
      }

      if (providerId === 'gemini' && !this.runtime.engine.providerRegistry.has('gemini')) {
        this.runtime.engine.providerRegistry.register(new GeminiProvider({
          apiKey: apiKey || this.runtime.engine.config.providers.geminiApiKey,
          defaultModel: this.runtime.engine.config.providers.geminiModel,
        }));
      }

      const provider = this.runtime.engine.providerRegistry.get(providerId);

      if (apiKey && typeof (provider as any).setApiKey === 'function') {
        (provider as any).setApiKey(apiKey.trim());
        if (providerId === 'gemini') {
          this.runtime.engine.config.providers.geminiApiKey = apiKey.trim();
        }
      }

      const health = await this.runtime.engine.providerRegistry.checkHealth(providerId, true);

      if (health.status === 'ONLINE' && providerId === 'gemini' && apiKey) {
        persistKeyToEnv('GEMINI_API_KEY', apiKey.trim());
      }

      if (health.status !== 'ONLINE') {
        return res.json({
          success: false,
          health,
          response: null,
          error: health.message || 'Provider is not online',
        });
      }

      const testResponse = await provider.generate({
        messages: [{ role: 'user', content: 'Ping JARVIS operational telemetry.' }],
        modelId: modelId || undefined,
      });

      res.json({
        success: true,
        health,
        response: testResponse.content,
        usage: testResponse.usage,
      });
    } catch (err: any) {
      res.json({
        success: false,
        error: err.message || 'Test failed',
      });
    }
  };

  public getMode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentPrivacyMode = this.runtime.engine.modelRouter.getPrivacyMode() || this.runtime.engine.config.privacy.mode;
      const isLocal = currentPrivacyMode === 'LOCAL_ONLY' || currentPrivacyMode === 'PREFER_LOCAL';
      const isCloud = currentPrivacyMode === 'CLOUD_ONLY' || currentPrivacyMode === 'CLOUD_PREFERRED';
      const mode: 'LOCAL' | 'CLOUD' | 'HYBRID' = isLocal ? 'LOCAL' : (isCloud ? 'CLOUD' : 'HYBRID');
      const allowFallback = currentPrivacyMode === 'PREFER_LOCAL' || currentPrivacyMode === 'CLOUD_PREFERRED' || currentPrivacyMode === 'ALLOW_CLOUD';

      let cloudHealth: any = { status: 'UNKNOWN' };
      let localHealth: any = { status: 'UNKNOWN' };
      try {
        if (this.runtime.engine.providerRegistry.has('gemini')) {
          cloudHealth = await this.runtime.engine.providerRegistry.checkHealth('gemini', false);
        }
        if (this.runtime.engine.providerRegistry.has('ollama')) {
          localHealth = await this.runtime.engine.providerRegistry.checkHealth('ollama', false);
        }
      } catch {}

      const allModels = await this.runtime.engine.modelRegistry.listModels();
      const cloudModels = allModels.filter(m => !m.isLocal).map(m => ({ id: m.id, name: m.name, providerId: m.providerId }));
      const localModels = allModels.filter(m => m.isLocal).map(m => ({ id: m.id, name: m.name, providerId: m.providerId }));

      res.json({
        success: true,
        mode,
        privacyMode: currentPrivacyMode,
        allowFallback,
        preferredModel: this.runtime.engine.modelRouter.getPreferredModel(),
        cloud: {
          provider: 'gemini',
          name: 'Google Gemini (Cloud)',
          status: cloudHealth.status,
          latencyMs: cloudHealth.latencyMs,
          model: this.runtime.engine.config.providers.geminiModel || 'gemini-3.7-flash',
          models: cloudModels,
        },
        local: {
          provider: 'ollama',
          name: 'Ollama (Local Engine)',
          status: localHealth.status,
          latencyMs: localHealth.latencyMs,
          baseUrl: this.runtime.engine.config.providers.ollamaBaseUrl || 'http://localhost:11434',
          models: localModels,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public setMode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        mode: z.enum(['CLOUD', 'LOCAL', 'HYBRID']),
        allowFallback: z.boolean().optional().default(true),
        preferredModel: z.string().optional(),
      });
      const parsed = schema.parse(req.body);

      let privacyMode: PrivacyMode;
      let priority: string[];

      if (parsed.mode === 'CLOUD') {
        privacyMode = parsed.allowFallback ? 'CLOUD_PREFERRED' : 'CLOUD_ONLY';
        priority = ['gemini', 'groq', 'openrouter', 'huggingface', 'ollama'];
      } else if (parsed.mode === 'LOCAL') {
        privacyMode = parsed.allowFallback ? 'PREFER_LOCAL' : 'LOCAL_ONLY';
        priority = ['ollama', 'gemini', 'groq', 'openrouter', 'huggingface'];
      } else {
        privacyMode = 'ALLOW_CLOUD';
        priority = ['gemini', 'ollama', 'groq', 'openrouter', 'huggingface'];
      }

      this.runtime.engine.modelRouter.setPrivacyMode(privacyMode);
      this.runtime.engine.modelRouter.setProviderPriority(priority);
      if (parsed.preferredModel !== undefined) {
        this.runtime.engine.modelRouter.setPreferredModel(parsed.preferredModel || undefined);
      }
      this.runtime.engine.config.privacy.mode = privacyMode;

      persistKeyToEnv('JARVIS_PRIVACY_MODE', privacyMode);

      await this.runtime.engine.eventBus.emit(createEvent('model:mode_changed', 'ProvidersController', {
        mode: parsed.mode,
        privacyMode,
        allowFallback: parsed.allowFallback,
        timestamp: new Date().toISOString(),
      }));

      res.json({
        success: true,
        mode: parsed.mode,
        privacyMode,
        allowFallback: parsed.allowFallback,
        preferredModel: this.runtime.engine.modelRouter.getPreferredModel(),
        message: `Intelligence mode updated to ${parsed.mode} (${privacyMode}).`,
      });
    } catch (err) {
      next(err);
    }
  };
}
