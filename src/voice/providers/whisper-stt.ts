import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { SpeechToTextProvider, AudioInput, VoiceTranscript } from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const execFileAsync = promisify(execFile);
const logger = rootLogger.child('WhisperLocalSTTProvider');

export interface WhisperSTTConfig {
  binaryPath?: string;
  modelPath?: string;
  language?: string;
}

export class WhisperLocalSTTProvider implements SpeechToTextProvider {
  public readonly id = 'whisper_local';
  public readonly name = 'Whisper.cpp Local STT';
  public readonly isPaid = false;
  public readonly isLocal = true;

  private binaryPath: string;
  private modelPath: string;
  private language: string;

  constructor(config: WhisperSTTConfig = {}) {
    this.binaryPath = config.binaryPath || process.env.JARVIS_VOICE_WHISPER_PATH || 'whisper-cli';
    this.modelPath = config.modelPath || process.env.JARVIS_VOICE_STT_MODEL || '';
    this.language = config.language || process.env.JARVIS_VOICE_LANGUAGE || 'en';
  }

  public async isAvailable(): Promise<boolean> {
    try {
      if (path.isAbsolute(this.binaryPath)) {
        if (!fs.existsSync(this.binaryPath)) return false;
      } else {
        const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
        await execFileAsync(cmd, [this.binaryPath], { timeout: 2000 });
      }

      if (this.modelPath && path.isAbsolute(this.modelPath)) {
        if (!fs.existsSync(this.modelPath)) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public async transcribe(audio: AudioInput): Promise<VoiceTranscript> {
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      throw new Error(`Whisper STT engine is not installed or configured at ${this.binaryPath}`);
    }

    const tempWav = path.join(os.tmpdir(), `jarvis_whisper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`);
    await fs.promises.writeFile(tempWav, audio.buffer);

    const args = ['-f', tempWav, '-l', this.language, '--no-timestamps'];
    if (this.modelPath) {
      args.push('-m', this.modelPath);
    }

    try {
      const { stdout } = await execFileAsync(this.binaryPath, args, { timeout: 30000 });
      const text = stdout.trim();

      return {
        id: `vt_${crypto.randomUUID().slice(0, 8)}`,
        voiceSessionId: '',
        text,
        isFinal: true,
        confidence: 0.95,
        provider: this.id,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error('Whisper transcription failed', undefined, err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      if (fs.existsSync(tempWav)) {
        try {
          await fs.promises.unlink(tempWav);
        } catch {
          // Best effort cleanup
        }
      }
    }
  }
}
