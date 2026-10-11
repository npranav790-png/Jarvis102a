import crypto from 'node:crypto';
import {
  SpeechToTextProvider,
  TextToSpeechProvider,
  AudioInput,
  AudioOutput,
  VoiceTranscript,
  TTSOptions
} from '../types.js';

export class MockSTTProvider implements SpeechToTextProvider {
  public readonly id = 'mock';
  public readonly name = 'Mock Speech-to-Text Provider';
  public readonly isPaid = false;
  public readonly isLocal = true;

  public transcribedText = 'Hello JARVIS';
  public confidence = 0.99;
  public simulateError = false;

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async transcribe(audio: AudioInput): Promise<VoiceTranscript> {
    if (this.simulateError) {
      throw new Error('Simulated STT failure');
    }

    return {
      id: `vt_${crypto.randomUUID().slice(0, 8)}`,
      voiceSessionId: '',
      text: this.transcribedText,
      isFinal: true,
      confidence: this.confidence,
      provider: this.id,
      createdAt: new Date().toISOString(),
    };
  }
}

export class MockTTSProvider implements TextToSpeechProvider {
  public readonly id = 'mock';
  public readonly name = 'Mock Text-to-Speech Provider';
  public readonly isPaid = false;
  public readonly isLocal = true;

  public simulateError = false;
  public synthesizedCalls: string[] = [];

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async synthesize(text: string, options?: TTSOptions): Promise<AudioOutput> {
    if (this.simulateError) {
      throw new Error('Simulated TTS failure');
    }

    this.synthesizedCalls.push(text);

    // Generate a minimal valid 44-byte standard RIFF WAV header for testing
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // Mono
    header.writeUInt32LE(16000, 24); // 16kHz
    header.writeUInt32LE(32000, 28); // Byte rate
    header.writeUInt16LE(2, 32); // Block align
    header.writeUInt16LE(16, 34); // 16-bit
    header.write('data', 36);
    header.writeUInt32LE(0, 40);

    return {
      buffer: header,
      mimeType: 'audio/wav',
    };
  }
}
