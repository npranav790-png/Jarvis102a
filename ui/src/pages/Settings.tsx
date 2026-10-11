import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Monitor, Wifi, Camera, Zap, ExternalLink, RefreshCw, Key, Volume2 } from 'lucide-react';
import { useJarvisStore } from '../store/jarvisStore';
import { api } from '../api/client';

export const Settings: React.FC = () => {
  const { gesturesEnabled, setGesturesEnabled, wsConnected } = useJarvisStore();
  const [activeTab, setActiveTab] = useState('GENERAL');
  
  const [reducedMotion, setReducedMotion] = useState(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // AI Providers State
  const [providersData, setProvidersData] = useState<any>(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [savingProviders, setSavingProviders] = useState(false);
  const [testResult, setTestResult] = useState<{ [key: string]: { loading: boolean; success?: boolean; message?: string } }>({});
  
  // Voice State
  const [voiceStatus, setVoiceStatus] = useState<any>(null);
  const [testingTts, setTestingTts] = useState(false);
  const [ttsFeedback, setTtsFeedback] = useState<string | null>(null);

  const fetchProviders = async () => {
    try {
      const res = await api.get('/providers');
      if (res) {
        setProvidersData(res);
      }
    } catch (err) {
      console.error('Failed to load AI providers', err);
    }
  };

  const fetchVoiceStatus = async () => {
    try {
      const res = await api.get('/voice/status');
      if (res) {
        setVoiceStatus(res);
      }
    } catch (err) {
      console.error('Failed to load voice status', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'AI_PROVIDERS') {
      fetchProviders();
    }
    if (activeTab === 'VOICE') {
      fetchVoiceStatus();
    }
  }, [activeTab]);

  const handleTestTts = async () => {
    setTestingTts(true);
    setTtsFeedback(null);
    try {
      const res = await api.post('/voice/synthesize', {
        text: 'All neural voice subsystems are nominal. Local speech synthesis verified at zero cost.'
      });
      if (res?.audioBase64) {
        const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
        await audio.play();
        setTtsFeedback('Playing local synthesized audio via speaker.');
      } else {
        setTtsFeedback('TTS generated response without audio data.');
      }
    } catch (err: any) {
      setTtsFeedback(`TTS Error: ${err.message}`);
    } finally {
      setTestingTts(false);
    }
  };

  const handleSaveProviders = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProviders(true);
    try {
      await api.post('/providers/configure', {
        geminiApiKey: geminiKey || undefined,
        groqApiKey: groqKey || undefined,
        openRouterApiKey: openRouterKey || undefined,
      });
      await fetchProviders();
      alert('AI Provider settings saved and re-initialized!');
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingProviders(false);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setTestResult(prev => ({ ...prev, [providerId]: { loading: true } }));
    try {
      const keyToSend = providerId === 'gemini' ? geminiKey : (providerId === 'groq' ? groqKey : (providerId === 'openrouter' ? openRouterKey : undefined));
      const res = await api.post('/providers/test', { providerId, apiKey: keyToSend || undefined });
      setTestResult(prev => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: res?.success,
          message: res?.success ? `Operational: ${res.health?.latencyMs || 0}ms latency` : (res?.error || 'Test failed'),
        }
      }));
    } catch (err: any) {
      setTestResult(prev => ({
        ...prev,
        [providerId]: { loading: false, success: false, message: err.message || 'Connection error' }
      }));
    }
  };

  return (
    <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SettingsIcon size={24} className="text-cyan" /> 
          <span>SETTINGS <span className="text-muted" style={{ fontWeight: 'normal' }}>// PREFERENCES</span></span>
        </h2>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { id: 'GENERAL', label: 'GENERAL' },
            { id: 'VOICE', label: 'VOICE & AUDIO' },
            { id: 'AI_PROVIDERS', label: 'AI PROVIDERS' },
            { id: 'APPEARANCE', label: 'APPEARANCE' },
            { id: 'GESTURES', label: 'GESTURES' },
            { id: 'CONNECTION', label: 'CONNECTION' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
                border: `1px solid ${activeTab === tab.id ? 'var(--accent-cyan)' : 'transparent'}`,
                padding: '8px 16px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="panel" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          
          {activeTab === 'GENERAL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h3 className="font-mono text-cyan" style={{ fontSize: '0.9rem', marginBottom: '16px' }}>JARVIS SYSTEM</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>System Version</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>JARVIS v2.0.0 (Release Candidate)</div>
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>UP TO DATE</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'VOICE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 className="font-mono text-cyan" style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Volume2 size={16} /> LOCAL ZERO-COST VOICE SUBSYSTEM
                  </h3>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    100% offline, local-first Speech-to-Text and Text-to-Speech pipeline. No paid cloud APIs.
                  </div>
                </div>
                <button 
                  onClick={fetchVoiceStatus} 
                  className="btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.75rem' }}
                >
                  <RefreshCw size={12} /> REFRESH STATUS
                </button>
              </div>

              {/* Status Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {/* STT Status Card */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>SPEECH-TO-TEXT (STT)</span>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontFamily: 'var(--font-mono)', 
                      padding: '2px 8px', 
                      borderRadius: '3px',
                      background: voiceStatus?.stt?.status === 'READY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: voiceStatus?.stt?.status === 'READY' ? '#10b981' : '#ef4444',
                      border: `1px solid ${voiceStatus?.stt?.status === 'READY' ? '#10b981' : '#ef4444'}`
                    }}>
                      {voiceStatus?.stt?.status || 'CHECKING...'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{voiceStatus?.stt?.name || 'Windows SAPI SpeechRecognition'}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    Engine: <span className="font-mono text-cyan">{voiceStatus?.stt?.provider || 'system'}</span> • Local: YES • Zero-Cost: ₹0/$0
                  </div>
                </div>

                {/* TTS Status Card */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>TEXT-TO-SPEECH (TTS)</span>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontFamily: 'var(--font-mono)', 
                      padding: '2px 8px', 
                      borderRadius: '3px',
                      background: voiceStatus?.tts?.status === 'READY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: voiceStatus?.tts?.status === 'READY' ? '#10b981' : '#ef4444',
                      border: `1px solid ${voiceStatus?.tts?.status === 'READY' ? '#10b981' : '#ef4444'}`
                    }}>
                      {voiceStatus?.tts?.status || 'CHECKING...'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{voiceStatus?.tts?.name || 'Windows SAPI SpeechSynthesizer'}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    Engine: <span className="font-mono text-cyan">{voiceStatus?.tts?.provider || 'system'}</span> • Local: YES • Zero-Cost: ₹0/$0
                  </div>
                </div>

                {/* Wake Word Status Card */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>WAKE WORD (OPTIONAL)</span>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontFamily: 'var(--font-mono)', 
                      padding: '2px 8px', 
                      borderRadius: '3px',
                      background: 'rgba(100, 116, 139, 0.15)',
                      color: '#94a3b8',
                      border: '1px solid #64748b'
                    }}>
                      {voiceStatus?.wakeWord?.status || 'DISABLED'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Keyword: "Hey Jarvis"</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    Trigger: <span className="font-mono">Manual Mic Activation (Default)</span>
                  </div>
                </div>
              </div>

              {/* Speech Synthesis Verification Test */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                <h4 className="font-mono text-cyan" style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
                  SPEECH SYNTHESIS SPEAKER TEST
                </h4>
                <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '12px' }}>
                  Click below to synthesize a local audio test phrase and verify audio playback through your system speaker.
                </div>
                <button
                  type="button"
                  onClick={handleTestTts}
                  disabled={testingTts}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: 'var(--accent-cyan-dim)',
                    color: 'var(--accent-cyan)',
                    border: '1px solid var(--accent-cyan)',
                    borderRadius: '4px',
                    cursor: testingTts ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  <Volume2 size={16} /> {testingTts ? 'SYNTHESIZING AUDIO...' : 'PLAY TEST PHRASE'}
                </button>
                {ttsFeedback && (
                  <div className="font-mono text-cyan" style={{ fontSize: '0.75rem', marginTop: '8px' }}>
                    {ttsFeedback}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'AI_PROVIDERS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 className="font-mono text-cyan" style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={16} /> ZERO-COST AI INTELLIGENCE ENGINES
                  </h3>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    Configure free-tier cloud API keys or local LLM instances. Zero-Cost Policy is strictly enforced ($0.00).
                  </div>
                </div>
                <button 
                  onClick={fetchProviders} 
                  className="btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.75rem' }}
                >
                  <RefreshCw size={14} className="text-cyan" />
                  <span>REFRESH STATUS</span>
                </button>
              </div>

              {/* Status summary banner */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <div className="text-muted font-mono" style={{ fontSize: '0.7rem' }}>ACTIVE ENGINES</div>
                  <div className="font-mono text-cyan" style={{ fontSize: '1.1rem', marginTop: '4px' }}>
                    {providersData?.activeProviderCount || 5} Registered
                  </div>
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <div className="text-muted font-mono" style={{ fontSize: '0.7rem' }}>COST GUARDRAIL</div>
                  <div className="font-mono" style={{ fontSize: '1.1rem', marginTop: '4px', color: 'var(--status-online)' }}>
                    $0.00 / FREE TIER ONLY
                  </div>
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <div className="text-muted font-mono" style={{ fontSize: '0.7rem' }}>PRIVACY ROUTING</div>
                  <div className="font-mono" style={{ fontSize: '1.1rem', marginTop: '4px', color: 'var(--accent-cyan)' }}>
                    {providersData?.privacyMode || 'CLOUD_ONLY'}
                  </div>
                </div>
              </div>

              {/* Provider Config Cards */}
              <form onSubmit={handleSaveProviders} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. Google Gemini Card */}
                {(() => {
                  const geminiInfo = providersData?.providers?.find((p: any) => p.id === 'gemini');
                  const isReady = geminiInfo?.status === 'ONLINE';
                  const configuredModel = geminiInfo?.models?.[0]?.id || 'gemini-3.7-flash';
                  return (
                    <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Google Gemini
                            <span style={{ 
                              fontSize: '0.7rem', 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              background: isReady ? 'rgba(0,255,204,0.1)' : 'rgba(255,255,255,0.05)', 
                              color: isReady ? 'var(--status-online)' : 'var(--text-muted)' 
                            }}>
                              {isReady ? 'CONNECTED / READY' : (geminiInfo?.status || 'STANDBY')}
                            </span>
                          </div>
                          <div className="text-muted font-mono" style={{ fontSize: '0.75rem', marginTop: '6px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <span>MODEL: <strong className="text-cyan">{configuredModel}</strong></span>
                            <span>ROUTING: <strong style={{ color: 'var(--accent-cyan)' }}>CLOUD ONLY</strong></span>
                            <span>COST: <strong style={{ color: 'var(--status-online)' }}>FREE TIER ($0.00)</strong></span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <a 
                            href="https://aistudio.google.com/app/apikey" 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)' }}
                          >
                            Get Free Key <ExternalLink size={12} />
                          </a>
                          <button 
                            type="button"
                            onClick={() => handleTestProvider('gemini')}
                            style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '4px', fontSize: '0.75rem' }}
                          >
                            {testResult['gemini']?.loading ? 'TESTING...' : 'TEST'}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Key size={14} className="text-muted" style={{ position: 'absolute', left: 12, top: 12 }} />
                          <input 
                            type="password"
                            placeholder="AIzaSy... (leave empty to keep current or use GEMINI_API_KEY from .env)"
                            value={geminiKey}
                            onChange={e => setGeminiKey(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px 8px 36px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>
                      {testResult['gemini'] && (
                        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: testResult['gemini'].success ? 'var(--status-online)' : 'var(--status-offline)' }}>
                          {testResult['gemini'].success ? '✔ ' : '✖ '} {testResult['gemini'].message}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Groq Card */}
                <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Groq Cloud (Free Tier)
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(0,255,204,0.1)', color: 'var(--status-online)' }}>
                          ULTRA-FAST INFERENCE
                        </span>
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        Free access to Llama 3.3 70B, Llama 3.1 8B, and Mixtral at 500+ tokens/sec.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <a 
                        href="https://console.groq.com/keys" 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)' }}
                      >
                        Get Free Key <ExternalLink size={12} />
                      </a>
                      <button 
                        type="button"
                        onClick={() => handleTestProvider('groq')}
                        style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '4px', fontSize: '0.75rem' }}
                      >
                        {testResult['groq']?.loading ? 'TESTING...' : 'TEST'}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Key size={14} className="text-muted" style={{ position: 'absolute', left: 12, top: 12 }} />
                      <input 
                        type="password"
                        placeholder="gsk_... (leave empty to keep current or use .env)"
                        value={groqKey}
                        onChange={e => setGroqKey(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px 8px 36px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                  {testResult['groq'] && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: testResult['groq'].success ? 'var(--status-online)' : 'var(--status-offline)' }}>
                      {testResult['groq'].success ? '✔ ' : '✖ '} {testResult['groq'].message}
                    </div>
                  )}
                </div>

                {/* 4. OpenRouter Free Models */}
                <div style={{ padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        OpenRouter (Free Models Only)
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,204,0,0.1)', color: 'var(--status-warning)' }}>
                          FREE MODELS ONLY (:free)
                        </span>
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        Access free models like DeepSeek-R1, Gemini 2.0 Flash Exp, and Llama 3.2.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <a 
                        href="https://openrouter.ai/keys" 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)' }}
                      >
                        Get Key <ExternalLink size={12} />
                      </a>
                      <button 
                        type="button"
                        onClick={() => handleTestProvider('openrouter')}
                        style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '4px', fontSize: '0.75rem' }}
                      >
                        {testResult['openrouter']?.loading ? 'TESTING...' : 'TEST'}
                      </button>
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Key size={14} className="text-muted" style={{ position: 'absolute', left: 12, top: 12 }} />
                    <input 
                      type="password"
                      placeholder="sk-or-... (leave empty to keep current or use .env)"
                      value={openRouterKey}
                      onChange={e => setOpenRouterKey(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px 8px 36px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '4px', fontSize: '0.85rem' }}
                    />
                  </div>
                  {testResult['openrouter'] && (
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: testResult['openrouter'].success ? 'var(--status-online)' : 'var(--status-offline)' }}>
                      {testResult['openrouter'].success ? '✔ ' : '✖ '} {testResult['openrouter'].message}
                    </div>
                  )}
                </div>

                {/* Submit button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button 
                    type="submit" 
                    disabled={savingProviders}
                    style={{ padding: '10px 24px', background: 'var(--accent-cyan)', color: '#000', fontWeight: 'bold', borderRadius: '4px', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
                  >
                    {savingProviders ? 'APPLYING CONFIGURATION...' : 'SAVE & APPLY AI SETTINGS'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'APPEARANCE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h3 className="font-mono text-cyan" style={{ fontSize: '0.9rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Monitor size={16} /> DISPLAY
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '4px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Theme</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>JARVIS Core Dark</div>
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>SYSTEM</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Reduced Motion</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>Disables Core inertia and complex animations.</div>
                  </div>
                  <button 
                    onClick={() => setReducedMotion(!reducedMotion)}
                    style={{ background: reducedMotion ? 'var(--status-online)' : 'var(--bg-secondary)', border: 'none', padding: '6px 16px', borderRadius: '4px', color: reducedMotion ? '#000' : 'var(--text-muted)' }}
                  >
                    {reducedMotion ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'GESTURES' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h3 className="font-mono text-cyan" style={{ fontSize: '0.9rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Camera size={16} /> MEDIA PIPE TRACKING
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '4px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Gesture Control</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>Enable local hardware camera for physical interaction.</div>
                  </div>
                  <button 
                    onClick={() => setGesturesEnabled(!gesturesEnabled)}
                    style={{ background: gesturesEnabled ? 'var(--accent-cyan)' : 'var(--bg-secondary)', border: 'none', padding: '6px 16px', borderRadius: '4px', color: gesturesEnabled ? '#000' : 'var(--text-muted)' }}
                  >
                    {gesturesEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '4px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Gesture Smoothing (Debounce)</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>Requires 4/5 stable frames to trigger state transition.</div>
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>LOCKED</div>
                </div>
                <div style={{ padding: '12px 16px', background: 'rgba(255, 51, 102, 0.1)', border: '1px solid rgba(255, 51, 102, 0.3)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                  <strong>PRIVACY NOTE:</strong> Camera frames are processed 100% locally via WebGL/WASM and never leave the device.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'CONNECTION' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h3 className="font-mono text-cyan" style={{ fontSize: '0.9rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wifi size={16} /> NETWORK
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '4px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>WebSocket State</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>ws://127.0.0.1:8787/api/v1/ws</div>
                  </div>
                  <div className="font-mono" style={{ color: wsConnected ? 'var(--status-online)' : 'var(--status-offline)' }}>
                    {wsConnected ? 'CONNECTED' : 'DISCONNECTED'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>REST API Target</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>http://127.0.0.1:8787/api/v1</div>
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>LOCKED</div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
