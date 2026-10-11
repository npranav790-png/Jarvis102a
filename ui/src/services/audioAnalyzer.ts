/**
 * AudioAnalyzer
 * Lightweight singleton to analyze real-time audio amplitude
 * from TTS playback (voicePlayer) and microphone input (useVoice),
 * with natural synthetic speech modulation fallback.
 */

export class AudioAnalyzer {
  private static instance: AudioAnalyzer;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private attachedElement: HTMLAudioElement | null = null;
  private attachedStream: MediaStream | null = null;
  private sourceNode: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null;
  private smoothedAmplitude = 0;
  private isSyntheticActive = false;
  private syntheticTime = 0;

  private constructor() {}

  public static getInstance(): AudioAnalyzer {
    if (!AudioAnalyzer.instance) {
      AudioAnalyzer.instance = new AudioAnalyzer();
    }
    return AudioAnalyzer.instance;
  }

  private initContext(): boolean {
    if (this.audioCtx) return true;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return false;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      return true;
    } catch (err) {
      console.warn('AudioContext initialization skipped:', err);
      return false;
    }
  }

  public attachAudioElement(audio: HTMLAudioElement) {
    if (!this.initContext() || !this.audioCtx || !this.analyser) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.attachedElement === audio) return;

      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch {}
      }

      this.attachedElement = audio;
      const source = this.audioCtx.createMediaElementSource(audio);
      source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
      this.sourceNode = source;
    } catch {
      // Audio element might already have a source connected or CORS restrictions; fallback gracefully
    }
  }

  public attachMediaStream(stream: MediaStream) {
    if (!this.initContext() || !this.audioCtx || !this.analyser) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.attachedStream === stream) return;

      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch {}
      }

      this.attachedStream = stream;
      const source = this.audioCtx.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.sourceNode = source;
    } catch {
      // Fallback
    }
  }

  public setSyntheticSpeaking(active: boolean) {
    this.isSyntheticActive = active;
    if (!active) {
      this.syntheticTime = 0;
    }
  }

  public getAmplitude(): number {
    let raw = 0;

    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      raw = (sum / this.dataArray.length) / 255;
    }

    // If no audio stream is providing data but system is speaking (e.g. browser Web Speech synthesis),
    // provide an authentic, multi-frequency rhythmic speech envelope
    if (raw < 0.02 && this.isSyntheticActive) {
      this.syntheticTime += 0.05;
      const t = this.syntheticTime;
      // Speech syllable modulation: combination of fundamental syllable pace (~3-4Hz) and phoneme micro-rhythms
      const syllable = Math.sin(t * 3.5) * 0.5 + 0.5;
      const phoneme = Math.sin(t * 11.2) * 0.3 + Math.cos(t * 7.8) * 0.2;
      const speechEnvelope = Math.max(0, syllable * 0.65 + phoneme * 0.35);
      raw = speechEnvelope * 0.75;
    }

    // Exponential smoothing for natural responsiveness without jitter
    this.smoothedAmplitude = this.smoothedAmplitude * 0.75 + raw * 0.25;
    return Math.min(1, Math.max(0, this.smoothedAmplitude));
  }
}

export const audioAnalyzer = AudioAnalyzer.getInstance();
