import React, { useEffect, useState } from 'react';
import { useJarvisStore } from '../store/jarvisStore';
import { api } from '../api/client';
import { useSearchParams } from 'react-router-dom';
import { Search, Play, XCircle, RefreshCw, ChevronDown, ChevronRight, CheckSquare } from 'lucide-react';

export const Tasks: React.FC = () => {
  const { activeTasks, setActiveTasks } = useJarvisStore();
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(searchParams.get('id'));

  useEffect(() => {
    // We already fetch via WS, but let's ensure we have latest on mount
    api.get('/tasks').then(res => {
      // The backend returns an array directly, not `{ data: [...] }` according to tasks.ts line 17
      if (Array.isArray(res)) {
        setActiveTasks(res);
      } else if (res?.data) {
        setActiveTasks(res.data);
      }
    });
  }, [setActiveTasks]);

  useEffect(() => {
    if (searchParams.get('id')) {
      setExpandedId(searchParams.get('id'));
    }
  }, [searchParams]);

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Cancel this task?')) {
      await api.post(`/tasks/${id}/cancel`, {});
      // Optimistic update
      setActiveTasks(activeTasks.map(t => t.id === id ? { ...t, status: 'FAILED' } : t));
    }
  };

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await api.post(`/tasks/${id}/retry`, {});
    // Optimistic update
    setActiveTasks(activeTasks.map(t => t.id === id ? { ...t, status: 'QUEUED' } : t));
  };

  const filteredTasks = activeTasks.filter(t => {
    if (filter !== 'ALL' && t.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!t.title?.toLowerCase().includes(s) && !t.id?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckSquare size={24} className="text-cyan" /> 
          <span>TASK <span className="text-muted" style={{ fontWeight: 'normal' }}>// CENTER</span></span>
        </h2>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
            <Search size={16} className="text-muted" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', padding: '10px 12px 10px 36px', borderRadius: '4px', outline: 'none'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['ALL', 'QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? 'var(--accent-cyan-dim)' : 'var(--bg-secondary)',
                  color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: `1px solid ${filter === f ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                  padding: '8px 16px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="panel" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {filteredTasks.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="text-muted font-mono">No tasks match the criteria.</div>
              <div style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Start a task from Chat or the Command Center.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredTasks.map(t => {
                const isExpanded = expandedId === t.id;
                return (
                  <div key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div 
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      style={{ 
                        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', background: isExpanded ? 'var(--bg-tertiary)' : 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {isExpanded ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
                        <div>
                          <div style={{ fontWeight: 500 }}>{t.title || 'Untitled Task'}</div>
                          <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>{t.id} • {t.type}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <div className="font-mono" style={{ 
                          fontSize: '0.8rem', 
                          color: t.status === 'RUNNING' ? 'var(--status-online)' : t.status === 'FAILED' ? 'var(--status-offline)' : 'var(--text-secondary)' 
                        }}>
                          {t.status}
                        </div>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div style={{ padding: '24px', background: 'rgba(10,12,16,0.3)', borderTop: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                          <div>
                            <div className="text-muted font-mono" style={{ fontSize: '0.75rem', marginBottom: '8px' }}>TIMELINE</div>
                            <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '-17px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                <div className="font-mono" style={{ fontSize: '0.85rem' }}>CREATED</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>{new Date(t.createdAt).toLocaleString()}</div>
                              </div>
                              <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '-17px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: t.status === 'QUEUED' ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                                <div className="font-mono" style={{ fontSize: '0.85rem' }}>QUEUED</div>
                              </div>
                              {(t.status === 'RUNNING' || t.status === 'COMPLETED' || t.status === 'FAILED') && (
                                <div style={{ position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: '-17px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: t.status === 'RUNNING' ? 'var(--status-online)' : 'var(--text-muted)' }} />
                                  <div className="font-mono" style={{ fontSize: '0.85rem' }}>EXECUTING</div>
                                </div>
                              )}
                              {t.status === 'COMPLETED' && (
                                <div style={{ position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: '-17px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--status-online)' }} />
                                  <div className="font-mono" style={{ fontSize: '0.85rem' }}>COMPLETED</div>
                                </div>
                              )}
                              {t.status === 'FAILED' && (
                                <div style={{ position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: '-17px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--status-offline)' }} />
                                  <div className="font-mono" style={{ fontSize: '0.85rem' }}>FAILED</div>
                                  <div className="text-muted" style={{ fontSize: '0.75rem', color: 'var(--status-offline)' }}>Execution error occurred.</div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-muted font-mono" style={{ fontSize: '0.75rem', marginBottom: '8px' }}>ACTIONS</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {(t.status === 'RUNNING' || t.status === 'QUEUED') && (
                                <button onClick={(e) => handleCancel(e, t.id)} className="btn" style={{ display: 'flex', justifyContent: 'center', gap: '8px', color: 'var(--status-offline)' }}>
                                  <XCircle size={16} /> CANCEL
                                </button>
                              )}
                              {(t.status === 'FAILED' || t.status === 'CANCELLED') && (
                                <button onClick={(e) => handleRetry(e, t.id)} className="btn" style={{ display: 'flex', justifyContent: 'center', gap: '8px', color: 'var(--status-online)' }}>
                                  <RefreshCw size={16} /> RETRY
                                </button>
                              )}
                              <button className="btn" style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                <Play size={16} /> VIEW JOB DETAILS
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
