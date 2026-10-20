import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  CheckCircle,
  FileCode,
  ShieldAlert,
  RefreshCw,
  FolderGit2,
  Sparkles,
  Layers,
  Code2,
  Square,
  Edit3,
  Check,
} from 'lucide-react';
import { api } from '../api/client';
import { voicePlayer } from '../services/voicePlayer';

interface OrchestrationJob {
  id: string;
  status: string;
  order: {
    orderText: string;
    targetWorkspace: string;
    engine?: 'opencode' | 'kilo';
    model?: string;
    title?: string;
  };
  engine: 'opencode' | 'kilo';
  research?: {
    projectRoot: string;
    techStack: string[];
    manifests: string[];
    relevantFiles: Array<{ relativePath: string; lineCount?: number }>;
    projectStructureSummary: string;
  };
  brainstorm?: {
    problemSummary: string;
    architecturalApproach: string;
    technicalDecisions: string[];
    affectedComponents: string[];
    potentialRisks: string[];
    suggestedValidation: string;
  };
  projectPlan?: {
    title: string;
    summary: string;
    architecturalReview: string;
    technicalDecisions: string[];
    phases: Array<{
      phaseNumber: number;
      title: string;
      description: string;
      tasks: string[];
      deliverables: string[];
    }>;
    risksAndMitigations: string[];
    validationCriteria: string[];
  };
  planApprovalStatus?: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  engineeredPrompt?: {
    title: string;
    promptText: string;
    targetFiles: string[];
    instructions: string[];
    constraints: string[];
    verificationCommand?: string;
    estimatedComplexity: string;
    version: number;
    report?: {
      summary: string;
      whatItDoes: string;
      targetFiles: string[];
      keyInstructions: string[];
      constraints: string[];
      verificationCommand?: string;
      estimatedComplexity: string;
    };
  };
  approvalStatus: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  executionLogs: Array<{ timestamp: string; stream: string; chunk: string }>;
  exitCode?: number;
  diff?: {
    gitDiff: string;
    filesChanged: string[];
    insertions: number;
    deletions: number;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface BridgeStatus {
  opencodeInstalled: boolean;
  opencodePath?: string;
  opencodeVersion?: string;
  kiloInstalled: boolean;
  kiloPath?: string;
  kiloVersion?: string;
  defaultEngine: 'opencode' | 'kilo';
  activeJobsCount: number;
  supportedModels: string[];
}

export const Orchestrator: React.FC = () => {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [jobs, setJobs] = useState<OrchestrationJob[]>([]);
  const [activeJob, setActiveJob] = useState<OrchestrationJob | null>(null);

  // Form State
  const [orderText, setOrderText] = useState('');
  const [targetWorkspace, setTargetWorkspace] = useState('');
  const [selectedEngine, setSelectedEngine] = useState<'opencode' | 'kilo'>('opencode');
  const [selectedModel, setSelectedModel] = useState('default');
  const [autoDispatch, setAutoDispatch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPromptText, setEditedPromptText] = useState('');

  const terminalRef = useRef<HTMLDivElement>(null);

  // Load status and jobs
  const fetchStatusAndJobs = useCallback(async () => {
    try {
      const statusRes = await api.get('/orchestrator/status');
      if (statusRes?.data) {
        setBridgeStatus(statusRes.data);
        if (!selectedEngine) {
          setSelectedEngine(statusRes.data.defaultEngine || 'opencode');
        }
      }

      const jobsRes = await api.get('/orchestrator/jobs');
      if (jobsRes?.data && Array.isArray(jobsRes.data)) {
        setJobs(jobsRes.data);
        setActiveJob((prev) => (!prev && jobsRes.data.length > 0 ? jobsRes.data[0] : prev));
      }
    } catch (err) {
      console.error('Failed to load orchestrator data:', err);
    }
  }, [selectedEngine]);

  // Real-time WebSocket log streaming
  useEffect(() => {
    const unsub = api.onWsEvent((eventType, data) => {
      if (eventType === 'orchestrator:log' && data?.chunk) {
        setActiveJob((prev) => {
          if (!prev) return prev;
          if (data.jobId && prev.id !== data.jobId && !prev.id.startsWith('temp_')) return prev;
          return {
            ...prev,
            id: data.jobId || prev.id,
            executionLogs: [...prev.executionLogs, data.chunk],
          };
        });
      } else if (eventType === 'orchestrator:progress' && data?.jobId) {
        setActiveJob((prev) => {
          if (!prev) return prev;
          if (prev.id !== data.jobId && !prev.id.startsWith('temp_')) return prev;
          return { ...prev, id: data.jobId, status: data.status };
        });
      } else if (
        eventType === 'orchestrator:awaiting_approval' ||
        eventType === 'orchestrator:approved' ||
        eventType === 'orchestrator:completed' ||
        eventType === 'orchestrator:failed'
      ) {
        fetchStatusAndJobs();
      }
    });

    return unsub;
  }, [fetchStatusAndJobs]);

  useEffect(() => {
    fetchStatusAndJobs();
    const interval = setInterval(fetchStatusAndJobs, 3000);
    return () => clearInterval(interval);
  }, [fetchStatusAndJobs, activeJob?.id]);

  // Keep active job updated from list
  useEffect(() => {
    if (activeJob) {
      const updated = jobs.find((j) => j.id === activeJob.id);
      if (updated && updated.status !== activeJob.status) {
        setActiveJob(updated);
      }
    }
  }, [jobs, activeJob]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [activeJob?.executionLogs]);

  // Handle Order Submit - IMMEDIATELY displays terminal and launches task
  const handleStartOrchestration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderText.trim()) return;

    const currentOrder = orderText.trim();
    const currentWorkspace = targetWorkspace.trim();
    const currentEngine = selectedEngine;
    const currentModel = selectedModel;
    const shouldAutoDispatch = autoDispatch;

    setIsSubmitting(true);
    setOrderText('');

    // 1. Immediately activate Live Terminal with provisional active job
    const provisionalJob: OrchestrationJob = {
      id: `temp_${Date.now()}`,
      status: 'ANALYZING',
      order: {
        orderText: currentOrder,
        targetWorkspace: currentWorkspace || 'Current Workspace',
        engine: currentEngine,
        model: currentModel,
      },
      engine: currentEngine,
      approvalStatus: 'NOT_SUBMITTED',
      executionLogs: [
        {
          timestamp: new Date().toISOString(),
          stream: 'system',
          chunk: `[JARVIS ORCHESTRATOR] Initialized task: "${currentOrder}"\n[JARVIS] Target Workspace: ${currentWorkspace || 'Current Workspace'}\n[JARVIS] Coding Engine: ${currentEngine.toUpperCase()} (${currentModel})\n[STAGE 1] Scanning project structure & manifests...\n`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setActiveJob(provisionalJob);

    if (shouldAutoDispatch) {
      voicePlayer.speak(`Directive received. Launching ${currentEngine.toUpperCase()} in your terminal now.`);
    } else {
      voicePlayer.speak(`Directive received. Analyzing workspace and preparing execution plan.`);
    }

    try {
      const res = await api.post('/orchestrator/jobs', {
        orderText: currentOrder,
        targetWorkspace: currentWorkspace || undefined,
        engine: currentEngine,
        model: currentModel !== 'default' ? currentModel : undefined,
        autoDispatch: shouldAutoDispatch,
      });

      if (res?.data) {
        setActiveJob(res.data);
        fetchStatusAndJobs();
      }
    } catch (err: any) {
      alert(`Orchestration failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Gate 1: Plan Approval
  const handleApprovePlan = async () => {
    if (!activeJob) return;
    try {
      voicePlayer.speak('Plan approved. Synthesizing prompt specifications.');
      const res = await api.post(`/orchestrator/jobs/${activeJob.id}/approve-plan`, {});
      if (res?.data) {
        setActiveJob(res.data);
        fetchStatusAndJobs();
      }
    } catch (err: any) {
      alert(`Plan approval error: ${err?.message}`);
    }
  };

  const handleRejectPlan = async () => {
    if (!activeJob) return;
    const reason = prompt('Reason for rejecting plan (optional):') || 'Plan rejected by operator';
    try {
      voicePlayer.speak('Project plan rejected.');
      const res = await api.post(`/orchestrator/jobs/${activeJob.id}/reject-plan`, { reason });
      if (res?.data) {
        setActiveJob(res.data);
        fetchStatusAndJobs();
      }
    } catch (err: any) {
      alert(`Plan rejection error: ${err?.message}`);
    }
  };

  // Handle Approval (Gate 2)
  const handleApprove = async () => {
    if (!activeJob) return;
    try {
      voicePlayer.speak(`Approval confirmed. Launching ${activeJob.engine.toUpperCase()} in your real terminal now.`);
      const res = await api.post(`/orchestrator/jobs/${activeJob.id}/approve`, {
        customPrompt: isEditingPrompt ? editedPromptText : undefined,
      });
      if (res?.data) {
        setActiveJob(res.data);
        setIsEditingPrompt(false);
        fetchStatusAndJobs();
      }
    } catch (err: any) {
      alert(`Approval error: ${err?.message}`);
    }
  };

  // Handle Rejection
  const handleReject = async () => {
    if (!activeJob) return;
    const reason = prompt('Reason for rejection (optional):') || 'Rejected by user';
    try {
      voicePlayer.speak('Order rejected. Execution cancelled.');
      const res = await api.post(`/orchestrator/jobs/${activeJob.id}/reject`, { reason });
      if (res?.data) {
        setActiveJob(res.data);
        fetchStatusAndJobs();
      }
    } catch (err: any) {
      alert(`Rejection error: ${err?.message}`);
    }
  };

  // Handle Cancel
  const handleCancel = async () => {
    if (!activeJob) return;
    try {
      voicePlayer.speak('Aborting execution process.');
      await api.post(`/orchestrator/jobs/${activeJob.id}/cancel`, {});
      fetchStatusAndJobs();
    } catch (err: any) {
      alert(`Cancel error: ${err?.message}`);
    }
  };

  const samplePrompts = [
    'Implement user authentication with JWT, refresh tokens, and password hashing',
    'Add an in-memory sliding window rate limiter middleware with unit tests',
    'Build a REST API endpoint for system metrics with CPU, memory, and uptime',
    'Refactor database connection pool with automatic retry and exponential backoff',
  ];

  return (
    <div className="page-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header & Engine Status Banner */}
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderRadius: '12px',
          borderLeft: '4px solid var(--accent-cyan)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: 'rgba(0, 210, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
            }}
          >
            <Code2 size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '1px' }}>
                JARVIS CODE ORCHESTRATOR
              </h2>
              <span className="badge" style={{ background: 'rgba(0,210,255,0.15)', color: 'var(--accent-cyan)', fontSize: '10px' }}>
                OPENCODE & KILOBYTE BRIDGE
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Autonomous architecture analysis, research, prompt synthesis, human approval, and solution development.
            </div>
          </div>
        </div>

        {/* Engine status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>OPENCODE:</span>
            {bridgeStatus?.opencodeInstalled ? (
              <span style={{ color: 'var(--status-online)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> v{bridgeStatus.opencodeVersion || '2.0.22'}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Not Detected</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>KILO CODE:</span>
            {bridgeStatus?.kiloInstalled ? (
              <span style={{ color: 'var(--status-online)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> v{bridgeStatus.kiloVersion || '7.8.1'}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Not Detected</span>
            )}
          </div>

          <button
            onClick={fetchStatusAndJobs}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 2. Main Grid Layout: Left Input Panel, Right Active Job View */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '20px', minHeight: '680px' }}>
        {/* Left Column: Order Input & Job Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* New Order Card */}
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Sparkles size={16} className="text-cyan" />
              <span style={{ fontWeight: 600, fontSize: '0.9rem', letterSpacing: '0.5px' }}>NEW ORCHESTRATION ORDER</span>
            </div>

            <form onSubmit={handleStartOrchestration} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  TARGET WORKSPACE ROOT
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderGit2 size={14} className="text-muted" />
                  <input
                    type="text"
                    value={targetWorkspace}
                    onChange={(e) => setTargetWorkspace(e.target.value)}
                    placeholder="Leave empty for current project"
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: 'var(--text-primary)',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  CODING ENGINE
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedEngine('opencode')}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: selectedEngine === 'opencode' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                      background: selectedEngine === 'opencode' ? 'rgba(0,210,255,0.1)' : 'rgba(0,0,0,0.2)',
                      color: selectedEngine === 'opencode' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    OpenCode CLI
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEngine('kilo')}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: selectedEngine === 'kilo' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                      background: selectedEngine === 'kilo' ? 'rgba(0,210,255,0.1)' : 'rgba(0,0,0,0.2)',
                      color: selectedEngine === 'kilo' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Kilo Code CLI
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  EXECUTION MODEL
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                  }}
                >
                  <option value="default">Engine Default (Configured)</option>
                  <option value="kilo/kilo-auto/free">Kilo Auto Free (Zero-Cost)</option>
                  <option value="kilo/google/gemini-2.5-flash">Google Gemini 2.5 Flash</option>
                  <option value="kilo/deepseek/deepseek-chat">DeepSeek Chat</option>
                  <option value="kilo/qwen/qwen3.5-35b-a3b">Qwen 3.5 35B</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  FEATURE / PROBLEM DIRECTIVE
                </label>
                <textarea
                  rows={4}
                  value={orderText}
                  onChange={(e) => setOrderText(e.target.value)}
                  placeholder="Describe what you want to build or fix in natural language..."
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '10px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    resize: 'none',
                    lineHeight: 1.4,
                  }}
                />
              </div>

              {/* Quick suggestions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>QUICK TEMPLATES:</span>
                {samplePrompts.slice(0, 2).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setOrderText(p)}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + {p}
                  </button>
                ))}
              </div>

              {/* Auto-Dispatch Toggle */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '11px',
                  color: autoDispatch ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  marginTop: '8px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: autoDispatch ? 'rgba(0,210,255,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${autoDispatch ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                  userSelect: 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoDispatch}
                  onChange={(e) => setAutoDispatch(e.target.checked)}
                  style={{ accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: autoDispatch ? 600 : 400 }}>
                  ⚡ Auto-Dispatch (Run OpenCode immediately without pausing)
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting || !orderText.trim()}
                style={{
                  marginTop: '6px',
                  background: isSubmitting ? 'var(--border-subtle)' : (autoDispatch ? 'linear-gradient(135deg, #00f5a0 0%, #00d2ff 100%)' : 'linear-gradient(135deg, #00d2ff 0%, #0072ff 100%)'),
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 16px',
                  color: autoDispatch ? '#00251a' : '#fff',
                  fontWeight: 700,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: autoDispatch ? '0 4px 14px rgba(0,245,160,0.3)' : '0 4px 14px rgba(0,210,255,0.25)',
                }}
              >
                {isSubmitting ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />}
                {isSubmitting ? 'PROCESSING DIRECTIVE...' : (autoDispatch ? '⚡ ANALYZE & RUN OPENCODE' : 'ANALYZE & GENERATE PROMPT')}
              </button>
            </form>
          </div>

          {/* Job History List */}
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '10px' }}>
              ORCHESTRATION SESSIONS ({jobs.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {jobs.map((j) => (
                <div
                  key={j.id}
                  onClick={() => setActiveJob(j)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: activeJob?.id === j.id ? 'rgba(0,210,255,0.1)' : 'rgba(255,255,255,0.02)',
                    border: activeJob?.id === j.id ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
                      {j.id}
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background:
                          j.status === 'COMPLETED'
                            ? 'rgba(0,255,160,0.15)'
                            : j.status === 'AWAITING_APPROVAL'
                            ? 'rgba(255,190,0,0.15)'
                            : j.status === 'DEVELOPING'
                            ? 'rgba(0,210,255,0.2)'
                            : 'rgba(255,255,255,0.05)',
                        color:
                          j.status === 'COMPLETED'
                            ? 'var(--status-online)'
                            : j.status === 'AWAITING_APPROVAL'
                            ? '#ffbe00'
                            : j.status === 'DEVELOPING'
                            ? 'var(--accent-cyan)'
                            : 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {j.status}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {j.order.orderText}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Engine: {j.engine.toUpperCase()} • {new Date(j.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {jobs.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  No sessions yet. Submit an order above!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Job Stages, Prompt Inspector, Live Terminal, Diff */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeJob ? (
            <>
              {/* Stepper Bar */}
              <div
                className="glass-panel"
                style={{
                  padding: '12px 20px',
                  borderRadius: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Session: <span style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{activeJob.id}</span>
                  </span>
                  <span style={{ color: 'var(--border-active)' }}>|</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Target: {activeJob.order.targetWorkspace}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activeJob.status === 'DEVELOPING' && (
                    <button
                      onClick={handleCancel}
                      style={{
                        background: 'rgba(255,60,60,0.15)',
                        border: '1px solid rgba(255,60,60,0.3)',
                        color: '#ff4d4d',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Square size={12} /> ABORT PROCESS
                    </button>
                  )}
                  <span
                    className="badge"
                    style={{
                      background:
                        activeJob.status === 'COMPLETED'
                          ? 'rgba(0,255,160,0.15)'
                          : activeJob.status === 'AWAITING_APPROVAL'
                          ? 'rgba(255,190,0,0.15)'
                          : 'rgba(0,210,255,0.15)',
                      color:
                        activeJob.status === 'COMPLETED'
                          ? 'var(--status-online)'
                          : activeJob.status === 'AWAITING_APPROVAL'
                          ? '#ffbe00'
                          : 'var(--accent-cyan)',
                    }}
                  >
                    STATE: {activeJob.status}
                  </span>
                </div>
              </div>

              {/* Research & Brainstorming Collapsible Card */}
              {activeJob.research && (
                <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={15} className="text-cyan" />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>
                        CODEBASE RESEARCH & ARCHITECTURAL BRAINSTORM
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {activeJob.research.techStack.map((tech, idx) => (
                        <span key={idx} className="badge" style={{ fontSize: '9px', background: 'rgba(255,255,255,0.05)' }}>
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px', fontSize: '11px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Architectural Approach:
                      </span>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        {activeJob.brainstorm?.architecturalApproach || 'Analyzed modular implementation'}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Identified Target Files:
                      </span>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        {activeJob.research.relevantFiles.slice(0, 4).map((f) => f.relativePath).join(', ') || 'Root repository'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Gate 1: Phased Project Plan Card */}
              {activeJob.projectPlan && (
                <div
                  className="glass-panel"
                  style={{
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: activeJob.status === 'AWAITING_PLAN_APPROVAL' ? '1px solid #00d2ff' : '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={16} className="text-cyan" />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                        {activeJob.projectPlan.title || 'PHASED PROJECT PLAN'}
                      </span>
                    </div>
                    {activeJob.status === 'AWAITING_PLAN_APPROVAL' && (
                      <span className="badge" style={{ background: 'rgba(255, 190, 0, 0.15)', color: '#ffbe00', fontSize: '9px', fontWeight: 600 }}>
                        GATE 1 • AWAITING PLAN APPROVAL
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--accent-cyan)' }}>Architectural Review: </strong>
                    {activeJob.projectPlan.architecturalReview || activeJob.projectPlan.summary}
                  </div>

                  {/* Phases Grid */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {activeJob.projectPlan.phases?.map((p: any) => (
                      <div
                        key={p.phaseNumber}
                        style={{
                          background: 'rgba(0, 0, 0, 0.25)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: '6px',
                          padding: '10px 12px',
                          fontSize: '11px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ background: 'rgba(0, 210, 255, 0.15)', color: 'var(--accent-cyan)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                            Phase {p.phaseNumber}
                          </span>
                          <span style={{ fontWeight: 600, color: '#f0f6fc' }}>{p.title}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>{p.description}</div>
                        {p.tasks && (
                          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                            <strong>Tasks:</strong> {p.tasks.join(' • ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Gate 1 Approval Action Bar */}
                  {activeJob.status === 'AWAITING_PLAN_APPROVAL' && (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(0, 210, 255, 0.08)',
                        border: '1px solid rgba(0, 210, 255, 0.3)',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}>
                        <strong>Operator Review Required:</strong> Authorize this phased plan to proceed with prompt engineering.
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={handleRejectPlan}
                          style={{
                            background: 'rgba(255,60,60,0.15)',
                            border: '1px solid rgba(255,60,60,0.3)',
                            color: '#ff4d4d',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Reject Plan
                        </button>
                        <button
                          onClick={handleApprovePlan}
                          style={{
                            background: 'linear-gradient(135deg, #00d2ff 0%, #0072ff 100%)',
                            border: 'none',
                            color: '#fff',
                            padding: '6px 16px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Check size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          APPROVE PLAN & GENERATE PROMPTS
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stage 3: Engineered Prompt & Human Approval Banner */}
              {activeJob.engineeredPrompt && (
                <div
                  className="glass-panel"
                  style={{
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: activeJob.status === 'AWAITING_APPROVAL' ? '1px solid #ffbe00' : '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileCode size={16} className="text-cyan" />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>
                        ENGINEERED PROMPT FOR {activeJob.engine.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        (v{activeJob.engineeredPrompt.version})
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => {
                          if (!isEditingPrompt) {
                            setEditedPromptText(activeJob.engineeredPrompt?.promptText || '');
                          }
                          setIsEditingPrompt(!isEditingPrompt);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Edit3 size={11} /> {isEditingPrompt ? 'Cancel Edit' : 'Edit Prompt'}
                      </button>
                    </div>
                  </div>

                  {/* Brief Prompt Report Box */}
                  <div
                    style={{
                      background: 'rgba(0, 245, 160, 0.06)',
                      border: '1px solid rgba(0, 245, 160, 0.25)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#00f5a0', marginBottom: '4px' }}>
                      ⚡ BRIEF PROMPT REPORT: WHAT IT DOES
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#e6edf3', lineHeight: 1.4, marginBottom: '6px' }}>
                      {activeJob.engineeredPrompt.report?.whatItDoes ||
                        `Directs ${activeJob.engine.toUpperCase()} to implement the approved plan across ${activeJob.engineeredPrompt.targetFiles?.join(', ') || 'workspace modules'}.`}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      <strong>Target Files:</strong> {activeJob.engineeredPrompt.targetFiles?.join(', ') || 'Root repository'}
                      {activeJob.engineeredPrompt.verificationCommand && (
                        <span> • <strong>Verification:</strong> {activeJob.engineeredPrompt.verificationCommand}</span>
                      )}
                    </div>
                  </div>


                  {isEditingPrompt ? (
                    <textarea
                      rows={8}
                      value={editedPromptText}
                      onChange={(e) => setEditedPromptText(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#0d1117',
                        color: '#c9d1d9',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--accent-cyan)',
                      }}
                    />
                  ) : (
                    <pre
                      style={{
                        background: '#0d1117',
                        color: '#c9d1d9',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        padding: '12px',
                        borderRadius: '6px',
                        maxHeight: '180px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        border: '1px solid rgba(255,255,255,0.05)',
                        margin: 0,
                      }}
                    >
                      {activeJob.engineeredPrompt.promptText}
                    </pre>
                  )}

                  {/* APPROVAL ACTION BAR */}
                  {activeJob.status === 'AWAITING_APPROVAL' && (
                    <div
                      style={{
                        marginTop: '14px',
                        padding: '12px 16px',
                        background: 'rgba(255, 190, 0, 0.08)',
                        border: '1px solid rgba(255, 190, 0, 0.3)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShieldAlert size={18} color="#ffbe00" />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffbe00' }}>
                            HUMAN APPROVAL REQUIRED
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            Review the prompt and authorize JARVIS to dispatch changes to {activeJob.engine.toUpperCase()}.
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={handleReject}
                          style={{
                            background: 'rgba(255,60,60,0.15)',
                            border: '1px solid rgba(255,60,60,0.3)',
                            color: '#ff4d4d',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Reject
                        </button>
                        <button
                          onClick={handleApprove}
                          style={{
                            background: 'linear-gradient(135deg, #00f5a0 0%, #00d2ff 100%)',
                            border: 'none',
                            color: '#00251a',
                            padding: '6px 18px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 10px rgba(0,245,160,0.3)',
                          }}
                        >
                          <Check size={14} /> APPROVE & DISPATCH TO {activeJob.engine.toUpperCase()}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stage 4: Live Execution Terminal Output */}
              <div
                className="glass-panel"
                style={{
                  padding: '16px 20px',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: '260px',
                  border: activeJob.status === 'DEVELOPING' ? '1px solid rgba(0, 210, 255, 0.4)' : '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={14} className="text-cyan" />
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>LIVE {activeJob.engine.toUpperCase()} TERMINAL</span>
                    {(activeJob.status === 'DEVELOPING' || activeJob.status === 'ANALYZING' || activeJob.status === 'BRAINSTORMING') ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10px',
                          color: '#00ffaa',
                          background: 'rgba(0,255,170,0.1)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00ffaa' }} />
                        RUNNING
                      </span>
                    ) : activeJob.status === 'AWAITING_APPROVAL' ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10px',
                          color: '#ffbe00',
                          background: 'rgba(255,190,0,0.1)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontWeight: 600,
                        }}
                      >
                        AWAITING APPROVAL
                      </span>
                    ) : activeJob.status === 'COMPLETED' ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10px',
                          color: '#00ffaa',
                          background: 'rgba(0,255,170,0.1)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                        }}
                      >
                        COMPLETED
                      </span>
                    ) : null}
                  </div>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    Lines: {activeJob.executionLogs.length}
                  </span>
                </div>

                <div
                  ref={terminalRef}
                  style={{
                    background: '#070a12',
                    padding: '14px',
                    borderRadius: '8px',
                    fontFamily: '"Fira Code", monospace, "Courier New"',
                    fontSize: '11px',
                    color: '#8be9fd',
                    overflowY: 'auto',
                    flex: 1,
                    maxHeight: '300px',
                    lineHeight: 1.5,
                    border: '1px solid rgba(0, 210, 255, 0.15)',
                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.6)',
                  }}
                >
                  {activeJob.executionLogs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)' }}>
                      [Awaiting execution. Logs will stream here live as {activeJob.engine.toUpperCase()} runs.]
                    </div>
                  ) : (
                    <>
                      {activeJob.executionLogs.map((log, idx) => (
                        <div
                          key={idx}
                          style={{
                            color:
                              log.stream === 'stderr'
                                ? '#ff5555'
                                : log.stream === 'system'
                                ? 'var(--accent-cyan)'
                                : '#f8f8f2',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {log.chunk}
                        </div>
                      ))}
                      {(activeJob.status === 'DEVELOPING' || activeJob.status === 'ANALYZING' || activeJob.status === 'BRAINSTORMING') && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <span style={{ color: 'var(--accent-cyan)' }}>&gt;</span>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '7px',
                              height: '14px',
                              background: '#00f5a0',
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Stage 5: Solution Diff & Modified Files */}
              {activeJob.diff && activeJob.diff.filesChanged.length > 0 && (
                <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={15} color="var(--status-online)" />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>
                        DEVELOPED SOLUTION & WORKSPACE DIFF
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                      <span style={{ color: 'var(--status-online)' }}>+{activeJob.diff.insertions}</span>
                      <span style={{ color: '#ff4d4d' }}>-{activeJob.diff.deletions}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Modified Files: {activeJob.diff.filesChanged.join(', ')}
                  </div>

                  {activeJob.diff.gitDiff && (
                    <pre
                      style={{
                        background: '#090d16',
                        color: '#c9d1d9',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                      }}
                    >
                      {activeJob.diff.gitDiff}
                    </pre>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              className="glass-panel"
              style={{
                padding: '60px',
                textAlign: 'center',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
              }}
            >
              <Code2 size={48} className="text-cyan" opacity={0.4} />
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>Ready for Orchestration</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '400px' }}>
                Enter your coding objective on the left. JARVIS will research the project, brainstorm the technical
                architecture, synthesize the prompt, request your approval, and dispatch to OpenCode / Kilo Code.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Orchestrator;
