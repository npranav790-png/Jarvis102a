import React, { useEffect, useState } from 'react';
import { Users, Activity } from 'lucide-react';
import { useJarvisStore } from '../store/jarvisStore';
import { api } from '../api/client';

export const Agents: React.FC = () => {
  const { activeTasks, setActiveTasks } = useJarvisStore();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => {
    api.get('/tasks').then(res => {
      if (Array.isArray(res)) setActiveTasks(res);
      else if (res?.data) setActiveTasks(res.data);
    });
  }, [setActiveTasks]);

  // Derive agent activity strictly from actively running tasks
  const agentActivity = activeTasks.reduce((acc: any, task: any) => {
    if (task.status !== 'RUNNING' && task.status !== 'IN_PROGRESS') {
      return acc;
    }
    const type = task.type || 'GENERAL';
    if (!acc[type]) acc[type] = { type, count: 0, tasks: [] };
    acc[type].count++;
    acc[type].tasks.push(task);
    return acc;
  }, {});

  const agents = ['GENERAL', 'CODING', 'RESEARCH', 'ANALYSIS', 'AUTOMATION'];

  return (
    <div style={{ padding: '40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={24} className="text-cyan" /> 
          <span>AGENTS <span className="text-muted" style={{ fontWeight: 'normal' }}>// TELEMETRY</span></span>
        </h2>

        <div className="panel" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {agents.map(agentType => {
              const activity = agentActivity[agentType];
              const isActive = !!activity && activity.count > 0;
              const isExpanded = expandedAgent === agentType;

              return (
                <div key={agentType} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div 
                    onClick={() => setExpandedAgent(isExpanded ? null : agentType)}
                    style={{ 
                      padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer', background: isExpanded ? 'var(--bg-tertiary)' : 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <Activity size={20} className={isActive ? 'text-cyan' : 'text-muted'} />
                      <div>
                        <div style={{ fontWeight: 500, letterSpacing: '1px' }}>{agentType} AGENT</div>
                        <div className="text-muted font-mono" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                          Status: {isActive ? 'ACTIVE' : 'STANDBY'}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono" style={{ color: isActive ? 'var(--status-online)' : 'var(--text-muted)' }}>
                      {isActive ? `${activity.count} TASKS RUNNING` : 'IDLE'}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '24px', background: 'rgba(10,12,16,0.3)', borderTop: '1px solid var(--border-subtle)' }}>
                      <div className="text-muted font-mono" style={{ fontSize: '0.75rem', marginBottom: '16px' }}>CURRENT ACTIVITY</div>
                      {!isActive ? (
                        <div className="font-mono text-muted" style={{ fontSize: '0.85rem' }}>No active tasks assigned to this agent type.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {activity.tasks.map((t: any) => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              <div>
                                <div style={{ fontSize: '0.85rem' }}>{t.title || 'Task Execution'}</div>
                                <div className="text-muted font-mono" style={{ fontSize: '0.7rem', marginTop: '4px' }}>ID: {t.id}</div>
                              </div>
                              <div className="font-mono" style={{ fontSize: '0.75rem', color: t.status === 'RUNNING' ? 'var(--status-online)' : 'var(--text-primary)' }}>
                                {t.status}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
