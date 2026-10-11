import { TaskType, Task } from '../tasks/types.js';
import { PrivacyMode } from '../providers/types.js';

// Intent Classification
export type UserIntent =
  | 'INFORMATION'
  | 'ACTION'
  | 'RESEARCH'
  | 'CREATION'
  | 'ANALYSIS'
  | 'CODING'
  | 'AUTOMATION'
  | 'CONVERSATION';

// Reasoning Modes
export type ReasoningMode = 'FAST' | 'STANDARD' | 'DEEP';

// Plan Step Statuses
export type PlanStepStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'SKIPPED';

// Plan Status
export type PlanStatus =
  | 'PENDING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'REPLANNED'
  | 'CANCELLED';

// Plan Step
export interface PlanStep {
  id: string;
  stepIndex: number;
  title: string;
  description: string;
  type: TaskType;
  dependencies: string[]; // step IDs that must complete before this step
  expectedOutput: string;
  successCriteria: string;
  status: PlanStepStatus;
  createdAt: string;
  updatedAt: string;
}

// Plan Model
export interface Plan {
  id: string;
  taskId: string | null;
  objective: string;
  assumptions: string[];
  constraints: string[];
  successCriteria: string[];
  risks: string[];
  steps: PlanStep[];
  status: PlanStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Memory Types
export type MemoryType =
  | 'WORKING'
  | 'EPISODIC'
  | 'SEMANTIC'
  | 'PROJECT'
  | 'USER_PREFERENCE';

export type MemoryImportance = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export type MemoryStatus = 'ACTIVE' | 'REINFORCED' | 'EXPIRED' | 'ARCHIVED';

// Memory Entity
export interface MemoryItem {
  id: string;
  type: MemoryType;
  subject: string;
  predicate: string;
  content: string;
  summary: string;
  importance: MemoryImportance;
  confidence: number;
  source: string;
  projectId: string | null;
  sessionId: string | null;
  status: MemoryStatus;
  verificationState?: VerificationStatus;
  containsSecrets?: boolean;
  embedding?: number[];
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Memory Search & Filter
export interface MemoryFilter {
  projectId?: string | null;
  sessionId?: string;
  type?: MemoryType;
  status?: MemoryStatus;
  minImportance?: MemoryImportance;
  limit?: number;
}

// Memory Link Target
export type MemoryLinkTargetType = 'TASK' | 'PLAN' | 'EVENT' | 'SESSION' | 'PROJECT';

export interface MemoryLink {
  id: string;
  memoryId: string;
  targetType: MemoryLinkTargetType;
  targetId: string;
  createdAt: string;
}

// Context Engine Types
export type ContextPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export type ContextCategory =
  | 'SYSTEM'
  | 'USER'
  | 'PROJECT'
  | 'MEMORY'
  | 'TASK'
  | 'UNTRUSTED';

export interface ContextItem {
  id: string;
  category: ContextCategory;
  priority: ContextPriority;
  content: string;
  tokenEstimate: number;
  untrusted?: boolean;
}

export interface ContextBudget {
  maxCharacters: number;
  maxTokens: number;
}

export interface AssembledContext {
  systemPrompt: string;
  userPrompt: string;
  tokenEstimate: number;
  truncatedCount: number;
  includedMemories: MemoryItem[];
}

// Verification Models
export type VerificationStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'UNVERIFIED'
  | 'FAILED';

export interface VerificationResult {
  id: string;
  planId: string;
  stepId: string | null;
  status: VerificationStatus;
  evidence: string[];
  reasoning: string;
  timestamp: string;
}

// Brain Loop Protection Limits
export interface BrainLimits {
  maxReasoningSteps: number;
  maxReplans: number;
  maxPlanDepth: number;
  maxChildTasks: number;
  maxContextTokens: number;
  maxMemoryResults: number;
}

export const DEFAULT_BRAIN_LIMITS: BrainLimits = {
  maxReasoningSteps: 5,
  maxReplans: 3,
  maxPlanDepth: 3,
  maxChildTasks: 10,
  maxContextTokens: 8192,
  maxMemoryResults: 15,
};

// Standardized Brain Request & Response
export interface BrainRequest {
  requestId?: string;
  sessionId?: string;
  projectId?: string;
  userInput: string;
  taskType?: TaskType;
  reasoningMode?: ReasoningMode;
  privacyMode?: PrivacyMode;
  constraints?: string[];
  contextBudget?: Partial<ContextBudget>;
  metadata?: Record<string, unknown>;
}

export interface BrainResponse {
  requestId: string;
  sessionId?: string;
  projectId?: string;
  finalResponse: string;
  plan?: Plan;
  tasks?: Task[];
  reasoningSummary: string;
  confidenceStatus: VerificationStatus;
  executionStatus: 'COMPLETED' | 'FAST_PATH' | 'FAILED' | 'REPLANNED' | 'WAITING_EXECUTION';
  sources: string[];
  memoryUpdates: MemoryItem[];
  metadata: Record<string, unknown>;
}
