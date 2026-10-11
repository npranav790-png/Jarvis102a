import crypto from 'node:crypto';
import { JarvisRuntime } from '../runtime/runtime.js';
import {
  VoiceSession,
  VoiceSessionState,
  VoiceTranscript,
  AudioInput,
  AudioOutput,
  VoiceStatusInfo,
  VoiceProcessResult,
  TTSOptions,
  VoiceDirection
} from './types.js';
import { VoiceDirector } from './director.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('VoiceService');

export class VoiceService {
  private activeSessions: Map<string, VoiceSession> = new Map();
  private cancellationTokens: Map<string, boolean> = new Map();
  private activeAbortControllers: Map<string, AbortController> = new Map();
  private director: VoiceDirector;

  constructor(private runtime: JarvisRuntime) {
    this.director = new VoiceDirector(this.runtime.engine.config.voice.geminiVoice || 'Charon');
  }

  public getDirector(): VoiceDirector {
    return this.director;
  }

  public async initialize(): Promise<void> {
    await this.runtime.voiceRegistry.initializeFromConfig(this.runtime.engine.config);
    logger.info('VoiceService initialized successfully with VoiceDirector and Gemini TTS.');
  }

  public async getStatus(): Promise<VoiceStatusInfo> {
    return this.runtime.voiceRegistry.getStatus();
  }

  public async createSession(options: {
    sessionId?: string;
    language?: string;
    metadata?: Record<string, unknown>;
  } = {}): Promise<VoiceSession> {
    const id = `vs_${crypto.randomUUID().slice(0, 12)}`;
    const session: VoiceSession = {
      id,
      sessionId: options.sessionId,
      state: 'IDLE',
      language: options.language || this.runtime.engine.config.voice.language,
      metadata: options.metadata || {},
      startedAt: new Date().toISOString(),
    };

    this.activeSessions.set(id, session);
    this.cancellationTokens.set(id, false);

    // Record in database
    try {
      let resolvedSessionId: string | null = null;
      if (session.sessionId) {
        const existing = this.runtime.engine.db.connect().prepare('SELECT id FROM sessions WHERE id = ?').get(session.sessionId);
        if (existing) {
          resolvedSessionId = session.sessionId;
        }
      }

      this.runtime.engine.db.connect().prepare(`
        INSERT INTO voice_sessions (id, session_id, state, language, metadata_json, started_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        resolvedSessionId,
        session.state,
        session.language,
        JSON.stringify(session.metadata),
        session.startedAt
      );
    } catch (err) {
      logger.warn('Failed to insert voice session into DB', { err: String(err) });
    }

    await this.emitVoiceEvent('voice.session.started', { session });
    return session;
  }

  public getSession(id: string): VoiceSession | undefined {
    return this.activeSessions.get(id);
  }

  /**
   * Barge-in interruption handler (Section 10).
   * Immediately terminates active TTS audio playback, transitions to INTERRUPTED state,
   * emits voice.interrupted, and readies the pipeline to process new incoming speech.
   */
  public async interrupt(id: string): Promise<boolean> {
    const session = this.activeSessions.get(id);
    if (!session) return false;

    logger.info(`Interrupting voice session ${id} (state: ${session.state})`);

    // 1. Abort any running TTS synthesis
    const controller = this.activeAbortControllers.get(id);
    if (controller) {
      try {
        controller.abort();
      } catch {
        // Ignore
      }
      this.activeAbortControllers.delete(id);
    }

    // 2. Deterministic transition: SPEAKING -> INTERRUPTED
    this.setSessionState(session, 'INTERRUPTED');

    // 3. Emit structured voice.interrupted event
    await this.emitVoiceEvent('voice.interrupted', {
      sessionId: id,
      previousState: 'SPEAKING',
      state: 'INTERRUPTED',
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  public async cancelSession(id: string): Promise<boolean> {
    const session = this.activeSessions.get(id);
    if (!session) return false;

    this.cancellationTokens.set(id, true);
    const controller = this.activeAbortControllers.get(id);
    if (controller) {
      try { controller.abort(); } catch { /* Ignore */ }
      this.activeAbortControllers.delete(id);
    }

    session.state = 'STOPPING';
    session.endedAt = new Date().toISOString();

    try {
      this.runtime.engine.db.connect().prepare(`
        UPDATE voice_sessions SET state = 'CANCELLED', ended_at = ? WHERE id = ?
      `).run(session.endedAt, id);
    } catch {
      // Best effort
    }

    await this.emitVoiceEvent('voice.session.ended', { sessionId: id, reason: 'cancelled' });
    this.activeSessions.delete(id);
    return true;
  }

  public async transcribeOnly(audio: AudioInput): Promise<VoiceTranscript> {
    this.validateAudioInput(audio);
    return this.runtime.voiceRegistry.STT.transcribe(audio);
  }

  public async synthesizeOnly(text: string, options?: TTSOptions): Promise<AudioOutput> {
    const direction = this.director.direct(text);
    return this.runtime.voiceRegistry.TTS.synthesize(direction.speechText, {
      ...options,
      direction,
      voice: options?.voice || direction.voiceName,
    });
  }

  public async processAudio(
    sessionId: string,
    audio: AudioInput,
    providedTranscript?: string
  ): Promise<VoiceProcessResult> {
    const session = this.activeSessions.get(sessionId) || (await this.createSession({ sessionId }));
    const startTime = Date.now();
    let sttDuration = 0;
    let brainDuration = 0;
    let ttsDuration = 0;

    try {
      // 1. Audio validation & limits
      this.validateAudioInput(audio);

      // Check cancellation
      if (this.cancellationTokens.get(sessionId)) {
        throw new Error('Voice session cancelled by user');
      }

      // If session was INTERRUPTED, cleanly resume to LISTENING -> TRANSCRIBING
      // 2. Transcription
      this.setSessionState(session, 'TRANSCRIBING');
      await this.emitVoiceEvent('voice.listening', { sessionId, state: 'TRANSCRIBING' });

      let transcript: VoiceTranscript;
      if (providedTranscript && providedTranscript.trim().length > 0) {
        transcript = {
          id: `vt_${Date.now().toString(36)}`,
          voiceSessionId: sessionId,
          text: providedTranscript.trim(),
          isFinal: true,
          confidence: 0.95,
          provider: 'client',
          createdAt: new Date().toISOString(),
        };
      } else {
        const sttStart = Date.now();
        transcript = await this.runtime.voiceRegistry.STT.transcribe(audio);
        transcript.voiceSessionId = sessionId;
        sttDuration = Date.now() - sttStart;
      }

      // Record transcript in DB
      try {
        this.runtime.engine.db.connect().prepare(`
          INSERT INTO voice_transcripts (id, voice_session_id, text, is_final, confidence, provider, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          transcript.id,
          transcript.voiceSessionId,
          transcript.text,
          transcript.isFinal ? 1 : 0,
          transcript.confidence,
          transcript.provider,
          transcript.createdAt
        );
      } catch (err) {
        logger.warn('Failed to record voice transcript in DB', { err: String(err) });
      }

      await this.emitVoiceEvent('voice.transcript.final', {
        sessionId,
        transcript,
      });

      if (!transcript.text || transcript.text.trim().length === 0) {
        this.setSessionState(session, 'IDLE');
        return {
          sessionId,
          transcript,
          response: {
            text: 'I did not catch any speech. Please try speaking again.',
            cleanText: 'I did not catch any speech. Please try speaking again.',
          },
          timingMs: { stt: sttDuration, brain: 0, tts: 0, total: Date.now() - startTime },
        };
      }

      // Check cancellation
      if (this.cancellationTokens.get(sessionId)) {
        throw new Error('Voice session cancelled by user');
      }

      // 3. JARVIS Brain Processing (Preserves approval, tasks, memory, and zero-cost policy)
      this.setSessionState(session, 'PROCESSING');
      await this.emitVoiceEvent('voice.processing', { sessionId, prompt: transcript.text });

      const brainStart = Date.now();
      const brainResponse = await this.runtime.engine.brain.process({
        userInput: transcript.text,
        sessionId: session.sessionId,
      });
      brainDuration = Date.now() - brainStart;

      const rawResponseText = brainResponse.finalResponse;

      // 4. Voice Director: Evaluate emotional delivery, style, pacing, and sanitization
      const isSecurityWarning =
        rawResponseText.toLowerCase().includes('security warning') ||
        rawResponseText.toLowerCase().includes('security alert') ||
        rawResponseText.toLowerCase().includes('security breach') ||
        rawResponseText.toLowerCase().includes('unauthorized access') ||
        rawResponseText.toLowerCase().includes('critical risk') ||
        rawResponseText.toLowerCase().includes('destructive action');

      const isStatusCheck =
        transcript.text.toLowerCase().includes('status') ||
        transcript.text.toLowerCase().includes('diagnostics') ||
        transcript.text.toLowerCase().includes('system') ||
        rawResponseText.toLowerCase().includes('system status') ||
        rawResponseText.toLowerCase().includes('operational');

      const direction = this.director.direct(rawResponseText, {
        userPrompt: transcript.text,
        hasTasks: Boolean(brainResponse.tasks?.length),
        requiresApproval: Boolean(
          brainResponse.executionStatus === 'WAITING_EXECUTION' ||
          brainResponse.tasks?.some((t) => (t as any).requiresApproval || (t as any).status === 'WAITING_APPROVAL')
        ),
        isSecurityWarning,
        isError: brainResponse.executionStatus === 'FAILED',
        isStatusCheck,
      });

      await this.emitVoiceEvent('voice.response', {
        sessionId,
        response: rawResponseText,
        cleanText: direction.speechText,
        direction,
        taskId: brainResponse.tasks?.[0]?.id,
      });

      // Check cancellation
      if (this.cancellationTokens.get(sessionId)) {
        throw new Error('Voice session cancelled by user');
      }

      // 5. Text-To-Speech Synthesis
      let audioOutput: AudioOutput | undefined;
      if (direction.shouldSpeak) {
        this.setSessionState(session, 'SPEAKING');
        await this.emitVoiceEvent('voice.speaking', {
          sessionId,
          text: direction.speechText,
          emotion: direction.emotion,
          style: direction.style,
          pacing: direction.pacing,
          energy: direction.energy,
        });

        const abortCtrl = new AbortController();
        this.activeAbortControllers.set(sessionId, abortCtrl);

        const ttsStart = Date.now();
        try {
          audioOutput = await this.runtime.voiceRegistry.TTS.synthesize(direction.speechText, {
            voice: direction.voiceName,
            direction,
          });
        } catch (ttsErr: any) {
          logger.error('TTS synthesis failed, continuing with text response only', {
            error: ttsErr.message,
            code: ttsErr.code,
          });
        } finally {
          this.activeAbortControllers.delete(sessionId);
        }
        ttsDuration = Date.now() - ttsStart;
      }

      // 6. Completion
      this.setSessionState(session, 'IDLE');
      await this.emitVoiceEvent('voice.completed', {
        sessionId,
        transcript,
        response: direction.speechText,
        hasAudio: Boolean(audioOutput),
        direction,
      });

      return {
        sessionId,
        transcript,
        response: {
          text: rawResponseText,
          cleanText: direction.speechText,
          taskId: brainResponse.tasks?.[0]?.id,
        },
        direction,
        audio: audioOutput,
        timingMs: {
          stt: sttDuration,
          brain: brainDuration,
          tts: ttsDuration,
          total: Date.now() - startTime,
        },
      };
    } catch (err: any) {
      this.setSessionState(session, 'ERROR');
      await this.emitVoiceEvent('voice.error', {
        sessionId,
        error: err.message || 'Voice processing error occurred',
      });
      throw err;
    }
  }

  private setSessionState(session: VoiceSession, state: VoiceSessionState): void {
    session.state = state;
    try {
      this.runtime.engine.db.connect().prepare(`
        UPDATE voice_sessions SET state = ? WHERE id = ?
      `).run(state, session.id);
    } catch {
      // Best effort
    }
  }

  private validateAudioInput(audio: AudioInput): void {
    if (!audio.buffer) {
      throw new Error('Audio payload missing buffer data');
    }

    const maxBytes = (this.runtime.engine.config.voice.maxAudioSizeMb || 10) * 1024 * 1024;
    if (audio.buffer.length > maxBytes) {
      throw new Error(
        `Audio payload exceeds maximum allowed size of ${this.runtime.engine.config.voice.maxAudioSizeMb}MB`
      );
    }
  }

  public sanitizeTextForSpeech(text: string): string {
    return this.director.sanitizeForSpeech(text);
  }

  private async emitVoiceEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
    await this.runtime.engine.eventBus.emit(
      createEvent(eventType, 'VoiceService', {
        id: `vevt_${crypto.randomUUID().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
        ...data,
      })
    );
  }
}
