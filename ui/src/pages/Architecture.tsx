import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useJarvisStore } from '../store/jarvisStore';
import { SynapticNeuralGraph } from '../components/Architecture/SynapticNeuralGraph';
import {
  Workflow,
  Cpu,
  Shield,
  Brain,
  Bot,
  Zap,
  Database,
  Radio,
  Play,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Clock,
  Smartphone,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Lock,
} from 'lucide-react';

interface TreeNode {
  id: string;
  name: string;
  subtitle: string;
  tier: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  iconType: string;
  description: string;
  tech: string;
  sourceFile: string;
  inputs: string[];
  outputs: string[];
  capabilities: string[];
}

const TREE_NODES: TreeNode[] = [
  // Level 0: Root Orchestrator
  {
    id: 'root-jarvis',
    name: 'JARVIS 2.0',
    subtitle: 'Autonomous AI Operating System',
    tier: 'ROOT ORCHESTRATOR',
    x: 500,
    y: 50,
    w: 220,
    h: 56,
    color: '#00e5ff',
    iconType: 'workflow',
    description: 'Central root authority coordinating the distributed client ecosystem, core backend runtime, and autonomous agents.',
    tech: 'TypeScript, Node.js 22+, EventBus',
    sourceFile: 'src/index.ts',
    inputs: ['Sensory Events', 'Client Payloads', 'System Signals'],
    outputs: ['Orchestration Directives', 'State Broadcasts', 'Execution Graph'],
    capabilities: ['Autonomous task lifecycle', 'Unified event dispatching', 'Zero-cost architecture enforcement'],
  },

  // Level 1: Left Branch - Android Client
  {
    id: 'android-client',
    name: 'Android Client',
    subtitle: '(Compose/M3/MVI)',
    tier: 'MOBILE CLIENT',
    x: 230,
    y: 155,
    w: 230,
    h: 58,
    color: '#00ffc8',
    iconType: 'smartphone',
    description: 'Native Android handheld client built with Jetpack Compose M3 and MVI architecture for remote voice, gestures, and controls.',
    tech: 'Kotlin, Jetpack Compose, Material 3, MVI',
    sourceFile: 'android/app/src/main/java/com/jarvis/companion/MainActivity.kt',
    inputs: ['User Voice Input', 'Touch Commands', 'Biometric Auth'],
    outputs: ['HTTP REST Requests', 'WebSocket Telemetry Frames'],
    capabilities: ['Handheld volume/media/lock controls', 'Live host screen snapshot viewer', 'Offline token storage'],
  },

  // Level 1: Right Branch - Backend Runtime
  {
    id: 'backend-runtime',
    name: 'Backend Runtime',
    subtitle: '(Node 24 / SQLite / TS)',
    tier: 'CORE RUNTIME',
    x: 770,
    y: 155,
    w: 250,
    h: 58,
    color: '#00e5ff',
    iconType: 'cpu',
    description: 'High-performance Node.js runtime with SQLite WAL engine, background job scheduler, and process supervisor.',
    tech: 'Node.js 22+, better-sqlite3 (WAL), TypeScript, Express 5',
    sourceFile: 'src/runtime/runtime.ts',
    inputs: ['REST API Requests', 'WebSocket Inbound Frames', 'Scheduled Cron Triggers'],
    outputs: ['Sub-second Event Stream', 'ACID Database Transactions', 'Telemetry State'],
    capabilities: ['WAL concurrent read/write', 'Scheduled cron job engine', 'Process supervision'],
  },

  // Level 2: Android Client Sub-branches (REST, WebSocket, Secure Storage)
  {
    id: 'client-rest',
    name: 'REST',
    subtitle: 'HTTP/HTTPS Commands',
    tier: 'CLIENT LINK',
    x: 100,
    y: 260,
    w: 110,
    h: 48,
    color: '#00ffc8',
    iconType: 'radio',
    description: 'Standardized HTTP client delivering paired commands, device registration, and screen capture requests.',
    tech: 'Fetch API, Keep-Alive Pooling',
    sourceFile: 'ui/src/api/client.ts',
    inputs: ['JSON Action Payloads'],
    outputs: ['HTTP POST / GET to :8787'],
    capabilities: ['Automatic retry with backoff', 'Dynamic LAN host detection', 'Bearer auth injection'],
  },
  {
    id: 'client-ws',
    name: 'WebSocket',
    subtitle: 'Sub-ms Stream',
    tier: 'CLIENT LINK',
    x: 230,
    y: 260,
    w: 120,
    h: 48,
    color: '#00ffc8',
    iconType: 'zap',
    description: 'Persistent duplex channel streaming agent thoughts, task progress, and real-time audio waveforms.',
    tech: 'Native WebSocket, JSON Framing',
    sourceFile: 'ui/src/api/client.ts',
    inputs: ['Server Broadcast Events'],
    outputs: ['Live UI State Updates', 'Audio Playback'],
    capabilities: ['Auto-reconnect loop', 'Heartbeat ping-pong', 'Zero-latency thought updates'],
  },
  {
    id: 'client-storage',
    name: 'Secure Storage',
    subtitle: 'Encrypted Keystore',
    tier: 'CLIENT SECURITY',
    x: 360,
    y: 260,
    w: 120,
    h: 48,
    color: '#00ffc8',
    iconType: 'lock',
    description: 'Hardware-backed encrypted storage holding signed device pairing tokens, keys, and user settings.',
    tech: 'Android EncryptedSharedPreferences / Web Crypto',
    sourceFile: 'ui/src/pages/RemoteCompanion.tsx',
    inputs: ['Device Tokens', 'Pairing Keys'],
    outputs: ['Authorized Headers'],
    capabilities: ['Instant token rotation', 'Zero plain-text credential leaks'],
  },

  // Level 2: Backend Runtime Sub-branches (Brain, Runtime, API)
  {
    id: 'backend-brain',
    name: 'Brain',
    subtitle: 'Cognitive Engine',
    tier: 'COGNITIVE LAYER',
    x: 610,
    y: 260,
    w: 120,
    h: 48,
    color: '#ffd600',
    iconType: 'brain',
    description: 'Cognitive reasoning hub evaluating intent, decomposing goals, and coordinating multi-agent execution.',
    tech: 'IntentClassifier, ContextEngine, OODA Loop',
    sourceFile: 'src/brain/brain.ts',
    inputs: ['Natural Language Prompts', 'Context History'],
    outputs: ['Execution Plans', 'Tool Requirements'],
    capabilities: ['Fast-path heuristic routing', 'Context compaction', 'Multi-turn memory integration'],
  },
  {
    id: 'backend-supervisor',
    name: 'Runtime',
    subtitle: 'Lifecycle & Scheduler',
    tier: 'RUNTIME CORE',
    x: 770,
    y: 260,
    w: 120,
    h: 48,
    color: '#00e5ff',
    iconType: 'cpu',
    description: 'Supervises active tasks, handles graceful shutdowns, manages cron schedules, and aggregates telemetry.',
    tech: 'Scheduler, JobQueue, Telemetry Collector',
    sourceFile: 'src/core/engine.ts',
    inputs: ['System Signals', 'Queued Tasks'],
    outputs: ['Worker Dispatches', 'Health Telemetry'],
    capabilities: ['Task retry queue', 'Graceful drain shutdown', 'Resource monitoring'],
  },
  {
    id: 'backend-api',
    name: 'API',
    subtitle: 'Gateway Endpoints',
    tier: 'GATEWAY',
    x: 930,
    y: 260,
    w: 120,
    h: 48,
    color: '#ff3366',
    iconType: 'radio',
    description: 'RESTful and WebSocket API gateway exposing device management, task execution, and system diagnostics.',
    tech: 'Express 5, WebSocket Server, Rate Limiter',
    sourceFile: 'src/api/server.ts',
    inputs: ['Incoming Client Packets'],
    outputs: ['API Responses', 'Event Dispatches'],
    capabilities: ['Sub-millisecond routing', 'CORS and helmet hardening', 'Dynamic route registration'],
  },

  // Level 3: Beneath API -> Auth/Security
  {
    id: 'backend-auth',
    name: 'Auth/Security',
    subtitle: 'Token Vault & Guard',
    tier: 'PERIMETER SECURITY',
    x: 930,
    y: 360,
    w: 130,
    h: 48,
    color: '#ff3366',
    iconType: 'shield',
    description: 'Hardened security perimeter enforcing HMAC/SHA-256 pairing PIN verification, rate limiting, and RBAC.',
    tech: 'Express 5, Node Crypto, Token Bucket Limiter',
    sourceFile: 'src/api/auth/service.ts',
    inputs: ['Pairing Codes', 'Bearer Tokens'],
    outputs: ['JWT Access Tokens', 'Authorized Context'],
    capabilities: ['15-minute PIN TTL', 'Hardware fingerprinting', 'Instant revocation'],
  },

  // Level 3: Beneath Brain -> Memory & Planning
  {
    id: 'brain-memory',
    name: 'Memory',
    subtitle: 'Hybrid Vector + FTS5',
    tier: 'PERSISTENT RECALL',
    x: 530,
    y: 360,
    w: 120,
    h: 48,
    color: '#ffd600',
    iconType: 'database',
    description: 'Dual-layer long-term memory combining SQLite Full-Text Search (FTS5) with semantic vector embeddings.',
    tech: 'SQLite FTS5, Vector Search, MemoryRepository',
    sourceFile: 'src/brain/memory.ts',
    inputs: ['Search Queries', 'Session Transcripts'],
    outputs: ['Relevant Context Snippets', 'Past Decisions'],
    capabilities: ['Token-level keyword matching', 'Cross-session recall', 'Importance decay scoring'],
  },
  {
    id: 'brain-planning',
    name: 'Planning',
    subtitle: 'Task Decomposition',
    tier: 'STRATEGIC REASONING',
    x: 690,
    y: 360,
    w: 120,
    h: 48,
    color: '#ffd600',
    iconType: 'workflow',
    description: 'Breaks complex instructions into sequential sub-tasks with dependency graphs and verification checkpoints.',
    tech: 'TaskPlanner, OODA Verification Engine',
    sourceFile: 'src/orchestration/planner.ts',
    inputs: ['User Instructions', 'System Capabilities'],
    outputs: ['DAG Task Plan', 'Required Tools'],
    capabilities: ['Sub-task dependency tracking', 'Dynamic replanning on error', 'Human-in-the-loop approval'],
  },

  // Level 4: Agents (Merged from Memory + Planning)
  {
    id: 'tier-agents',
    name: 'Agents',
    subtitle: 'Autonomous Worker Pool',
    tier: 'AUTONOMOUS WORKERS',
    x: 610,
    y: 460,
    w: 210,
    h: 52,
    color: '#b388ff',
    iconType: 'bot',
    description: 'Fleet of specialized autonomous agents executing tasks: software engineering, Windows OS control, and deep research.',
    tech: 'AgentRegistry, AgentSelector, Specialized Handlers',
    sourceFile: 'src/core/agent-registry.ts',
    inputs: ['Assigned Task Spec', 'Scoped Permissions'],
    outputs: ['Tool Execution Requests', 'Synthesized Responses'],
    capabilities: ['Role-based task delegation', 'AST-aware code repair', 'Autonomous screen navigation'],
  },

  // Level 5: Tools
  {
    id: 'tier-tools',
    name: 'Tools',
    subtitle: 'System & Hardware Mesh',
    tier: 'EXECUTION CAPABILITIES',
    x: 610,
    y: 550,
    w: 210,
    h: 52,
    color: '#b388ff',
    iconType: 'zap',
    description: 'Secure tool execution layer providing atomic filesystem modifications, PowerShell process execution, and desktop controls.',
    tech: 'ToolRegistry, child_process, Windows User32',
    sourceFile: 'src/core/tool-registry.ts',
    inputs: ['Tool Call Arguments', 'Security Context'],
    outputs: ['Tool Execution Result', 'Stdout / Stderr'],
    capabilities: ['Atomic file diffs', 'Native Windows volume/media/lock', 'Windows GDI screen capture'],
  },

  // Level 6: Tools splits into MCP & Approval
  {
    id: 'tier-mcp',
    name: 'MCP',
    subtitle: 'Model Context Protocol',
    tier: 'EXTERNAL PROTOCOLS',
    x: 530,
    y: 645,
    w: 120,
    h: 48,
    color: '#ff4081',
    iconType: 'workflow',
    description: 'Official Model Context Protocol (MCP) client mounting external tools (such as GitHub repo, issue, and PR management).',
    tech: '@modelcontextprotocol/sdk via stdio',
    sourceFile: 'src/mcp/registry.ts',
    inputs: ['External MCP Invocations'],
    outputs: ['Mounted MCP Tool Results'],
    capabilities: ['26 external GitHub tools', 'stdio pipe communication', 'Sandboxed process execution'],
  },
  {
    id: 'tier-approval',
    name: 'Approval',
    subtitle: 'Safety & Governance',
    tier: 'SAFETY & GOVERNANCE',
    x: 690,
    y: 645,
    w: 120,
    h: 48,
    color: '#ffb800',
    iconType: 'shield',
    description: 'Security gate intercepting destructive actions (file deletion, high-privilege shell execution) until approved by the user.',
    tech: 'ApprovalManager, WebSocket Alerts',
    sourceFile: 'src/security/approval-manager.ts',
    inputs: ['High-Risk Action Requests'],
    outputs: ['Approved / Denied Signal'],
    capabilities: ['Human-in-the-loop review', 'Diff preview before write', 'Audit trail logging'],
  },

  // Level 7: MCP & Approval merge into Verification
  {
    id: 'tier-verification',
    name: 'Verification',
    subtitle: 'OODA Loop & Self-Correction',
    tier: 'QUALITY ASSURANCE',
    x: 610,
    y: 740,
    w: 210,
    h: 52,
    color: '#00ffc8',
    iconType: 'check-circle',
    description: 'Validates execution output against initial intent: checks compiler output, tests exit codes, and replans if errors are detected.',
    tech: 'VerificationEngine, TypeScript Diagnoser',
    sourceFile: 'src/orchestration/verification.ts',
    inputs: ['Execution Results', 'Goal Specification'],
    outputs: ['Success Confirmation', 'Replan Directives'],
    capabilities: ['Automated test suite execution', 'Compilation error feedback loop', 'Zero hallucinated completions'],
  },

  // Level 8: Model Router
  {
    id: 'tier-model-router',
    name: 'Model Router',
    subtitle: 'Capability-Aware ($0 Constraint)',
    tier: 'AI ORCHESTRATION',
    x: 610,
    y: 830,
    w: 220,
    h: 52,
    color: '#00e5ff',
    iconType: 'cpu',
    description: 'Dynamically routes agent prompts to the best free AI model based on context size, vision, tools, and latency with zero cost.',
    tech: 'ModelRouter, ModelRegistry, 429 Cooldown',
    sourceFile: 'src/providers/router.ts',
    inputs: ['Task Prompt', 'Capability Requirements (Vision, Tools)'],
    outputs: ['Winning AI Model', 'Ordered Fallback Chain'],
    capabilities: ['Strict $0 zero-cost enforcement', '429 rate-limit backoff recovery', 'Air-gapped local fallback'],
  },

  // Level 9: Model Router splits into Local AI & Free AI
  {
    id: 'tier-local-ai',
    name: 'Local AI',
    subtitle: '(Ollama)',
    tier: 'AIR-GAPPED INFERENCE',
    x: 470,
    y: 930,
    w: 190,
    h: 56,
    color: '#00ffc8',
    iconType: 'cpu',
    description: 'On-device private neural execution on local GPU/CPU ensuring 100% offline autonomy without cloud data egress.',
    tech: 'Ollama REST Server, Local Tensor Execution',
    sourceFile: 'src/providers/ollama.ts',
    inputs: ['Private Prompts', 'Local Codebases'],
    outputs: ['Air-Gapped Text / Code Stream'],
    capabilities: ['100% offline privacy', 'Zero cloud egress', 'Air-gapped coding assistance'],
  },
  {
    id: 'tier-free-ai',
    name: 'Free AI',
    subtitle: '(Groq/HF/OpenRouter)',
    tier: 'HIGH-SPEED ZERO-COST',
    x: 750,
    y: 930,
    w: 240,
    h: 56,
    color: '#00e5ff',
    iconType: 'sparkles',
    description: 'Free-tier cloud models: Gemini 3.5 Flash (1M tokens, vision, STT/TTS), Groq LPU (500 tok/s), and OpenRouter free models.',
    tech: 'Google Gemini v1beta, Groq LPU, OpenRouter Free',
    sourceFile: 'src/providers/gemini.ts',
    inputs: ['Multimodal Prompts', 'Screen Pixels', 'Audio Buffers'],
    outputs: ['Sub-second Streamed Tokens', 'Synthesized Speech Audio'],
    capabilities: ['1M token context window', 'Zero-latency sub-second inference', 'Multimodal speech and screen vision'],
  },
];

interface ConnectionLine {
  from: string;
  to: string;
  label?: string;
}

const CONNECTIONS: ConnectionLine[] = [
  // Level 0 -> Level 1
  { from: 'root-jarvis', to: 'android-client' },
  { from: 'root-jarvis', to: 'backend-runtime' },

  // Android Client -> Sub-branches
  { from: 'android-client', to: 'client-rest' },
  { from: 'android-client', to: 'client-ws' },
  { from: 'android-client', to: 'client-storage' },

  // Backend Runtime -> Sub-branches
  { from: 'backend-runtime', to: 'backend-brain' },
  { from: 'backend-runtime', to: 'backend-supervisor' },
  { from: 'backend-runtime', to: 'backend-api' },

  // API -> Auth/Security
  { from: 'backend-api', to: 'backend-auth' },

  // Brain -> Memory & Planning
  { from: 'backend-brain', to: 'brain-memory' },
  { from: 'backend-brain', to: 'brain-planning' },

  // Memory & Planning -> Agents
  { from: 'brain-memory', to: 'tier-agents' },
  { from: 'brain-planning', to: 'tier-agents' },

  // Agents -> Tools
  { from: 'tier-agents', to: 'tier-tools' },

  // Tools -> MCP & Approval
  { from: 'tier-tools', to: 'tier-mcp' },
  { from: 'tier-tools', to: 'tier-approval' },

  // MCP & Approval -> Verification
  { from: 'tier-mcp', to: 'tier-verification' },
  { from: 'tier-approval', to: 'tier-verification' },

  // Verification -> Model Router
  { from: 'tier-verification', to: 'tier-model-router' },

  // Model Router -> Local AI & Free AI
  { from: 'tier-model-router', to: 'tier-local-ai' },
  { from: 'tier-model-router', to: 'tier-free-ai' },
];

export const Architecture: React.FC = () => {
  const { wsConnected, systemState } = useJarvisStore();
  const [viewMode, setViewMode] = useState<'neural' | 'tree'>('neural');
  const [selectedNode, setSelectedNode] = useState<TreeNode>(TREE_NODES[0]);
  const [activeSimulation, setActiveSimulation] = useState<boolean>(false);
  const [activeNodeIndex, setActiveNodeIndex] = useState<number>(-1);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [runtimeTelemetry, setRuntimeTelemetry] = useState<any>(null);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const res = await api.get('/runtime/status');
        if (res) setRuntimeTelemetry(res);
      } catch {
        // Fallback
      }
    };
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 6000);
    return () => clearInterval(interval);
  }, []);

  const simulationOrder = [
    'root-jarvis',
    'android-client',
    'client-rest',
    'backend-api',
    'backend-auth',
    'backend-runtime',
    'backend-brain',
    'brain-planning',
    'tier-agents',
    'tier-tools',
    'tier-approval',
    'tier-verification',
    'tier-model-router',
    'tier-free-ai',
  ];

  const handleSimulatePipeline = () => {
    if (activeSimulation) return;
    setActiveSimulation(true);
    setActiveNodeIndex(0);

    simulationOrder.forEach((nodeId, idx) => {
      setTimeout(() => {
        setActiveNodeIndex(idx);
        const node = TREE_NODES.find((n) => n.id === nodeId);
        if (node) setSelectedNode(node);

        if (idx === simulationOrder.length - 1) {
          setTimeout(() => {
            setActiveSimulation(false);
            setActiveNodeIndex(-1);
          }, 2000);
        }
      }, idx * 750);
    });
  };

  const getConnectorPath = (fromNode: TreeNode, toNode: TreeNode) => {
    const startX = fromNode.x;
    const startY = fromNode.y + fromNode.h / 2;
    const endX = toNode.x;
    const endY = toNode.y - toNode.h / 2;

    if (Math.abs(startX - endX) < 4) {
      // Direct vertical circuit line
      return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    // Orthogonal circuit step
    const midY = startY + (endY - startY) / 2;
    return `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
  };

  const renderNodeIcon = (iconType: string, color: string) => {
    switch (iconType) {
      case 'workflow':
        return <Workflow size={14} style={{ color }} />;
      case 'smartphone':
        return <Smartphone size={14} style={{ color }} />;
      case 'cpu':
        return <Cpu size={14} style={{ color }} />;
      case 'radio':
        return <Radio size={14} style={{ color }} />;
      case 'zap':
        return <Zap size={14} style={{ color }} />;
      case 'lock':
        return <Lock size={14} style={{ color }} />;
      case 'brain':
        return <Brain size={14} style={{ color }} />;
      case 'shield':
        return <Shield size={14} style={{ color }} />;
      case 'database':
        return <Database size={14} style={{ color }} />;
      case 'bot':
        return <Bot size={14} style={{ color }} />;
      case 'check-circle':
        return <CheckCircle2 size={14} style={{ color }} />;
      case 'sparkles':
        return <Sparkles size={14} style={{ color }} />;
      default:
        return <Workflow size={14} style={{ color }} />;
    }
  };

  return (
    <div
      className="page-container"
      style={{
        padding: '20px 28px',
        overflowY: 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes dashPulse {
          to {
            stroke-dashoffset: -24;
          }
        }
        @keyframes spinSlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spin {
          animation: spinSlow 2s linear infinite;
        }
      `}</style>

      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Workflow size={22} className="text-cyan" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '2px', color: '#00e5ff', margin: 0 }}>
              JARVIS 2.0 SYSTEM ARCHITECTURE TOPOLOGY
            </h1>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Interactive flowchart diagram faithfully mapping JARVIS 2.0 components, execution pipeline, and Zero-Cost AI model router.
          </p>
        </div>

        {/* Real-time Status Chips */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
            }}
          >
            <Cpu size={13} className="text-cyan" />
            <span style={{ color: 'var(--text-muted)' }}>CORE:</span>
            <span style={{ color: '#00e5ff', fontWeight: 700 }}>{systemState}</span>
          </div>

          <div
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
            }}
          >
            <Radio size={13} style={{ color: wsConnected ? '#00e5ff' : '#ff3366' }} />
            <span style={{ color: 'var(--text-muted)' }}>STREAM:</span>
            <span style={{ color: wsConnected ? '#00e5ff' : '#ff3366', fontWeight: 700 }}>
              {wsConnected ? '8787/WS' : 'OFFLINE'}
            </span>
          </div>

          {runtimeTelemetry?.uptime !== undefined && (
            <div
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
            >
              <Clock size={13} style={{ color: '#ffd600' }} />
              <span style={{ color: 'var(--text-muted)' }}>UPTIME:</span>
              <span style={{ color: '#ffd600', fontWeight: 700 }}>
                {Math.floor(runtimeTelemetry.uptime)}s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mode A / Mode B View Switcher Bar */}
      <div
        style={{
          background: 'rgba(5, 12, 24, 0.95)',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          borderRadius: '8px',
          padding: '8px 14px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 0 20px rgba(0, 240, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              background: 'rgba(2, 6, 14, 0.9)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '6px',
              padding: '3px',
              gap: '4px',
            }}
          >
            <button
              onClick={() => setViewMode('neural')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'neural' ? 'rgba(0, 240, 255, 0.22)' : 'transparent',
                color: viewMode === 'neural' ? '#00f0ff' : 'var(--text-muted)',
                fontWeight: viewMode === 'neural' ? 800 : 500,
                fontSize: '11px',
                letterSpacing: '1px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                boxShadow: viewMode === 'neural' ? '0 0 14px rgba(0, 240, 255, 0.35)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <Brain size={14} className={viewMode === 'neural' ? 'text-cyan animate-pulse' : ''} />
              <span>MODE A // SYNAPTIC NEURAL GRAPH</span>
            </button>

            <button
              onClick={() => setViewMode('tree')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '4px',
                border: 'none',
                background: viewMode === 'tree' ? 'rgba(0, 240, 255, 0.22)' : 'transparent',
                color: viewMode === 'tree' ? '#00f0ff' : 'var(--text-muted)',
                fontWeight: viewMode === 'tree' ? 800 : 500,
                fontSize: '11px',
                letterSpacing: '1px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                boxShadow: viewMode === 'tree' ? '0 0 14px rgba(0, 240, 255, 0.35)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <Workflow size={14} />
              <span>MODE B // BLUEPRINT TREE</span>
            </button>
          </div>
        </div>

        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={13} className="text-cyan" />
          <span>
            {viewMode === 'neural'
              ? 'Active: Living 5-tier biological neural network with dynamic action potentials'
              : 'Active: Hierarchical functional flowchart with step-by-step pipeline simulation'}
          </span>
        </div>
      </div>

      {viewMode === 'neural' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SynapticNeuralGraph />
        </div>
      ) : (
        <>
          {/* Control Bar: Simulation and Zoom */}
          <div
            style={{
              background: 'rgba(5, 12, 24, 0.9)',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 0 16px rgba(0, 229, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleSimulatePipeline}
            disabled={activeSimulation}
            style={{
              padding: '7px 16px',
              borderRadius: '6px',
              background: activeSimulation ? 'rgba(0, 229, 255, 0.35)' : '#00e5ff',
              color: '#020408',
              border: 'none',
              fontWeight: 800,
              fontSize: '12px',
              letterSpacing: '1px',
              fontFamily: 'var(--font-mono)',
              cursor: activeSimulation ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 16px rgba(0, 229, 255, 0.4)',
              transition: 'all 0.2s',
            }}
          >
            <Play size={13} className={activeSimulation ? 'spin' : ''} />
            {activeSimulation
              ? `SIMULATING PIPELINE [STEP ${activeNodeIndex + 1}/${simulationOrder.length}]...`
              : 'SIMULATE FULL PIPELINE'}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Trace request journey: Client ➔ Gateway ➔ Brain ➔ Agents ➔ Verification ➔ AI Model Router
          </span>
        </div>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.65, z - 0.1))}
            style={{
              padding: '6px',
              borderRadius: '4px',
              background: 'rgba(2, 6, 14, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'center' }}>
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
            style={{
              padding: '6px',
              borderRadius: '4px',
              background: 'rgba(2, 6, 14, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            style={{
              padding: '6px',
              borderRadius: '4px',
              background: 'rgba(2, 6, 14, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Reset Zoom"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Main Split: Interactive Flowchart Canvas (Left) + Selected Node Dossier (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* LEFT: Cybernetic Flowchart Canvas */}
        <div
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.03) 0%, rgba(2, 6, 14, 0.95) 100%)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            overflow: 'auto',
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: '24px',
            boxShadow: 'inset 0 0 32px rgba(0, 0, 0, 0.8)',
          }}
        >
          <div
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
              position: 'relative',
              width: '1060px',
              height: '1030px',
              flexShrink: 0,
            }}
          >
            {/* SVG Connector Circuits */}
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            >
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {CONNECTIONS.map((conn, idx) => {
                const fromNode = TREE_NODES.find((n) => n.id === conn.from);
                const toNode = TREE_NODES.find((n) => n.id === conn.to);
                if (!fromNode || !toNode) return null;

                const pathData = getConnectorPath(fromNode, toNode);
                const isTraversed =
                  activeSimulation &&
                  selectedNode.id === toNode.id;

                return (
                  <g key={idx}>
                    {/* Underlying shadow track */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="rgba(0, 229, 255, 0.16)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Active circuit connection */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={isTraversed ? '#00ffc8' : 'rgba(0, 229, 255, 0.45)'}
                      strokeWidth={isTraversed ? '3.5' : '1.5'}
                      strokeDasharray={isTraversed ? '6,3' : 'none'}
                      strokeLinecap="round"
                      filter={isTraversed ? 'url(#glow)' : undefined}
                      style={{
                        animation: isTraversed ? 'dashPulse 0.5s linear infinite' : undefined,
                      }}
                    />

                    {/* Junction circle marker */}
                    <circle
                      cx={toNode.x}
                      cy={toNode.y - toNode.h / 2}
                      r="3.5"
                      fill={isTraversed ? '#00ffc8' : '#00e5ff'}
                      filter="url(#glow)"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Interactive Flowchart Node Cards */}
            {TREE_NODES.map((node) => {
              const isSelected = selectedNode.id === node.id;
              const isPulsing = activeSimulation && selectedNode.id === node.id;

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  style={{
                    position: 'absolute',
                    left: `${node.x - node.w / 2}px`,
                    top: `${node.y - node.h / 2}px`,
                    width: `${node.w}px`,
                    height: `${node.h}px`,
                    background: isPulsing
                      ? 'rgba(0, 229, 255, 0.35)'
                      : isSelected
                      ? 'rgba(0, 229, 255, 0.18)'
                      : 'rgba(5, 12, 24, 0.92)',
                    border: `1.5px solid ${
                      isPulsing ? '#ffffff' : isSelected ? node.color : 'rgba(0, 229, 255, 0.3)'
                    }`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    boxShadow: isPulsing
                      ? '0 0 28px rgba(0, 229, 255, 0.8), inset 0 0 12px rgba(0, 229, 255, 0.4)'
                      : isSelected
                      ? `0 0 16px ${node.color}55`
                      : '0 4px 12px rgba(0,0,0,0.6)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    transform: isPulsing ? 'scale(1.05)' : isSelected ? 'scale(1.02)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    backdropFilter: 'blur(8px)',
                    zIndex: isPulsing ? 30 : isSelected ? 20 : 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}>
                    {renderNodeIcon(node.iconType, isSelected ? node.color : 'var(--text-secondary)')}
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        color: isSelected ? node.color : '#ffffff',
                        letterSpacing: '0.8px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {node.name}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                      marginTop: '2px',
                    }}
                  >
                    {node.subtitle}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Selected Node Live Diagnostic Dossier */}
        <div
          style={{
            background: 'rgba(5, 12, 24, 0.95)',
            border: `1px solid ${selectedNode.color}66`,
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            backdropFilter: 'blur(16px)',
            boxShadow: `0 0 24px ${selectedNode.color}22`,
            overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '14px',
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: selectedNode.color,
                    fontWeight: 800,
                    letterSpacing: '1px',
                  }}
                >
                  {selectedNode.tier}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {renderNodeIcon(selectedNode.iconType, selectedNode.color)}
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                  {selectedNode.name}
                </h2>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {selectedNode.subtitle}
              </div>
            </div>

            <span
              style={{
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '12px',
                background: 'rgba(0, 255, 200, 0.15)',
                color: '#00ffc8',
                border: '1px solid #00ffc8',
              }}
            >
              OPERATIONAL
            </span>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '16px' }}>
            <span
              style={{
                display: 'block',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                marginBottom: '4px',
              }}
            >
              ARCHITECTURAL RESPONSIBILITY
            </span>
            <p style={{ fontSize: '12px', color: '#e6f8ff', lineHeight: 1.5, margin: 0 }}>
              {selectedNode.description}
            </p>
          </div>

          {/* Technology & Implementation File */}
          <div
            style={{
              background: 'rgba(2, 6, 14, 0.8)',
              borderRadius: '6px',
              padding: '12px',
              border: '1px solid var(--border-subtle)',
              marginBottom: '16px',
            }}
          >
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                CORE TECHNOLOGIES & STACK
              </span>
              <div style={{ fontSize: '11px', color: selectedNode.color, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {selectedNode.tech}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                PRIMARY SOURCE IMPLEMENTATION
              </span>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ExternalLink size={12} />
                {selectedNode.sourceFile}
              </div>
            </div>
          </div>

          {/* Input & Output Data Flow */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                INGESTED INPUTS
              </span>
              <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                {selectedNode.inputs.map((inp, i) => (
                  <li key={i}>{inp}</li>
                ))}
              </ul>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                EMITTED OUTPUTS
              </span>
              <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '11px', color: '#00ffc8' }}>
                {selectedNode.outputs.map((out, i) => (
                  <li key={i}>{out}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Key Capabilities */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
            <span
              style={{
                display: 'block',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                marginBottom: '8px',
              }}
            >
              KEY ARCHITECTURAL CAPABILITIES
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {selectedNode.capabilities.map((cap, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <CheckCircle2 size={13} style={{ color: '#00ffc8' }} />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
