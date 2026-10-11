import React, { useState, useEffect } from 'react';
import { Database, Search, Plus, Trash2, Tag, RefreshCw } from 'lucide-react';
import { api } from '../api/client';

export const Memory: React.FC = () => {
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('WORKING');
  const [newSubject, setNewSubject] = useState('');

  const fetchMemories = async () => {
    setLoading(true);
    try {
      if (search.trim()) {
        const queryParams = new URLSearchParams({ q: search.trim() });
        if (filter !== 'ALL') queryParams.append('type', filter);
        const res = await api.get(`/memory/search?${queryParams.toString()}`);
        const items = Array.isArray(res) ? res.map((r: any) => r.memory || r) : (res?.data || []);
        setMemories(items);
      } else {
        const queryParams = new URLSearchParams();
        if (filter !== 'ALL') queryParams.append('type', filter);
        const res = await api.get(`/memory?${queryParams.toString()}`);
        setMemories(Array.isArray(res) ? res : (res?.data || []));
      }
    } catch (err) {
      console.error('Failed to load memories', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, [filter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMemories();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this memory record?')) {
      try {
        await api.delete(`/memory/${id}`);
        setMemories(memories.filter(m => m.id !== id));
      } catch (err) {
        console.error('Failed to delete memory', err);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      await api.post('/memory', {
        content: newContent.trim(),
        type: newType,
        subject: newSubject.trim() || undefined,
        importance: 'NORMAL',
      });
      setNewContent('');
      setNewSubject('');
      setShowAddModal(false);
      fetchMemories();
    } catch (err) {
      console.error('Failed to create memory', err);
    }
  };

  return (
    <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={24} className="text-cyan" /> 
            <span>MEMORY <span className="text-muted" style={{ fontWeight: 'normal' }}>// EXPLORER</span></span>
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={fetchMemories} 
              className="btn" 
              title="Refresh memories"
              style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin text-cyan' : 'text-cyan'} />
              <span className="font-mono" style={{ fontSize: '0.75rem' }}>SYNC</span>
            </button>
            <button 
              onClick={() => setShowAddModal(true)} 
              className="btn" 
              style={{ padding: '8px 16px', background: 'var(--accent-cyan-dim)', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
            >
              <Plus size={16} /> ADD RECORD
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
            <Search size={16} className="text-muted" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input 
              type="text" 
              placeholder="Search working memory..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)', padding: '10px 12px 10px 36px', borderRadius: '4px', outline: 'none'
              }}
            />
          </form>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['ALL', 'WORKING', 'EPISODIC', 'SEMANTIC', 'PROJECT', 'USER_PREFERENCE'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: `1px solid ${filter === f ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                  padding: '8px 14px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Memory Items List */}
        <div className="panel" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {loading && memories.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="text-cyan font-mono" style={{ fontSize: '0.85rem' }}>Loading neural memories...</div>
            </div>
          ) : memories.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Database size={48} className="text-muted" style={{ marginBottom: '16px', opacity: 0.3 }} />
              <div className="text-muted font-mono" style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                No {filter !== 'ALL' ? filter.toLowerCase() : ''} memories found.
              </div>
              <div className="text-muted" style={{ fontSize: '0.8rem', maxWidth: '400px' }}>
                Directives, system summaries, and user preferences are automatically stored here as you interact with JARVIS.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {memories.map((m: any) => (
                <div 
                  key={m.id} 
                  style={{ 
                    padding: '20px 24px', 
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'background 0.2s',
                  }}
                  className="hover-bg"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--accent-cyan)',
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid var(--border-subtle)'
                      }}>
                        {m.type}
                      </span>
                      {m.subject && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {m.subject}
                        </span>
                      )}
                      <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                        ID: {m.id}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                        CONFIDENCE: {Math.round((m.confidence || 1.0) * 100)}%
                      </span>
                      <button 
                        onClick={() => handleDelete(m.id)}
                        style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                        title="Delete memory record"
                      >
                        <Trash2 size={14} className="hover-red" />
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <div className="font-mono text-muted" style={{ fontSize: '0.7rem' }}>
                      CREATED: {new Date(m.createdAt || m.created_at || Date.now()).toLocaleString()}
                    </div>
                    {m.importance && (
                      <span className="font-mono" style={{ fontSize: '0.65rem', color: m.importance === 'HIGH' ? 'var(--status-warning)' : 'var(--text-muted)' }}>
                        IMPORTANCE: {m.importance}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Memory Modal */}
        {showAddModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <form onSubmit={handleCreate} className="panel" style={{ width: '500px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-secondary)' }}>
              <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={16} className="text-cyan" />
                CREATE MEMORY RECORD
              </div>

              <div>
                <label className="font-mono text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>MEMORY TYPE</label>
                <select 
                  value={newType} 
                  onChange={e => setNewType(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '4px' }}
                >
                  {['WORKING', 'EPISODIC', 'SEMANTIC', 'PROJECT', 'USER_PREFERENCE'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-mono text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>SUBJECT / TOPIC (OPTIONAL)</label>
                <input 
                  type="text" 
                  placeholder="e.g. Architecture, User Preference, Database"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label className="font-mono text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>CONTENT / DIRECTIVE</label>
                <textarea 
                  rows={4} 
                  required
                  placeholder="Enter the knowledge or directive JARVIS should persist..."
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '4px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: '4px' }}
                >
                  CANCEL
                </button>
                <button 
                  type="submit" 
                  style={{ padding: '8px 20px', background: 'var(--accent-cyan)', color: '#000', fontWeight: 'bold', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}
                >
                  SAVE RECORD
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};
