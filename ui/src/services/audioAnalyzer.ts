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

  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;

  public setSyntheticSpeaking(active: boolean) {
    this.isSyntheticActive = active;
    if (!active) {
      this.syntheticTime = 0;
    }
  }

  public getSpectrum(): AudioSpectrum {
    let raw = 0;
    let rawBass = 0;
    let rawMid = 0;
    let rawTreble = 0;

    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      let bassSum = 0;
      let midSum = 0;
      let trebleSum = 0;

      const len = this.dataArray.length;
      const bassCutoff = Math.max(1, Math.floor(len * 0.15));
      const midCutoff = Math.max(bassCutoff + 1, Math.floor(len * 0.55));

      for (let i = 0; i < len; i++) {
        const val = this.dataArray[i];
        sum += val;
        if (i < bassCutoff) {
          bassSum += val;
        } else if (i < midCutoff) {
          midSum += val;
        } else {
          trebleSum += val;
        }
      }

      raw = (sum / len) / 255;
      rawBass = (bassSum / bassCutoff) / 255;
      rawMid = (midSum / (midCutoff - bassCutoff)) / 255;
      rawTreble = (trebleSum / (len - midCutoff)) / 255;
    }

    // Authentic multi-frequency speech envelope fallback for synthetic voice / Web Speech
    if (raw < 0.02 && this.isSyntheticActive) {
      this.syntheticTime += 0.05;
      const t = this.syntheticTime;
      const syllable = Math.sin(t * 3.5) * 0.5 + 0.5;
      const phoneme = Math.sin(t * 11.2) * 0.3 + Math.cos(t * 7.8) * 0.2;
      const speechEnvelope = Math.max(0, syllable * 0.65 + phoneme * 0.35);
      raw = speechEnvelope * 0.75;
      rawBass = raw * (0.8 + 0.2 * Math.sin(t * 2.1));
      rawMid = raw * (1.0 + 0.25 * Math.sin(t * 4.3));
      rawTreble = raw * (0.6 + 0.3 * Math.cos(t * 9.5));
    }

    this.smoothedAmplitude = this.smoothedAmplitude * 0.75 + raw * 0.25;
    this.smoothedBass = this.smoothedBass * 0.75 + rawBass * 0.25;
    this.smoothedMid = this.smoothedMid * 0.75 + rawMid * 0.25;
    this.smoothedTreble = this.smoothedTreble * 0.75 + rawTreble * 0.25;

    return {
      amplitude: Math.min(1, Math.max(0, this.smoothedAmplitude)),
      bass: Math.min(1, Math.max(0, this.smoothedBass)),
      mid: Math.min(1, Math.max(0, this.smoothedMid)),
      treble: Math.min(1, Math.max(0, this.smoothedTreble)),
      rawArray: this.dataArray,
    };
  }

  public getAmplitude(): number {
    return this.getSpectrum().amplitude;
  }
}

export interface AudioSpectrum {
  amplitude: number;
  bass: number;
  mid: number;
  treble: number;
  rawArray: Uint8Array<ArrayBuffer> | null;
}

export const audioAnalyzer = AudioAnalyzer.getInstance();
