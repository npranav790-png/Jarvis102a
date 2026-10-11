import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { TextToSpeechProvider, AudioOutput, TTSOptions } from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const execFileAsync = promisify(execFile);
const logger = rootLogger.child('PiperTTSProvider');

export interface PiperTTSConfig {
  binaryPath?: string;
  modelPath?: string;
}

export class PiperTTSProvider implements TextToSpeechProvider {
  public readonly id = 'piper_local';
  public readonly name = 'Piper Local Neural TTS';
  public readonly isPaid = false;
  public readonly isLocal = true;

  private binaryPath: string;
  private modelPath: string;

  constructor(config: PiperTTSConfig = {}) {
    this.binaryPath = config.binaryPath || process.env.JARVIS_VOICE_PIPER_PATH || 'piper';
    this.modelPath = config.modelPath || process.env.JARVIS_VOICE_TTS_MODEL || '';
  }

  public async isAvailable(): Promise<boolean> {
    try {
      // Check if custom binary path exists or if piper is executable in PATH
      if (path.isAbsolute(this.binaryPath)) {
        if (!fs.existsSync(this.binaryPath)) return false;
      } else {
        const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
        await execFileAsync(cmd, [this.binaryPath], { timeout: 2000 });
      }

      // If a model is specified, verify model exists
      if (this.modelPath && path.isAbsolute(this.modelPath)) {
        if (!fs.existsSync(this.modelPath)) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public async synthesize(text: string, options?: TTSOptions): Promise<AudioOutput> {
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      throw new Error(`Piper TTS engine is not installed or configured at ${this.binaryPath}`);
    }

    const tempWav = path.join(os.tmpdir(), `jarvis_piper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`);

    const args = ['--output_file', tempWav];
    if (this.modelPath) {
      args.push('--model', this.modelPath);
    }

    try {
      const child = execFile(this.binaryPath, args, { timeout: 15000 }, (error) => {
        if (error) logger.error('Piper process error', undefined, error);
      });

      if (child.stdin) {
        child.stdin.write(text);
        child.stdin.end();
      }

      await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Piper exited with code ${code}`));
        });
        child.on('error', reject);
      });

      if (!fs.existsSync(tempWav)) {
        throw new Error('Piper did not output audio file');
      }

      const buffer = await fs.promises.readFile(tempWav);
      return {
        buffer,
        mimeType: 'audio/wav',
      };
    } finally {
      if (fs.existsSync(tempWav)) {
        try {
          await fs.promises.unlink(tempWav);
        } catch {
          // Best effort
        }
      }
    }
  }
}
