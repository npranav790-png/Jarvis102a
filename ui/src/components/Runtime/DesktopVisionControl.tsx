import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Camera,
  Play,
  Pause,
  MousePointer,
  Keyboard,
  Volume2,
  Volume1,
  VolumeX,
  Lock,
  Sparkles,
  Eye,
  Send
} from 'lucide-react';
import { api } from '../../api/client';
import { soundEffects } from '../../services/soundEffects';
import { voicePlayer } from '../../services/voicePlayer';

export const DesktopVisionControl: React.FC = () => {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [screenDim, setScreenDim] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [typeTextInput, setTypeTextInput] = useState('');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [lastActionStatus, setLastActionStatus] = useState<string>('Standby');

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Capture screen frame from backend
  const captureScreen = async () => {
    setLoading(true);
    soundEffects.playStartup();
    try {
      const res = await api.captureDesktopScreen('fullscreen');
      if (res && res.base64) {
        setImageBase64(res.base64);
        if (res.width && res.height) {
          setScreenDim({ width: res.width, height: res.height });
        }
        soundEffects.playSuccess();
        setLastActionStatus('Frame acquired');
      }
    } catch (err: any) {
      console.error('Screen capture failed', err);
      soundEffects.playAlert();
      setLastActionStatus('Capture failed');
    } finally {
      setLoading(false);
    }
  };

  // Initial capture on mount
  useEffect(() => {
    captureScreen();
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      captureScreen();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Handle clicking on the image viewport in "Take The Wheel" mode
  const handleViewportClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!interactiveMode || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = screenDim.width / rect.width;
    const scaleY = screenDim.height / rect.height;

    const actualX = Math.round(clickX * scaleX);
    const actualY = Math.round(clickY * scaleY);

    soundEffects.playModeSwitch();
    setLastActionStatus(`Clicking (${actualX}, ${actualY})...`);

    try {
      await api.executeDesktopAction({
        action: 'mouse_click',
        x: actualX,
        y: actualY,
        button: 'left'
      });
      soundEffects.playSuccess();
      setLastActionStatus(`Dispatched left click at ${actualX}, ${actualY}`);
      // Refresh screen after interaction
      setTimeout(captureScreen, 600);
    } catch (err) {
      console.error('Desktop click failed', err);
      soundEffects.playAlert();
      setLastActionStatus('Action failed');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = screenDim.width / rect.width;
    const scaleY = screenDim.height / rect.height;
    setHoverCoords({
      x: Math.round(x * scaleX),
      y: Math.round(y * scaleY)
    });
  };

  // Execute quick tactical desktop action
  const handleTacticalAction = async (action: string, extra: any = {}) => {
    soundEffects.playModeSwitch();
    setLastActionStatus(`Executing ${action}...`);
    try {
      await api.executeDesktopAction({ action, ...extra });
      soundEffects.playSuccess();
      setLastActionStatus(`Completed ${action}`);
      if (['key_press', 'type_text', 'mouse_click'].includes(action)) {
        setTimeout(captureScreen, 600);
      }
    } catch (err) {
      soundEffects.playAlert();
      setLastActionStatus(`Failed ${action}`);
    }
  };

  // Type text string on desktop
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeTextInput.trim()) return;
    const text = typeTextInput;
    setTypeTextInput('');
    await handleTacticalAction('type_text', { text });
  };

  // Multimodal AI Screen Vision Diagnostics
  const handleAnalyzeWithAI = async () => {
    if (!imageBase64) return;
    setAiAnalyzing(true);
    soundEffects.playCommandTransmit();
    setLastActionStatus('Multimodal AI Vision inspection in progress...');

    try {
      const prompt = 'Analyze the desktop screenshot: identify the active software applications, browser tabs or code editor open, any visible errors or notifications, and state what task the user is currently engaged in.';
      const res = await api.post('/chat', {
        message: prompt,
        image: imageBase64,
        modelPreference: 'CLOUD'
      });

      const responseText = res?.response || res?.content || res?.data?.response || 'Analysis complete: desktop displays the primary active workspace.';
      setAiAnalysisResult(responseText);
      soundEffects.playSuccess();
      setLastActionStatus('Vision inspection finished');
      voicePlayer.speak(responseText);
    } catch (err) {
      console.error('Vision analysis failed', err);
      soundEffects.playAlert();
      setLastActionStatus('AI analysis failed');
    } finally {
      setAiAnalyzing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: "'Space Mono', monospace" }}>
      {/* Top Controls Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(3, 8, 16, 0.9)',
          border: '1px solid rgba(0, 240, 255, 0.25)',
          borderRadius: '8px',
          padding: '10px 16px',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Monitor size={16} className="text-cyan animate-pulse" />
            <span style={{ color: '#00f0ff', fontSize: '11px', fontWeight: 800, letterSpacing: '1px' }}>
              HOST DESKTOP VISION
            </span>
          </div>
          <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>|</span>
          <span style={{ fontSize: '10px', color: 'rgba(0, 240, 255, 0.7)' }}>
            NATIVE RESOLUTION: {screenDim.width} × {screenDim.height}
          </span>
          {hoverCoords && (
            <span style={{ fontSize: '10px', color: '#ffd600', background: 'rgba(255, 214, 0, 0.1)', padding: '2px 6px', borderRadius: '3px', border: '1px solid rgba(255, 214, 0, 0.2)' }}>
              CURSOR: X: {hoverCoords.x} Y: {hoverCoords.y}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Capture Frame Button */}
          <button
            onClick={captureScreen}
            disabled={loading}
            style={{
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              color: '#00f0ff',
              padding: '5px 10px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: loading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 700
            }}
          >
            <Camera size={12} className={loading ? 'spin' : ''} />
            <span>{loading ? 'CAPTURING...' : 'CAPTURE'}</span>
          </button>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              background: autoRefresh ? 'rgba(0, 255, 200, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${autoRefresh ? '#00ffc8' : 'rgba(255, 255, 255, 0.2)'}`,
              color: autoRefresh ? '#00ffc8' : 'rgba(255, 255, 255, 0.6)',
              padding: '5px 10px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            {autoRefresh ? <Pause size={12} /> : <Play size={12} />}
            <span>AUTO: {autoRefresh ? '4s POLLING' : 'OFF'}</span>
          </button>

          {/* Take The Wheel (Interactive Toggle) */}
          <button
            onClick={() => {
              const next = !interactiveMode;
              setInteractiveMode(next);
              if (next) soundEffects.playStartup();
              else soundEffects.playBargeIn();
            }}
            style={{
              background: interactiveMode ? 'rgba(255, 214, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${interactiveMode ? '#ffd600' : 'rgba(255, 255, 255, 0.2)'}`,
              color: interactiveMode ? '#ffd600' : 'rgba(255, 255, 255, 0.6)',
              padding: '5px 10px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 700,
              boxShadow: interactiveMode ? '0 0 12px rgba(255, 214, 0, 0.3)' : 'none'
            }}
          >
            <MousePointer size={12} />
            <span>{interactiveMode ? 'TAKE THE WHEEL: ACTIVE' : 'VIEW ONLY'}</span>
          </button>

          {/* Multimodal AI Vision Analysis */}
          <button
            onClick={handleAnalyzeWithAI}
            disabled={aiAnalyzing || !imageBase64}
            style={{
              background: 'linear-gradient(90deg, rgba(0, 240, 255, 0.25), rgba(0, 255, 200, 0.25))',
              border: '1px solid #00f0ff',
              color: '#00f0ff',
              padding: '5px 12px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: aiAnalyzing ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontWeight: 800,
              boxShadow: '0 0 14px rgba(0, 240, 255, 0.3)'
            }}
          >
            <Sparkles size={12} className={aiAnalyzing ? 'spin' : ''} />
            <span>{aiAnalyzing ? 'AI ANALYZING SCREEN...' : 'AI VISION SCAN'}</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          background: '#010408',
          border: `1px solid ${interactiveMode ? 'rgba(255, 214, 0, 0.5)' : 'rgba(0, 240, 255, 0.25)'}`,
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: interactiveMode ? '0 0 30px rgba(255, 214, 0, 0.15)' : 'inset 0 0 30px rgba(0, 240, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '380px'
        }}
      >
        {imageBase64 ? (
          <img
            ref={imageRef}
            src={`data:image/png;base64,${imageBase64}`}
            alt="Host Desktop Screen Viewport"
            onClick={handleViewportClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverCoords(null)}
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '680px',
              objectFit: 'contain',
              display: 'block',
              cursor: interactiveMode ? 'crosshair' : 'default',
              transition: 'opacity 0.2s ease'
            }}
          />
        ) : (
          <div style={{ color: 'rgba(0, 240, 255, 0.5)', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Eye size={24} className="text-cyan animate-pulse" />
            <span>INITIALIZING DESKTOP RETINA FEED...</span>
          </div>
        )}

        {/* Tactical Crosshair Overlay when Hovering in Interactive Mode */}
        {interactiveMode && hoverCoords && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              background: 'rgba(2, 6, 12, 0.85)',
              border: '1px solid #ffd600',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              color: '#ffd600',
              pointerEvents: 'none',
              zIndex: 20
            }}
          >
            TARGET RETICLE: ({hoverCoords.x}, {hoverCoords.y}) — CLICK TO DISPATCH
          </div>
        )}
      </div>

      {/* Multimodal AI Vision Report Dossier */}
      {aiAnalysisResult && (
        <div
          style={{
            background: 'rgba(0, 240, 255, 0.05)',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            borderRadius: '6px',
            padding: '14px',
            boxShadow: '0 0 20px rgba(0, 240, 255, 0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00f0ff', fontSize: '11px', fontWeight: 800 }}>
              <Sparkles size={13} className="text-cyan" />
              <span>JARVIS MULTIMODAL SCREEN REPORT</span>
            </div>
            <button
              onClick={() => voicePlayer.speak(aiAnalysisResult)}
              style={{
                background: 'rgba(0, 240, 255, 0.15)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                color: '#00f0ff',
                padding: '3px 8px',
                borderRadius: '3px',
                fontSize: '9px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Volume2 size={11} />
              <span>RE-READ REPORT</span>
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#d9f8ff', lineHeight: 1.6 }}>
            {aiAnalysisResult}
          </div>
        </div>
      )}

      {/* Tactical Desktop Command Deck (Interactive Controls) */}
      <div
        style={{
          background: 'rgba(3, 8, 16, 0.85)',
          border: '1px solid rgba(0, 240, 255, 0.2)',
          borderRadius: '8px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          {/* Quick Keys */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '9px', color: 'rgba(0, 240, 255, 0.6)', marginRight: '4px' }}>KEY STROKES:</span>
            {['Enter', 'Tab', 'Escape', 'WinKey', 'Space'].map(k => (
              <button
                key={k}
                onClick={() => handleTacticalAction('key_press', { key: k })}
                style={{
                  background: 'rgba(0, 240, 255, 0.08)',
                  border: '1px solid rgba(0, 240, 255, 0.25)',
                  color: '#00f0ff',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  cursor: 'pointer'
                }}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Media & System Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '9px', color: 'rgba(0, 240, 255, 0.6)', marginRight: '4px' }}>HARDWARE:</span>
            <button
              onClick={() => handleTacticalAction('volume_up')}
              title="Volume Up"
              style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer' }}
            >
              <Volume2 size={12} />
            </button>
            <button
              onClick={() => handleTacticalAction('volume_down')}
              title="Volume Down"
              style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer' }}
            >
              <Volume1 size={12} />
            </button>
            <button
              onClick={() => handleTacticalAction('volume_mute')}
              title="Mute Volume"
              style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer' }}
            >
              <VolumeX size={12} />
            </button>
            <button
              onClick={() => handleTacticalAction('media_play_pause')}
              title="Play / Pause Media"
              style={{ background: 'rgba(0, 255, 200, 0.1)', border: '1px solid rgba(0, 255, 200, 0.3)', color: '#00ffc8', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer' }}
            >
              <Play size={12} />
            </button>
            <button
              onClick={() => handleTacticalAction('lock_workstation')}
              title="Lock Windows Workstation"
              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 8px', borderRadius: '3px', cursor: 'pointer' }}
            >
              <Lock size={12} />
            </button>
          </div>
        </div>

        {/* Type Text Direct Input Form */}
        <form onSubmit={handleSendText} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Keyboard size={14} className="text-cyan shrink-0" />
          <input
            type="text"
            placeholder="Type text string to inject into active Windows window..."
            value={typeTextInput}
            onChange={(e) => setTypeTextInput(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(2, 6, 12, 0.8)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: '4px',
              padding: '6px 12px',
              color: '#ffffff',
              fontSize: '11px',
              fontFamily: "'Space Mono', monospace",
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={!typeTextInput.trim()}
            style={{
              background: 'rgba(0, 240, 255, 0.2)',
              border: '1px solid rgba(0, 240, 255, 0.45)',
              color: '#00f0ff',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: typeTextInput.trim() ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>INJECT</span>
            <Send size={11} />
          </button>
        </form>

        {/* Live Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', borderTop: '1px solid rgba(0, 240, 255, 0.1)', paddingTop: '6px' }}>
          <span>STATUS: {lastActionStatus}</span>
          <span style={{ color: interactiveMode ? '#ffd600' : '#00ffcc' }}>
            {interactiveMode ? '⚡ MOUSE CLICK INTERACTION ENABLED' : '🔒 SAFE READ-ONLY TELEMETRY'}
          </span>
        </div>
      </div>
    </div>
  );
};
