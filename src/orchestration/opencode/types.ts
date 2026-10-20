export type OpenCodeEngine = 'opencode' | 'kilo';

export type OrchestrationJobStatus =
  | 'IDLE'
  | 'ANALYZING'
  | 'BRAINSTORMING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'PLAN_APPROVED'
  | 'PROMPT_READY'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISPATCHING'
  | 'DEVELOPING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface OrchestrationOrder {
  orderText: string;
  targetWorkspace: string;
  engine?: OpenCodeEngine;
  model?: string;
  title?: string;
  autoApprovePermissions?: boolean;
  autoDispatch?: boolean;
  skipPlanApproval?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CodebaseFileContext {
  path: string;
  relativePath: string;
  summary?: string;
  lineCount?: number;
  isKeyFile?: boolean;
}

export interface ResearchResult {
  projectRoot: string;
  techStack: string[];
  manifests: string[];
  relevantFiles: CodebaseFileContext[];
  projectStructureSummary: string;
  dependencies: Record<string, string>;
  gitStatus?: string;
}

export interface BrainstormResult {
  problemSummary: string;
  architecturalApproach: string;
  technicalDecisions: string[];
  affectedComponents: string[];
  potentialRisks: string[];
  suggestedValidation: string;
}

export interface ProjectPlanPhase {
  phaseNumber: number;
  title: string;
  description: string;
  tasks: string[];
  deliverables: string[];
}

export interface ProjectPlan {
  title: string;
  summary: string;
  architecturalReview: string;
  technicalDecisions: string[];
  phases: ProjectPlanPhase[];
  risksAndMitigations: string[];
  validationCriteria: string[];
  rawPlanMarkdown?: string;
}

export interface PromptReport {
  summary: string;
  whatItDoes: string;
  targetFiles: string[];
  keyInstructions: string[];
  constraints: string[];
  verificationCommand?: string;
  estimatedComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface EngineeredPrompt {
  title: string;
  promptText: string;
  targetFiles: string[];
  instructions: string[];
  constraints: string[];
  verificationCommand?: string;
  estimatedComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  version: number;
  report?: PromptReport;
}

export interface ExecutionLogChunk {
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system';
  chunk: string;
}

export interface SolutionDiff {
  gitDiff: string;
  filesChanged: string[];
  insertions: number;
  deletions: number;
}

export interface OrchestrationJob {
  id: string;
  status: OrchestrationJobStatus;
  order: OrchestrationOrder;
  engine: OpenCodeEngine;
  engineVersion?: string;
  research?: ResearchResult;
  brainstorm?: BrainstormResult;
  projectPlan?: ProjectPlan;
  planApprovalStatus?: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  planRejectionReason?: string;
  engineeredPrompt?: EngineeredPrompt;
  approvalId?: string;
  approvalStatus: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  currentPhase?: number;
  completedPhases?: number[];
  phaseResults?: Record<number, { status: 'SUCCESS' | 'FAILED'; logs: string[]; error?: string }>;
  selfHealAttempts?: number;
  maxSelfHealAttempts?: number;
  rollbackStatus?: 'NONE' | 'AVAILABLE' | 'ROLLED_BACK';
  initialGitCommit?: string;
  phaseGitCommits?: Record<number, string>;
  executionLogs: ExecutionLogChunk[];
  exitCode?: number;
  diff?: SolutionDiff;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface OpenCodeBridgeStatus {
  opencodeInstalled: boolean;
  opencodePath?: string;
  opencodeVersion?: string;
  kiloInstalled: boolean;
  kiloPath?: string;
  kiloVersion?: string;
  defaultEngine: OpenCodeEngine;
  activeJobsCount: number;
  supportedModels: string[];
}

