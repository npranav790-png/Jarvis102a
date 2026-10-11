import React, { useState } from 'react';
import { useJarvisStore } from '../store/jarvisStore';
import { GestureController } from '../components/NeuralCore/GestureController';
import { Send, Zap, X, Loader, Terminal, Camera, CameraOff } from 'lucide-react';
import { api } from '../api/client';
import { VoiceControl } from '../components/Voice/VoiceControl';
import { voicePlayer } from '../services/voicePlayer';

/**
 * Home View
 * Clean, cinematic presentation of the JARVIS Neural Core orb.
 * All cluttering HUD panels, dials, gauges, and duplicate menus removed.
 * Features only the pristine 3D holographic orb, a minimal floating command bar,
 * and intelligent voice/text dialogue response popovers.
 */
export const Home: React.FC = () => {
  const { systemState, addMessage, setSystemState, messages, gesturesEnabled, setGesturesEnabled } = useJarvisStore();
  const [input, setInput] = useState('');
  const [showResponse, setShowResponse] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCameraPreview, setShowCameraPreview] = useState(false);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    const currentInput = input;
    setInput('');
    setIsSubmitting(true);
    setShowResponse(true);

    const userMsg = { id: Date.now().toString(), role: 'user', content: currentInput, timestamp: new Date().toISOString() };
    addMessage(userMsg);
    setSystemState('THINKING');

    const tempAssistantId = `stream_${Date.now()}`;
    let accumulatedText = '';
    let streamSucceeded = false;

    try {
      // 1. Primary real-time token streaming
      const stream = api.streamChat({ message: currentInput });
      for await (const chunk of stream) {
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if (chunk.delta) {
          streamSucceeded = true;
          accumulatedText += chunk.delta;
          addMessage({
            id: tempAssistantId,
            role: 'jarvis',
            content: accumulatedText,
            timestamp: new Date().toISOString(),
          });
        }
        if (chunk.done) {
          streamSucceeded = true;
          const finalText = chunk.content || accumulatedText;
          if (finalText) {
            addMessage({
              id: chunk.id || tempAssistantId,
              role: 'jarvis',
              content: finalText,
              timestamp: new Date().toISOString(),
            });
            voicePlayer.speak(finalText);
          }
          setSystemState('IDLE');
          break;
        }
      }
    } catch (streamErr: any) {
      console.warn('Real-time chat stream interrupted in Home, falling back:', streamErr);
      if (!streamSucceeded) {
        try {
          const res = await api.post('/chat', { message: currentInput });
          const resp = res?.response || res?.content || res?.data?.response || res?.data?.content;
          if (resp) {
            addMessage({
              id: res?.messageId || Date.now().toString(),
              role: 'jarvis',
              content: resp,
              timestamp: new Date().toISOString()
            });
            voicePlayer.speak(resp);
            setSystemState('IDLE');
          } else if (res && res.taskId) {
            // Fallback for background tasks
            const pollInterval = setInterval(async () => {
              try {
                const taskData = await api.get(`/tasks/${res.taskId}`);
                const taskObj = taskData?.data || taskData;
                if (taskObj?.status === 'COMPLETED' || taskObj?.output?.response || taskObj?.output?.message) {
                  clearInterval(pollInterval);
                  const taskResp = taskObj?.output?.response || taskObj?.output?.message || 'Task completed.';
                  addMessage({
                    id: Date.now().toString(),
                    role: 'jarvis',
                    content: taskResp,
                    timestamp: new Date().toISOString()
                  });
                  voicePlayer.speak(taskResp);
                  setSystemState('IDLE');
                } else if (taskObj?.status === 'FAILED') {
                  clearInterval(pollInterval);
                  addMessage({
                    id: Date.now().toString(),
                    role: 'jarvis',
                    content: `ERROR: ${taskObj?.error?.message || 'Task failed.'}`,
                    timestamp: new Date().toISOString()
                  });
                  setSystemState('ERROR');
                  setTimeout(() => setSystemState('IDLE'), 3000);
                }
              } catch {
                clearInterval(pollInterval);
              }
            }, 1500);

            setTimeout(() => clearInterval(pollInterval), 60000);
          } else {
            addMessage({ id: Date.now().toString(), role: 'jarvis', content: 'ERROR: Core did not acknowledge command.', timestamp: new Date().toISOString() });
            setSystemState('ERROR');
            setTimeout(() => setSystemState('IDLE'), 3000);
          }
        } catch (e) {
          addMessage({ id: Date.now().toString(), role: 'jarvis', content: 'ERROR: Link failed. Connection to core interrupted.', timestamp: new Date().toISOString() });
          setSystemState('ERROR');
          setTimeout(() => setSystemState('IDLE'), 3000);
        }
      } else if (accumulatedText) {
        voicePlayer.speak(accumulatedText);
        setSystemState('IDLE');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastJarvisMsg = [...messages].reverse().find(m => m.role === 'jarvis');
  const isAwaitingJarvis = isSubmitting || systemState === 'THINKING' || (lastUserMsg && (!lastJarvisMsg || new Date(lastJarvisMsg.timestamp).getTime() < new Date(lastUserMsg.timestamp).getTime()));

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      userSelect: 'none',
      pointerEvents: 'none',
      background: 'transparent'
    }}>

      {/* Background MediaPipe gesture engine (only renders UI if gestures active and preview toggled) */}
      {gesturesEnabled && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          zIndex: 50,
          pointerEvents: 'auto',
          display: showCameraPreview ? 'block' : 'none'
        }}>
          <GestureController style={{ width: '260px', borderRadius: '8px', boxShadow: '0 0 20px rgba(0, 200, 255, 0.25)' }} />
        </div>
      )}
      {/* Invisible GestureController instance when camera preview is hidden to keep MediaPipe active */}
      {gesturesEnabled && !showCameraPreview && (
        <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0, overflow: 'hidden' }}>
          <GestureController />
        </div>
      )}

      {/* Floating Holographic Dialogue Popover */}
      {showResponse && (isAwaitingJarvis || lastJarvisMsg) && (
        <div style={{
          position: 'absolute',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(640px, 90vw)',
          maxHeight: '240px',
          overflowY: 'auto',
          background: 'rgba(3, 8, 16, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 200, 255, 0.35)',
          padding: '16px 20px',
          borderRadius: '8px',
          boxShadow: '0 0 30px rgba(0, 200, 255, 0.2)',
          zIndex: 60,
          pointerEvents: 'auto',
          fontFamily: "'Space Mono', monospace"
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 200, 255, 0.2)', paddingBottom: '6px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={14} className={isAwaitingJarvis ? 'spin' : ''} style={{ color: '#00C8FF' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color: '#00C8FF' }}>
                JARVIS // NEURAL RESPONSE
              </span>
            </div>
            <button onClick={() => setShowResponse(false)} style={{ background: 'transparent', border: 'none', color: '#7fe3f5', cursor: 'pointer', padding: '2px' }}>
              <X size={14} />
            </button>
          </div>

          {lastUserMsg && (
            <div style={{ fontSize: '11px', color: 'rgba(0, 200, 255, 0.7)', marginBottom: '8px' }}>
              ► COMMAND: {lastUserMsg.content}
            </div>
          )}

          {isAwaitingJarvis ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#48E8FF', fontSize: '12px' }}>
              <Loader size={14} className="spin" />
              <span>Analyzing neural vector...</span>
            </div>
          ) : lastJarvisMsg ? (
            <div style={{ fontSize: '12px', color: '#D9F8FF', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {lastJarvisMsg.content || lastJarvisMsg.payload?.content || ''}
            </div>
          ) : null}
        </div>
      )}

      {/* Sleek, Minimal Bottom Center Command & Voice Console */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(580px, 92vw)',
        zIndex: 50,
        pointerEvents: 'auto'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(3, 8, 16, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(0, 200, 255, 0.35)',
          padding: '8px 16px',
          borderRadius: '28px',
          boxShadow: '0 0 24px rgba(0, 200, 255, 0.2)',
          transition: 'border-color 0.2s, box-shadow 0.2s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', color: '#00C8FF', opacity: 0.85 }}>
            <Terminal size={15} />
          </div>

          <form onSubmit={handleCommand} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              placeholder="TRANSMIT COMMAND TO JARVIS..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isSubmitting}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '12px',
                fontFamily: "'Space Mono', monospace",
                outline: 'none',
                letterSpacing: '1px'
              }}
            />

            {/* Voice Control Button */}
            <VoiceControl compact onTranscript={() => setShowResponse(true)} onResponse={() => setShowResponse(true)} />

            {/* Gesture Tracking Toggle */}
            <button
              type="button"
              title={gesturesEnabled ? (showCameraPreview ? "Hide Gesture Camera Preview" : "Show Gesture Camera Preview") : "Enable Hand Gesture Tracking"}
              onClick={() => {
                if (!gesturesEnabled) {
                  setGesturesEnabled(true);
                  setShowCameraPreview(true);
                } else {
                  if (showCameraPreview) {
                    setShowCameraPreview(false);
                  } else {
                    setGesturesEnabled(false);
                  }
                }
              }}
              style={{
                background: gesturesEnabled ? 'rgba(0, 200, 255, 0.15)' : 'transparent',
                border: `1px solid ${gesturesEnabled ? '#00C8FF' : 'rgba(0, 200, 255, 0.25)'}`,
                color: gesturesEnabled ? '#00C8FF' : 'rgba(0, 200, 255, 0.5)',
                padding: '6px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {gesturesEnabled ? <Camera size={14} /> : <CameraOff size={14} />}
            </button>

            {/* Send Command Button */}
            <button
              type="submit"
              disabled={isSubmitting || !input.trim()}
              style={{
                background: input.trim() ? '#00C8FF' : 'rgba(0, 200, 255, 0.15)',
                color: input.trim() ? '#020408' : 'rgba(255, 255, 255, 0.4)',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '16px',
                fontSize: '11px',
                fontFamily: "'Space Mono', monospace",
                fontWeight: 700,
                cursor: (isSubmitting || !input.trim()) ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>SEND</span>
              <Send size={12} />
            </button>
          </form>
        </div>
      </div>

    </div>
  );
};
