import React, { useEffect, useState } from 'react';
import { useJarvisStore } from '../store/jarvisStore';
import { api } from '../api/client';
import { ShieldAlert, ShieldCheck, ShieldX, Clock, ChevronDown, ChevronRight } from 'lucide-react';

export const Approvals: React.FC = () => {
  const { pendingApprovals, setPendingApprovals } = useJarvisStore();
  const [filter, setFilter] = useState('PENDING');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/approvals').then(res => {
      // Backend list returns an array of pending approvals
      if (Array.isArray(res)) setPendingApprovals(res);
      else if (res?.data) setPendingApprovals(res.data);
    });
  }, [setPendingApprovals]);

  const handleAction = async (e: React.MouseEvent, id: string, action: 'approve' | 'deny') => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to ${action.toUpperCase()} this request?`)) {
      await api.post(`/approvals/${id}/${action}`, action === 'deny' ? { reason: 'User denied via Command Center' } : {});
      // Optimistic update
      setPendingApprovals(pendingApprovals.filter(a => a.id !== id));
      setExpandedId(null);
    }
  };

  const displayApprovals = filter === 'PENDING' ? pendingApprovals : [];

  return (
    <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-warning)' }}>
          <ShieldAlert size={24} /> 
          <span>APPROVAL <span className="text-muted" style={{ fontWeight: 'normal' }}>// CENTER</span></span>
        </h2>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          {['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                color: filter === f ? (f === 'PENDING' ? 'var(--status-warning)' : 'var(--text-primary)') : 'var(--text-muted)',
                border: `1px solid ${filter === f ? (f === 'PENDING' ? 'var(--status-warning)' : 'var(--border-subtle)') : 'transparent'}`,
                padding: '8px 16px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)'
              }}
            >
              {f} {f === 'PENDING' && pendingApprovals.length > 0 && `(${pendingApprovals.length})`}
            </button>
          ))}
        </div>

        <div className="panel" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {displayApprovals.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="text-muted font-mono">No {filter.toLowerCase()} approvals found.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {displayApprovals.map(a => {
                const isExpanded = expandedId === a.id;
                return (
                  <div key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div 
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                      style={{ 
                        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', background: isExpanded ? 'var(--bg-tertiary)' : 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {isExpanded ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {a.action}
                            <span style={{ 
                              fontSize: '0.7rem', padding: '2px 6px', background: 'var(--status-offline)', 
                              color: '#fff', borderRadius: '10px' 
                            }}>
                              {a.riskLevel}
                            </span>
                          </div>
                          <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                            {a.id} • TASK: {a.taskId}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono text-muted" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} /> EXPIRES: {new Date(a.expiresAt).toLocaleTimeString()}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div style={{ padding: '24px', background: 'rgba(10,12,16,0.3)', borderTop: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                          <div>
                            <div className="text-muted font-mono" style={{ fontSize: '0.75rem', marginBottom: '8px' }}>DETAILS</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div>
                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>RESOURCE / TARGET</div>
                                <div className="font-mono" style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{a.resource || 'N/A'}</div>
                              </div>
                              <div>
                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>REASON</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{a.reason || 'Approval required for execution.'}</div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="text-muted font-mono" style={{ fontSize: '0.75rem', marginBottom: '8px' }}>AUTHORIZATION</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <button 
                                onClick={(e) => handleAction(e, a.id, 'approve')}
                                className="btn" 
                                style={{ display: 'flex', justifyContent: 'center', gap: '8px', background: 'var(--status-warning)', color: '#000', border: 'none' }}
                              >
                                <ShieldCheck size={16} /> APPROVE ACTION
                              </button>
                              <button 
                                onClick={(e) => handleAction(e, a.id, 'deny')}
                                className="btn" 
                                style={{ display: 'flex', justifyContent: 'center', gap: '8px', color: 'var(--text-muted)' }}
                              >
                                <ShieldX size={16} /> DENY REQUEST
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
