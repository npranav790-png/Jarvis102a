export type ModelCapability =
  | 'GENERAL'
  | 'CODING'
  | 'REASONING'
  | 'RESEARCH'
  | 'FAST'
  | 'LONG_CONTEXT'
  | 'TOOL_USE'
  | 'STRUCTURED_OUTPUT'
  | 'VISION'
  | 'STREAMING'
  | 'LOCAL';

export type AITaskType =
  | 'GENERAL'
  | 'PLANNING'
  | 'CODING'
  | 'REASONING'
  | 'RESEARCH'
  | 'ANALYSIS'
  | 'BRAINSTORMING'
  | 'SUMMARIZATION'
  | 'EXTRACTION'
  | 'FAST';

export type PrivacyMode =
  | 'LOCAL_ONLY'
  | 'PREFER_LOCAL'
  | 'ALLOW_CLOUD'
  | 'CLOUD_PREFERRED'
  | 'CLOUD_ONLY';

export type SpeedClass = 'FAST' | 'MODERATE' | 'SLOW';

export type PrivacyClass = 'LOCAL' | 'PUBLIC_CLOUD';

export type ModelAvailability =
  | 'AVAILABLE'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export type QualitativeRating = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ModelDescriptor {
  id: string;
  providerId: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJson: boolean;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  capabilities: ModelCapability[];
  qualitativeCapabilities?: {
    coding?: QualitativeRating;
    reasoning?: QualitativeRating;
    research?: QualitativeRating;
  };
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
  isFree: boolean;
  isLocal: boolean;
  speedClass: SpeedClass;
  privacyClass: PrivacyClass;
  availability: ModelAvailability;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  supportsVision: boolean;
}

export interface ProviderHealth {
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'RATE_LIMITED' | 'MISCONFIGURED' | 'TEMPORARILY_UNAVAILABLE' | 'UNKNOWN';
  latencyMs?: number;
  message?: string;
  lastChecked: string;
  consecutiveFailures?: number;
  rateLimitResetTime?: string;
}

export interface ChatAttachment {
  mimeType: string;
  data: string; // Base64-encoded file or image data
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  attachments?: ChatAttachment[];
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export interface GenerateRequest {
  modelId: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  thinkingBudget?: number;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  jsonSchema?: Record<string, unknown>;
  responseFormat?: {
    type: 'text' | 'json';
    schema?: Record<string, unknown>;
  };
}

export interface GenerateResponse {
  id: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  usage: TokenUsage;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

export interface StreamChunk {
  delta: string;
  finishReason?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

export interface IAIProvider {
  readonly id: string;
  readonly name: string;
  readonly isPaid: boolean;
  readonly isLocal: boolean;

  healthCheck(): Promise<ProviderHealth>;
  listModels(): Promise<ModelDescriptor[]>;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  getCapabilities(): ProviderCapabilities;
  embed?(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}

export interface TaskRoutingRequest {
  taskType: AITaskType;
  requiredCapabilities?: ModelCapability[];
  privacyMode?: PrivacyMode;
  minContextWindow?: number;
  requireTools?: boolean;
  requireStreaming?: boolean;
  requireJson?: boolean;
  preferredProvider?: string;
  preferredModel?: string;
}

export interface CandidateScore {
  providerId: string;
  modelId: string;
  score: number;
  breakdown: Record<string, number>;
  isEligible: boolean;
  disqualificationReason?: string;
}

export interface RoutingDecision {
  selectedProviderId: string;
  selectedModelId: string;
  reason: string;
  candidates: CandidateScore[];
  rejectedCandidates: Array<{ modelId: string; reason: string }>;
  fallbackChain: Array<{ providerId: string; modelId: string }>;
  privacyMode: PrivacyMode;
  costStatus: 'FREE_VERIFIED';
}
