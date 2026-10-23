import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Brain,
  Zap,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import { useJarvisStore } from '../../store/jarvisStore';
import { soundEffects } from '../../services/soundEffects';

// -------------------------------------------------------------
// Neural Biology & Deep Learning Data Types
// -------------------------------------------------------------
export type NeuralLayer = 'sensory' | 'cognition' | 'core' | 'agent' | 'effector';

export interface NeuronNode {
  id: string;
  name: string;
  subtitle: string;
  layer: NeuralLayer;
  layerIndex: number; // 0..4
  tier: string;
  x: number;
  y: number;
  baseRadius: number;
  color: string;
  icon: string;
  description: string;
  tech: string;
  sourceFile: string;
  inputs: string[];
  outputs: string[];
  capabilities: string[];
  status: 'ONLINE' | 'FIRING' | 'STANDBY';
  latencyMs: number;
  membranePotential: number; // -70mV (resting) to +35mV (depolarized)
  activationFunction: string;
}

export interface SynapticAxon {
  id: string;
  from: string;
  to: string;
  color?: string;
  weight: number; // 0.15 to 1.0 (synaptic strength)
  isPrimary?: boolean;
}

interface ActionPotential {
  axonId: string;
  fromId: string;
  toId: string;
  progress: number; // 0..1
  speed: number;
  color: string;
  size: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
}

interface DepolarizationWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface GlialParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
}

// -------------------------------------------------------------
// 24 Neural Nodes mapped across 5 biological layers
// -------------------------------------------------------------
const NEURAL_NODES: NeuronNode[] = [
  // --- LAYER 0: SENSORY RECEPTORS (Inputs / Receptive Field) ---
  {
    id: 'sensory-stt',
    name: 'Voice Acoustic STT',
    subtitle: 'Cochlear Audio Buffer',
    layer: 'sensory',
    layerIndex: 0,
    tier: 'SENSORY RECEPTOR',
    x: 120,
    y: 110,
    baseRadius: 26,
    color: '#00f0ff',
    icon: 'radio',
    description: 'Biological sensory acoustic parser converting human voice vibrations into real-time phoneme tokens via Gemini Cloud STT.',
    tech: 'Gemini Cloud STT, WebAudio API, 16kHz PCM Stream',
    sourceFile: 'src/voice/providers/gemini-stt.ts',
    inputs: ['Microphone Audio Stream', 'Acoustic Waveforms'],
    outputs: ['Phoneme Vectors', 'Confidence Probabilities'],
    capabilities: ['Sub-200ms acoustic latency', 'Ambient acoustic cancellation', 'Prosody extraction'],
    status: 'ONLINE',
    latencyMs: 142,
    membranePotential: -65,
    activationFunction: 'Linear / Continuous Stream'
  },
  {
    id: 'sensory-gesture',
    name: 'Spatial Vision Cam',
    subtitle: 'MediaPipe Retina Field',
    layer: 'sensory',
    layerIndex: 0,
    tier: 'SENSORY RECEPTOR',
    x: 120,
    y: 235,
    baseRadius: 26,
    color: '#00ffcc',
    icon: 'sparkles',
    description: 'Touchless spatial vision mapping 21-landmark skeletal hand vectors into 3D rotational coordinates.',
    tech: 'MediaPipe Hands, WebGL2 Tensor Pipeline',
    sourceFile: 'ui/src/components/NeuralCore/GestureController.tsx',
    inputs: ['Retinal Webcam Feed (60 FPS)'],
    outputs: ['3D Spatial Vectors', 'Gesture Trigger Directives'],
    capabilities: ['Pinch-drag coordinate solving', 'Open-palm wake trigger', 'Kinematic gesture filtering'],
    status: 'ONLINE',
    latencyMs: 16,
    membranePotential: -60,
    activationFunction: 'Continuous Coordinate Normalization'
  },
  {
    id: 'sensory-android',
    name: 'Android Companion',
    subtitle: 'Peripheral Somatosensory',
    layer: 'sensory',
    layerIndex: 0,
    tier: 'SENSORY RECEPTOR',
    x: 120,
    y: 360,
    baseRadius: 26,
    color: '#00ffaa',
    icon: 'smartphone',
    description: 'Remote mobile nerve terminal streaming user touch gestures, physical button toggles, and biometric auth over LAN.',
    tech: 'Kotlin Compose, Scrcpy Bridge, MVI Pipeline',
    sourceFile: 'android/app/src/main/java/com/jarvis/companion/MainActivity.kt',
    inputs: ['Handheld Touch Coordinates', 'Companion Mic', 'Hardware Volume Keys'],
    outputs: ['Encrypted REST Frames', 'WebSocket Telemetry Packets'],
    capabilities: ['Instant QR pairing handshake', 'Sub-millisecond latency link', 'Biometric credential vault'],
    status: 'ONLINE',
    latencyMs: 4,
    membranePotential: -70,
    activationFunction: 'Event-Driven Impulse'
  },
  {
    id: 'sensory-terminal',
    name: 'CLI & API Gateway',
    subtitle: 'Synaptic Command Ingress',
    layer: 'sensory',
    layerIndex: 0,
    tier: 'SENSORY RECEPTOR',
    x: 120,
    y: 485,
    baseRadius: 26,
    color: '#38bdf8',
    icon: 'terminal',
    description: 'Primary perimeter gateway ingesting developer terminal keystrokes, REST payloads, and continuous SSE telemetry.',
    tech: 'Express 5, Node.js HTTP/2, WebSocket Core',
    sourceFile: 'src/api/server.ts',
    inputs: ['Terminal Keystrokes', 'JSON API Payloads', 'WebSocket Packets'],
    outputs: ['Validated Ingress Events', 'Client Keep-Alives'],
    capabilities: ['Token-bucket rate limiter', 'Helmet security perimeter', 'Zero-allocation SSE pipeline'],
    status: 'ONLINE',
    latencyMs: 2,
    membranePotential: -68,
    activationFunction: 'Rate-Governed Sigmoid'
  },
  {
    id: 'sensory-screen',
    name: 'Screen Vision OCR',
    subtitle: 'Desktop Optic Nerve',
    layer: 'sensory',
    layerIndex: 0,
    tier: 'SENSORY RECEPTOR',
    x: 120,
    y: 610,
    baseRadius: 24,
    color: '#00e5ff',
    icon: 'activity',
    description: 'Autonomous desktop optic scanner reading active window boundaries, visual UI elements, and screen text.',
    tech: 'DesktopScreenCapture Tool, Native Windows GDI',
    sourceFile: 'src/tools/system.ts',
    inputs: ['Raw Framebuffer Pixels (4K/1080p)', 'Window Handles'],
    outputs: ['Segmented PNG Frames', 'OCR Text Glyphs'],
    capabilities: ['Zero-leak memory buffer', 'Target window isolation', 'Multi-monitor visual spanning'],
    status: 'STANDBY',
    latencyMs: 22,
    membranePotential: -70,
    activationFunction: 'Threshold Step'
  },

  // --- LAYER 1: SYNAPTIC COGNITION & ROUTING (Hidden Layer 1) ---
  {
    id: 'cognition-intent',
    name: 'Intent Classifier',
    subtitle: 'OODA Cognitive Nucleus',
    layer: 'cognition',
    layerIndex: 1,
    tier: 'SYNAPTIC ROUTING',
    x: 370,
    y: 150,
    baseRadius: 28,
    color: '#ffd600',
    icon: 'brain',
    description: 'Central cognitive nucleus decomposing raw sensory inputs into structured Observe-Orient-Decide-Act (OODA) decisions.',
    tech: 'IntentEngine, Semantic Grammar, FastPath Heuristics',
    sourceFile: 'src/brain/brain.ts',
    inputs: ['Acoustic Transcripts', 'User Chat Tokens', 'System State Signals'],
    outputs: ['Structured Task Goals', 'Execution Modality Flags'],
    capabilities: ['Sub-millisecond heuristic bypass', 'Intent disambiguation', 'Contextual persona injection'],
    status: 'ONLINE',
    latencyMs: 12,
    membranePotential: -20, // highly active
    activationFunction: 'Softmax Intent Distribution'
  },
  {
    id: 'cognition-memory',
    name: 'Memory & Vector Recall',
    subtitle: 'Hippocampal FTS5 Vault',
    layer: 'cognition',
    layerIndex: 1,
    tier: 'SYNAPTIC ROUTING',
    x: 370,
    y: 280,
    baseRadius: 28,
    color: '#ffb800',
    icon: 'brain',
    description: 'Long-term biological memory combining SQLite FTS5 lexical matching with high-dimensional vector semantic recall.',
    tech: 'better-sqlite3 (WAL Mode), SQLite FTS5, MemoryExtractor',
    sourceFile: 'src/brain/memory/service.ts',
    inputs: ['Context Query Embeddings', 'Dialogue Fact Vectors'],
    outputs: ['Relevant Historical Snippets', 'Durable User Preferences'],
    capabilities: ['Cross-session persistent recall', 'Instant WAL commits', 'Autonomous fact distillation'],
    status: 'ONLINE',
    latencyMs: 5,
    membranePotential: -35,
    activationFunction: 'Cosine Similarity Threshold'
  },
  {
    id: 'cognition-router',
    name: 'Zero-Cost Model Router',
    subtitle: 'Neural Dispatch Synapse',
    layer: 'cognition',
    layerIndex: 1,
    tier: 'SYNAPTIC ROUTING',
    x: 370,
    y: 410,
    baseRadius: 30,
    color: '#00f0ff',
    icon: 'cpu',
    description: 'Dynamic neural routing synapse enforcing the $0 cost constraint, routing queries to Local Qwen or Cloud Gemini.',
    tech: 'ModelRouter, ModelRegistry, 429 Cooldown Governor',
    sourceFile: 'src/providers/router.ts',
    inputs: ['Cognitive Task Type', 'Privacy Mode Setting (Local/Cloud)'],
    outputs: ['Winning AI Model', 'Ordered Fallback Matrix'],
    capabilities: ['Strict $0 zero-cost validation', 'Dynamic latency scoring', 'Graceful 429 cooldown recovery'],
    status: 'ONLINE',
    latencyMs: 1,
    membranePotential: +15, // depolarized
    activationFunction: 'Capability-Weighted Argmax'
  },
  {
    id: 'cognition-security',
    name: 'Sandbox & Security Gate',
    subtitle: 'Perimeter Blood-Brain Barrier',
    layer: 'cognition',
    layerIndex: 1,
    tier: 'SYNAPTIC ROUTING',
    x: 370,
    y: 540,
    baseRadius: 26,
    color: '#ff3366',
    icon: 'shield',
    description: 'Blood-brain barrier preventing unauthorized host file modification, dangerous shell execution, or credential leaks.',
    tech: 'SecuritySandbox, HMAC/SHA-256 Vault, ApprovalGate',
    sourceFile: 'src/security/sandbox.ts',
    inputs: ['Proposed Tool Calls', 'Terminal Shell Commands'],
    outputs: ['Sanitized Execution Grants', 'Human Review Challenges'],
    capabilities: ['Dry-run impact analysis', 'Hardware-fingerprinted token vault', 'Air-gapped execution jail'],
    status: 'ONLINE',
    latencyMs: 1,
    membranePotential: -65,
    activationFunction: 'Boolean RBAC Gate'
  },

  // --- LAYER 2: NEURAL INTELLIGENCE CORES (Latent Reasoning Engines) ---
  {
    id: 'core-qwen-local',
    name: 'Ollama Qwen 3.5 8B',
    subtitle: 'On-Device Local Neural Core',
    layer: 'core',
    layerIndex: 2,
    tier: 'NEURAL CORE',
    x: 620,
    y: 175,
    baseRadius: 32,
    color: '#00ffcc',
    icon: 'cpu',
    description: '100% private, on-device neural reasoning running on local GPU tensor cores with zero data egress and $0 cost.',
    tech: 'Ollama REST Core, Qwen 3.5 8B (Q4_K_M GGUF), CUDA VRAM',
    sourceFile: 'src/providers/ollama.ts',
    inputs: ['Private Prompts', 'Local Code Files', 'Encrypted State'],
    outputs: ['Local Streamed Tokens', 'AST Refactoring Diffs'],
    capabilities: ['Complete air-gapped privacy', 'Infinite zero-cost generation', 'Hardware tensor acceleration'],
    status: 'ONLINE',
    latencyMs: 38,
    membranePotential: +30, // actively firing in local mode
    activationFunction: 'SwiGLU Non-Linearity'
  },
  {
    id: 'core-gemini-cloud',
    name: 'Google Gemini 3.5 Flash',
    subtitle: '1M Context Cloud Core',
    layer: 'core',
    layerIndex: 2,
    tier: 'NEURAL CORE',
    x: 620,
    y: 330,
    baseRadius: 32,
    color: '#00e5ff',
    icon: 'sparkles',
    description: 'High-speed cloud neural intelligence with a 1,000,000 token context window, multimodal vision, and Google AI Studio free tier.',
    tech: 'Google Gemini v1beta REST, 1M Context Window',
    sourceFile: 'src/providers/gemini.ts',
    inputs: ['Massive Code Repositories', 'Screen Pixels', 'Audio Streams'],
    outputs: ['High-Speed Streamed Tokens (120 tok/s)', 'Synthesized Audio'],
    capabilities: ['1M token context capacity', 'Zero-cost free tier (15 RPM)', 'Deep reasoning synthesis'],
    status: 'ONLINE',
    latencyMs: 420,
    membranePotential: -10,
    activationFunction: 'Multi-Head Attention (GeLU)'
  },
  {
    id: 'core-groq-lpu',
    name: 'Groq LPU Engine',
    subtitle: '500 tok/s Ultra-Fast LPU',
    layer: 'core',
    layerIndex: 2,
    tier: 'NEURAL CORE',
    x: 620,
    y: 470,
    baseRadius: 26,
    color: '#ff9100',
    icon: 'zap',
    description: 'Deterministic Language Processing Unit executing Llama-3.3 70B with ultra-low latency for instant responses.',
    tech: 'Groq LPU Architecture, OpenAI-Compatible API',
    sourceFile: 'src/providers/groq.ts',
    inputs: ['Time-Critical Queries', 'Real-time Dialogue'],
    outputs: ['Near-instantaneous Streamed Text'],
    capabilities: ['500+ tokens/sec throughput', 'Sub-100ms time-to-first-token', 'Strict free tier enforcement'],
    status: 'ONLINE',
    latencyMs: 85,
    membranePotential: -50,
    activationFunction: 'SwiGLU / LPUMatrix'
  },
  {
    id: 'core-openrouter',
    name: 'OpenRouter Free Tiers',
    subtitle: 'Distributed Backup Mesh',
    layer: 'core',
    layerIndex: 2,
    tier: 'NEURAL CORE',
    x: 620,
    y: 590,
    baseRadius: 24,
    color: '#bd00ff',
    icon: 'sparkles',
    description: 'Serverless backup fleet indexing verified `:free` open-source models with zero token charges.',
    tech: 'OpenRouter Free Model Mesh',
    sourceFile: 'src/providers/openrouter.ts',
    inputs: ['Fallback Prompts'],
    outputs: ['Redundant Completion Streams'],
    capabilities: ['Multi-provider diversity', 'Automatic outage bypass', 'Zero credit requirement'],
    status: 'STANDBY',
    latencyMs: 650,
    membranePotential: -70,
    activationFunction: 'Transformer Attention'
  },

  // --- LAYER 3: CORTICAL AGENTS (Executive Cerebral Cortex) ---
  {
    id: 'agent-general',
    name: 'General Autonomous Agent',
    subtitle: 'Primary Executive Cortex',
    layer: 'agent',
    layerIndex: 3,
    tier: 'CORTICAL AGENT',
    x: 870,
    y: 120,
    baseRadius: 28,
    color: '#00f0ff',
    icon: 'bot',
    description: 'Master autonomous coordinator executing multi-turn plans, tool calls, and high-level conversational synthesis.',
    tech: 'GeneralAgent, ReAct Decision Loop, ToolDispatcher',
    sourceFile: 'src/agents/general.ts',
    inputs: ['User Instructions', 'Context History', 'Tool Outputs'],
    outputs: ['Natural Speech Responses', 'Coordinated Action Plans'],
    capabilities: ['Multi-turn conversation', 'Autonomous tool invocation', 'Error self-recovery'],
    status: 'ONLINE',
    latencyMs: 24,
    membranePotential: -25,
    activationFunction: 'ReAct Decision Gating'
  },
  {
    id: 'agent-coding',
    name: 'Coding & Engineering Agent',
    subtitle: 'Software Synthesis Cortex',
    layer: 'agent',
    layerIndex: 3,
    tier: 'CORTICAL AGENT',
    x: 870,
    y: 245,
    baseRadius: 28,
    color: '#00ffcc',
    icon: 'bot',
    description: 'Specialized software engineer performing AST codebase diagnostics, unit testing, and unified diff editing.',
    tech: 'CodingAgent, CodeDiagnose, GitTools, TestRunner',
    sourceFile: 'src/agents/coding.ts',
    inputs: ['Bug Reports', 'Feature Specs', 'Compiler Logs'],
    outputs: ['Unified Code Diffs', 'Automated Test Reports'],
    capabilities: ['Syntactic diff verification', 'Automated compiler feedback loops', 'Branch isolation'],
    status: 'ONLINE',
    latencyMs: 32,
    membranePotential: -30,
    activationFunction: 'Diff Synthesis Softmax'
  },
  {
    id: 'agent-research',
    name: 'Deep Research Agent',
    subtitle: 'Knowledge Mining Cortex',
    layer: 'agent',
    layerIndex: 3,
    tier: 'CORTICAL AGENT',
    x: 870,
    y: 370,
    baseRadius: 26,
    color: '#ffd600',
    icon: 'brain',
    description: 'Autonomous researcher crawling docs, scraping web articles via Brave Search MCP, and summarizing findings.',
    tech: 'ResearchAgent, MCP Brave Search, WebExtractor',
    sourceFile: 'src/agents/research.ts',
    inputs: ['Research Queries', 'Documentation URLs'],
    outputs: ['Structured Fact Summaries', 'Cited Markdown Briefs'],
    capabilities: ['Multi-source cross-referencing', 'Hallucination filtering', 'Live API doc synthesis'],
    status: 'ONLINE',
    latencyMs: 45,
    membranePotential: -45,
    activationFunction: 'Relevance Scoring Sigmoid'
  },
  {
    id: 'agent-desktop',
    name: 'Desktop GUI Agent',
    subtitle: 'Autonomous OS Controller',
    layer: 'agent',
    layerIndex: 3,
    tier: 'CORTICAL AGENT',
    x: 870,
    y: 495,
    baseRadius: 26,
    color: '#ff3366',
    icon: 'activity',
    description: 'Vision-guided desktop operator calculating visual element coordinates and dispatching native mouse/keyboard clicks.',
    tech: 'DesktopAgent, VisionCoordinateSolver, NativeInputBridge',
    sourceFile: 'src/agents/desktop.ts',
    inputs: ['Screen Pixels', 'Target UI Element Descriptions'],
    outputs: ['Coordinate Clicks', 'Simulated Keystrokes'],
    capabilities: ['Visual button localization', 'Window focus management', 'Keyboard shortcut macros'],
    status: 'ONLINE',
    latencyMs: 18,
    membranePotential: -55,
    activationFunction: 'Spatial Heatmap SpatialSoftmax'
  },
  {
    id: 'agent-orchestrator',
    name: 'Project Orchestrator',
    subtitle: 'Kilo & OpenCode Pipeline',
    layer: 'agent',
    layerIndex: 3,
    tier: 'CORTICAL AGENT',
    x: 870,
    y: 620,
    baseRadius: 28,
    color: '#00ffaa',
    icon: 'sparkles',
    description: 'Phased software orchestrator breaking ambitious projects into research, phased planning, and human-gated CLI runs.',
    tech: 'OrchestrationEngine, VerificationLoop, OpenCodeBridge',
    sourceFile: 'src/orchestration/service.ts',
    inputs: ['Complex Product Concept Prompts'],
    outputs: ['Phased Execution Spec', 'Human Approval Checkpoints'],
    capabilities: ['Human-in-the-loop review gates', 'Multi-phase progress tracking', 'OpenCode terminal launch'],
    status: 'ONLINE',
    latencyMs: 28,
    membranePotential: -20,
    activationFunction: 'Phased DAG Execution'
  },

  // --- LAYER 4: MOTOR EFFECTORS (Neuromuscular Action Space) ---
  {
    id: 'effector-tts',
    name: 'Gemini Neural Voice TTS',
    subtitle: 'Speech Synthesis Effector',
    layer: 'effector',
    layerIndex: 4,
    tier: 'MOTOR EFFECTOR',
    x: 1120,
    y: 125,
    baseRadius: 28,
    color: '#00f0ff',
    icon: 'radio',
    description: 'High-fidelity neural voice generation producing JARVIS\'s characteristic calm, composed British-accent speech.',
    tech: 'Gemini TTS (Puck/Charon/Fenrir), VoiceDirector, HTML5 Audio',
    sourceFile: 'src/voice/providers/gemini-tts.ts',
    inputs: ['Synthesized Response Text', 'Voice Tone Directives'],
    outputs: ['Live PCM Audio Stream', 'Acoustic Soundwaves'],
    capabilities: ['Sub-second audio streaming', 'Automatic quota model fallbacks', 'Prosody tuning'],
    status: 'ONLINE',
    latencyMs: 280,
    membranePotential: +25, // firing speech
    activationFunction: 'WaveNet / Vocoder Synthesis'
  },
  {
    id: 'effector-shell',
    name: 'Sandboxed Shell Runner',
    subtitle: 'Host Process Actuator',
    layer: 'effector',
    layerIndex: 4,
    tier: 'MOTOR EFFECTOR',
    x: 1120,
    y: 255,
    baseRadius: 26,
    color: '#ff3366',
    icon: 'terminal',
    description: 'Sandboxed terminal execution runner executing shell commands, builds, and tests inside isolated perimeters.',
    tech: 'ShellExecutor, ChildProcess, AuditLogger',
    sourceFile: 'src/tools/shell.ts',
    inputs: ['Authorized Shell Commands', 'Environment Variables'],
    outputs: ['Process Exit Codes', 'Standard Output/Error Stream'],
    capabilities: ['Timeout auto-termination', 'Restricted path sandbox', 'Immutable audit logging'],
    status: 'ONLINE',
    latencyMs: 8,
    membranePotential: -40,
    activationFunction: 'Process Return Code'
  },
  {
    id: 'effector-scrcpy',
    name: 'Android Scrcpy Mirror',
    subtitle: 'Phone Screen & Input Tunnel',
    layer: 'effector',
    layerIndex: 4,
    tier: 'MOTOR EFFECTOR',
    x: 1120,
    y: 385,
    baseRadius: 26,
    color: '#00ffaa',
    icon: 'smartphone',
    description: 'Low-latency ADB bridge streaming Android phone display to the desktop and injecting hardware touch/key inputs.',
    tech: 'Genymobile scrcpy v4.1, ADB Tunnel, Win32 Bridge',
    sourceFile: 'src/services/android-mirror.ts',
    inputs: ['Companion Launch Directives', 'Remote Input Coordinates'],
    outputs: ['Hardware Device Actions', 'Mirrored Video Stream'],
    capabilities: ['Zero-latency H.264 video feed', 'Physical keycode simulation', 'Auto-recovery on disconnect'],
    status: 'ONLINE',
    latencyMs: 12,
    membranePotential: -35,
    activationFunction: 'Frame Interpolation'
  },
  {
    id: 'effector-ui',
    name: '3D Neural Canvas',
    subtitle: 'Electron Holographic Core',
    layer: 'effector',
    layerIndex: 4,
    tier: 'MOTOR EFFECTOR',
    x: 1120,
    y: 515,
    baseRadius: 30,
    color: '#00e5ff',
    icon: 'sparkles',
    description: 'Interactive WebGL 3D particle reactor responding with organic fluid dynamics to speech, gestures, and thought states.',
    tech: 'Three.js, WebGL2 Particle Shaders, PostProcessing Bloom',
    sourceFile: 'ui/src/components/NeuralCore/NeuralCore.tsx',
    inputs: ['Core State (IDLE/THINKING/STREAMING)', 'Hand Coordinates'],
    outputs: ['60fps Holographic HUD Render'],
    capabilities: ['Unreal-grade bloom shaders', 'Dynamic audio reactivity', 'Fluid particle repulsion'],
    status: 'ONLINE',
    latencyMs: 16,
    membranePotential: -15,
    activationFunction: 'Shader Fragment Vertex Stage'
  },
  {
    id: 'effector-notify',
    name: 'System Audio & Notifier',
    subtitle: 'Auditory & HUD Effector',
    layer: 'effector',
    layerIndex: 4,
    tier: 'MOTOR EFFECTOR',
    x: 1120,
    y: 640,
    baseRadius: 24,
    color: '#ffd600',
    icon: 'zap',
    description: 'Desktop alerts, acoustic chime triggers, and tray notifications keeping the user appraised of background jobs.',
    tech: 'NotificationService, Electron Native Notifications',
    sourceFile: 'src/services/notifications.ts',
    inputs: ['System Event Alerts', 'Completion Statuses'],
    outputs: ['Windows Toast Notifications', 'Synthesized Audio Pings'],
    capabilities: ['Priority queue filtering', 'Non-intrusive HUD toasts', 'Auditory state cues'],
    status: 'ONLINE',
    latencyMs: 3,
    membranePotential: -60,
    activationFunction: 'Auditory Pulse'
  }
];

// -------------------------------------------------------------
// Dense Synaptic Axons (High-density neural network wiring)
// -------------------------------------------------------------
const PRIMARY_SYNAPTIC_AXONS: SynapticAxon[] = [
  // Layer 0 -> Layer 1
  { id: 'ax-0-1', from: 'sensory-stt', to: 'cognition-intent', weight: 0.95, isPrimary: true },
  { id: 'ax-0-2', from: 'sensory-gesture', to: 'cognition-intent', weight: 0.85, isPrimary: true },
  { id: 'ax-0-3', from: 'sensory-android', to: 'cognition-intent', weight: 0.88, isPrimary: true },
  { id: 'ax-0-4', from: 'sensory-android', to: 'cognition-security', weight: 0.92, isPrimary: true },
  { id: 'ax-0-5', from: 'sensory-terminal', to: 'cognition-security', weight: 0.98, isPrimary: true },
  { id: 'ax-0-6', from: 'sensory-terminal', to: 'cognition-intent', weight: 0.9, isPrimary: true },
  { id: 'ax-0-7', from: 'sensory-screen', to: 'cognition-intent', weight: 0.75, isPrimary: true },

  // Layer 1 Interconnections (Synaptic Memory & Gateways)
  { id: 'ax-1-1', from: 'cognition-intent', to: 'cognition-memory', weight: 0.95, isPrimary: true },
  { id: 'ax-1-2', from: 'cognition-memory', to: 'cognition-router', weight: 0.9, isPrimary: true },
  { id: 'ax-1-3', from: 'cognition-intent', to: 'cognition-router', weight: 0.98, isPrimary: true },
  { id: 'ax-1-4', from: 'cognition-security', to: 'cognition-router', weight: 0.92, isPrimary: true },

  // Layer 1 -> Layer 2 (Router to Intelligence Cores)
  { id: 'ax-2-1', from: 'cognition-router', to: 'core-qwen-local', weight: 1.0, isPrimary: true },
  { id: 'ax-2-2', from: 'cognition-router', to: 'core-gemini-cloud', weight: 0.95, isPrimary: true },
  { id: 'ax-2-3', from: 'cognition-router', to: 'core-groq-lpu', weight: 0.75, isPrimary: true },
  { id: 'ax-2-4', from: 'cognition-router', to: 'core-openrouter', weight: 0.6, isPrimary: true },

  // Layer 2 -> Layer 3 (Intelligence Cores to Cortical Agents)
  { id: 'ax-3-1', from: 'core-qwen-local', to: 'agent-general', weight: 0.95, isPrimary: true },
  { id: 'ax-3-2', from: 'core-qwen-local', to: 'agent-coding', weight: 0.98, isPrimary: true },
  { id: 'ax-3-3', from: 'core-qwen-local', to: 'agent-desktop', weight: 0.85, isPrimary: true },
  { id: 'ax-3-4', from: 'core-gemini-cloud', to: 'agent-general', weight: 0.95, isPrimary: true },
  { id: 'ax-3-5', from: 'core-gemini-cloud', to: 'agent-research', weight: 0.92, isPrimary: true },
  { id: 'ax-3-6', from: 'core-gemini-cloud', to: 'agent-orchestrator', weight: 0.96, isPrimary: true },
  { id: 'ax-3-7', from: 'core-groq-lpu', to: 'agent-general', weight: 0.7, isPrimary: true },
  { id: 'ax-3-8', from: 'core-openrouter', to: 'agent-research', weight: 0.65, isPrimary: true },

  // Layer 3 -> Layer 4 (Cortical Agents to Motor Effectors)
  { id: 'ax-4-1', from: 'agent-general', to: 'effector-tts', weight: 0.95, isPrimary: true },
  { id: 'ax-4-2', from: 'agent-general', to: 'effector-ui', weight: 0.92, isPrimary: true },
  { id: 'ax-4-3', from: 'agent-coding', to: 'effector-shell', weight: 0.98, isPrimary: true },
  { id: 'ax-4-4', from: 'agent-coding', to: 'effector-notify', weight: 0.8, isPrimary: true },
  { id: 'ax-4-5', from: 'agent-research', to: 'effector-ui', weight: 0.85, isPrimary: true },
  { id: 'ax-4-6', from: 'agent-desktop', to: 'effector-shell', weight: 0.92, isPrimary: true },
  { id: 'ax-4-7', from: 'agent-orchestrator', to: 'effector-shell', weight: 0.95, isPrimary: true },
  { id: 'ax-4-8', from: 'agent-orchestrator', to: 'effector-notify', weight: 0.85, isPrimary: true },
  { id: 'ax-4-9', from: 'sensory-android', to: 'effector-scrcpy', weight: 0.9, isPrimary: true },
  { id: 'ax-4-10', from: 'agent-desktop', to: 'effector-ui', weight: 0.88, isPrimary: true },
];

// Dense Background Inter-Layer Synaptic Mesh (creates authentic neural plexus)
const SECONDARY_SYNAPTIC_AXONS: SynapticAxon[] = [
  { id: 'mesh-0-1', from: 'sensory-stt', to: 'cognition-memory', weight: 0.35 },
  { id: 'mesh-0-2', from: 'sensory-gesture', to: 'cognition-security', weight: 0.28 },
  { id: 'mesh-0-3', from: 'sensory-screen', to: 'cognition-security', weight: 0.32 },
  { id: 'mesh-1-1', from: 'cognition-intent', to: 'core-qwen-local', weight: 0.4 },
  { id: 'mesh-1-2', from: 'cognition-intent', to: 'core-gemini-cloud', weight: 0.42 },
  { id: 'mesh-1-3', from: 'cognition-memory', to: 'core-gemini-cloud', weight: 0.38 },
  { id: 'mesh-1-4', from: 'cognition-security', to: 'core-qwen-local', weight: 0.35 },
  { id: 'mesh-2-1', from: 'core-qwen-local', to: 'agent-research', weight: 0.42 },
  { id: 'mesh-2-2', from: 'core-qwen-local', to: 'agent-orchestrator', weight: 0.45 },
  { id: 'mesh-2-3', from: 'core-gemini-cloud', to: 'agent-coding', weight: 0.48 },
  { id: 'mesh-2-4', from: 'core-gemini-cloud', to: 'agent-desktop', weight: 0.36 },
  { id: 'mesh-2-5', from: 'core-groq-lpu', to: 'agent-coding', weight: 0.3 },
  { id: 'mesh-3-1', from: 'agent-general', to: 'effector-shell', weight: 0.35 },
  { id: 'mesh-3-2', from: 'agent-coding', to: 'effector-ui', weight: 0.4 },
  { id: 'mesh-3-3', from: 'agent-research', to: 'effector-notify', weight: 0.3 },
  { id: 'mesh-3-4', from: 'agent-desktop', to: 'effector-notify', weight: 0.25 },
  { id: 'mesh-3-5', from: 'agent-orchestrator', to: 'effector-ui', weight: 0.42 },
  { id: 'mesh-x-1', from: 'cognition-router', to: 'agent-general', weight: 0.25 },
  { id: 'mesh-x-2', from: 'cognition-memory', to: 'agent-research', weight: 0.32 },
];

const ALL_AXONS: SynapticAxon[] = [...PRIMARY_SYNAPTIC_AXONS, ...SECONDARY_SYNAPTIC_AXONS];

export const SynapticNeuralGraph: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const eegCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { systemState, modelMode } = useJarvisStore();

  // State
  const [selectedNeuron, setSelectedNeuron] = useState<NeuronNode | null>(NEURAL_NODES[7]); // Model Router
  const [hoveredNeuron, setHoveredNeuron] = useState<NeuronNode | null>(null);
  const [filterLayer, setFilterLayer] = useState<NeuralLayer | 'all'>('all');
  const [zoom, setZoom] = useState<number>(0.92);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 15 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [impulseActive, setImpulseActive] = useState<boolean>(false);
  const [firingFrequencyHz, setFiringFrequencyHz] = useState<number>(42);

  // Dynamic Action Potentials & Waves
  const potentialsRef = useRef<ActionPotential[]>([]);
  const wavesRef = useRef<DepolarizationWave[]>([]);
  const glialParticlesRef = useRef<GlialParticle[]>([]);

  // Node Map for fast coordinate lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, NeuronNode>();
    NEURAL_NODES.forEach(n => map.set(n.id, n));
    return map;
  }, []);

  // Connected node IDs for synaptic path highlighting
  const connectedIds = useMemo(() => {
    const target = hoveredNeuron || selectedNeuron;
    if (!target) return new Set<string>();

    const set = new Set<string>();
    set.add(target.id);
    ALL_AXONS.forEach(ax => {
      if (ax.from === target.id) set.add(ax.to);
      if (ax.to === target.id) set.add(ax.from);
    });
    return set;
  }, [hoveredNeuron, selectedNeuron]);

  // Initialize Glial Ambient Fluid Particles
  useEffect(() => {
    const particles: GlialParticle[] = [];
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * 1300,
        y: Math.random() * 750,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        size: 1 + Math.random() * 1.5,
        alpha: 0.1 + Math.random() * 0.25,
        baseAlpha: 0.1 + Math.random() * 0.25
      });
    }
    glialParticlesRef.current = particles;
  }, []);

  // Initialize Action Potential Packets on Axons
  useEffect(() => {
    const list: ActionPotential[] = [];
    PRIMARY_SYNAPTIC_AXONS.forEach((axon) => {
      // 2 photons per primary axon
      for (let i = 0; i < 2; i++) {
        list.push({
          axonId: axon.id,
          fromId: axon.from,
          toId: axon.to,
          progress: (i * 0.5) + Math.random() * 0.2,
          speed: 0.0035 + (axon.weight * 0.003),
          color: axon.weight > 0.9 ? '#00f0ff' : '#00ffcc',
          size: 2.2 + axon.weight * 1.5,
          trail: []
        });
      }
    });
    potentialsRef.current = list;
  }, []);

  // Trigger Depolarization Wave on a specific Neuron
  const triggerDepolarization = useCallback((x: number, y: number, color: string) => {
    wavesRef.current.push({
      x,
      y,
      radius: 8,
      maxRadius: 65,
      color,
      alpha: 0.85
    });
  }, []);

  // Trigger Network-Wide Action Potential Cascade
  const handleFireImpulse = useCallback(() => {
    soundEffects.playSynapticCascade();
    setImpulseActive(true);
    setFiringFrequencyHz(88); // Gamma burst

    // Trigger depolarization on all sensory nodes
    NEURAL_NODES.filter(n => n.layer === 'sensory').forEach(n => {
      triggerDepolarization(n.x, n.y, n.color);
    });

    // Surge photon velocity
    potentialsRef.current.forEach(p => {
      p.speed = 0.016 + Math.random() * 0.008;
      p.size = 4.5;
    });

    // Downstream wave delays
    setTimeout(() => {
      NEURAL_NODES.filter(n => n.layer === 'cognition').forEach(n => {
        triggerDepolarization(n.x, n.y, n.color);
      });
    }, 400);

    setTimeout(() => {
      const activeCore = modelMode === 'LOCAL' ? 'core-qwen-local' : 'core-gemini-cloud';
      const coreNode = nodeMap.get(activeCore);
      if (coreNode) triggerDepolarization(coreNode.x, coreNode.y, coreNode.color);
    }, 850);

    setTimeout(() => {
      NEURAL_NODES.filter(n => n.layer === 'agent').forEach(n => {
        triggerDepolarization(n.x, n.y, n.color);
      });
    }, 1300);

    setTimeout(() => {
      NEURAL_NODES.filter(n => n.layer === 'effector').forEach(n => {
        triggerDepolarization(n.x, n.y, n.color);
      });
    }, 1750);

    setTimeout(() => {
      potentialsRef.current.forEach(p => {
        const axon = PRIMARY_SYNAPTIC_AXONS.find(a => a.id === p.axonId);
        p.speed = 0.0035 + ((axon?.weight || 0.8) * 0.003);
        p.size = 2.2 + ((axon?.weight || 0.8) * 1.5);
      });
      setImpulseActive(false);
      setFiringFrequencyHz(42);
    }, 2800);
  }, [modelMode, nodeMap, triggerDepolarization]);

  // Real-time EEG Oscilloscope Mini-Canvas
  useEffect(() => {
    const canvas = eegCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let eegAnimId: number;
    let t = 0;

    const renderEEG = () => {
      t += 0.08;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background subtle grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Draw Multi-Band Synaptic Waveform (Gamma + Beta + Theta)
      ctx.beginPath();
      ctx.strokeStyle = impulseActive ? '#ffd600' : '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = impulseActive ? '#ffd600' : '#00f0ff';
      ctx.shadowBlur = 6;

      const freqMultiplier = impulseActive ? 2.5 : systemState === 'THINKING' ? 1.8 : 1.0;
      const amp = impulseActive ? h * 0.4 : systemState === 'THINKING' ? h * 0.3 : h * 0.2;

      for (let x = 0; x < w; x++) {
        const theta = (x * 0.04 * freqMultiplier) + t;
        const gamma = (x * 0.16 * freqMultiplier) + (t * 2.2);
        const noise = Math.sin(x * 0.2 + t * 4) * (amp * 0.15);
        const y = (h / 2) + Math.sin(theta) * (amp * 0.7) + Math.cos(gamma) * (amp * 0.3) + noise;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      eegAnimId = requestAnimationFrame(renderEEG);
    };

    renderEEG();
    return () => cancelAnimationFrame(eegAnimId);
  }, [impulseActive, systemState]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const render = () => {
      time += 0.025;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Deep Bio-Cybernetic Background
      ctx.fillStyle = '#02060b';
      ctx.fillRect(0, 0, width, height);

      // Organic Vignette & Radial Depth
      const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, width * 0.7);
      bgGrad.addColorStop(0, 'rgba(0, 240, 255, 0.035)');
      bgGrad.addColorStop(0.6, 'rgba(2, 6, 12, 0.9)');
      bgGrad.addColorStop(1, '#020508');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Apply Pan & Zoom Transform
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // 1. Ambient Glial / Astrocytic Micro-Particle Plexus
      const glial = glialParticlesRef.current;
      ctx.fillStyle = '#00f0ff';
      for (let i = 0; i < glial.length; i++) {
        const p = glial[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = 1300;
        if (p.x > 1300) p.x = 0;
        if (p.y < 0) p.y = 750;
        if (p.y > 750) p.y = 0;

        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Connect nearby glial particles for plexus mesh
        for (let j = i + 1; j < glial.length; j++) {
          const p2 = glial[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 75) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.035)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1.0;

      // 2. Secondary Synaptic Mesh Axons (Dense background wiring)
      SECONDARY_SYNAPTIC_AXONS.forEach(ax => {
        const from = nodeMap.get(ax.from);
        const to = nodeMap.get(ax.to);
        if (!from || !to) return;

        const isFiltered = filterLayer !== 'all' && from.layer !== filterLayer && to.layer !== filterLayer;
        if (isFiltered) return;

        const isHighlighted = connectedIds.has(from.id) && connectedIds.has(to.id);

        const cp1x = from.x + (to.x - from.x) * 0.5;
        const cp1y = from.y;
        const cp2x = from.x + (to.x - from.x) * 0.5;
        const cp2y = to.y;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, to.x, to.y);

        if (isHighlighted) {
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
          ctx.lineWidth = 1.6;
        } else {
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
          ctx.lineWidth = 0.9;
        }
        ctx.stroke();
      });

      // 3. Primary Synaptic Axons (High-weight, firing nerve fibers)
      PRIMARY_SYNAPTIC_AXONS.forEach(ax => {
        const from = nodeMap.get(ax.from);
        const to = nodeMap.get(ax.to);
        if (!from || !to) return;

        const isFiltered = filterLayer !== 'all' && from.layer !== filterLayer && to.layer !== filterLayer;
        const isHighlighted = connectedIds.has(from.id) && connectedIds.has(to.id);

        const isLocalActive = modelMode === 'LOCAL' && (from.id === 'core-qwen-local' || to.id === 'core-qwen-local');
        const isCloudActive = modelMode === 'CLOUD' && (from.id === 'core-gemini-cloud' || to.id === 'core-gemini-cloud');

        // Organic Bezier Axon with Dendritic Curve
        const cp1x = from.x + (to.x - from.x) * 0.52;
        const cp1y = from.y + Math.sin(time + ax.weight) * 3;
        const cp2x = from.x + (to.x - from.x) * 0.48;
        const cp2y = to.y - Math.cos(time + ax.weight) * 3;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, to.x, to.y);

        if (isFiltered) {
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.025)';
          ctx.lineWidth = 1;
        } else if (isHighlighted) {
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.95)';
          ctx.lineWidth = 2.8;
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 14;
        } else if (isLocalActive) {
          ctx.strokeStyle = 'rgba(0, 255, 200, 0.75)';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#00ffc8';
          ctx.shadowBlur = 10;
        } else if (isCloudActive) {
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = 10;
        } else {
          ctx.strokeStyle = `rgba(0, 240, 255, ${0.16 + (ax.weight * 0.12)})`;
          ctx.lineWidth = 1.2 + (ax.weight * 0.8);
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw Synaptic Boutons (Junction Nodes where axon terminal docks)
        const boutonX = to.x - 14;
        const boutonY = to.y;
        ctx.beginPath();
        ctx.arc(boutonX, boutonY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = isHighlighted || isLocalActive || isCloudActive ? '#00f0ff' : 'rgba(0, 240, 255, 0.4)';
        ctx.fill();
      });

      // 4. Action Potential Photons (Traveling Depolarization Pulses)
      potentialsRef.current.forEach(p => {
        const from = nodeMap.get(p.fromId);
        const to = nodeMap.get(p.toId);
        if (!from || !to) return;

        if (filterLayer !== 'all' && from.layer !== filterLayer && to.layer !== filterLayer) {
          return;
        }

        p.progress += p.speed;
        if (p.progress >= 1) {
          p.progress = 0;
          p.trail = [];
          // Trigger a micro-depolarization ripple on destination soma
          triggerDepolarization(to.x, to.y, to.color);
        }

        const t = p.progress;
        const cp1x = from.x + (to.x - from.x) * 0.52;
        const cp1y = from.y;
        const cp2x = from.x + (to.x - from.x) * 0.48;
        const cp2y = to.y;

        const cx = 3 * (cp1x - from.x);
        const bx = 3 * (cp2x - cp1x) - cx;
        const ax = to.x - from.x - cx - bx;

        const cy = 3 * (cp1y - from.y);
        const by = 3 * (cp2y - cp1y) - cy;
        const ay = to.y - from.y - cy - by;

        const x = ax * Math.pow(t, 3) + bx * Math.pow(t, 2) + cx * t + from.x;
        const y = ay * Math.pow(t, 3) + by * Math.pow(t, 2) + cy * t + from.y;

        p.trail.push({ x, y, alpha: 1.0 });
        if (p.trail.length > 8) p.trail.shift();

        // Draw Ionized Plasma Trail
        ctx.beginPath();
        for (let i = 0; i < p.trail.length; i++) {
          const pt = p.trail[i];
          const a = (i + 1) / p.trail.length;
          ctx.lineTo(pt.x, pt.y);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * a;
        }
        ctx.stroke();

        // Draw Depolarization Head Photon
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = impulseActive ? '#ffd600' : p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = impulseActive ? 16 : 9;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // 5. Depolarization Shockwave Rings
      const remainingWaves: DepolarizationWave[] = [];
      wavesRef.current.forEach(wave => {
        wave.radius += 1.8;
        wave.alpha *= 0.94;

        if (wave.radius < wave.maxRadius && wave.alpha > 0.05) {
          ctx.beginPath();
          ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
          ctx.strokeStyle = wave.color;
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = wave.alpha;
          ctx.shadowColor = wave.color;
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1.0;
          remainingWaves.push(wave);
        }
      });
      wavesRef.current = remainingWaves;

      // 6. Biological Soma Neurons (Cell Bodies with Dendrites)
      NEURAL_NODES.forEach(node => {
        const isSelected = selectedNeuron?.id === node.id;
        const isHovered = hoveredNeuron?.id === node.id;
        const isConnected = connectedIds.has(node.id);
        const isFiltered = filterLayer !== 'all' && node.layer !== filterLayer;

        const isPrimaryLocal = modelMode === 'LOCAL' && node.id === 'core-qwen-local';
        const isPrimaryCloud = modelMode === 'CLOUD' && node.id === 'core-gemini-cloud';

        // Breathing Soma Pulse
        const somaPulse = Math.sin(time * 2.5 + node.layerIndex) * 2;
        const r = node.baseRadius + (isSelected || isHovered ? 4 : 0) + (isPrimaryLocal || isPrimaryCloud ? somaPulse : 0);

        ctx.save();
        ctx.translate(node.x, node.y);

        if (isFiltered) {
          ctx.globalAlpha = 0.22;
        }

        // Draw Dendritic Filaments radiating out from Soma
        const dendriteCount = 6;
        for (let d = 0; d < dendriteCount; d++) {
          const angle = (d * (Math.PI * 2 / dendriteCount)) + (time * 0.15 * (d % 2 === 0 ? 1 : -1));
          const len = r + 9 + Math.sin(time * 3 + d) * 3;
          const dx = Math.cos(angle) * len;
          const dy = Math.sin(angle) * len;

          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * (r * 0.8), Math.sin(angle) * (r * 0.8));
          ctx.lineTo(dx, dy);
          ctx.strokeStyle = `${node.color}55`;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Dendritic Spines (tiny receptor knobs)
          ctx.beginPath();
          ctx.arc(dx, dy, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.fill();
        }

        // Outer Bio-Electric Membrane Aura (Gradient)
        const auraRadius = r + (isSelected ? 18 : isPrimaryLocal || isPrimaryCloud ? 16 : 10);
        const auraGrad = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, auraRadius);
        auraGrad.addColorStop(0, `${node.color}66`);
        auraGrad.addColorStop(0.65, `${node.color}15`);
        auraGrad.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
        ctx.fillStyle = auraGrad;
        ctx.fill();

        // Rotating Myelin Sheath / Organelle Rings
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, time + node.layerIndex, time + node.layerIndex + Math.PI * 1.4);
        ctx.strokeStyle = isSelected || isPrimaryLocal || isPrimaryCloud ? node.color : `${node.color}88`;
        ctx.lineWidth = isSelected ? 2.2 : 1.4;
        ctx.stroke();

        // Inner Cytoplasm / Nucleus Core
        const coreGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.35, node.color);
        coreGrad.addColorStop(1, '#050c16');

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = isSelected ? 22 : isConnected ? 14 : 7;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Outer Membrane Boundary
        ctx.strokeStyle = isSelected ? '#ffffff' : `${node.color}ee`;
        ctx.lineWidth = isSelected ? 2.5 : 1.6;
        ctx.stroke();

        // Active Model Badge / Depolarization Indicator
        if (isPrimaryLocal || isPrimaryCloud) {
          ctx.beginPath();
          ctx.arc(r - 2, -r + 2, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = isPrimaryLocal ? '#00ffcc' : '#00e5ff';
          ctx.shadowColor = isPrimaryLocal ? '#00ffcc' : '#00e5ff';
          ctx.shadowBlur = 9;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#02060b';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Holographic Typography Labels Below Soma
        ctx.font = isSelected ? 'bold 11px "Space Mono", monospace' : '10px "Space Mono", monospace';
        ctx.fillStyle = isSelected ? '#ffffff' : isConnected ? '#e6f8ff' : '#7fe3f5';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.name, 0, r + 13);

        ctx.font = '8px "Space Mono", monospace';
        ctx.fillStyle = `${node.color}aa`;
        ctx.fillText(node.subtitle, 0, r + 27);

        ctx.restore();
      });

      // 7. Column Biological Cortical Headers
      const layerHeaders = [
        { name: 'I. RECEPTIVE FIELD', sub: 'Sensory Transduction', x: 120, color: '#00f0ff' },
        { name: 'II. SYNAPTIC ROUTER', sub: 'Cognitive OODA Nucleus', x: 370, color: '#ffd600' },
        { name: 'III. LATENT CORES', sub: '$0 Zero-Cost Reasoning', x: 620, color: '#00ffcc' },
        { name: 'IV. CORTICAL AGENTS', sub: 'Executive Cerebral Cortex', x: 870, color: '#38bdf8' },
        { name: 'V. MOTOR EFFECTORS', sub: 'Action Space Actuators', x: 1120, color: '#00e5ff' },
      ];

      layerHeaders.forEach(col => {
        ctx.save();
        ctx.fillStyle = col.color;
        ctx.font = 'bold 10px "Space Mono", monospace';
        ctx.letterSpacing = '1.5px';
        ctx.textAlign = 'center';
        ctx.fillText(col.name, col.x, 38);

        ctx.font = '8px "Space Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillText(col.sub, col.x, 52);

        // Column vertical delimiter
        ctx.beginPath();
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = `${col.color}15`;
        ctx.lineWidth = 1;
        ctx.moveTo(col.x, 66);
        ctx.lineTo(col.x, 710);
        ctx.stroke();
        ctx.restore();
      });

      ctx.restore(); // Pan & Zoom
      ctx.restore(); // DPR

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [nodeMap, connectedIds, selectedNeuron, hoveredNeuron, filterLayer, zoom, pan, impulseActive, modelMode, triggerDepolarization]);

  // Mouse Interaction Handlers
  const getCanvasMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;
    return { x: worldX, y: worldY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    const { x, y } = getCanvasMousePos(e);

    let found: NeuronNode | null = null;
    for (const node of NEURAL_NODES) {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist <= node.baseRadius + 12) {
        found = node;
        break;
      }
    }

    setHoveredNeuron(found);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = found ? 'pointer' : isDragging ? 'grabbing' : 'grab';
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasMousePos(e);
    let found: NeuronNode | null = null;
    for (const node of NEURAL_NODES) {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist <= node.baseRadius + 12) {
        found = node;
        break;
      }
    }

    if (found) {
      soundEffects.playModeSwitch();
      setSelectedNeuron(found);
      triggerDepolarization(found.x, found.y, found.color);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom(prev => Math.min(1.8, Math.max(0.45, prev + delta)));
  };

  const resetView = () => {
    setZoom(0.92);
    setPan({ x: 30, y: 15 });
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '700px',
        background: '#02060b',
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid rgba(0, 240, 255, 0.22)',
        boxShadow: 'inset 0 0 50px rgba(0, 240, 255, 0.06)',
        display: 'flex',
      }}
    >
      {/* Canvas Viewport */}
      <div style={{ flex: 1, position: 'relative', height: '100%' }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {/* Real-time Bio-Neural EEG Oscilloscope & Telemetry Strip (Top Bar) */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '20px',
            right: selectedNeuron ? '420px' : '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(3, 8, 16, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            borderRadius: '8px',
            padding: '8px 16px',
            zIndex: 10,
            fontFamily: "'Space Mono', monospace",
            boxShadow: '0 0 24px rgba(0, 0, 0, 0.6)',
            transition: 'right 0.25s ease'
          }}
        >
          {/* Title & Pulse */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Brain size={17} className="text-cyan animate-pulse" />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#00f0ff', letterSpacing: '1.5px' }}>
                BIOLOGICAL SYNAPTIC NETWORK
              </div>
              <div style={{ fontSize: '9px', color: 'rgba(0, 240, 255, 0.6)' }}>
                {ALL_AXONS.length} Synaptic Pathways • 24 Somas • Active Oscillations
              </div>
            </div>
          </div>

          {/* Real-time Oscilloscope Canvas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '9px' }}>
              <span style={{ color: impulseActive ? '#ffd600' : '#00f0ff', fontWeight: 700 }}>
                {impulseActive ? 'GAMMA (SURGE)' : systemState === 'THINKING' ? 'BETA (COGNITION)' : 'ALPHA (STANDBY)'}
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>{firingFrequencyHz} Hz</span>
            </div>
            <div style={{
              width: '120px',
              height: '26px',
              background: 'rgba(2, 5, 10, 0.8)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <canvas ref={eegCanvasRef} width={120} height={26} style={{ display: 'block' }} />
            </div>
          </div>

          {/* Active Model Core Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '9px' }}>CORE SYNAPSE:</span>
            <span style={{
              color: modelMode === 'LOCAL' ? '#00ffcc' : '#00e5ff',
              fontWeight: 700,
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: modelMode === 'LOCAL' ? '#00ffcc' : '#00e5ff',
                boxShadow: `0 0 8px ${modelMode === 'LOCAL' ? '#00ffcc' : '#00e5ff'}`
              }} />
              {modelMode === 'LOCAL' ? 'QWEN 3.5 8B (LOCAL)' : 'GEMINI FLASH (CLOUD)'}
            </span>
          </div>

          {/* Fire Action Potential Button */}
          <button
            onClick={handleFireImpulse}
            disabled={impulseActive}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: impulseActive ? 'rgba(255, 214, 0, 0.25)' : 'rgba(0, 240, 255, 0.14)',
              border: `1px solid ${impulseActive ? '#ffd600' : 'rgba(0, 240, 255, 0.45)'}`,
              color: impulseActive ? '#ffd600' : '#00f0ff',
              padding: '5px 12px',
              borderRadius: '4px',
              fontSize: '10.5px',
              fontWeight: 800,
              cursor: impulseActive ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: impulseActive ? '0 0 16px rgba(255, 214, 0, 0.4)' : '0 0 10px rgba(0, 240, 255, 0.15)'
            }}
          >
            <Zap size={13} className={impulseActive ? 'spin' : ''} />
            <span>{impulseActive ? 'SURGING ACTION POTENTIAL...' : '⚡ FIRE SYNAPTIC CASCADE'}</span>
          </button>
        </div>

        {/* Floating Layer Filter Controls (Bottom Left) */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(3, 8, 16, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            borderRadius: '6px',
            padding: '6px 12px',
            zIndex: 10,
            fontFamily: "'Space Mono', monospace",
            fontSize: '10px',
          }}
        >
          <span style={{ color: 'rgba(0, 240, 255, 0.6)', marginRight: '4px' }}>CORTICAL LAYER:</span>
          {(['all', 'sensory', 'cognition', 'core', 'agent', 'effector'] as const).map(l => (
            <button
              key={l}
              onClick={() => setFilterLayer(l)}
              style={{
                background: filterLayer === l ? 'rgba(0, 240, 255, 0.22)' : 'transparent',
                border: filterLayer === l ? '1px solid #00f0ff' : '1px solid transparent',
                color: filterLayer === l ? '#00f0ff' : 'rgba(255, 255, 255, 0.65)',
                padding: '3px 8px',
                borderRadius: '3px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontWeight: filterLayer === l ? 700 : 400,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* View Zoom & Reset Controls */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '480px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(3, 8, 16, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            borderRadius: '6px',
            padding: '4px 8px',
            zIndex: 10,
          }}
        >
          <button
            onClick={() => setZoom(z => Math.min(1.8, z + 0.1))}
            style={{ background: 'transparent', border: 'none', color: '#00f0ff', cursor: 'pointer', padding: '4px' }}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.45, z - 0.1))}
            style={{ background: 'transparent', border: 'none', color: '#00f0ff', cursor: 'pointer', padding: '4px' }}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={resetView}
            style={{ background: 'transparent', border: 'none', color: '#00f0ff', cursor: 'pointer', padding: '4px' }}
            title="Reset View"
          >
            <RotateCcw size={14} />
          </button>
          <span style={{ fontSize: '10px', color: 'rgba(0, 240, 255, 0.7)', padding: '0 6px', fontFamily: "'Space Mono', monospace" }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Cyberpunk Holographic Neuron Dossier (Right Inspector Panel) */}
      {selectedNeuron && (
        <div
          style={{
            width: '390px',
            background: 'rgba(3, 7, 14, 0.96)',
            backdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(0, 240, 255, 0.3)',
            padding: '24px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
            fontFamily: "'Space Mono', monospace",
            zIndex: 20,
            boxShadow: '-12px 0 40px rgba(0, 0, 0, 0.75)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{
                fontSize: '10px',
                color: selectedNeuron.color,
                fontWeight: 700,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: selectedNeuron.color,
                  boxShadow: `0 0 6px ${selectedNeuron.color}`
                }} />
                {selectedNeuron.tier}
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                {selectedNeuron.name}
              </h2>
              <div style={{ fontSize: '11px', color: 'rgba(0, 240, 255, 0.7)', marginTop: '2px' }}>
                {selectedNeuron.subtitle}
              </div>
            </div>

            <div style={{
              background: 'rgba(0, 240, 255, 0.1)',
              border: `1px solid ${selectedNeuron.color}`,
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '10px',
              color: selectedNeuron.color,
              fontWeight: 700,
            }}>
              {selectedNeuron.status}
            </div>
          </div>

          {/* Biological & Deep Learning Parameters Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            background: 'rgba(0, 240, 255, 0.04)',
            border: '1px solid rgba(0, 240, 255, 0.18)',
            borderRadius: '6px',
            padding: '10px',
          }}>
            <div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>MEMBRANE POTENTIAL</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: selectedNeuron.membranePotential > -50 ? '#00ffcc' : '#38bdf8' }}>
                {selectedNeuron.membranePotential > 0 ? `+${selectedNeuron.membranePotential}` : selectedNeuron.membranePotential} mV
              </div>
            </div>
            <div>
              <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>LATENCY / SPEED</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#00f0ff' }}>
                {selectedNeuron.latencyMs} ms
              </div>
            </div>
          </div>

          {/* Activation Function */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(0, 240, 255, 0.7)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Activation Non-Linearity
            </div>
            <div style={{
              background: 'rgba(0, 240, 255, 0.05)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '11px',
              color: '#00ffcc'
            }}>
              {selectedNeuron.activationFunction}
            </div>
          </div>

          {/* Functional Scope */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(0, 240, 255, 0.7)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Biological / Cognitive Scope
            </div>
            <p style={{ fontSize: '11px', color: '#c4eef8', lineHeight: 1.6, margin: 0 }}>
              {selectedNeuron.description}
            </p>
          </div>

          {/* Implementation Anchor (Code Link) */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(0, 240, 255, 0.7)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Source Implementation Anchor
            </div>
            <div style={{
              background: 'rgba(2, 5, 10, 0.85)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '10px',
              color: '#00ffcc',
              wordBreak: 'break-all',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Terminal size={12} className="text-cyan shrink-0" />
              <span>{selectedNeuron.sourceFile}</span>
            </div>
          </div>

          {/* Technology Stack */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(0, 240, 255, 0.7)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Engineered Subsystem Stack
            </div>
            <div style={{ fontSize: '11px', color: '#ffd600', background: 'rgba(255, 214, 0, 0.05)', padding: '6px 10px', borderRadius: '4px', border: '1px solid rgba(255, 214, 0, 0.2)' }}>
              {selectedNeuron.tech}
            </div>
          </div>

          {/* Key Capabilities */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(0, 240, 255, 0.7)', marginBottom: '6px', textTransform: 'uppercase' }}>
              Key Synaptic Capabilities
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {selectedNeuron.capabilities.map((cap, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: '#d9f8ff' }}>
                  <CheckCircle2 size={11} style={{ color: selectedNeuron.color, flexShrink: 0 }} />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Synaptic Ingress & Egress */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid rgba(0, 240, 255, 0.15)', paddingTop: '12px' }}>
            <div>
              <div style={{ fontSize: '9px', color: 'rgba(0, 240, 255, 0.6)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Afferent Synapses (In)
              </div>
              <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '10px', color: '#7fe3f5', lineHeight: 1.4 }}>
                {selectedNeuron.inputs.map((inp, idx) => (
                  <li key={idx}>{inp}</li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: '9px', color: 'rgba(0, 255, 200, 0.6)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Efferent Synapses (Out)
              </div>
              <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '10px', color: '#00ffcc', lineHeight: 1.4 }}>
                {selectedNeuron.outputs.map((out, idx) => (
                  <li key={idx}>{out}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
