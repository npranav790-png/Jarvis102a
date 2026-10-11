import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Cpu, Clock, RefreshCw } from 'lucide-react';

export const Runtime: React.FC = () => {
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [status, setStatus] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      if (activeTab === 'OVERVIEW') {
        const res = await api.get('/runtime/status');
        if (res) setStatus(res);
      } else if (activeTab === 'JOBS') {
        const res = await api.get('/jobs');
        if (res) setJobs(res);
      } else if (activeTab === 'AUTOMATIONS') {
        const res = await api.get('/automations');
        if (res) setAutomations(res);
      } else if (activeTab === 'REMINDERS') {
        const res = await api.get('/reminders');
        if (res) setReminders(res);
      }
    } catch (e) {
      console.error('Failed to fetch runtime data', e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={24} className="text-cyan" /> 
            <span>RUNTIME <span className="text-muted" style={{ fontWeight: 'normal' }}>// CENTER</span></span>
          </h2>
          <button onClick={fetchData} className="btn" style={{ padding: '8px', background: 'var(--bg-tertiary)' }}>
            <RefreshCw size={16} className="text-cyan" />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          {['OVERVIEW', 'JOBS', 'AUTOMATIONS', 'REMINDERS'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                color: activeTab === tab ? 'var(--accent-cyan)' : 'var(--text-muted)',
                border: `1px solid ${activeTab === tab ? 'var(--accent-cyan)' : 'transparent'}`,
                padding: '8px 16px', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="panel" style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'OVERVIEW' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {!status ? (
                <div className="text-muted font-mono" style={{ padding: '40px', textAlign: 'center' }}>Loading runtime status...</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-muted font-mono" style={{ fontSize: '0.8rem', marginBottom: '12px' }}>ENGINE STATE</div>
                      <div style={{ fontSize: '1.5rem', color: status.state === 'RUNNING' ? 'var(--status-online)' : 'var(--status-offline)' }}>
                        {status.state}
                      </div>
                    </div>
                    <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-muted font-mono" style={{ fontSize: '0.8rem', marginBottom: '12px' }}>UPTIME</div>
                      <div style={{ fontSize: '1.5rem', color: 'var(--text-primary)' }}>
                        {Math.floor(status.uptime / 60)}m {Math.floor(status.uptime % 60)}s
                      </div>
                    </div>
                    <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-muted font-mono" style={{ fontSize: '0.8rem', marginBottom: '12px' }}>SCHEDULER</div>
                      <div style={{ fontSize: '1.5rem', color: status.schedulerRunning ? 'var(--status-online)' : 'var(--text-muted)' }}>
                        {status.schedulerRunning ? 'ONLINE' : 'STANDBY'}
                      </div>
                    </div>
                    <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-muted font-mono" style={{ fontSize: '0.8rem', marginBottom: '12px' }}>DATABASE</div>
                      <div style={{ fontSize: '1.5rem', color: status.databaseHealthy ? 'var(--status-online)' : 'var(--status-warning)' }}>
                        {status.databaseHealthy ? 'HEALTHY' : 'DEGRADED'}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-mono text-muted" style={{ fontSize: '0.9rem', marginBottom: '16px' }}>TELEMETRY & QUEUE METRICS</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                      <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>ACTIVE JOBS</div>
                        <div style={{ fontSize: '1.3rem', color: 'var(--text-primary)' }}>{status.activeJobs ?? 0}</div>
                      </div>
                      <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>QUEUED JOBS</div>
                        <div style={{ fontSize: '1.3rem', color: 'var(--text-primary)' }}>{status.queuedJobs ?? 0}</div>
                      </div>
                      <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>AUTOMATIONS</div>
                        <div style={{ fontSize: '1.3rem', color: 'var(--text-primary)' }}>{status.activeAutomations ?? 0}</div>
                      </div>
                      <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginBottom: '8px' }}>APPROVALS REQUIRED</div>
                        <div style={{ fontSize: '1.3rem', color: status.pendingApprovals > 0 ? 'var(--status-warning)' : 'var(--text-primary)' }}>{status.pendingApprovals ?? 0}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'JOBS' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {jobs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center' }} className="text-muted font-mono">No active jobs found.</div>
              ) : (
                jobs.map(j => (
                  <div key={j.id} style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="font-mono text-cyan">{j.type}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{j.id}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', marginTop: '8px', color: 'var(--text-secondary)' }}>
                        Task: {j.taskId} | Priority: {j.priority}
                      </div>
                    </div>
                    <div className="font-mono" style={{ color: j.status === 'FAILED' ? 'var(--status-offline)' : j.status === 'RUNNING' ? 'var(--status-online)' : 'var(--text-muted)' }}>
                      {j.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'AUTOMATIONS' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {automations.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center' }} className="text-muted font-mono">No automations configured.</div>
              ) : (
                automations.map(a => (
                  <div key={a.id} style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="font-mono text-cyan">{a.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>{a.trigger}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', marginTop: '8px', color: 'var(--text-secondary)' }}>
                        Last run: {a.lastRun ? new Date(a.lastRun).toLocaleString() : 'Never'}
                      </div>
                    </div>
                    <div className="font-mono" style={{ color: a.enabled ? 'var(--status-online)' : 'var(--text-muted)' }}>
                      {a.enabled ? 'ACTIVE' : 'DISABLED'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'REMINDERS' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {reminders.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center' }} className="text-muted font-mono">No reminders set.</div>
              ) : (
                reminders.map(r => (
                  <div key={r.id} style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Clock size={16} className="text-cyan" />
                        <span>{r.message}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', marginTop: '8px', color: 'var(--text-muted)' }}>
                        Scheduled for: {new Date(r.scheduledAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="font-mono" style={{ color: r.status === 'PENDING' ? 'var(--status-warning)' : 'var(--text-muted)' }}>
                      {r.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
