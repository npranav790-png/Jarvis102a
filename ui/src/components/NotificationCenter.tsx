import React, { useState, useEffect, useRef } from 'react';

import { Bell, Check, AlertTriangle, Info } from 'lucide-react';
import { api } from '../api/client';

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      if (res && Array.isArray(res)) {
        setNotifications(res);
      } else if (res?.data) {
        setNotifications(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (isOpen && popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleReadAll = async () => {
    try {
      await api.post('/notifications/read-all', {});
      fetchNotifications();
    } catch (err) {}
  };

  const handleRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`, {});
      fetchNotifications();
    } catch (err) {}
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <div 
        style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        role="button"
        tabIndex={0}
      >
        <Bell size={16} className="text-muted" />
        {unreadCount > 0 && (
          <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: 'var(--status-warning)', borderRadius: '50%' }} />
        )}
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '12px', width: '350px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', maxHeight: '500px'
        }} role="dialog" aria-label="Notification Center">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="font-mono text-cyan" style={{ fontSize: '0.85rem' }}>NOTIFICATIONS</div>
            {unreadCount > 0 && (
              <button onClick={handleReadAll} className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={12} /> MARK ALL READ
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }} className="text-muted font-mono">
                No notifications.
              </div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id} 
                  onClick={() => handleRead(n.id)}
                  style={{ 
                    padding: '12px', marginBottom: '8px', borderRadius: '4px', cursor: 'pointer',
                    background: n.read ? 'transparent' : 'rgba(255, 204, 0, 0.05)',
                    borderLeft: `2px solid ${n.read ? 'transparent' : 'var(--status-warning)'}`,
                    opacity: n.read ? 0.7 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ marginTop: '2px' }}>
                      {n.severity === 'HIGH' ? <AlertTriangle size={14} style={{ color: 'var(--status-offline)' }} /> : <Info size={14} className="text-cyan" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: n.read ? 'normal' : 500, color: 'var(--text-primary)' }}>{n.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>{n.message}</div>
                      <div className="text-muted font-mono" style={{ fontSize: '0.65rem', marginTop: '8px' }}>
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
