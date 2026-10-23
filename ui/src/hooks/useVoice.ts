import { useState, useRef, useEffect, useCallback } from 'react';
import { useJarvisStore } from '../store/jarvisStore';
import { api } from '../api/client';
import { audioAnalyzer } from '../services/audioAnalyzer';
import { soundEffects } from '../services/soundEffects';
import { voicePlayer } from '../services/voicePlayer';

export type VoiceUiState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR';

export interface UseVoiceOptions {
  onTranscript?: (text: string) => void;
  onResponse?: (text: string, taskId?: string) => void;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const [voiceState, setVoiceState] = useState<VoiceUiState>('IDLE');
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecRef = useRef<any>(null);
  const activeVoiceSessionIdRef = useRef<string | null>(null);
  const interimTextRef = useRef<string>('');

  const { addMessage, setSystemState } = useJarvisStore();

  // Stop any active audio playback
  const stopAudio = useCallback(() => {
    voicePlayer.stop();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVoiceState('IDLE');
    setSystemState('IDLE');
  }, [setSystemState]);

  // Barge-in interruption (Section 10)
  const interruptVoice = useCallback(async () => {
    soundEffects.playBargeIn();
    voicePlayer.stop();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVoiceState('INTERRUPTED');
    if (activeVoiceSessionIdRef.current) {
      try {
        await api.post(`/voice/sessions/${activeVoiceSessionIdRef.current}/interrupt`, {});
      } catch {
        // Ignore
      }
    }
  }, []);

  // Clean up media streams
  const cleanupRecording = useCallback(() => {
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // Ignore
      }
      speechRecRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  }, []);

  const cancelVoice = useCallback(async () => {
    cleanupRecording();
    stopAudio();

    if (activeVoiceSessionIdRef.current) {
      try {
        await api.post(`/voice/sessions/${activeVoiceSessionIdRef.current}/cancel`, {});
      } catch {
        // Ignore
      }
      activeVoiceSessionIdRef.current = null;
    }

    setVoiceState('IDLE');
    setInterimText('');
    interimTextRef.current = '';
    setSystemState('IDLE');
  }, [cleanupRecording, stopAudio, setSystemState]);

  const startListening = useCallback(async () => {
    // If currently speaking, clicking immediately barge-in interrupts and readies microphone
    if (voiceState === 'SPEAKING') {
      await interruptVoice();
    }

    if (voiceState !== 'IDLE' && voiceState !== 'ERROR') {
      return;
    }

    setErrorMessage(null);
    setInterimText('');
    interimTextRef.current = '';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Microphone access is not supported by this browser.');
      setVoiceState('ERROR');
      return;
    }

    try {
      // 1. Request microphone permission explicitly on user action
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;
      audioAnalyzer.attachMediaStream(stream);

      // 2. Initialize MediaRecorder
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 3. Optional client-side Web Speech recognition for real-time visual feedback
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';

          rec.onresult = (e: any) => {
            let fullTranscript = '';
            for (let i = 0; i < e.results.length; i++) {
              fullTranscript += e.results[i][0].transcript;
            }
            const clean = fullTranscript.trim();
            if (clean) {
              interimTextRef.current = clean;
              setInterimText(clean);
              if (options.onTranscript) options.onTranscript(clean);
            }
          };

          rec.onend = () => {
            if (speechRecRef.current === rec && streamRef.current) {
              try {
                rec.start();
              } catch {
                // Ignore if already active or stopping
              }
            }
          };

          rec.onerror = () => {
            // Non-fatal, local recording still works
          };

          rec.start();
          speechRecRef.current = rec;
        } catch {
          // Fallback to purely local audio recording
        }
      }

      recorder.start(250);
      setVoiceState('LISTENING');
      setSystemState('LISTENING');
    } catch (err: any) {
      cleanupRecording();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone permission denied. Please allow microphone access.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No microphone device found on this system.');
      } else {
        setErrorMessage(err.message || 'Failed to initialize microphone.');
      }
      setVoiceState('ERROR');
      setSystemState('IDLE');
    }
  }, [voiceState, stopAudio, cleanupRecording, options, setSystemState]);

  const stopListeningAndProcess = useCallback(async () => {
    if (voiceState !== 'LISTENING') return;

    setVoiceState('PROCESSING');
    setSystemState('THINKING');

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      cleanupRecording();
      setVoiceState('IDLE');
      setSystemState('IDLE');
      return;
    }

    // Stop recorder and extract Blob
    const recordedBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        resolve(blob);
      };
      recorder.stop();
    });

    cleanupRecording();

    try {
      // 1. Create a voice session in backend
      const sessionRes = await api.post('/voice/sessions', { language: 'en' });
      const voiceSessionId = sessionRes?.voiceSessionId || sessionRes?.session?.id;
      activeVoiceSessionIdRef.current = voiceSessionId;

      // 2. Convert audio blob to Base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1] || result;
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(recordedBlob);
      const audioBase64 = await base64Promise;

      const clientTranscript = interimTextRef.current || interimText || undefined;

      // 3. Dispatch to backend voice session
      const processRes = await api.post(`/voice/sessions/${voiceSessionId}/audio`, {
        audioBase64,
        mimeType: recordedBlob.type || 'audio/webm',
        transcript: clientTranscript,
      });

      const transcriptText = processRes?.transcript?.text || clientTranscript || '';
      const responseText = processRes?.response?.cleanText || processRes?.response?.text || '';
      const taskId = processRes?.response?.taskId;
      const audioData = processRes?.audioBase64;

      if (transcriptText) {
        addMessage({
          id: Date.now().toString(),
          role: 'user',
          content: transcriptText,
          timestamp: new Date().toISOString(),
        });
        if (options.onTranscript) options.onTranscript(transcriptText);
      } else {
        addMessage({
          id: Date.now().toString(),
          role: 'user',
          content: '[Voice Audio Command]',
          timestamp: new Date().toISOString(),
        });
      }

      if (responseText) {
        addMessage({
          id: (Date.now() + 1).toString(),
          role: 'jarvis',
          content: responseText,
          taskId,
          timestamp: new Date().toISOString(),
        });
        if (options.onResponse) options.onResponse(responseText, taskId);
      }

      // 4. Play local audio returned from local TTS synthesis
      if (audioData) {
        setVoiceState('SPEAKING');
        setSystemState('SPEAKING');

        const audio = new Audio(`data:${processRes.mimeType || 'audio/wav'};base64,${audioData}`);
        activeAudioRef.current = audio;

        audio.onended = () => {
          activeAudioRef.current = null;
          setVoiceState('IDLE');
          setSystemState('IDLE');
          setInterimText('');
          interimTextRef.current = '';
        };

        audio.onerror = () => {
          activeAudioRef.current = null;
          setVoiceState('IDLE');
          setSystemState('IDLE');
          setInterimText('');
          interimTextRef.current = '';
        };

        await audio.play();
      } else {
        setVoiceState('IDLE');
        setSystemState('IDLE');
        setInterimText('');
      }
    } catch (err: any) {
      console.error('Voice processing failed', err);
      setErrorMessage(err.message || 'Voice transmission failed');
      setVoiceState('ERROR');
      setSystemState('ERROR');
      setTimeout(() => {
        setVoiceState('IDLE');
        setSystemState('IDLE');
      }, 3000);
    }
  }, [voiceState, interimText, cleanupRecording, addMessage, setSystemState, options]);

  useEffect(() => {
    return () => {
      cleanupRecording();
      stopAudio();
    };
  }, [cleanupRecording, stopAudio]);

  return {
    voiceState,
    interimText,
    errorMessage,
    startListening,
    stopListeningAndProcess,
    cancelVoice,
    stopAudio,
    interruptVoice,
  };
}
