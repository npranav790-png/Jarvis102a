import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { SpeechToTextProvider, AudioInput, VoiceTranscript } from '../types.js';
import { rootLogger } from '../../logging/logger.js';

const execFileAsync = promisify(execFile);
const logger = rootLogger.child('WindowsSystemSTTProvider');

export class WindowsSystemSTTProvider implements SpeechToTextProvider {
  public readonly id = 'system';
  public readonly name = 'Windows SAPI SpeechRecognitionEngine';
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
$recog = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$info = $recog.RecognizerInfo
$recog.Dispose()
if ($info) { Write-Output "READY" } else { Write-Output "NO_RECOGNIZER" }
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
      logger.warn('Windows SAPI STT availability check failed', { err: String(err) });
      this.availableCache = false;
      return false;
    }
  }

  public async transcribe(audio: AudioInput): Promise<VoiceTranscript> {
    if (!audio.buffer || audio.buffer.length === 0) {
      return {
        id: `vt_${crypto.randomUUID().slice(0, 8)}`,
        voiceSessionId: '',
        text: '',
        isFinal: true,
        confidence: 0,
        provider: this.id,
        createdAt: new Date().toISOString(),
      };
    }

    const tempWav = path.join(os.tmpdir(), `jarvis_stt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`);
    await fs.promises.writeFile(tempWav, audio.buffer);

    const script = `
Add-Type -AssemblyName System.Speech
try {
  $recog = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $recog.SetInputToWaveFile('${tempWav.replace(/\\/g, '\\\\')}')
  $grammar = New-Object System.Speech.Recognition.DictationGrammar
  $recog.LoadGrammar($grammar)
  $result = $recog.Recognize([TimeSpan]::FromSeconds(10))
  $recog.Dispose()
  if ($result -and $result.Text) {
    Write-Output "RESULT:$($result.Confidence):$($result.Text)"
  } else {
    Write-Output "NO_SPEECH"
  }
} catch {
  Write-Output "ERROR:$($_.Exception.Message)"
}
`;

    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script
      ], { timeout: 15000 });

      const output = stdout.trim();
      let text = '';
      let confidence = 0.8;

      if (output.startsWith('RESULT:')) {
        const parts = output.substring('RESULT:'.length).split(':');
        confidence = parseFloat(parts[0]) || 0.8;
        text = parts.slice(1).join(':').trim();
      } else if (output.startsWith('ERROR:')) {
        logger.warn('Windows SAPI STT recognition error reported', { error: output });
        text = '';
      }

      return {
        id: `vt_${crypto.randomUUID().slice(0, 8)}`,
        voiceSessionId: '',
        text,
        isFinal: true,
        confidence,
        provider: this.id,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error('Failed to transcribe audio via Windows SAPI', undefined, err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      // Audio Security: Transient audio processing - always delete temporary files
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
