import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, MessageSquare, CheckSquare, Users, Shield, Database, Cpu, Zap, Settings, Radio, Code2, Smartphone, Network, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import { NeuralCore } from '../NeuralCore/NeuralCore';
import { useJarvisStore } from '../../store/jarvisStore';
import { api } from '../../api/client';
import { CommandPalette } from '../CommandPalette';
import { NotificationCenter } from '../NotificationCenter';
import { ModelSwitcher } from '../ModelSwitcher';
import { soundEffects } from '../../services/soundEffects';
import { wakeWordService } from '../../services/wakeWordService';
import { voicePlayer } from '../../services/voicePlayer';
import { SystemBriefingModal } from '../Runtime/SystemBriefingModal';

export const Layout: React.FC = () => {
  const {
    wsConnected,
    systemState,
    setSystemState,
    pendingApprovals,
    activeTasks,
    soundEnabled,
    setSoundEnabled,
    wakeWordEnabled,
    setWakeWordEnabled,
    modelMode,
    addMessage,
  } = useJarvisStore();
  const location = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [timeStr, setTimeStr] = useState('');
  const [showBriefing, setShowBriefing] = useState(false);

  // Sync sound effects service muted state with store
  useEffect(() => {
    soundEffects.setMuted(!soundEnabled);
  }, [soundEnabled]);

  // Sync wake word ambient listener service with store
  useEffect(() => {
    if (wakeWordEnabled) {
      wakeWordService.start();
    } else {
      wakeWordService.stop();
    }
    return () => {
      wakeWordService.stop();
    };
  }, [wakeWordEnabled]);

  // Listen for ambient "Hey JARVIS" triggers
  useEffect(() => {
    const unsubscribe = wakeWordService.subscribe(async ({ commandText }) => {
      if (!commandText) {
        voicePlayer.speak("Online. Standing by.");
        return;
      }

      // Check if command is a status briefing request
      if (/(briefing|status|diagnostic|morning|telemetry)/i.test(commandText)) {
        setShowBriefing(true);
        return;
      }

      // Spoken trailing command
      addMessage({
        id: Date.now().toString(),
        role: 'user',
        content: commandText,
        timestamp: new Date().toISOString()
      });
      setSystemState('THINKING');

      const tempAssistantId = `stream_${Date.now()}`;
      let accumulatedText = '';
      try {
        const stream = api.streamChat({ message: commandText, modelPreference: modelMode });
        for await (const chunk of stream) {
          if (chunk.delta) {
            accumulatedText += chunk.delta;
            addMessage({
              id: tempAssistantId,
              role: 'jarvis',
              content: accumulatedText,
              timestamp: new Date().toISOString(),
            });
          }
          if (chunk.done) {
            soundEffects.playSuccess();
            const finalText = chunk.content || accumulatedText;
            if (finalText) {
              addMessage({
                id: chunk.id || tempAssistantId,
                replaceId: tempAssistantId,
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
      } catch {
        try {
          const res = await api.post('/chat', { message: commandText, modelPreference: modelMode });
          const resp = res?.response || res?.content || res?.data?.response;
          if (resp) {
            addMessage({
              id: Date.now().toString(),
              role: 'jarvis',
              content: resp,
              timestamp: new Date().toISOString()
            });
            voicePlayer.speak(resp);
          }
        } catch {
          voicePlayer.speak("I was unable to complete the command.");
        }
        setSystemState('IDLE');
      }
    });

    return unsubscribe;
  }, [modelMode, addMessage, setSystemState]);

  useEffect(() => {
    api.connectWs();
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toTimeString().split(' ')[0]);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Ensure sidebar navigation is always reset to the top when navigating routes
  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  const navItems = [
    { to: '/', icon: <Activity size={16} />, label: 'HOME' },
    { to: '/chat', icon: <MessageSquare size={16} />, label: 'CHAT' },
    { to: '/orchestrator', icon: <Code2 size={16} />, label: 'ORCHESTRATOR' },
    { to: '/architecture', icon: <Network size={16} />, label: 'ARCHITECTURE' },
    { to: '/tasks', icon: <CheckSquare size={16} />, label: 'TASKS' },
    { to: '/agents', icon: <Users size={16} />, label: 'AGENTS' },
    { to: '/approvals', icon: <Shield size={16} />, label: 'APPROVALS', badge: pendingApprovals.length },
    { to: '/devices', icon: <Smartphone size={16} />, label: 'DEVICES' },
    { to: '/memory', icon: <Database size={16} />, label: 'MEMORY' },
    { to: '/runtime', icon: <Cpu size={16} />, label: 'RUNTIME' },
    { to: '/ai', icon: <Zap size={16} />, label: 'AI' },
    { to: '/settings', icon: <Settings size={16} />, label: 'SETTINGS' },
  ];

  return (
    <div className="app-container">
      <CommandPalette />

      {/* Top Bar - Header */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '3px' }}>
            <div style={{ width: '3px', height: '14px', background: 'var(--accent-cyan)' }} />
            <div style={{ width: '3px', height: '14px', background: 'var(--accent-cyan)', opacity: 0.6 }} />
            <div style={{ width: '3px', height: '14px', background: 'var(--accent-cyan)', opacity: 0.3 }} />
          </div>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, letterSpacing: '2px' }}>JARVIS 2.0</span>
          <span style={{ color: 'var(--text-muted)' }}>//</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', letterSpacing: '1.5px' }}>COMMAND CENTER</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className={`status-dot ${wsConnected ? 'active status-online' : 'active status-offline'}`} />
            <span className="font-mono text-cyan" style={{ fontSize: '0.75rem', letterSpacing: '1px' }}>
              CORE: {systemState}
            </span>
          </div>
          <span style={{ color: 'var(--border-active)' }}>|</span>
          <span className="font-mono" style={{ color: 'var(--text-primary)', fontSize: '0.75rem', letterSpacing: '1.5px' }}>
            SYS.TIME: {timeStr || '00:00:00'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* HUD Audio SFX Engine Toggle */}
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              soundEffects.setMuted(!next);
              if (next) soundEffects.playStartup();
            }}
            title={soundEnabled ? 'HUD Audio SFX: Active' : 'HUD Audio SFX: Muted'}
            style={{
              background: soundEnabled ? 'rgba(0, 240, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${soundEnabled ? 'rgba(0, 240, 255, 0.35)' : 'var(--border-subtle)'}`,
              color: soundEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.2s ease',
            }}
          >
            {soundEnabled ? <Volume2 size={13} className="text-cyan" /> : <VolumeX size={13} />}
            <span>{soundEnabled ? 'SFX ON' : 'SFX MUTED'}</span>
          </button>

          {/* Hands-Free Ambient Wake Word Toggle ("Hey JARVIS") */}
          <button
            onClick={() => {
              const next = !wakeWordEnabled;
              setWakeWordEnabled(next);
              if (next) {
                soundEffects.playStartup();
              } else {
                soundEffects.playBargeIn();
              }
            }}
            title={wakeWordEnabled ? 'Hands-Free Listener: ACTIVE (Say "Hey Jarvis")' : 'Hands-Free Listener: Standby'}
            style={{
              background: wakeWordEnabled ? 'rgba(0, 255, 200, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${wakeWordEnabled ? 'rgba(0, 255, 200, 0.5)' : 'var(--border-subtle)'}`,
              color: wakeWordEnabled ? '#00ffc8' : 'var(--text-muted)',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.2s ease',
              boxShadow: wakeWordEnabled ? '0 0 10px rgba(0, 255, 200, 0.25)' : 'none',
            }}
          >
            {wakeWordEnabled ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#00ffc8',
                  boxShadow: '0 0 6px #00ffc8',
                  animation: 'pulse 1.5s infinite'
                }} />
                <Mic size={13} />
                <span>WAKE: ACTIVE</span>
              </>
            ) : (
              <>
                <MicOff size={13} />
                <span>WAKE: OFF</span>
              </>
            )}
          </button>

          <ModelSwitcher variant="compact" />
          <NotificationCenter />

          {/* Tactical Morning Status Briefing Trigger */}
          <button
            onClick={() => {
              soundEffects.playStartup();
              setShowBriefing(true);
            }}
            title="Execute Executive Status Briefing & System Telemetry"
            style={{
              background: 'rgba(0, 240, 255, 0.12)',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              color: '#00f0ff',
              borderRadius: '4px',
              padding: '4px 9px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              letterSpacing: '1px',
              transition: 'all 0.2s ease',
              boxShadow: '0 0 10px rgba(0, 240, 255, 0.15)'
            }}
          >
            <Activity size={12} className="text-cyan animate-pulse" />
            <span>BRIEFING</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '14px' }}>
            <Radio size={14} className={wsConnected ? 'text-cyan' : 'text-muted'} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
              <span className="font-mono" style={{ fontSize: '8px', color: 'var(--text-muted)' }}>SYSTEM LINK</span>
              <span className="font-mono" style={{ color: wsConnected ? 'var(--status-online)' : 'var(--status-offline)', fontSize: '10px', fontWeight: 600 }}>
                {wsConnected ? '127.0.0.1:8787' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        {/* Left Navigation Rail */}
        <div ref={sidebarRef} className="sidebar">
          <div style={{ padding: '0 16px 12px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
            <div className="font-mono" style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '1.5px' }}>
              SUBSYSTEMS
            </div>
          </div>
          {navItems.map(item => (
            <NavLink 
              key={item.to} 
              to={item.to} 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '14px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {item.icon}
                <span className="font-mono" style={{ fontSize: '0.72rem' }}>{item.label}</span>
              </div>
              {(item.badge ?? 0) > 0 && (
                <div style={{
                  background: 'var(--status-warning)',
                  color: '#04070a',
                  fontSize: '9px',
                  padding: '1px 5px',
                  borderRadius: '2px',
                  fontWeight: 'bold',
                  boxShadow: '0 0 6px var(--status-warning)'
                }}>
                  {item.badge}
                </div>
              )}
            </NavLink>
          ))}
          <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div className="font-mono" style={{ fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '1px' }}>
              SECURITY LVL-5
            </div>
            <div className="font-mono text-cyan" style={{ fontSize: '9px', marginTop: '2px' }}>
              LOCAL SECURITY
            </div>
          </div>
        </div>

        {/* Main Content Area: Neural Core centered in this area */}
        <div className="content-area" style={{ position: 'relative', flex: 1, height: '100%', overflow: 'hidden' }}>
          <NeuralCore />
          <div className="overlay-ui" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <Outlet />
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bottom-bar">
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span className="text-muted">SYS.STATE:</span>
          <span className="text-cyan font-mono" style={{ fontWeight: 600 }}>{systemState}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span className="text-muted">ACTIVE.TASKS:</span>
          {(() => {
            const runningCount = activeTasks.filter(t => t.status === 'RUNNING' || t.status === 'IN_PROGRESS').length;
            return (
              <span className="font-mono" style={{ color: runningCount > 0 ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                {runningCount.toString().padStart(2, '0')}
              </span>
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span className="text-muted">APPROVALS:</span>
          <span className="font-mono" style={{ color: pendingApprovals.length > 0 ? 'var(--status-warning)' : 'var(--text-muted)' }}>
            {pendingApprovals.length.toString().padStart(2, '0')}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="font-mono" style={{ fontSize: '8px', color: 'var(--text-muted)' }}>TELEMETRY STREAM</span>
          <div className="waveform-bar" style={{ height: '14px' }}>
            {[8, 14, 6, 12, 18, 10, 4, 16, 9, 13, 7, 15, 11, 8, 14, 18, 6, 12, 10, 16].map((h, i) => (
              <div 
                key={i} 
                className="waveform-spike" 
                style={{ 
                  height: `${h}px`, 
                  opacity: 0.35 + (i % 3) * 0.25 
                }} 
              />
            ))}
          </div>
        </div>
      </div>

      <SystemBriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
    </div>
  );
};
