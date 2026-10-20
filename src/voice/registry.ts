import {
  SpeechToTextProvider,
  TextToSpeechProvider,
  WakeWordDetector,
  VoiceStatusInfo,
  VoiceEngineStatus,
  ProviderOperationalStatus,
  IRealtimeVoiceProvider
} from './types.js';
import { rootLogger } from '../logging/logger.js';
import { JarvisEngine } from '../core/engine.js';
import { JarvisConfig } from '../config/schema.js';
import { WindowsSystemTTSProvider } from './providers/system-tts.js';
import { WindowsSystemSTTProvider } from './providers/system-stt.js';
import { PiperTTSProvider } from './providers/piper-tts.js';
import { WhisperLocalSTTProvider } from './providers/whisper-stt.js';
import { OpenWakeWordDetector } from './providers/open-wakeword.js';
import { MockSTTProvider, MockTTSProvider } from './providers/mock.js';
import { GeminiTTSProvider } from './providers/gemini-tts.js';
import { GeminiSTTProvider } from './providers/gemini-stt.js';
import { GeminiLiveProvider } from './providers/gemini-live.js';
import { VoiceCache } from './cache.js';

const logger = rootLogger.child('VoiceRegistry');

export class VoiceRegistry {
  private sttProviders: Map<string, SpeechToTextProvider> = new Map();
  private ttsProviders: Map<string, TextToSpeechProvider> = new Map();
  private wakeWordDetectors: Map<string, WakeWordDetector> = new Map();
  private realtimeProviders: Map<string, IRealtimeVoiceProvider> = new Map();

  private activeStt?: SpeechToTextProvider;
  private activeTts?: TextToSpeechProvider;
  private activeWakeWord?: WakeWordDetector;
  private activeRealtime?: IRealtimeVoiceProvider;

  constructor(private engine: JarvisEngine) {}

  public async initializeFromConfig(config: JarvisConfig): Promise<void> {
    logger.info('Initializing Voice Registry with configured voice providers...');

    // 1. Always register mock providers for headless/test fallback
    this.registerSTT(new MockSTTProvider());
    this.registerTTS(new MockTTSProvider());

    // 2. Windows Native SAPI Providers (Zero-cost, built-in)
    if (process.platform === 'win32') {
      const winTTS = new WindowsSystemTTSProvider();
      const winSTT = new WindowsSystemSTTProvider();
      this.registerTTS(winTTS);
      this.registerSTT(winSTT);
    }

    // 3. Piper Local Neural TTS Provider
    const piperTTS = new PiperTTSProvider({
      binaryPath: config.voice.piperPath,
      modelPath: config.voice.ttsModel !== 'default' ? config.voice.ttsModel : undefined,
    });
    this.registerTTS(piperTTS);

    // 4. Gemini Cloud TTS Provider (Zero-cost free-tier)
    const voiceCache = config.voice.voiceCacheEnabled
      ? new VoiceCache(50, config.voice.voiceCacheTtlSeconds)
      : undefined;

    const geminiTTS = new GeminiTTSProvider({
      apiKey: config.providers.geminiApiKey,
      model: config.voice.geminiTtsModel,
      voiceName: config.voice.geminiVoice,
      allowPaidProviders: config.cost.allowPaidProviders,
      cache: voiceCache,
    });
    this.registerTTS(geminiTTS);

    // 5. Whisper Local STT Provider
    const whisperSTT = new WhisperLocalSTTProvider({
      binaryPath: config.voice.whisperPath,
      modelPath: config.voice.sttModel !== 'base' ? config.voice.sttModel : undefined,
      language: config.voice.language,
    });
    this.registerSTT(whisperSTT);

    // 6. Gemini Cloud STT Provider (Zero-cost free-tier)
    const geminiSTT = new GeminiSTTProvider({
      apiKey: config.providers.geminiApiKey,
    });
    this.registerSTT(geminiSTT);

    // 7. OpenWakeWord
    const wakeDetector = new OpenWakeWordDetector('hey jarvis');
    this.registerWakeWord(wakeDetector);

    // 8. Gemini Live Realtime Streaming Provider (Zero-cost free-tier)
    const geminiLive = new GeminiLiveProvider({
      apiKey: config.providers.geminiApiKey,
      model: config.voice.geminiTtsModel?.includes('live') ? config.voice.geminiTtsModel : 'gemini-3.8-live',
      voiceName: config.voice.geminiVoice,
    });
    this.registerRealtimeVoice(geminiLive);

    // 9. Select active providers based on config and availability
    await this.selectActiveProviders(config);
  }

  private async selectActiveProviders(config: JarvisConfig): Promise<void> {
    // Select STT
    const preferredStt = config.voice.sttProvider;
    const sttCandidate = this.sttProviders.get(preferredStt);
    if (sttCandidate && (await sttCandidate.isAvailable())) {
      this.activeStt = sttCandidate;
      logger.info(`Active STT provider selected: ${sttCandidate.name} (${sttCandidate.id})`);
    } else {
      // Fallback order: gemini-stt -> system -> mock
      const geminiStt = this.sttProviders.get('gemini-stt');
      const sysStt = this.sttProviders.get('system');
      if (geminiStt && (await geminiStt.isAvailable()) && !config.app.offline) {
        this.activeStt = geminiStt;
        logger.info(`Fell back to Gemini Cloud STT provider: ${geminiStt.name}`);
      } else if (sysStt && (await sysStt.isAvailable())) {
        this.activeStt = sysStt;
        logger.info(`Fell back to system STT provider: ${sysStt.name}`);
      } else {
        this.activeStt = this.sttProviders.get('mock');
        logger.info(`Fell back to mock STT provider`);
      }
    }

    // Select TTS
    const isOffline = Boolean((config as any).app?.offline);
    const preferredTts = (isOffline && config.voice.ttsProvider === 'gemini-tts')
      ? 'system'
      : config.voice.ttsProvider;
    const ttsCandidate = this.ttsProviders.get(preferredTts);
    if (ttsCandidate && (await ttsCandidate.isAvailable())) {
      this.activeTts = ttsCandidate;
      logger.info(`Active TTS provider selected: ${ttsCandidate.name} (${ttsCandidate.id})`);
    } else {
      // If preferred was gemini-tts but unavailable, adhere to fallback policy (Section 19):
      // Retain preferred candidate if registered, otherwise fall back to system -> mock
      if (preferredTts === 'gemini-tts' && ttsCandidate) {
        this.activeTts = ttsCandidate;
        logger.warn(`Gemini TTS selected as primary provider (operational status: ${(ttsCandidate as any).getOperationalStatus?.() || 'UNAVAILABLE'})`);
      } else {
        const sysTts = this.ttsProviders.get('system');
        if (sysTts && (await sysTts.isAvailable())) {
          this.activeTts = sysTts;
          logger.info(`Fell back to system TTS provider: ${sysTts.name}`);
        } else {
          this.activeTts = this.ttsProviders.get('mock');
          logger.info(`Fell back to mock TTS provider`);
        }
      }
    }

    // Wake Word selection
    if (config.voice.wakeWordEnabled) {
      this.activeWakeWord = this.wakeWordDetectors.get('default');
    } else {
      this.activeWakeWord = undefined;
    }
  }

  public registerSTT(provider: SpeechToTextProvider, makeActive = false): void {
    const isPaid = (provider as any).isPaid ?? !provider.isLocal;
    if (!this.engine.config.cost.allowPaidProviders && isPaid) {
      logger.warn(`Rejected STT provider ${provider.name}: Paid providers not allowed by policy.`);
      return;
    }
    this.sttProviders.set(provider.id, provider);
    logger.debug(`Registered STT provider: ${provider.name}`);
    if (makeActive || !this.activeStt) this.activeStt = provider;
  }

  public registerTTS(provider: TextToSpeechProvider, makeActive = false): void {
    const isPaid = (provider as any).isPaid ?? !provider.isLocal;
    if (!this.engine.config.cost.allowPaidProviders && isPaid) {
      logger.warn(`Rejected TTS provider ${provider.name}: Paid providers not allowed by policy.`);
      return;
    }
    this.ttsProviders.set(provider.id, provider);
    logger.debug(`Registered TTS provider: ${provider.name}`);
    if (makeActive || !this.activeTts) this.activeTts = provider;
  }

  public registerRealtimeVoice(provider: IRealtimeVoiceProvider, makeActive = false): void {
    const isPaid = provider.isPaid ?? !provider.isLocal;
    if (!this.engine.config.cost.allowPaidProviders && isPaid) {
      logger.warn(`Rejected Realtime voice provider ${provider.name}: Paid providers not allowed by policy.`);
      return;
    }
    this.realtimeProviders.set(provider.id, provider);
    logger.debug(`Registered Realtime voice provider: ${provider.name}`);
    if (makeActive || !this.activeRealtime) this.activeRealtime = provider;
  }

  public registerWakeWord(detector: WakeWordDetector): void {
    this.wakeWordDetectors.set('default', detector);
    if (!this.activeWakeWord && this.engine.config.voice.wakeWordEnabled) {
      this.activeWakeWord = detector;
    }
  }

  public setActiveSTT(id: string): boolean {
    const provider = this.sttProviders.get(id);
    if (!provider) return false;
    this.activeStt = provider;
    return true;
  }

  public setActiveTTS(id: string): boolean {
    const provider = this.ttsProviders.get(id);
    if (!provider) return false;
    this.activeTts = provider;
    return true;
  }

  public get STT(): SpeechToTextProvider {
    if (!this.activeStt) throw new Error('No STT provider registered');
    return this.activeStt;
  }

  public get TTS(): TextToSpeechProvider {
    if (!this.activeTts) throw new Error('No TTS provider registered');
    return this.activeTts;
  }

  public get RealtimeVoice(): IRealtimeVoiceProvider | undefined {
    return this.activeRealtime;
  }

  public get WakeWord(): WakeWordDetector | undefined {
    return this.activeWakeWord;
  }

  public getTTSProvider(id: string): TextToSpeechProvider | undefined {
    return this.ttsProviders.get(id);
  }

  public getSTTProvider(id: string): SpeechToTextProvider | undefined {
    return this.sttProviders.get(id);
  }

  public async getStatus(): Promise<VoiceStatusInfo> {
    const stt = this.activeStt;
    const tts = this.activeTts;
    const config = this.engine.config.voice;

    let sttStatus: ProviderOperationalStatus = 'NOT_INSTALLED';
    if (stt) {
      if (typeof (stt as any).getOperationalStatus === 'function') {
        sttStatus = (stt as any).getOperationalStatus();
      } else {
        const isAvail = await stt.isAvailable();
        sttStatus = isAvail ? 'READY' : 'NOT_INSTALLED';
      }
    }

    let ttsStatus: ProviderOperationalStatus = 'NOT_INSTALLED';
    let ttsDetails: string | undefined;
    if (tts) {
      if (typeof (tts as any).getOperationalStatus === 'function') {
        ttsStatus = (tts as any).getOperationalStatus();
        if (ttsStatus === 'RATE_LIMITED') {
          const retryAfter = (tts as any).getRetryAfterSeconds?.();
          ttsDetails = retryAfter ? `Rate limited. Retry after ${retryAfter}s` : 'Rate limited by cooldown policy';
        }
      } else {
        const isAvail = await tts.isAvailable();
        ttsStatus = isAvail ? 'READY' : 'NOT_INSTALLED';
      }
    }

    const wakeWordStatus: ProviderOperationalStatus = config.wakeWordEnabled
      ? (this.activeWakeWord && (await this.activeWakeWord.isAvailable?.()) ? 'READY' : 'NOT_INSTALLED')
      : 'DISABLED';

    const isCloudInUse = Boolean((stt && !stt.isLocal) || (tts && !tts.isLocal));

    return {
      enabled: config.enabled,
      privacy: isCloudInUse ? 'CLOUD_ALLOWED' : 'LOCAL_ONLY',
      stt: {
        provider: stt?.id || 'none',
        name: stt?.name || 'None',
        status: sttStatus,
        isLocal: stt?.isLocal ?? true,
      },
      tts: {
        provider: tts?.id || 'none',
        name: tts?.name || 'None',
        status: ttsStatus,
        isLocal: tts?.isLocal ?? true,
        details: ttsDetails,
      },
      wakeWord: {
        enabled: config.wakeWordEnabled,
        status: wakeWordStatus,
        keyword: 'hey jarvis',
      },
    };
  }
}
