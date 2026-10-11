export type VoiceSessionState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'STOPPING'
  | 'ERROR';

export type VoiceEmotion =
  | 'NEUTRAL'
  | 'CALM'
  | 'CONFIDENT'
  | 'WARM'
  | 'AMUSED'
  | 'HAPPY'
  | 'CONCERNED'
  | 'URGENT'
  | 'SERIOUS'
  | 'SAD'
  | 'SURPRISED'
  | 'FRUSTRATED';

export type VoiceStyle =
  | 'PROFESSIONAL'
  | 'CONVERSATIONAL'
  | 'TECHNICAL'
  | 'REASSURING'
  | 'URGENT'
  | 'DRAMATIC'
  | 'SERIOUS'
  | 'DRY_HUMOR';

export type VoicePacing = 'VERY_SLOW' | 'SLOW' | 'NORMAL' | 'BRISK' | 'URGENT';

export type VoiceEnergy = 'LOW' | 'CONTROLLED' | 'NORMAL' | 'HIGH';

export interface VoiceDirection {
  shouldSpeak: boolean;
  reason?: string;
  emotion: VoiceEmotion;
  style: VoiceStyle;
  pacing: VoicePacing;
  energy: VoiceEnergy;
  emphasisWords: string[];
  speechText: string;
  originalText: string;
  voiceName: string;
  speedMultiplier: number;
  pitchAdjustment: number;
}

export interface VoiceSession {
  id: string;
  sessionId?: string;
  state: VoiceSessionState;
  language: string;
  metadata?: Record<string, unknown>;
  startedAt: string;
  endedAt?: string;
}

export interface VoiceTranscript {
  id: string;
  voiceSessionId: string;
  text: string;
  isFinal: boolean;
  confidence: number;
  provider: string;
  createdAt: string;
}

export interface AudioInput {
  buffer: Buffer;
  mimeType: string;
}

export interface AudioOutput {
  buffer: Buffer;
  mimeType: string;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  direction?: VoiceDirection;
}

export interface SpeechToTextProvider {
  id: string;
  name: string;
  isLocal: boolean;
  isPaid?: boolean;
  transcribe(audio: AudioInput): Promise<VoiceTranscript>;
  transcribeStream?(audioStream: AsyncIterable<AudioInput>): AsyncIterable<VoiceTranscript>;
  isAvailable(): Promise<boolean>;
}

export interface TextToSpeechProvider {
  id: string;
  name: string;
  isLocal: boolean;
  isPaid?: boolean;
  synthesize(text: string, options?: TTSOptions): Promise<AudioOutput>;
  synthesizeStream?(text: string, options?: TTSOptions): AsyncIterable<AudioOutput>;
  isAvailable(): Promise<boolean>;
}

export interface RealtimeAudioChunk {
  data: Buffer;
  mimeType: string;
}

/**
 * Gemini Live / Bidirectional voice provider abstraction (Section 25).
 * Allows plugging in low-latency bidirectional voice streams in future iterations.
 */
export interface IRealtimeVoiceProvider {
  id: string;
  name: string;
  isLocal: boolean;
  isPaid?: boolean;
  connect(options?: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  sendAudio(chunk: RealtimeAudioChunk): Promise<void>;
  sendText(text: string): Promise<void>;
  onAudio(callback: (chunk: RealtimeAudioChunk) => void): void;
  onTranscript(callback: (transcript: VoiceTranscript) => void): void;
  onError(callback: (err: Error) => void): void;
  onInterrupted?(callback: () => void): void;
  isAvailable(): Promise<boolean>;
}

export interface WakeWordDetector {
  start(): Promise<void>;
  stop(): Promise<void>;
  onWakeWord(callback: () => void): void;
  isAvailable?(): Promise<boolean>;
}

export type ProviderOperationalStatus = 'READY' | 'NOT_INSTALLED' | 'MISCONFIGURED' | 'UNAVAILABLE' | 'DISABLED' | 'RATE_LIMITED';

export interface VoiceEngineStatus {
  provider: string;
  name: string;
  status: ProviderOperationalStatus;
  isLocal: boolean;
  details?: string;
}

export interface VoiceStatusInfo {
  enabled: boolean;
  privacy: 'LOCAL_ONLY' | 'CLOUD_ALLOWED';
  stt: VoiceEngineStatus;
  tts: VoiceEngineStatus;
  wakeWord: {
    enabled: boolean;
    status: ProviderOperationalStatus;
    keyword?: string;
  };
  activeSession?: {
    id: string;
    state: VoiceSessionState;
    startedAt: string;
  };
}

export interface VoiceProcessResult {
  sessionId: string;
  transcript: VoiceTranscript;
  response: {
    text: string;
    cleanText: string;
    taskId?: string;
  };
  direction?: VoiceDirection;
  audio?: AudioOutput;
  timingMs: {
    stt: number;
    brain: number;
    tts: number;
    total: number;
  };
}

export const VOICE_ERRORS = {
  PROVIDER_UNAVAILABLE: 'VOICE_PROVIDER_UNAVAILABLE',
  QUOTA_EXHAUSTED: 'VOICE_QUOTA_EXHAUSTED',
  RATE_LIMITED: 'VOICE_RATE_LIMITED',
  INVALID_KEY: 'VOICE_INVALID_API_KEY',
  DECODING_FAILED: 'VOICE_AUDIO_DECODING_FAILED',
} as const;

