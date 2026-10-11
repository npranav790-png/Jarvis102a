import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = [
    { id: 'home', label: 'Go to Home', action: () => navigate('/') },
    { id: 'chat', label: 'Open Chat', action: () => navigate('/chat') },
    { id: 'tasks', label: 'View Tasks', action: () => navigate('/tasks') },
    { id: 'approvals', label: 'View Approvals', action: () => navigate('/approvals') },
    { id: 'memory', label: 'Open Memory', action: () => navigate('/memory') },
    { id: 'runtime', label: 'Open Runtime', action: () => navigate('/runtime') },
    { id: 'ai', label: 'Open AI Control', action: () => navigate('/ai') },
    { id: 'settings', label: 'Open Settings', action: () => navigate('/settings') },
  ];

  const filteredCommands = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        setIsOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh'
      }}
      onClick={() => setIsOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div 
        className="panel"
        style={{ width: '100%', maxWidth: '600px', padding: 0, background: 'var(--bg-secondary)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Search size={20} className="text-muted" style={{ marginRight: '12px' }} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleInputKeyDown}
            aria-label="Search commands"
            style={{
              flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)',
              fontSize: '1rem', outline: 'none'
            }}
          />
        </div>
        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px 0' }} role="listbox">
          {filteredCommands.length > 0 ? filteredCommands.map((cmd, i) => (
            <div
              key={cmd.id}
              role="option"
              aria-selected={i === selectedIndex}
              onClick={() => { cmd.action(); setIsOpen(false); }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: '12px 24px', cursor: 'pointer',
                background: i === selectedIndex ? 'var(--bg-tertiary)' : 'transparent',
                color: i === selectedIndex ? 'var(--accent-cyan)' : 'var(--text-primary)'
              }}
            >
              <div className="font-mono">{cmd.label}</div>
            </div>
          )) : (
            <div style={{ padding: '24px', textAlign: 'center' }} className="text-muted font-mono" role="status">No commands found.</div>
          )}
        </div>
      </div>
    </div>
  );
};
