import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Database,
  GitBranch,
  ShieldCheck,
  Volume2,
  VolumeX,
  RotateCcw,
  X,
  Zap,
  Server,
  Sparkles
} from 'lucide-react';
import { api } from '../../api/client';
import { voicePlayer } from '../../services/voicePlayer';
import { soundEffects } from '../../services/soundEffects';

interface SystemBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemBriefingModal: React.FC<SystemBriefingModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const fetchBriefing = async () => {
    setLoading(true);
    soundEffects.playStartup();
    try {
      const res = await api.getBriefing();
      if (res && res.success) {
        setData(res);
        soundEffects.playSuccess();
        // Automatically narrate briefing upon generation
        if (res.briefingText) {
          setIsSpeaking(true);
          voicePlayer.speak(res.briefingText);
        }
      }
    } catch (err) {
      console.error('Failed to load system briefing', err);
      soundEffects.playAlert();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBriefing();
    } else {
      voicePlayer.stop();
      setIsSpeaking(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const metrics = data?.metrics || {};

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2, 6, 12, 0.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '760px',
          background: 'linear-gradient(145deg, rgba(6, 14, 26, 0.98), rgba(2, 7, 14, 0.95))',
          border: '1px solid rgba(0, 240, 255, 0.4)',
          borderRadius: '12px',
          boxShadow: '0 0 50px rgba(0, 240, 255, 0.25), inset 0 0 20px rgba(0, 240, 255, 0.05)',
          overflow: 'hidden',
          fontFamily: "'Space Mono', monospace",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Holographic Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(0, 240, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 240, 255, 0.04)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid #00f0ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 14px rgba(0, 240, 255, 0.5)'
            }}>
              <Zap size={16} className="text-cyan animate-pulse" />
            </div>
            <div>
              <div style={{ color: '#00f0ff', fontSize: '13px', fontWeight: 800, letterSpacing: '1.5px' }}>
                JARVIS 2.0 // MORNING STATUS BRIEFING
              </div>
              <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '10px' }}>
                EXECUTIVE TELEMETRY & MULTI-AGENT DIAGNOSTICS
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontSize: '10px',
              color: '#00ffcc',
              background: 'rgba(0, 255, 204, 0.1)',
              padding: '3px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(0, 255, 204, 0.3)'
            }}>
              ALL SYSTEMS NOMINAL
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '22px', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Verbal Briefing Audio Dossier Card */}
          <div
            style={{
              background: 'rgba(0, 240, 255, 0.05)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={14} className="text-cyan animate-pulse" />
                <span style={{ color: '#00f0ff', fontSize: '11px', fontWeight: 700, letterSpacing: '1px' }}>
                  VOICE DISPATCH SUMMARY
                </span>
              </div>
              <button
                onClick={() => {
                  if (isSpeaking) {
                    voicePlayer.stop();
                    setIsSpeaking(false);
                    soundEffects.playBargeIn();
                  } else if (data?.briefingText) {
                    setIsSpeaking(true);
                    voicePlayer.speak(data.briefingText);
                  }
                }}
                style={{
                  background: isSpeaking ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 240, 255, 0.15)',
                  border: `1px solid ${isSpeaking ? '#ef4444' : '#00f0ff'}`,
                  color: isSpeaking ? '#ef4444' : '#00f0ff',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {isSpeaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
                <span>{isSpeaking ? 'STOP AUDIO' : 'READ ALOUD'}</span>
              </button>
            </div>

            <div style={{
              fontSize: '12px',
              lineHeight: 1.6,
              color: '#d9f8ff',
              fontStyle: 'italic',
              padding: '6px 0'
            }}>
              "{loading ? 'Compiling executive diagnostics...' : (data?.briefingText || 'Initializing briefing telemetry...')}"
            </div>
          </div>

          {/* Core Metrics Hex Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
            {/* CPU */}
            <div style={{
              background: 'rgba(2, 6, 12, 0.75)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '6px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(0, 240, 255, 0.7)', fontSize: '10px', marginBottom: '6px' }}>
                <Cpu size={13} className="text-cyan" />
                <span>PROCESSOR</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>
                {metrics.cpuCores ? `${metrics.cpuCores} CORES` : 'N/A'}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {metrics.cpuModel || 'Host CPU Architecture'}
              </div>
            </div>

            {/* RAM */}
            <div style={{
              background: 'rgba(2, 6, 12, 0.75)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '6px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(0, 240, 255, 0.7)', fontSize: '10px', marginBottom: '6px' }}>
                <Database size={13} className="text-cyan" />
                <span>MEMORY RAM</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#00ffcc' }}>
                {metrics.memoryUsagePercent !== undefined ? `${metrics.memoryUsagePercent}% UTILIZED` : 'N/A'}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '3px' }}>
                {metrics.usedMemoryGb && metrics.totalMemoryGb ? `${metrics.usedMemoryGb} GB / ${metrics.totalMemoryGb} GB` : 'System Memory'}
              </div>
            </div>

            {/* AI Core */}
            <div style={{
              background: 'rgba(2, 6, 12, 0.75)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '6px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(0, 240, 255, 0.7)', fontSize: '10px', marginBottom: '6px' }}>
                <Sparkles size={13} className="text-cyan" />
                <span>CORE INTELLIGENCE</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffd600' }}>
                {metrics.modelMode || 'CLOUD'} MODE
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '3px' }}>
                {metrics.modelMode === 'LOCAL' ? 'Qwen 3.5 8B (Offline)' : 'Gemini 3.5 Flash'}
              </div>
            </div>

            {/* Git Health */}
            <div style={{
              background: 'rgba(2, 6, 12, 0.75)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '6px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(0, 240, 255, 0.7)', fontSize: '10px', marginBottom: '6px' }}>
                <GitBranch size={13} className="text-cyan" />
                <span>WORKSPACE GIT</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: metrics.gitClean ? '#00ffcc' : '#f59e0b' }}>
                {metrics.gitBranch || 'main'} • {metrics.gitClean ? 'CLEAN' : 'MODIFIED'}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '3px' }}>
                Working tree sync status
              </div>
            </div>

            {/* Approvals */}
            <div style={{
              background: 'rgba(2, 6, 12, 0.75)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '6px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(0, 240, 255, 0.7)', fontSize: '10px', marginBottom: '6px' }}>
                <ShieldCheck size={13} className="text-cyan" />
                <span>SECURITY CLEARANCE</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#00ffcc' }}>
                {metrics.pendingApprovals ?? 0} PENDING
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '3px' }}>
                Air-gap perimeter secure
              </div>
            </div>

            {/* Uptime */}
            <div style={{
              background: 'rgba(2, 6, 12, 0.75)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '6px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(0, 240, 255, 0.7)', fontSize: '10px', marginBottom: '6px' }}>
                <Server size={13} className="text-cyan" />
                <span>DAEMON UPTIME</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#00f0ff' }}>
                {metrics.uptimeMinutes !== undefined ? `${metrics.uptimeMinutes} MINS` : 'ONLINE'}
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '3px' }}>
                Continuous background session
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid rgba(0, 240, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 240, 255, 0.02)'
          }}
        >
          <button
            onClick={fetchBriefing}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              color: '#00f0ff',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: loading ? 'default' : 'pointer',
              fontWeight: 700
            }}
          >
            <RotateCcw size={12} className={loading ? 'spin' : ''} />
            <span>{loading ? 'ANALYZING HOST...' : 'RE-RUN DIAGNOSTICS'}</span>
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.8)',
              padding: '6px 16px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            DISMISS HUD
          </button>
        </div>
      </div>
    </div>
  );
};
