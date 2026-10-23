import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import {
  Smartphone,
  ShieldCheck,
  Zap,
  Volume2,
  VolumeX,
  Volume1,
  Play,
  Lock,
  Camera,
  Mic,
  MicOff,
  Send,
  RefreshCw,
  LogOut,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'jarvis';
  text: string;
  timestamp: string;
}

export const RemoteCompanion: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlPairingId = searchParams.get('pairingId') || '';
  const urlCode = searchParams.get('code') || '';

  // Auth & Pairing State
  const [deviceId, setDeviceId] = useState<string>(() => localStorage.getItem('jarvis_device_id') || '');
  const [token, setToken] = useState<string>(() => localStorage.getItem('jarvis_device_token') || '');
  const [isPaired, setIsPaired] = useState<boolean>(() => Boolean(localStorage.getItem('jarvis_device_token')));
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Manual pairing inputs
  const [inputPairingId, setInputPairingId] = useState(urlPairingId);
  const [inputCode, setInputCode] = useState(urlCode);
  const [deviceName, setDeviceName] = useState(() => {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return 'iPhone Remote';
    if (/iPad/i.test(ua)) return 'iPad Remote';
    if (/Android/i.test(ua)) return 'Android Companion';
    return 'Web Companion';
  });

  // Host Telemetry & Heartbeat
  const [isHostOnline, setIsHostOnline] = useState(true);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  // Action status
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Screen snapshot
  const [screenPreview, setScreenPreview] = useState<string | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);

  // Chat & Voice
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      sender: 'jarvis',
      text: 'JARVIS Remote Terminal established. How may I assist your workstation today?',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync API host from URL search/hash if present
  useEffect(() => {
    const host = searchParams.get('host');
    if (host) {
      api.setBaseUrl(host);
    }
  }, [searchParams]);

  // Attempt auto-pairing if URL has pairingId and code
  useEffect(() => {
    if (urlPairingId && urlCode && !token) {
      const host = searchParams.get('host');
      if (host) {
        api.setBaseUrl(host);
      }
      handleCompletePairing(urlPairingId, urlCode);
    }
  }, [urlPairingId, urlCode]);

  // Heartbeat ping loop
  useEffect(() => {
    if (!isPaired || !deviceId) return;

    const ping = async () => {
      const start = Date.now();
      try {
        await api.pingDevice(deviceId);
        setIsHostOnline(true);
        setLastLatency(Date.now() - start);
      } catch {
        setIsHostOnline(false);
      }
    };

    ping();
    const interval = setInterval(ping, 25000);
    return () => clearInterval(interval);
  }, [isPaired, deviceId]);

  // Initialize SpeechRecognition if available
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, []);

  const handleToggleVoice = () => {
    if (!speechRecognitionRef.current) {
      alert('Speech Recognition is not supported on this browser. You can type commands below.');
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      setInputText('');
      speechRecognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleCompletePairing = async (pairId: string, code: string) => {
    try {
      setPairingLoading(true);
      setPairingError(null);

      const platform = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? 'iOS'
        : /Android/i.test(navigator.userAgent)
        ? 'Android'
        : 'Web Browser';

      const res = await api.completePairing(pairId.trim(), code.trim(), {
        name: deviceName.trim() || 'Remote Device',
        platform,
        appVersion: '2.1.2',
      });

      if (res && res.accessToken) {
        setToken(res.accessToken);
        setDeviceId(res.deviceId);
        setIsPaired(true);
        localStorage.setItem('jarvis_device_token', res.accessToken);
        localStorage.setItem('jarvis_device_id', res.deviceId);
      }
    } catch (err: any) {
      setPairingError(err.message || 'Pairing failed. The code may be invalid or expired.');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleUnpair = () => {
    if (confirm('Disconnect this device from JARVIS? You will need a new pairing code to reconnect.')) {
      localStorage.removeItem('jarvis_device_token');
      localStorage.removeItem('jarvis_device_id');
      setToken('');
      setDeviceId('');
      setIsPaired(false);
    }
  };

  const handleExecuteAction = async (action: string, params: Record<string, any> = {}) => {
    try {
      setActionLoading(action);
      setActionFeedback(null);
      const res = await api.executeDesktopAction(action, params);
      const msg = res?.details || `Executed ${action.replace('_', ' ').toUpperCase()}`;
      setActionFeedback(msg);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      setActionFeedback(`Failed: ${err.message}`);
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCaptureScreen = async () => {
    try {
      setScreenLoading(true);
      const res = await api.captureScreen();
      const imageSrc = res?.dataUrl || (res?.base64 ? `data:image/png;base64,${res.base64}` : null);
      if (imageSrc) {
        setScreenPreview(imageSrc);
      }
    } catch (err: any) {
      setActionFeedback(`Screen capture failed: ${err.message}`);
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setScreenLoading(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const res = await api.post('/chat', { message: text });
      const reply = res?.response || res?.content || res?.data?.response || 'Command dispatched to JARVIS core.';
      const jarvisMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'jarvis',
        text: reply,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, jarvisMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'jarvis',
        text: `Error connecting to JARVIS: ${err.message || 'Host unreachable'}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // If not paired, render the Pairing Access Screen
  if (!isPaired) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #02060e 0%, #050d1a 100%)',
          color: '#e6f8ff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            background: 'rgba(5, 12, 24, 0.95)',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            borderRadius: '12px',
            padding: '28px 24px',
            boxShadow: '0 0 32px rgba(0, 229, 255, 0.2)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                margin: '0 auto 12px',
                borderRadius: '50%',
                background: 'rgba(0, 229, 255, 0.12)',
                border: '1px solid #00e5ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(0, 229, 255, 0.4)',
              }}
            >
              <Smartphone size={26} style={{ color: '#00e5ff' }} />
            </div>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '2px',
                color: '#00e5ff',
                margin: '0 0 4px',
                textShadow: '0 0 8px rgba(0, 229, 255, 0.6)',
              }}
            >
              JARVIS COMPANION
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)' }}>
              TACTICAL HANDHELD REMOTE UPLINK
            </p>
          </div>

          {pairingError && (
            <div
              style={{
                background: 'rgba(255, 51, 102, 0.15)',
                border: '1px solid #ff3366',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '18px',
                color: '#ff3366',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {pairingError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCompletePairing(inputPairingId, inputCode);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                DEVICE IDENTIFIER
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. My Phone"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: 'rgba(2, 6, 14, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  color: '#ffffff',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                PAIRING ID
              </label>
              <input
                type="text"
                value={inputPairingId}
                onChange={(e) => setInputPairingId(e.target.value)}
                placeholder="Paste or enter pairing ID"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: 'rgba(2, 6, 14, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                6-DIGIT VERIFICATION PIN
              </label>
              <input
                type="text"
                maxLength={6}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  background: 'rgba(2, 6, 14, 0.8)',
                  border: '1px solid #00e5ff',
                  color: '#00e5ff',
                  fontSize: '20px',
                  fontWeight: 800,
                  textAlign: 'center',
                  letterSpacing: '8px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={pairingLoading || !inputCode || !inputPairingId}
              style={{
                marginTop: '10px',
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                background: '#00e5ff',
                color: '#020408',
                border: 'none',
                fontWeight: 800,
                fontSize: '13px',
                letterSpacing: '1px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 0 16px rgba(0, 229, 255, 0.4)',
                opacity: pairingLoading ? 0.7 : 1,
              }}
            >
              <ShieldCheck size={16} />
              {pairingLoading ? 'AUTHENTICATING...' : 'AUTHORIZE PAIRING'}
            </button>
          </form>

          <div
            style={{
              marginTop: '20px',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '14px',
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            Generate pairing credentials from the desktop JARVIS dashboard under{' '}
            <span style={{ color: '#00e5ff' }}>DEVICES</span>.
          </div>
        </div>
      </div>
    );
  }

  // PAIRED: Tactical Handheld Remote
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#02060e',
        color: '#e6f8ff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        maxWidth: '540px',
        margin: '0 auto',
        borderLeft: '1px solid rgba(0, 229, 255, 0.15)',
        borderRight: '1px solid rgba(0, 229, 255, 0.15)',
        position: 'relative',
      }}
    >
      {/* Top Tactical Status Bar */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(5, 12, 24, 0.95)',
          borderBottom: '1px solid rgba(0, 229, 255, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isHostOnline ? '#00ffc8' : '#ff3366',
              boxShadow: `0 0 8px ${isHostOnline ? '#00ffc8' : '#ff3366'}`,
            }}
          />
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1px', color: '#00e5ff' }}>
            JARVIS REMOTE
          </span>
          {lastLatency !== null && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(0,0,0,0.4)',
                padding: '2px 5px',
                borderRadius: '3px',
              }}
            >
              {lastLatency}ms
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {deviceName}
          </span>
          <button
            onClick={handleUnpair}
            title="Unpair Device"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ff3366',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          style={{
            background: 'rgba(0, 229, 255, 0.15)',
            borderBottom: '1px solid #00e5ff',
            padding: '8px 16px',
            fontSize: '11px',
            color: '#00e5ff',
            fontFamily: 'var(--font-mono)',
            textAlign: 'center',
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          {actionFeedback}
        </div>
      )}

      {/* Main Body with Controls & Chat */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Quick OS Control Deck */}
        <div
          style={{
            background: 'rgba(5, 12, 24, 0.85)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            borderRadius: '10px',
            padding: '14px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '1px',
              color: 'var(--text-muted)',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Zap size={12} className="text-cyan" />
            WORKSTATION DIRECT ACTIONS
          </div>

          {/* Volume & Media Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
            <button
              onClick={() => handleExecuteAction('volume_down')}
              disabled={Boolean(actionLoading)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(2, 6, 14, 0.8)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <Volume1 size={16} className="text-cyan" />
              <span>VOL -</span>
            </button>

            <button
              onClick={() => handleExecuteAction('volume_up')}
              disabled={Boolean(actionLoading)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(2, 6, 14, 0.8)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <Volume2 size={16} className="text-cyan" />
              <span>VOL +</span>
            </button>

            <button
              onClick={() => handleExecuteAction('volume_mute')}
              disabled={Boolean(actionLoading)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(2, 6, 14, 0.8)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <VolumeX size={16} style={{ color: '#ffb800' }} />
              <span>MUTE</span>
            </button>
          </div>

          {/* Media Play/Pause, Lock, Screenshot */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <button
              onClick={() => handleExecuteAction('media_play_pause')}
              disabled={Boolean(actionLoading)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(2, 6, 14, 0.8)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <Play size={16} style={{ color: '#00ffc8' }} />
              <span>PLAY/PAUSE</span>
            </button>

            <button
              onClick={handleCaptureScreen}
              disabled={screenLoading}
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(2, 6, 14, 0.8)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <Camera size={16} className="text-cyan" />
              <span>{screenLoading ? 'SNAPPING...' : 'SNAP SCREEN'}</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Lock host workstation screen immediately?')) {
                  handleExecuteAction('lock_workstation');
                }
              }}
              disabled={Boolean(actionLoading)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: 'rgba(255, 51, 102, 0.1)',
                border: '1px solid rgba(255, 51, 102, 0.35)',
                color: '#ff3366',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <Lock size={16} />
              <span>LOCK PC</span>
            </button>
          </div>
        </div>

        {/* Screen Snapshot Preview Modal / Card */}
        {screenPreview && (
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.95)',
              border: '1px solid #00e5ff',
              borderRadius: '8px',
              padding: '12px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#00e5ff', fontFamily: 'var(--font-mono)' }}>
                HOST SCREEN LIVE CAPTURE
              </span>
              <button
                onClick={() => setScreenPreview(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ✕
              </button>
            </div>
            <img
              src={screenPreview}
              alt="Workstation Screen"
              style={{ width: '100%', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
            />
          </div>
        )}

        {/* Quick Command Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            'System status report',
            'Take a screenshot',
            'Summarize clipboard',
            'Check running tasks',
            'Mute host sound',
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(prompt)}
              style={{
                whiteSpace: 'nowrap',
                padding: '5px 10px',
                borderRadius: '14px',
                background: 'rgba(0, 229, 255, 0.08)',
                border: '1px solid rgba(0, 229, 255, 0.25)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Live Conversation Stream */}
        <div
          style={{
            flex: 1,
            minHeight: '260px',
            background: 'rgba(2, 6, 14, 0.8)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '14px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.map((m) => {
            const isJarvis = m.sender === 'jarvis';
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isJarvis ? 'flex-start' : 'flex-end',
                  maxWidth: '85%',
                  background: isJarvis ? 'rgba(5, 15, 30, 0.9)' : 'rgba(0, 229, 255, 0.15)',
                  border: `1px solid ${isJarvis ? 'rgba(0, 229, 255, 0.3)' : '#00e5ff'}`,
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: isJarvis ? '#00e5ff' : '#00ffc8',
                  }}
                >
                  <span>{isJarvis ? 'JARVIS AI' : 'REMOTE'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{m.timestamp}</span>
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#ffffff',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          {isSending && (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(5, 15, 30, 0.7)',
                border: '1px solid rgba(0, 229, 255, 0.2)',
                color: '#00e5ff',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={11} className="spin" />
              <span>JARVIS is formulating execution...</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>
      </div>

      {/* Handheld Voice & Command Input Dock */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(5, 12, 24, 0.95)',
          borderTop: '1px solid rgba(0, 229, 255, 0.25)',
          position: 'sticky',
          bottom: 0,
          zIndex: 40,
          backdropFilter: 'blur(12px)',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {/* Push-to-Talk / Mic Button */}
          <button
            type="button"
            onClick={handleToggleVoice}
            style={{
              padding: '10px',
              borderRadius: '50%',
              background: isListening ? '#ff3366' : 'rgba(0, 229, 255, 0.15)',
              border: `1px solid ${isListening ? '#ff3366' : '#00e5ff'}`,
              color: isListening ? '#ffffff' : '#00e5ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isListening ? '0 0 16px #ff3366' : 'none',
              flexShrink: 0,
            }}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isListening ? 'Listening...' : 'Command JARVIS or host OS...'}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '20px',
              background: 'rgba(2, 6, 14, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: '#ffffff',
              fontSize: '13px',
              outline: 'none',
            }}
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            style={{
              padding: '10px',
              borderRadius: '50%',
              background: inputText.trim() ? '#00e5ff' : 'rgba(255,255,255,0.1)',
              border: 'none',
              color: inputText.trim() ? '#020408' : 'var(--text-muted)',
              cursor: inputText.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
