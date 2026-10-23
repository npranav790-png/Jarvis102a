import React, { useEffect, useState } from 'react';
import { Cloud, Cpu, Zap, AlertTriangle, ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import { useJarvisStore } from '../store/jarvisStore';
import { soundEffects } from '../services/soundEffects';

export interface ModelSwitcherProps {
  variant?: 'compact' | 'full' | 'inline';
  className?: string;
}

export interface ModelModeData {
  mode: 'CLOUD' | 'LOCAL' | 'HYBRID';
  privacyMode: string;
  allowFallback: boolean;
  preferredModel?: string;
  cloud: {
    provider: string;
    name: string;
    status: string;
    latencyMs?: number;
    model: string;
    models?: Array<{ id: string; name: string }>;
  };
  local: {
    provider: string;
    name: string;
    status: string;
    latencyMs?: number;
    baseUrl: string;
    models?: Array<{ id: string; name: string }>;
  };
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({ variant = 'compact' }) => {
  const { modelMode, setModelMode } = useJarvisStore();
  const [data, setData] = useState<ModelModeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [allowFallback, setAllowFallback] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchModeData = async () => {
    try {
      const res = await api.getModelMode();
      if (res && res.mode) {
        setData(res);
        setModelMode(res.mode);
        if (res.allowFallback !== undefined) {
          setAllowFallback(res.allowFallback);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch model mode data:', err);
    }
  };

  useEffect(() => {
    fetchModeData();
    const interval = setInterval(fetchModeData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectMode = async (newMode: 'CLOUD' | 'LOCAL' | 'HYBRID') => {
    if (loading) return;
    try {
      soundEffects.playModeSwitch();
      setLoading(true);
      setModelMode(newMode); // Optimistic UI update
      const res = await api.setModelMode(newMode, allowFallback);
      if (res && res.success) {
        setFeedback(res.message || `Switched to ${newMode}`);
        setTimeout(() => setFeedback(null), 3000);
      }
      await fetchModeData();
    } catch (err: any) {
      setFeedback(`Error: ${err.message || 'Failed to switch mode'}`);
      setTimeout(() => setFeedback(null), 4000);
      await fetchModeData();
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setAllowFallback(val);
    try {
      await api.setModelMode(modelMode, val);
      await fetchModeData();
    } catch (err) {
      console.error(err);
    }
  };

  const cloudOnline = data?.cloud?.status === 'ONLINE';
  const localOnline = data?.local?.status === 'ONLINE';

  // -------------------------------------------------------------
  // COMPACT VARIANT: Designed for Top Bar / Header
  // -------------------------------------------------------------
  if (variant === 'compact') {
    return (
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(2, 6, 14, 0.85)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            borderRadius: '20px',
            padding: '2px',
            gap: '2px',
            boxShadow: '0 0 12px rgba(0, 229, 255, 0.08)',
          }}
        >
          {/* Cloud Option */}
          <button
            type="button"
            onClick={() => handleSelectMode('CLOUD')}
            disabled={loading}
            title={`Cloud Mode: ${data?.cloud?.model || 'Gemini 3.5 Flash'} (${cloudOnline ? 'ONLINE' : 'CONNECTING'})`}
            style={{
              padding: '4px 10px',
              borderRadius: '16px',
              border: 'none',
              background: modelMode === 'CLOUD' ? 'linear-gradient(135deg, rgba(0, 229, 255, 0.25), rgba(0, 150, 255, 0.35))' : 'transparent',
              color: modelMode === 'CLOUD' ? '#00e5ff' : 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: modelMode === 'CLOUD' ? 700 : 500,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s ease',
              boxShadow: modelMode === 'CLOUD' ? '0 0 8px rgba(0, 229, 255, 0.3)' : 'none',
            }}
          >
            <Cloud size={12} />
            <span>CLOUD</span>
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: cloudOnline ? '#00ffc8' : '#ffd600',
                boxShadow: cloudOnline ? '0 0 4px #00ffc8' : 'none',
              }}
            />
          </button>

          {/* Local Option */}
          <button
            type="button"
            onClick={() => handleSelectMode('LOCAL')}
            disabled={loading}
            title={`Local Mode: Ollama (${localOnline ? 'ONLINE' : 'OFFLINE at localhost:11434'})`}
            style={{
              padding: '4px 10px',
              borderRadius: '16px',
              border: 'none',
              background: modelMode === 'LOCAL' ? 'linear-gradient(135deg, rgba(0, 255, 200, 0.25), rgba(0, 180, 120, 0.35))' : 'transparent',
              color: modelMode === 'LOCAL' ? '#00ffc8' : 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: modelMode === 'LOCAL' ? 700 : 500,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s ease',
              boxShadow: modelMode === 'LOCAL' ? '0 0 8px rgba(0, 255, 200, 0.3)' : 'none',
            }}
          >
            <Cpu size={12} />
            <span>LOCAL</span>
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: localOnline ? '#00ffc8' : '#ff5252',
                boxShadow: localOnline ? '0 0 4px #00ffc8' : 'none',
              }}
            />
          </button>

          {/* Hybrid Option */}
          <button
            type="button"
            onClick={() => handleSelectMode('HYBRID')}
            disabled={loading}
            title="Hybrid Mode: High-speed Cloud primary with automatic Local fallback"
            style={{
              padding: '4px 10px',
              borderRadius: '16px',
              border: 'none',
              background: modelMode === 'HYBRID' ? 'linear-gradient(135deg, rgba(255, 214, 0, 0.2), rgba(255, 140, 0, 0.3))' : 'transparent',
              color: modelMode === 'HYBRID' ? '#ffd600' : 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: modelMode === 'HYBRID' ? 700 : 500,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              boxShadow: modelMode === 'HYBRID' ? '0 0 8px rgba(255, 214, 0, 0.25)' : 'none',
            }}
          >
            <Zap size={12} />
            <span>HYBRID</span>
          </button>

          {/* Details / Popover toggle */}
          <button
            type="button"
            onClick={() => setShowPopover(!showPopover)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '2px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronDown size={11} />
          </button>
        </div>

        {/* Dropdown Popover Info */}
        {showPopover && (
          <div
            style={{
              position: 'absolute',
              top: '32px',
              right: 0,
              width: '280px',
              background: 'rgba(5, 12, 24, 0.96)',
              border: '1px solid rgba(0, 229, 255, 0.4)',
              borderRadius: '8px',
              padding: '14px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 16px rgba(0, 229, 255, 0.15)',
              backdropFilter: 'blur(16px)',
              zIndex: 1000,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#00e5ff', letterSpacing: '1px', fontFamily: 'var(--font-mono)' }}>
                INTELLIGENCE ROUTING
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                ZERO-COST ($0)
              </span>
            </div>

            {/* Cloud Status Item */}
            <div style={{ padding: '8px', background: 'rgba(2, 6, 14, 0.6)', borderRadius: '6px', marginBottom: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Cloud size={13} className="text-cyan" /> Cloud (Gemini)
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: cloudOnline ? '#00ffc8' : '#ffd600' }}>
                  {cloudOnline ? 'ONLINE' : 'CONNECTING'}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {data?.cloud?.model || 'gemini-3.5-flash'} • 1M Context Window
              </div>
            </div>

            {/* Local Status Item */}
            <div style={{ padding: '8px', background: 'rgba(2, 6, 14, 0.6)', borderRadius: '6px', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Cpu size={13} style={{ color: '#00ffc8' }} /> Local (Ollama)
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: localOnline ? '#00ffc8' : '#ff5252' }}>
                  {localOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {data?.local?.baseUrl || 'http://localhost:11434'}
              </div>
              {!localOnline && (
                <div style={{ fontSize: '9px', color: '#ffd600', marginTop: '4px', lineHeight: 1.3 }}>
                  Tip: Start Ollama with `ollama run qwen3.5:8b`
                </div>
              )}
            </div>

            {/* Fallback Option */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
              <input
                type="checkbox"
                checked={allowFallback}
                onChange={handleToggleFallback}
                style={{ accentColor: '#00e5ff' }}
              />
              <span>Auto-fallback to Cloud when Local is offline</span>
            </label>

            {feedback && (
              <div style={{ marginTop: '8px', fontSize: '10px', color: '#00e5ff', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                {feedback}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // FULL / INLINE VARIANT: Designed for Pages (AI, Settings, Chat)
  // -------------------------------------------------------------
  return (
    <div
      style={{
        background: 'rgba(5, 12, 24, 0.85)',
        border: '1px solid rgba(0, 229, 255, 0.35)',
        borderRadius: '8px',
        padding: '18px 20px',
        boxShadow: '0 0 20px rgba(0, 229, 255, 0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={18} className="text-cyan" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px', color: '#00e5ff' }}>
              INTELLIGENCE CORE MODEL SWITCHER
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Select whether JARVIS routes directives to ultra-fast free Cloud models or your private Local Neural Engine.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            CURRENT PRIVACY:
          </span>
          <span
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: modelMode === 'LOCAL' ? '#00ffc8' : '#00e5ff',
              background: modelMode === 'LOCAL' ? 'rgba(0, 255, 200, 0.15)' : 'rgba(0, 229, 255, 0.15)',
              border: `1px solid ${modelMode === 'LOCAL' ? '#00ffc8' : '#00e5ff'}`,
            }}
          >
            {data?.privacyMode || modelMode}
          </span>
        </div>
      </div>

      {/* 3 Interactive Mode Selection Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
        {/* Card 1: Cloud Model */}
        <div
          onClick={() => handleSelectMode('CLOUD')}
          style={{
            padding: '14px',
            borderRadius: '6px',
            background: modelMode === 'CLOUD' ? 'rgba(0, 229, 255, 0.15)' : 'rgba(2, 6, 14, 0.7)',
            border: `1.5px solid ${modelMode === 'CLOUD' ? '#00e5ff' : 'var(--border-subtle)'}`,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: modelMode === 'CLOUD' ? '0 0 16px rgba(0, 229, 255, 0.2)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12px', color: '#00e5ff' }}>
              <Cloud size={16} />
              <span>CLOUD MODEL</span>
            </div>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                color: cloudOnline ? '#00ffc8' : '#ffd600',
                padding: '2px 6px',
                borderRadius: '8px',
                background: cloudOnline ? 'rgba(0, 255, 200, 0.1)' : 'rgba(255, 214, 0, 0.1)',
                border: `1px solid ${cloudOnline ? '#00ffc8' : '#ffd600'}`,
              }}
            >
              {cloudOnline ? 'READY' : 'STANDBY'}
            </span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>
            Google Gemini 3.5 Flash
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Ultra-fast responses, 1 Million token context window, multimodality, zero per-token cost ($0).
          </div>
        </div>

        {/* Card 2: Local Model */}
        <div
          onClick={() => handleSelectMode('LOCAL')}
          style={{
            padding: '14px',
            borderRadius: '6px',
            background: modelMode === 'LOCAL' ? 'rgba(0, 255, 200, 0.15)' : 'rgba(2, 6, 14, 0.7)',
            border: `1.5px solid ${modelMode === 'LOCAL' ? '#00ffc8' : 'var(--border-subtle)'}`,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: modelMode === 'LOCAL' ? '0 0 16px rgba(0, 255, 200, 0.2)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12px', color: '#00ffc8' }}>
              <Cpu size={16} />
              <span>LOCAL MODEL</span>
            </div>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                color: localOnline ? '#00ffc8' : '#ff5252',
                padding: '2px 6px',
                borderRadius: '8px',
                background: localOnline ? 'rgba(0, 255, 200, 0.1)' : 'rgba(255, 82, 82, 0.1)',
                border: `1px solid ${localOnline ? '#00ffc8' : '#ff5252'}`,
              }}
            >
              {localOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>
            Ollama Neural Engine (Qwen 3.5 8B)
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            100% private, on-device workstation execution, zero external data sharing, air-gapped security.
          </div>
        </div>

        {/* Card 3: Hybrid / Smart Auto */}
        <div
          onClick={() => handleSelectMode('HYBRID')}
          style={{
            padding: '14px',
            borderRadius: '6px',
            background: modelMode === 'HYBRID' ? 'rgba(255, 214, 0, 0.15)' : 'rgba(2, 6, 14, 0.7)',
            border: `1.5px solid ${modelMode === 'HYBRID' ? '#ffd600' : 'var(--border-subtle)'}`,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: modelMode === 'HYBRID' ? '0 0 16px rgba(255, 214, 0, 0.2)' : 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12px', color: '#ffd600' }}>
              <Zap size={16} />
              <span>HYBRID (SMART)</span>
            </div>
            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                color: '#ffd600',
                padding: '2px 6px',
                borderRadius: '8px',
                background: 'rgba(255, 214, 0, 0.1)',
                border: '1px solid #ffd600',
              }}
            >
              RECOMMENDED
            </span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>
            Intelligent Hybrid Orchestration
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Fast Cloud Gemini primary with automatic, seamless fallback to Local Ollama if cloud is unreachable.
          </div>
        </div>
      </div>

      {/* Local Offline Guidance Banner if Local is chosen while offline */}
      {modelMode === 'LOCAL' && !localOnline && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(255, 214, 0, 0.1)',
            border: '1px solid rgba(255, 214, 0, 0.4)',
            color: '#ffd600',
            fontSize: '11px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <div>
            <b>Local Ollama is currently offline at http://localhost:11434.</b>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              To run locally: Install Ollama (<a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: '#00e5ff' }}>ollama.com</a>) and run <code style={{ color: '#00ffc8' }}>ollama run qwen3.5:8b</code>.
              {allowFallback && ' Auto-fallback to Cloud Gemini is currently ENABLED, so JARVIS will continue responding smoothly.'}
            </div>
          </div>
        </div>
      )}

      {/* Fallback Checkbox and Action Feedback */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
          <input
            type="checkbox"
            checked={allowFallback}
            onChange={handleToggleFallback}
            style={{ accentColor: '#00e5ff' }}
          />
          <span>Enable resilient fallback across engines (prevents service interruption)</span>
        </label>

        {feedback && (
          <span style={{ fontSize: '11px', color: '#00ffc8', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {feedback}
          </span>
        )}
      </div>
    </div>
  );
};
