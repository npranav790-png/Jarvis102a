import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Zap, Network, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ModelSwitcher } from '../components/ModelSwitcher';

export const AI: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [providersData, setProvidersData] = useState<any>(null);

  useEffect(() => {
    api.get('/runtime/status').then(res => {
      if (res) setStatus(res);
    });
    api.get('/providers').then(res => {
      if (res) setProvidersData(res);
    });
  }, []);

  const providers = providersData?.providers || [];
  const activeProviders = providers.filter((p: any) => p.status === 'ONLINE');

  return (
    <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={24} className="text-cyan" /> 
            <span>AI <span className="text-muted" style={{ fontWeight: 'normal' }}>// CONTROL CENTER</span></span>
          </h2>
          <Link 
            to="/settings" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '0.8rem', 
              fontFamily: 'var(--font-mono)',
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px'
            }}
          >
            <span>CONFIGURE KEYS</span> <ArrowRight size={14} />
          </Link>
        </div>

        {/* System Health Overview */}
        <div className="panel" style={{ marginBottom: '24px' }}>
          <div className="panel-header" style={{ marginBottom: '16px' }}>SYSTEM HEALTH</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>RUNTIME STATE</div>
              <div className="font-mono text-cyan">{status?.state || 'RUNNING'}</div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>PRIVACY MODE</div>
              <div className="font-mono" style={{ color: 'var(--status-online)' }}>
                {providersData?.privacyMode || 'CLOUD_ONLY'}
              </div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>ZERO-COST POLICY</div>
              <div className="font-mono" style={{ color: 'var(--status-online)' }}>ENFORCED ($0.00)</div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>PAID PROVIDERS</div>
              <div className="font-mono" style={{ color: 'var(--status-offline)' }}>DISABLED</div>
            </div>
          </div>
        </div>

        {/* Model Switcher Interactive Station */}
        <div style={{ marginBottom: '24px' }}>
          <ModelSwitcher variant="full" />
        </div>

        {/* Active Providers & Routing Architecture */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flex: 1 }}>
          {/* Left: Registered Providers */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>ACTIVE ENGINES & MODELS</span>
              <span className="font-mono text-cyan" style={{ fontSize: '0.75rem' }}>
                {activeProviders.length} ONLINE
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {providers.length === 0 ? (
                <div className="font-mono text-muted" style={{ padding: '24px', textAlign: 'center' }}>
                  Discovering provider health...
                </div>
              ) : (
                providers.map((p: any) => {
                  const isOnline = p.status === 'ONLINE';
                  return (
                    <div 
                      key={p.id} 
                      style={{ 
                        padding: '14px 16px', 
                        background: 'var(--bg-tertiary)', 
                        borderRadius: '4px', 
                        border: `1px solid ${isOnline ? 'var(--border-subtle)' : 'rgba(255,255,255,0.03)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isOnline ? (
                            <CheckCircle2 size={14} style={{ color: 'var(--status-online)' }} />
                          ) : (
                            <AlertCircle size={14} style={{ color: 'var(--text-muted)' }} />
                          )}
                          <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{p.name}</span>
                        </div>
                        <span 
                          className="font-mono" 
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '2px 6px', 
                            borderRadius: '3px',
                            background: isOnline ? 'rgba(0,255,204,0.1)' : 'var(--bg-secondary)',
                            color: isOnline ? 'var(--status-online)' : 'var(--text-muted)'
                          }}
                        >
                          {p.status}
                        </span>
                      </div>

                      {p.models && p.models.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {p.models.slice(0, 3).map((m: any) => (
                            <span 
                              key={m.id} 
                              style={{ 
                                fontSize: '0.65rem', 
                                padding: '1px 6px', 
                                background: 'var(--bg-secondary)', 
                                color: 'var(--text-secondary)',
                                borderRadius: '2px',
                                fontFamily: 'var(--font-mono)'
                              }}
                            >
                              {m.id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Routing Pipeline Flow */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ marginBottom: '16px' }}>ROUTING PIPELINE</div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div style={{ padding: '10px 20px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', width: '220px', textAlign: 'center' }}>
                <div className="text-muted font-mono" style={{ fontSize: '0.65rem' }}>STEP 1</div>
                <div className="font-mono" style={{ fontSize: '0.85rem' }}>USER COMMAND</div>
              </div>
              
              <div style={{ height: '14px', width: '2px', background: 'var(--accent-cyan)' }} />
              
              <div style={{ padding: '10px 20px', border: '1px solid var(--accent-cyan)', borderRadius: 'var(--radius-sm)', background: 'var(--accent-cyan-dim)', width: '220px', textAlign: 'center' }}>
                <div className="text-muted font-mono" style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)' }}>STEP 2</div>
                <div className="font-mono text-cyan" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem' }}>
                  <Network size={14} /> MODEL ROUTER
                </div>
              </div>

              <div style={{ height: '14px', width: '2px', background: 'var(--accent-cyan)' }} />
              
              <div style={{ padding: '10px 20px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', width: '220px', textAlign: 'center' }}>
                <div className="text-muted font-mono" style={{ fontSize: '0.65rem' }}>ACTIVE CANDIDATE</div>
                <div className="font-mono text-cyan" style={{ fontSize: '0.8rem' }}>
                  {activeProviders.length > 0 ? activeProviders.map((p: any) => p.name.toUpperCase()).join(' / ') : 'GEMINI CLOUD / GROQ / OPENROUTER'}
                </div>
              </div>

              <div style={{ height: '14px', width: '2px', background: 'var(--accent-cyan)' }} />
              
              <div style={{ padding: '10px 20px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', width: '220px', textAlign: 'center' }}>
                <div className="text-muted font-mono" style={{ fontSize: '0.65rem' }}>STEP 4</div>
                <div className="font-mono" style={{ fontSize: '0.85rem' }}>VERIFIED RESPONSE</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
