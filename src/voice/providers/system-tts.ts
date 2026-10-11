import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { TextToSpeechProvider, AudioOutput, TTSOptions } from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const execFileAsync = promisify(execFile);
const logger = rootLogger.child('WindowsSystemTTSProvider');

export class WindowsSystemTTSProvider implements TextToSpeechProvider {
  public readonly id = 'system';
  public readonly name = 'Windows SAPI SpeechSynthesizer';
  public readonly isPaid = false;
  public readonly isLocal = true;

  private availableCache: boolean | null = null;

  public async isAvailable(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }
    if (this.availableCache !== null) {
      return this.availableCache;
    }

    try {
      const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices()
$synth.Dispose()
if ($voices.Count -gt 0) { Write-Output "READY" } else { Write-Output "NO_VOICES" }
`;
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script
      ], { timeout: 4000 });

      this.availableCache = stdout.trim() === 'READY';
      return this.availableCache;
    } catch (err) {
      logger.warn('Windows SAPI TTS availability check failed', { err: String(err) });
      this.availableCache = false;
      return false;
    }
  }

  public async synthesize(text: string, options?: TTSOptions): Promise<AudioOutput> {
    if (!text || text.trim().length === 0) {
      return { buffer: Buffer.alloc(0), mimeType: 'audio/wav' };
    }

    const tempWav = path.join(os.tmpdir(), `jarvis_tts_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`);
    
    // Sanitize text for PowerShell string interpolation (escape single quotes)
    const sanitizedText = text.replace(/'/g, "''").replace(/[\r\n]+/g, ' ');
    const voiceName = options?.voice ? options.voice.replace(/'/g, "''") : '';
    const speedRate = typeof options?.speed === 'number' 
      ? Math.max(-10, Math.min(10, Math.round((options.speed - 1) * 5))) 
      : 0;

    const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
${voiceName ? `$synth.SelectVoice('${voiceName}')` : ''}
$synth.Rate = ${speedRate}
$synth.SetOutputToWaveFile('${tempWav.replace(/\\/g, '\\\\')}')
$synth.Speak('${sanitizedText}')
$synth.Dispose()
`;

    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script
      ], { timeout: 15000 });

      if (!fs.existsSync(tempWav)) {
        throw new Error('TTS engine did not generate output audio file.');
      }

      const buffer = await fs.promises.readFile(tempWav);
      return {
        buffer,
        mimeType: 'audio/wav',
      };
    } catch (err) {
      logger.error('Failed to synthesize speech via Windows SAPI', undefined, err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      // Audio Security: Transient audio processing - always delete temporary files
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
