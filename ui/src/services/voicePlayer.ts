import { api } from '../api/client';
import { useJarvisStore } from '../store/jarvisStore';
import { audioAnalyzer } from './audioAnalyzer';

class VoicePlayer {
  private currentAudio: HTMLAudioElement | null = null;
  private isSpeaking = false;

  public sanitizeForSpeech(text: string): string {
    if (!text) return '';
    let cleaned = text;

    // Remove think blocks (<think>...</think>)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // Replace code blocks with concise spoken description
    cleaned = cleaned.replace(/```[\s\S]*?```/g, ' I have written the code solution. ');

    // Remove inline backticks
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // Remove markdown links [text](url) -> text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Remove raw URLs
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, ' ');

    // Remove markdown headers and formatting characters
    cleaned = cleaned.replace(/[#*_~>]/g, '');

    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Limit voice utterance length to keep it natural and avoid endless speech
    if (cleaned.length > 350) {
      const sentenceEnd = cleaned.indexOf('.', 220);
      if (sentenceEnd !== -1 && sentenceEnd < 450) {
        cleaned = cleaned.substring(0, sentenceEnd + 1);
      } else {
        cleaned = cleaned.substring(0, 320) + '.';
      }
    }

    return cleaned;
  }

  public async speak(text: string): Promise<void> {
    const spokenText = this.sanitizeForSpeech(text);
    if (!spokenText || spokenText.length < 2) return;

    // Stop previously playing audio before starting new speech
    this.stop();

    const store = useJarvisStore.getState();
    store.setSystemState('SPEAKING');
    this.isSpeaking = true;

    try {
      // 1. Synthesize audio with Google Gemini TTS via backend API
      const res = await api.post('/voice/synthesize', { text: spokenText });
      if (res && res.success && res.audioBase64) {
        const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
        this.currentAudio = audio;
        audioAnalyzer.attachAudioElement(audio);

        audio.onended = () => {
          this.currentAudio = null;
          this.isSpeaking = false;
          audioAnalyzer.setSyntheticSpeaking(false);
          if (useJarvisStore.getState().systemState === 'SPEAKING') {
            useJarvisStore.getState().setSystemState('IDLE');
          }
        };

        audio.onerror = () => {
          this.currentAudio = null;
          this.isSpeaking = false;
          audioAnalyzer.setSyntheticSpeaking(false);
          if (useJarvisStore.getState().systemState === 'SPEAKING') {
            useJarvisStore.getState().setSystemState('IDLE');
          }
        };

        try {
          await audio.play();
          return;
        } catch (playErr) {
          console.warn('Audio playback error, attempting speech synthesis fallback:', playErr);
        }
      }
    } catch (err) {
      console.warn('Backend Gemini TTS synthesis request failed, attempting local speech synthesis:', err);
    }

    // 2. Fallback: Browser Web Speech API if backend TTS is unreachable
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.rate = 1.05;
        utterance.pitch = 0.95;
        audioAnalyzer.setSyntheticSpeaking(true);

        utterance.onend = () => {
          this.isSpeaking = false;
          audioAnalyzer.setSyntheticSpeaking(false);
          if (useJarvisStore.getState().systemState === 'SPEAKING') {
            useJarvisStore.getState().setSystemState('IDLE');
          }
        };

        utterance.onerror = () => {
          this.isSpeaking = false;
          audioAnalyzer.setSyntheticSpeaking(false);
          if (useJarvisStore.getState().systemState === 'SPEAKING') {
            useJarvisStore.getState().setSystemState('IDLE');
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        this.isSpeaking = false;
        audioAnalyzer.setSyntheticSpeaking(false);
        useJarvisStore.getState().setSystemState('IDLE');
      }
    } else {
      this.isSpeaking = false;
      audioAnalyzer.setSyntheticSpeaking(false);
      useJarvisStore.getState().setSystemState('IDLE');
    }
  }

  public stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    audioAnalyzer.setSyntheticSpeaking(false);
    if (useJarvisStore.getState().systemState === 'SPEAKING') {
      useJarvisStore.getState().setSystemState('IDLE');
    }
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const voicePlayer = new VoicePlayer();
