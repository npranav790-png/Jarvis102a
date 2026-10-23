import { useJarvisStore } from '../store/jarvisStore';
import { soundEffects } from './soundEffects';
import { voicePlayer } from './voicePlayer';

export type WakeWordCallback = (event: {
  wakeWord: string;
  transcript: string;
  commandText?: string;
}) => void;

class WakeWordService {
  private recognition: any = null;
  private isListening: boolean = false;
  private isPaused: boolean = false;
  private lastTriggerTime: number = 0;
  private listeners: Set<WakeWordCallback> = new Set();
  private restartTimeout: any = null;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public subscribe(callback: WakeWordCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(data: { wakeWord: string; transcript: string; commandText?: string }) {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('Error in wake word listener:', err);
      }
    });
  }

  public start(): boolean {
    if (!this.isSupported()) {
      console.warn('Wake word recognition not supported in this environment');
      return false;
    }

    if (this.isListening) return true;

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        this.isListening = true;
      };

      rec.onresult = (event: any) => {
        if (this.isPaused) return;

        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const clean = transcript.trim().toLowerCase();
        if (!clean) return;

        // 1. Full-Duplex Interruption (Barge-in):
        // If JARVIS is speaking and user utters anything audible, interrupt speech immediately
        if (voicePlayer.getIsSpeaking()) {
          const isInterruptWord = /^(stop|quiet|hush|wait|hold|hey|jarvis|cancel|pause)/i.test(clean) || clean.length > 3;
          if (isInterruptWord) {
            voicePlayer.stop();
            soundEffects.playBargeIn();
            const store = useJarvisStore.getState();
            store.setSystemState('LISTENING');
            return;
          }
        }

        // 2. Wake Word Pattern Matching: "Hey Jarvis", "OK Jarvis", "Jarvis"
        const wakeRegex = /\b(?:hey\s+|ok\s+|hello\s+)?jarvis\b/i;
        const match = clean.match(wakeRegex);

        if (match) {
          const now = Date.now();
          // Debounce duplicate triggers within 1800ms
          if (now - this.lastTriggerTime < 1800) return;
          this.lastTriggerTime = now;

          // Holographic audio confirmation
          soundEffects.playStartup();

          // Extract trailing command after the wake phrase if user spoke in one breath
          const matchIndex = match.index || 0;
          const afterWake = clean.slice(matchIndex + match[0].length).replace(/^[,.\s]+/, '').trim();

          const store = useJarvisStore.getState();
          store.setSystemState('LISTENING');

          this.notify({
            wakeWord: match[0],
            transcript: clean,
            commandText: afterWake || undefined,
          });
        }
      };

      rec.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          return;
        }
        if (event.error === 'not-allowed') {
          this.stop();
          const store = useJarvisStore.getState();
          store.setWakeWordEnabled(false);
          console.warn('Microphone permission blocked for ambient wake word');
        }
      };

      rec.onend = () => {
        this.isListening = false;
        const store = useJarvisStore.getState();
        if (store.wakeWordEnabled && !this.isPaused) {
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (store.wakeWordEnabled) {
              try {
                rec.start();
              } catch {
                this.start();
              }
            }
          }, 200);
        }
      };

      rec.start();
      this.recognition = rec;
      this.isListening = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize wake word listener:', err);
      this.isListening = false;
      return false;
    }
  }

  public stop(): void {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public triggerWakeManual(command?: string): void {
    soundEffects.playStartup();
    const store = useJarvisStore.getState();
    store.setSystemState('LISTENING');
    this.notify({
      wakeWord: 'jarvis',
      transcript: command || 'jarvis',
      commandText: command,
    });
  }
}

export const wakeWordService = new WakeWordService();
