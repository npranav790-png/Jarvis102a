import React, { useState, useEffect, useRef } from 'react';
import { useJarvisStore } from '../store/jarvisStore';
import {
  Send,
  Loader,
  Cpu,
  CheckSquare,
  ShieldAlert,
  Check,
  X,
  Terminal,
  ExternalLink,
  Sparkles,
  Layers,
  FileCode,
  ChevronDown,
  ChevronRight,
  Play,
  Download,
  Archive,
} from 'lucide-react';

import { api } from '../api/client';
import { Link } from 'react-router-dom';
import { VoiceControl } from '../components/Voice/VoiceControl';
import { voicePlayer } from '../services/voicePlayer';
import { MarkdownRenderer } from '../components/Chat/MarkdownRenderer';
import { ModelSwitcher } from '../components/ModelSwitcher';

export const Chat: React.FC = () => {
  const { messages, addMessage, setSystemState, activeTasks, pendingApprovals, setPendingApprovals, modelMode } = useJarvisStore();
  const [input, setInput] = useState('');
  const [isCodingMode, setIsCodingMode] = useState(false);
  const [activeOrchJob, setActiveOrchJob] = useState<any>(null);
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);

  // Auto-scroll chat container
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, activeTasks, pendingApprovals, activeOrchJob?.executionLogs, activeOrchJob?.status]);

  // Auto-scroll embedded terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [activeOrchJob?.executionLogs]);

  // Fetch pending approvals on mount
  useEffect(() => {
    api.get('/approvals').then((res) => {
      if (res?.data && Array.isArray(res.data)) {
        setPendingApprovals(res.data);
      } else if (Array.isArray(res)) {
        setPendingApprovals(res);
      }
    });

    // Check if an active orchestrator job exists
    api.get('/orchestrator/jobs').then((res) => {
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        const running = res.data.find(
          (j: any) =>
            j.status === 'DEVELOPING' ||
            j.status === 'ANALYZING' ||
            j.status === 'AWAITING_PLAN_APPROVAL' ||
            j.status === 'AWAITING_APPROVAL' ||
            j.status === 'PROMPT_READY'
        );
        if (running) setActiveOrchJob(running);
      }
    });

    // Load recent persistent messages if store is empty
    api.get('/chat/messages?limit=40').then((res) => {
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        const store = useJarvisStore.getState();
        if (store.messages.length === 0) {
          res.data
            .filter((m: any) => m.content !== 'Task initiated.')
            .forEach((m: any) => {
              store.addMessage({
                id: m.id,
                role: m.role,
                content: m.content,
                taskId: m.task_id,
                timestamp: m.created_at,
              });
            });
        }
      }
    });
  }, [setPendingApprovals]);

  // Listen to WebSocket events for real-time live terminal streaming & approvals
  useEffect(() => {
    const unsub = api.onWsEvent((eventType, data) => {
      if (eventType === 'orchestrator:log' && data?.chunk) {
        setActiveOrchJob((prev: any) => {
          if (!prev) return prev;
          if (data.jobId && prev.id !== data.jobId && !prev.id.startsWith('temp_')) return prev;
          return {
            ...prev,
            id: data.jobId || prev.id,
            executionLogs: [...(prev.executionLogs || []), data.chunk],
          };
        });
      } else if (eventType === 'orchestrator:progress' && data?.jobId) {
        setActiveOrchJob((prev: any) => {
          if (!prev || (prev.id !== data.jobId && !prev.id.startsWith('temp_'))) return prev;
          return { ...prev, id: data.jobId, status: data.status };
        });
      } else if (eventType === 'orchestrator:plan_ready' && data?.jobId) {
        voicePlayer.speak('Phased project plan generated. Please review and approve the plan.');
        api.get(`/orchestrator/jobs/${data.jobId}`).then((res) => {
          if (res?.data) setActiveOrchJob(res.data);
        });
      } else if (eventType === 'orchestrator:plan_approved' && data?.jobId) {
        voicePlayer.speak('Plan approved. Synthesizing prompt specifications.');
        api.get(`/orchestrator/jobs/${data.jobId}`).then((res) => {
          if (res?.data) setActiveOrchJob(res.data);
        });
      } else if (eventType === 'orchestrator:awaiting_approval' && data?.jobId) {
        voicePlayer.speak('Prompt engineered and verified. Human authorization required before opening terminal.');
        api.get(`/orchestrator/jobs/${data.jobId}`).then((res) => {
          if (res?.data) setActiveOrchJob(res.data);
        });
      } else if (
        eventType === 'approval:requested' ||
        eventType === 'approval.requested' ||
        eventType === 'security:approval_requested'
      ) {
        voicePlayer.speak('Approval required for system action. Please review.');
        api.get('/approvals').then((res) => {
          if (res?.data && Array.isArray(res.data)) setPendingApprovals(res.data);
          else if (Array.isArray(res)) setPendingApprovals(res);
        });
      } else if (eventType === 'orchestrator:approved') {
        voicePlayer.speak('Authorization confirmed. Launching OpenCode in your terminal now.');
      } else if (eventType === 'orchestrator:completed') {
        voicePlayer.speak('OpenCode task completed successfully.');
        if (data?.jobId) {
          api.get(`/orchestrator/jobs/${data.jobId}`).then((res) => {
            if (res?.data) setActiveOrchJob(res.data);
          });
        }
      } else if (eventType === 'orchestrator:failed') {
        voicePlayer.speak('OpenCode task encountered an error.');
        if (data?.jobId) {
          api.get(`/orchestrator/jobs/${data.jobId}`).then((res) => {
            if (res?.data) setActiveOrchJob(res.data);
          });
        }
      } else if (eventType === 'chat_message') {
        const payload = (data as any)?.payload || (data as any)?.task || data;
        const reply = payload?.content || payload?.text;
        if (reply && typeof reply === 'string') {
          const store = useJarvisStore.getState();
          const msgId = payload?.id || Date.now().toString();
          const exists = store.messages.some((m) => m.id === msgId);
          if (!exists) {
            store.addMessage({
              id: msgId,
              role: payload?.role || 'jarvis',
              content: reply,
              timestamp: payload?.timestamp || new Date().toISOString(),
            });
            voicePlayer.speak(reply);
          }
        }
      } else if (eventType === 'task:completed' || eventType === 'task.completed') {
        const payload = (data as any)?.payload || (data as any)?.task || data;
        const reply = payload?.output?.response || payload?.output?.message || payload?.result;
        if (reply && typeof reply === 'string') {
          const store = useJarvisStore.getState();
          const taskId = payload?.id || payload?.taskId;
          const existing = taskId ? store.messages.find((m) => m.taskId === taskId) : null;
          if (!existing || existing.content === 'Task initiated.') {
            store.addMessage({
              id: Date.now().toString(),
              role: 'jarvis',
              content: reply,
              taskId: taskId,
              timestamp: new Date().toISOString(),
            });
          }
          voicePlayer.speak(reply);
        }
      }
    });
    return unsub;
  }, [setPendingApprovals]);

  // Handle Human Approval decisions directly from chat
  const handleApproveAction = async (approvalId: string) => {
    try {
      voicePlayer.speak('Authorization confirmed. Dispatching task to OpenCode now.');
      await api.post(`/approvals/${approvalId}/approve`, {});
      setPendingApprovals(pendingApprovals.filter((a) => a.id !== approvalId));
      setSystemState('EXECUTING');
    } catch (err: any) {
      alert(`Approval failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleDenyAction = async (approvalId: string) => {
    try {
      voicePlayer.speak('Authorization denied. Operation rejected.');
      await api.post(`/approvals/${approvalId}/deny`, { reason: 'User denied from Chat' });
      setPendingApprovals(pendingApprovals.filter((a) => a.id !== approvalId));
      setSystemState('IDLE');
    } catch (err: any) {
      alert(`Denial failed: ${err?.message || 'Unknown error'}`);
    }
  };

  // Gate 1: Approve Project Plan
  const handleApprovePlan = async () => {
    if (!activeOrchJob) return;
    try {
      voicePlayer.speak('Project plan approved. Synthesizing prompt specification and brief report now.');
      addMessage({
        id: Date.now().toString() + 'plan_appr',
        role: 'jarvis',
        content: `✅ **Plan Approved!** Synthesizing prompt specification and target blueprints for OpenCode...`,
        timestamp: new Date().toISOString(),
      });
      const res = await api.post(`/orchestrator/jobs/${activeOrchJob.id}/approve-plan`, {});
      if (res?.data) {
        setActiveOrchJob(res.data);
      }
    } catch (err: any) {
      alert(`Plan approval failed: ${err?.message}`);
    }
  };

  const handleRejectPlan = async () => {
    if (!activeOrchJob) return;
    const reason = prompt('Reason for rejecting plan (optional):') || 'Plan rejected by operator';
    try {
      voicePlayer.speak('Project plan rejected. Workflow cancelled.');
      addMessage({
        id: Date.now().toString() + 'plan_rej',
        role: 'jarvis',
        content: `❌ **Project Plan Rejected:** ${reason}`,
        timestamp: new Date().toISOString(),
      });
      const res = await api.post(`/orchestrator/jobs/${activeOrchJob.id}/reject-plan`, { reason });
      if (res?.data) {
        setActiveOrchJob(res.data);
      }
    } catch (err: any) {
      alert(`Rejection failed: ${err?.message}`);
    }
  };

  // Gate 2: Approve Prompt & Launch External Terminal
  const handleApprovePrompt = async () => {
    if (!activeOrchJob) return;
    try {
      voicePlayer.speak(`Authorization granted. Launching ${activeOrchJob.engine?.toUpperCase() || 'OPENCODE'} in your real terminal now.`);
      addMessage({
        id: Date.now().toString() + 'prompt_appr',
        role: 'jarvis',
        content: `🚀 **Prompt Authorized!** Opening real terminal session for ${activeOrchJob.engine?.toUpperCase() || 'OPENCODE'}...`,
        timestamp: new Date().toISOString(),
      });
      const res = await api.post(`/orchestrator/jobs/${activeOrchJob.id}/approve`, {});
      if (res?.data) {
        setActiveOrchJob(res.data);
      }
    } catch (err: any) {
      alert(`Authorization failed: ${err?.message}`);
    }
  };

  const handleRejectPrompt = async () => {
    if (!activeOrchJob) return;
    const reason = prompt('Reason for rejecting prompt (optional):') || 'Prompt rejected by operator';
    try {
      voicePlayer.speak('Prompt rejected. Terminal launch aborted.');
      addMessage({
        id: Date.now().toString() + 'prompt_rej',
        role: 'jarvis',
        content: `❌ **Prompt Rejected:** ${reason}`,
        timestamp: new Date().toISOString(),
      });
      const res = await api.post(`/orchestrator/jobs/${activeOrchJob.id}/reject`, { reason });
      if (res?.data) {
        setActiveOrchJob(res.data);
      }
    } catch (err: any) {
      alert(`Rejection failed: ${err?.message}`);
    }
  };

  const handleExportSession = async () => {
    try {
      const sessionsRes = await api.get('/sessions');
      const sessionsList = Array.isArray(sessionsRes?.data) ? sessionsRes.data : (Array.isArray(sessionsRes) ? sessionsRes : []);
      const activeSession = sessionsList.find((s: any) => s.status === 'ACTIVE') || sessionsList[0];

      let markdown = '';
      let fileName = `jarvis_session_${new Date().toISOString().slice(0, 10)}.md`;

      if (activeSession) {
        try {
          const expRes = await api.get(`/sessions/${activeSession.id}/export?format=markdown`);
          if (expRes?.markdown) {
            markdown = expRes.markdown;
            if (expRes.fileName) fileName = expRes.fileName;
          } else if (typeof expRes === 'string') {
            markdown = expRes;
          }
        } catch {
          // Fall back to building markdown from store messages
        }
      }

      if (!markdown || markdown.trim().length === 0) {
        const now = new Date();
        markdown = `# 📜 JARVIS 2.0 Session Report\n\n`;
        markdown += `| Attribute | Details |\n| :--- | :--- |\n`;
        markdown += `| **Exported** | ${now.toLocaleString()} |\n`;
        markdown += `| **Total Turns** | ${messages.length} |\n`;
        markdown += `| **System** | JARVIS 2.0 Autonomous AI Operating System |\n\n---\n\n`;
        markdown += `## 💬 Conversation Transcript\n\n`;
        for (const m of messages) {
          const roleLabel = m.role === 'user' ? '👤 User' : '🤖 JARVIS';
          const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
          markdown += `### ${roleLabel} ${time ? `• ${time}` : ''}\n\n`;
          markdown += `${(m.content || '').trim()}\n\n---\n\n`;
        }
      }

      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      voicePlayer.speak('Session report exported.');
    } catch (err: any) {
      alert(`Export failed: ${err?.message || err}`);
    }
  };

  const handleArchiveSession = async () => {
    if (!confirm('Archive current session? This will save the conversation to archives and start a fresh session.')) return;
    try {
      const sessionsRes = await api.get('/sessions');
      const sessionsList = Array.isArray(sessionsRes?.data) ? sessionsRes.data : (Array.isArray(sessionsRes) ? sessionsRes : []);
      const activeSession = sessionsList.find((s: any) => s.status === 'ACTIVE');

      if (activeSession) {
        await api.post(`/sessions/${activeSession.id}/archive`);
      }

      await api.post('/sessions', { title: `Session ${new Date().toISOString().slice(0, 10)}` });

      addMessage({
        id: Date.now().toString(),
        role: 'jarvis',
        content: `📁 **Session Archived:** Previous session saved to disk archives. Ready for new instructions, Sir.`,
        timestamp: new Date().toISOString(),
      });

      voicePlayer.speak('Session archived.');
    } catch (err: any) {
      alert(`Archive failed: ${err?.message || err}`);
    }
  };

  const handleSend = async (e: React.FormEvent) => {

    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const currentInput = input.trim();
    const userMsg = { id: Date.now().toString(), role: 'user', content: currentInput, timestamp: new Date().toISOString() };
    addMessage(userMsg);
    setInput('');

    // Check if input is a project directive or coding mode is active
    const isQuestion = currentInput.includes('?');
    const isProjectRequest =
      isCodingMode ||
      currentInput.startsWith('/project') ||
      currentInput.startsWith('/code') ||
      (!isQuestion && (
        currentInput.toLowerCase().startsWith('code ') ||
        currentInput.toLowerCase().startsWith('project ') ||
        /^(create|build|make|develop|implement)\s+(a|an|the)?\s*(new\s+)?(project|app|application|service|dashboard|tool)\b/i.test(currentInput)
      ));

    if (isProjectRequest) {
      const directive = currentInput
        .replace(/^\/project\s*/i, '')
        .replace(/^\/code\s*/i, '')
        .replace(/^project\s*/i, '')
        .replace(/^code\s*/i, '')
        .trim() || currentInput;

      setIsLoading(true);
      setSystemState('THINKING');

      // Safety timeout so input is never permanently locked
      const safetyTimeout = setTimeout(() => {
        setIsLoading(false);
        setSystemState('IDLE');
      }, 35000);

      const provisionalJob = {
        id: `temp_${Date.now()}`,
        status: 'ANALYZING',
        engine: 'opencode',
        order: { orderText: directive },
        executionLogs: [
          {
            timestamp: new Date().toISOString(),
            stream: 'system',
            chunk: `[JARVIS PROJECT ORCHESTRATOR] Initialized directive: "${directive}"\n[STAGE 1] Scanning repository manifests & researching codebase...\n`,
          },
        ],
      };
      setActiveOrchJob(provisionalJob);

      addMessage({
        id: Date.now().toString() + 'sys',
        role: 'jarvis',
        content: `Project directive received: "${directive}".\n\nI am researching the repository and synthesizing a phased project plan with architectural review. You will review and approve the plan before any prompts are engineered or terminals are opened.`,
        timestamp: new Date().toISOString(),
      });
      voicePlayer.speak(`Directive received. Analyzing architecture and preparing phased plan for your review.`);

      try {
        const isSingleShot = /single prompt|single shot|single-shot/i.test(directive);
        const res = await api.post('/orchestrator/jobs', {
          orderText: directive,
          engine: 'opencode',
          autoDispatch: false,
          skipPlanApproval: isSingleShot,
        });
        if (res?.data) {
          setActiveOrchJob(res.data);
        }
      } catch (err: any) {
        addMessage({
          id: Date.now().toString(),
          role: 'jarvis',
          content: `ERROR: Project orchestration failed: ${err?.message || 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        });
      } finally {
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      }
      return;
    }

    // Standard Assistant Chat Flow - Real-time word streaming with fallback
    setIsLoading(true);
    setSystemState('THINKING');

    const tempAssistantId = `stream_${Date.now()}`;
    let accumulatedText = '';
    let streamSucceeded = false;

    try {
      // 1. Primary real-time token streaming (<300ms time to first token)
      const stream = api.streamChat({ message: currentInput, modelPreference: modelMode });
      for await (const chunk of stream) {
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if (chunk.delta) {
          streamSucceeded = true;
          accumulatedText += chunk.delta;
          addMessage({
            id: tempAssistantId,
            role: 'jarvis',
            content: accumulatedText,
            timestamp: new Date().toISOString(),
          });
        }
        if (chunk.done) {
          streamSucceeded = true;
          const finalText = chunk.content || accumulatedText;
          if (finalText) {
            addMessage({
              id: chunk.id || tempAssistantId,
              replaceId: tempAssistantId,
              role: 'jarvis',
              content: finalText,
              timestamp: new Date().toISOString(),
            });
            voicePlayer.speak(finalText);
          }
          setSystemState('IDLE');
          break;
        }
      }
    } catch (streamErr: any) {
      console.warn('Real-time chat stream interrupted or fallback needed:', streamErr);
      if (!streamSucceeded) {
        // Fallback to standard request
        try {
          const res = await api.post('/chat', { message: currentInput, modelPreference: modelMode });
          const resp = res?.response || res?.content || res?.data?.response || res?.data?.content;
          if (resp) {
            addMessage({
              id: res?.messageId || Date.now().toString(),
              role: 'jarvis',
              content: resp,
              timestamp: new Date().toISOString(),
            });
            voicePlayer.speak(resp);
            setSystemState('IDLE');
          } else if (res && res.taskId) {
            // Fallback for async background tasks
            const pollInterval = setInterval(async () => {
              try {
                const taskData = await api.get(`/tasks/${res.taskId}`);
                const taskObj = taskData?.data || taskData;
                if (taskObj?.status === 'COMPLETED' || taskObj?.output?.response || taskObj?.output?.message) {
                  clearInterval(pollInterval);
                  const taskResp = taskObj?.output?.response || taskObj?.output?.message || 'Task completed.';
                  addMessage({
                    id: Date.now().toString(),
                    role: 'jarvis',
                    content: taskResp,
                    timestamp: new Date().toISOString(),
                  });
                  voicePlayer.speak(taskResp);
                  setSystemState('IDLE');
                } else if (taskObj?.status === 'FAILED') {
                  clearInterval(pollInterval);
                  addMessage({
                    id: Date.now().toString(),
                    role: 'jarvis',
                    content: `ERROR: ${taskObj?.error?.message || 'Task failed.'}`,
                    timestamp: new Date().toISOString(),
                  });
                  setSystemState('ERROR');
                  setTimeout(() => setSystemState('IDLE'), 3000);
                }
              } catch {
                clearInterval(pollInterval);
              }
            }, 1500);

            setTimeout(() => clearInterval(pollInterval), 60000);
          }
        } catch (err: any) {
          addMessage({
            id: Date.now().toString(),
            role: 'jarvis',
            content: `ERROR: Link failed. ${err?.response?.data?.error?.message || err?.message || 'Connection interrupted.'}`,
            timestamp: new Date().toISOString(),
          });
          setSystemState('ERROR');
          setTimeout(() => setSystemState('IDLE'), 3000);
        }
      } else if (accumulatedText) {
        voicePlayer.speak(accumulatedText);
        setSystemState('IDLE');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getTaskStatus = (taskId: string) => {
    return activeTasks.find((t) => t.id === taskId)?.status || 'UNKNOWN';
  };

  return (
    <div style={{ padding: '30px 40px', pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', justifyContent: 'center' }}>
      <div className="panel" style={{ width: '100%', maxWidth: '860px', display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} className="text-cyan" />
            <span>JARVIS COMMUNICATION LINK</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ModelSwitcher variant="compact" />
            <button
              onClick={() => {
                const next = !isCodingMode;
                setIsCodingMode(next);
                voicePlayer.speak(
                  next
                    ? 'Project mode active. Inputs will undergo research, phased planning, and approval before terminal launch.'
                    : 'Conversational assistant mode active.'
                );
              }}
              style={{
                background: isCodingMode ? 'rgba(0,245,160,0.15)' : 'transparent',
                border: `1px solid ${isCodingMode ? '#00f5a0' : 'var(--border-subtle)'}`,
                color: isCodingMode ? '#00f5a0' : 'var(--text-muted)',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontWeight: isCodingMode ? 600 : 400,
                boxShadow: isCodingMode ? '0 0 10px rgba(0,245,160,0.2)' : 'none',
              }}
            >
              <Layers size={13} />
              {isCodingMode ? '⚡ PROJECT MODE: ACTIVE' : 'PROJECT MODE: OFF'}
            </button>
            <Link
              to="/orchestrator"
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Orchestrator <ExternalLink size={11} />
            </Link>

            <button
              onClick={handleExportSession}
              title="Export session transcript to Markdown report"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary, #00f0ff)';
                e.currentTarget.style.color = 'var(--accent-primary, #00f0ff)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <Download size={12} />
              Export .md
            </button>

            <button
              onClick={handleArchiveSession}
              title="Archive current session and save to disk archives"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary, #00f0ff)';
                e.currentTarget.style.color = 'var(--accent-primary, #00f0ff)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <Archive size={12} />
              Archive
            </button>
          </div>
        </div>


        <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px 0' }}>
          {messages.length === 0 ? (
            <div className="text-muted font-mono" style={{ textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
              Connection established. Awaiting input.
            </div>
          ) : (
            messages
              .filter((m: any) => m.content !== 'Task initiated.')
              .map((m: any) => {
                const content = typeof m.content === 'string' ? m.content : (m.payload?.content || '');
                const role = m.role || m.payload?.role || 'jarvis';
                const timestamp = m.timestamp || m.payload?.timestamp || '';
                const taskId = m.taskId || m.payload?.taskId;
                const showTaskCard = m.showTaskCard || false;
                const isError = typeof content === 'string' && content.includes('ERROR:');

                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', fontFamily: 'var(--font-mono)', textAlign: role === 'user' ? 'right' : 'left' }}>
                      {role === 'user' ? 'USER' : 'JARVIS'} {timestamp ? `// ${new Date(timestamp).toLocaleTimeString()}` : ''}
                    </div>
                    <div
                      style={{
                        background: role === 'user' ? 'var(--accent-cyan-dim)' : 'var(--bg-tertiary)',
                        border: `1px solid ${role === 'user' ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        color: isError ? 'var(--status-offline)' : 'var(--text-primary)',
                        lineHeight: 1.5,
                      }}
                    >
                      {role === 'user' ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
                      ) : (
                        <MarkdownRenderer
                          content={content}
                          onRunCode={(code) => {
                            setInput(code);
                          }}
                        />
                      )}
                    </div>
                    {taskId && showTaskCard && (
                      <div
                        style={{
                          marginTop: '8px',
                          background: 'rgba(10,12,16,0.5)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <CheckSquare size={15} className="text-cyan" />
                          <div>
                            <div style={{ fontSize: '0.8rem' }}>Task Execution</div>
                            <div className="text-muted font-mono" style={{ fontSize: '0.68rem' }}>{taskId}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="font-mono text-cyan" style={{ fontSize: '0.75rem' }}>{getTaskStatus(taskId)}</div>
                          <Link
                            to={`/tasks?id=${taskId}`}
                            style={{
                              background: 'var(--bg-secondary)',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              textDecoration: 'none',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            VIEW
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          )}

          {/* INTERACTIVE HUMAN APPROVAL BANNER IN CHAT */}
          {pendingApprovals && pendingApprovals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
              {pendingApprovals.map((appr: any) => (
                <div
                  key={appr.id}
                  style={{
                    background: 'rgba(255, 190, 0, 0.08)',
                    border: '1px solid rgba(255, 190, 0, 0.4)',
                    borderRadius: '8px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: '0 4px 16px rgba(255, 190, 0, 0.12)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <ShieldAlert size={20} color="#ffbe00" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffbe00', marginBottom: '2px' }}>
                        AUTHORIZATION REQUIRED
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {appr.reason || appr.action || 'An execution action requires your authorization.'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        Action: {appr.action} | Target: {appr.target || 'Workspace'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleDenyAction(appr.id)}
                      style={{
                        background: 'rgba(255,60,60,0.15)',
                        border: '1px solid rgba(255,60,60,0.3)',
                        color: '#ff4d4d',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <X size={12} /> Reject
                    </button>
                    <button
                      onClick={() => handleApproveAction(appr.id)}
                      style={{
                        background: 'linear-gradient(135deg, #00f5a0 0%, #00d2ff 100%)',
                        border: 'none',
                        color: '#00251a',
                        padding: '6px 16px',
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
                      <Check size={14} /> APPROVE & RUN
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* GATE 1: PHASED PROJECT PLAN REVIEW CARD */}
          {activeOrchJob && activeOrchJob.status === 'AWAITING_PLAN_APPROVAL' && activeOrchJob.projectPlan && (
            <div
              style={{
                marginTop: '12px',
                background: 'linear-gradient(180deg, rgba(13, 20, 36, 0.95) 0%, rgba(8, 12, 22, 0.98) 100%)',
                border: '1px solid #00d2ff',
                borderRadius: '10px',
                padding: '20px',
                boxShadow: '0 6px 24px rgba(0, 210, 255, 0.15)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                    <Layers size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: 700, letterSpacing: '0.8px' }}>
                      GATE 1 • PHASED PROJECT PLAN & ARCHITECTURAL REVIEW
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      {activeOrchJob.projectPlan.title}
                    </div>
                  </div>
                </div>
                <span className="badge" style={{ background: 'rgba(255, 190, 0, 0.15)', color: '#ffbe00', fontSize: '10px', fontWeight: 600 }}>
                  AWAITING YOUR APPROVAL
                </span>
              </div>

              {/* Summary & Architectural Review */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '11.5px', lineHeight: 1.5 }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--accent-cyan)' }}>Architecture Strategy: </strong>
                  {activeOrchJob.projectPlan.architecturalReview || activeOrchJob.projectPlan.summary}
                </div>
                {activeOrchJob.projectPlan.technicalDecisions && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {activeOrchJob.projectPlan.technicalDecisions.map((decision: string, idx: number) => (
                      <span key={idx} style={{ background: 'rgba(0, 210, 255, 0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(0, 210, 255, 0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>
                        ✓ {decision}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Phased Breakdown */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  IMPLEMENTATION PHASES ({activeOrchJob.projectPlan.phases?.length || 0})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeOrchJob.projectPlan.phases?.map((phase: any) => {
                    const isExpanded = expandedPhase === phase.phaseNumber;
                    return (
                      <div
                        key={phase.phaseNumber}
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '6px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          onClick={() => setExpandedPhase(isExpanded ? null : phase.phaseNumber)}
                          style={{
                            padding: '10px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: 'rgba(0, 210, 255, 0.2)', color: 'var(--accent-cyan)', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>
                              PHASE {phase.phaseNumber}
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#f0f6fc' }}>
                              {phase.title}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {phase.tasks?.length || 0} tasks
                            </span>
                            {isExpanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: '0 14px 12px 14px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            <div style={{ marginTop: '8px', marginBottom: '8px', color: '#c9d1d9' }}>{phase.description}</div>
                            {phase.tasks && phase.tasks.length > 0 && (
                              <div style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '4px' }}>TASKS:</div>
                                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                  {phase.tasks.map((t: string, i: number) => (
                                    <li key={i} style={{ marginBottom: '2px' }}>{t}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {phase.deliverables && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                <strong>Deliverables:</strong> {phase.deliverables.join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
                <button
                  onClick={handleRejectPlan}
                  style={{
                    background: 'rgba(255, 60, 60, 0.15)',
                    border: '1px solid rgba(255, 60, 60, 0.3)',
                    color: '#ff4d4d',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <X size={14} /> Reject Plan
                </button>
                <button
                  onClick={handleApprovePlan}
                  style={{
                    background: 'linear-gradient(135deg, #00d2ff 0%, #0072ff 100%)',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 20px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 12px rgba(0, 210, 255, 0.3)',
                  }}
                >
                  <Check size={14} /> APPROVE PLAN & GENERATE PROMPTS
                </button>
              </div>
            </div>
          )}

          {/* GATE 2: PROMPT SPECIFICATION & BRIEF REPORT CARD */}
          {activeOrchJob && activeOrchJob.status === 'AWAITING_APPROVAL' && activeOrchJob.engineeredPrompt && (
            <div
              style={{
                marginTop: '12px',
                background: 'linear-gradient(180deg, rgba(20, 24, 15, 0.95) 0%, rgba(12, 16, 10, 0.98) 100%)',
                border: '1px solid #00f5a0',
                borderRadius: '10px',
                padding: '20px',
                boxShadow: '0 6px 24px rgba(0, 245, 160, 0.18)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(0, 245, 160, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00f5a0' }}>
                    <FileCode size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#00f5a0', fontWeight: 700, letterSpacing: '0.8px' }}>
                      GATE 2 • PROMPT REPORT & TERMINAL LAUNCH AUTHORIZATION
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      {activeOrchJob.engineeredPrompt.title}
                    </div>
                  </div>
                </div>
                <span className="badge" style={{ background: 'rgba(0, 245, 160, 0.15)', color: '#00f5a0', fontSize: '10px', fontWeight: 700 }}>
                  AWAITING TERMINAL DISPATCH
                </span>
              </div>

              {/* BRIEF REPORT OF THE PROMPT (WHAT IT DOES) */}
              <div
                style={{
                  background: 'rgba(0, 245, 160, 0.06)',
                  border: '1px solid rgba(0, 245, 160, 0.25)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#00f5a0', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={13} /> BRIEF PROMPT REPORT: WHAT IT DOES
                </div>
                <div style={{ fontSize: '12px', color: '#e6edf3', lineHeight: 1.5, marginBottom: '10px' }}>
                  {activeOrchJob.engineeredPrompt.report?.whatItDoes ||
                    `This engineered prompt instructs OpenCode to implement the approved project blueprint, targeting ${activeOrchJob.engineeredPrompt.targetFiles?.join(', ') || 'the workspace'}.`}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Target Files Touched:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {activeOrchJob.engineeredPrompt.targetFiles?.slice(0, 5).map((f: string, i: number) => (
                        <span key={i} style={{ background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', color: '#8be9fd', fontSize: '10px' }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Validation Command:</span>
                    <span style={{ fontFamily: 'monospace', color: '#00f5a0', background: 'rgba(0,0,0,0.4)', padding: '3px 8px', borderRadius: '4px', fontSize: '10.5px' }}>
                      {activeOrchJob.engineeredPrompt.verificationCommand || 'npm test'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Collapsible Full Prompt Text */}
              <div style={{ marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowPromptDetails(!showPromptDetails)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                  }}
                >
                  {showPromptDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {showPromptDetails ? 'Hide full prompt text' : 'View full prompt text that will be sent to OpenCode'}
                </button>

                {showPromptDetails && (
                  <pre
                    style={{
                      marginTop: '8px',
                      background: '#070a12',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '6px',
                      padding: '12px',
                      fontSize: '10.5px',
                      fontFamily: '"Fira Code", monospace',
                      color: '#8be9fd',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {activeOrchJob.engineeredPrompt.promptText}
                  </pre>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
                <button
                  onClick={handleRejectPrompt}
                  style={{
                    background: 'rgba(255, 60, 60, 0.15)',
                    border: '1px solid rgba(255, 60, 60, 0.3)',
                    color: '#ff4d4d',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <X size={14} /> Reject Prompt
                </button>
                <button
                  onClick={handleApprovePrompt}
                  style={{
                    background: 'linear-gradient(135deg, #00f5a0 0%, #00d2ff 100%)',
                    border: 'none',
                    color: '#00251a',
                    padding: '8px 22px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 14px rgba(0, 245, 160, 0.4)',
                  }}
                >
                  <Play size={14} fill="#00251a" /> AUTHORIZE & LAUNCH TERMINAL ({activeOrchJob.engine?.toUpperCase() || 'OPENCODE'})
                </button>
              </div>
            </div>
          )}

          {/* EMBEDDED LIVE OPENCODE TERMINAL (ONLY VISIBLE ONCE APPROVED & RUNNING) */}
          {activeOrchJob && (activeOrchJob.status === 'DEVELOPING' || activeOrchJob.status === 'COMPLETED' || activeOrchJob.status === 'FAILED') && (
            <div
              style={{
                marginTop: '10px',
                background: '#070a12',
                border: activeOrchJob.status === 'DEVELOPING' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              {/* Terminal Header */}
              <div
                style={{
                  background: '#0d131f',
                  padding: '8px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={14} className="text-cyan" />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    OPENCODE LIVE TERMINAL: {activeOrchJob.order?.orderText?.slice(0, 40) || 'Task'}
                  </span>
                  {activeOrchJob.status === 'DEVELOPING' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: '#00ffaa', background: 'rgba(0,255,170,0.1)', padding: '2px 6px', borderRadius: '8px', fontWeight: 600 }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00ffaa' }} />
                      RUNNING IN REAL TERMINAL
                    </span>
                  ) : activeOrchJob.status === 'COMPLETED' ? (
                    <span style={{ fontSize: '9px', color: '#00ffaa', background: 'rgba(0,255,170,0.1)', padding: '2px 6px', borderRadius: '8px', fontWeight: 600 }}>
                      COMPLETED
                    </span>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Link
                    to="/orchestrator"
                    style={{
                      fontSize: '10px',
                      color: 'var(--accent-cyan)',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Open Full Orchestrator <ExternalLink size={10} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setActiveOrchJob(null)}
                    title="Dismiss Orchestrator Card"
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: 'var(--text-muted)',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <X size={11} /> Dismiss
                  </button>
                </div>
              </div>

              {/* Terminal Logs Stream */}
              <div
                ref={terminalRef}
                style={{
                  padding: '12px 14px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  fontFamily: '"Fira Code", monospace, "Courier New"',
                  fontSize: '10.5px',
                  lineHeight: 1.5,
                  color: '#8be9fd',
                }}
              >
                {(!activeOrchJob.executionLogs || activeOrchJob.executionLogs.length === 0) ? (
                  <div style={{ color: 'var(--text-muted)' }}>[Initializing OpenCode session in external terminal...]</div>
                ) : (
                  <>
                    {activeOrchJob.executionLogs.map((log: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          color: log.stream === 'stderr' ? '#ff5555' : log.stream === 'system' ? 'var(--accent-cyan)' : '#f8f8f2',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {log.chunk}
                      </div>
                    ))}
                    {activeOrchJob.status === 'DEVELOPING' && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span style={{ color: 'var(--accent-cyan)' }}>&gt;</span>
                        <span style={{ display: 'inline-block', width: '6px', height: '12px', background: '#00f5a0' }} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {isLoading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)' }}>
              <Loader size={16} className="spin" />
              <span className="font-mono" style={{ fontSize: '0.8rem' }}>Processing directive...</span>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(false);
                  setSystemState('IDLE');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  marginLeft: '8px',
                }}
              >
                (Cancel / Unlock)
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <input
            type="text"
            placeholder={isCodingMode ? 'Enter project directive (e.g. Build an authentication service)...' : 'Transmit directive or question...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            style={{
              flex: 1,
              background: 'var(--bg-tertiary)',
              border: isCodingMode ? '1px solid #00f5a0' : '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '0.95rem',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              opacity: isLoading ? 0.5 : 1,
            }}
          />
          <VoiceControl />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              background: isCodingMode ? 'linear-gradient(135deg, #00f5a0 0%, #00d2ff 100%)' : 'var(--accent-cyan-dim)',
              color: isCodingMode ? '#00251a' : 'var(--accent-cyan)',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${isCodingMode ? '#00f5a0' : 'var(--accent-cyan)'}`,
              opacity: (isLoading || !input.trim()) ? 0.5 : 1,
              cursor: (isLoading || !input.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
