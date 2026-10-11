import {
  IAIProvider,
  ModelDescriptor,
  ProviderCapabilities,
  ProviderHealth,
  GenerateRequest,
  GenerateResponse,
  StreamChunk,
} from './types.js';
import { ProviderUnavailableError } from '../errors/base.js';

export interface MockProviderOptions {
  id?: string;
  name?: string;
  isPaid?: boolean;
  isLocal?: boolean;
  simulateFailure?: boolean;
  simulateRateLimit?: boolean;
  models?: ModelDescriptor[];
}

export class MockAIProvider implements IAIProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly isPaid: boolean;
  public readonly isLocal: boolean;

  private simulateFailure: boolean;
  private simulateRateLimit: boolean;
  private models: ModelDescriptor[];
  private customResponseGenerator?: (req: GenerateRequest) => string;

  constructor(options: MockProviderOptions = {}) {
    this.id = options.id || 'mock-provider';
    this.name = options.name || 'JARVIS Mock Provider (Offline)';
    this.isPaid = options.isPaid ?? false;
    this.isLocal = options.isLocal ?? true;
    this.simulateFailure = options.simulateFailure ?? false;
    this.simulateRateLimit = options.simulateRateLimit ?? false;

    this.models = options.models || [
      {
        id: 'mock-llama-3-8b',
        providerId: this.id,
        name: 'Mock Llama 3 8B (Free/Local)',
        contextWindow: 8192,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['GENERAL', 'CODING', 'REASONING', 'FAST', 'LOCAL', 'STREAMING', 'TOOL_USE', 'STRUCTURED_OUTPUT'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'MEDIUM',
          research: 'MEDIUM',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: true,
        speedClass: 'FAST',
        privacyClass: 'LOCAL',
        availability: 'AVAILABLE',
      },
      {
        id: 'mock-qwen-coder-32b',
        providerId: this.id,
        name: 'Mock Qwen 2.5 Coder 32B (Free/Local)',
        contextWindow: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsJson: true,
        supportsVision: false,
        supportsReasoning: true,
        capabilities: ['CODING', 'LONG_CONTEXT', 'TOOL_USE', 'LOCAL', 'STREAMING', 'STRUCTURED_OUTPUT'],
        qualitativeCapabilities: {
          coding: 'HIGH',
          reasoning: 'HIGH',
          research: 'MEDIUM',
        },
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
        isFree: true,
        isLocal: true,
        speedClass: 'MODERATE',
        privacyClass: 'LOCAL',
        availability: 'AVAILABLE',
      },
    ];
  }

  public setSimulateFailure(value: boolean): void {
    this.simulateFailure = value;
  }

  public setSimulateRateLimit(value: boolean): void {
    this.simulateRateLimit = value;
  }

  public setResponseGenerator(fn: (req: GenerateRequest) => string): void {
    this.customResponseGenerator = fn;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    if (this.simulateRateLimit) {
      return {
        status: 'RATE_LIMITED',
        latencyMs: 50,
        message: 'Mock provider rate limited (HTTP 429)',
        lastChecked: new Date().toISOString(),
      };
    }

    return {
      status: 'ONLINE',
      latencyMs: 1,
      message: 'Mock provider running offline with 0 cost.',
      lastChecked: new Date().toISOString(),
    };
  }

  public async listModels(): Promise<ModelDescriptor[]> {
    return [...this.models];
  }

  public async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (this.simulateRateLimit) {
      throw new ProviderUnavailableError(this.id, 'HTTP 429: Too Many Requests (Rate limit exceeded)');
    }
    if (this.simulateFailure) {
      throw new ProviderUnavailableError(this.id, 'Simulated connection failure');
    }

    const lastMsg = request.messages[request.messages.length - 1];
    const userPrompt = lastMsg ? lastMsg.content : 'No input';

    // Simulated tool call if requested
    if (request.tools && request.tools.length > 0 && userPrompt.includes('call_tool')) {
      const tool = request.tools[0];
      return {
        id: `mock-resp-${Date.now()}`,
        content: '',
        finishReason: 'tool_calls',
        usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40, estimatedCostUSD: 0.0 },
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: tool.name,
            arguments: JSON.stringify({ query: 'mock search query' }),
          },
        ],
      };
    }

    // Custom generator if registered
    if (this.customResponseGenerator) {
      const customContent = this.customResponseGenerator(request);
      return {
        id: `mock-resp-${Date.now()}`,
        content: customContent,
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estimatedCostUSD: 0.0 },
      };
    }

    // Simulated JSON if requested
    if (request.responseFormat?.type === 'json' || request.jsonSchema) {
      if (userPrompt.toLowerCase().includes('plan') || userPrompt.toLowerCase().includes('steps')) {
        return {
          id: `mock-resp-${Date.now()}`,
          content: JSON.stringify({
            assumptions: ['Environment is ready'],
            constraints: ['Zero-cost policy'],
            successCriteria: ['Completed cleanly'],
            risks: [],
            steps: [
              {
                id: 'step_1',
                stepIndex: 1,
                title: 'Analyze Requirements',
                description: 'Review task requirements',
                type: 'RESEARCH',
                dependencies: [],
                expectedOutput: 'Requirements understood',
                successCriteria: 'Analysis complete',
              },
              {
                id: 'step_2',
                stepIndex: 2,
                title: 'Execute Implementation',
                description: 'Execute planned operations',
                type: 'CODING',
                dependencies: ['step_1'],
                expectedOutput: 'Implementation complete',
                successCriteria: 'Execution verified',
              },
            ],
          }),
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estimatedCostUSD: 0.0 },
        };
      }

      return {
        id: `mock-resp-${Date.now()}`,
        content: JSON.stringify({ result: 'mock_json_success', inputEcho: userPrompt, score: 100 }),
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estimatedCostUSD: 0.0 },
      };
    }

    const lower = userPrompt.toLowerCase().trim();
    let generatedContent = '';

    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('greetings')) {
      generatedContent = `Good day, sir. All neural subsystems are online and operating at peak efficiency. How may I be of assistance today?`;
    } else if (lower.includes('who are you') || lower.includes('identity') || lower.includes('what are you')) {
      generatedContent = `I am JARVIS 2.0 (Just A Rather Very Intelligent System), your local-first autonomous command intelligence. I coordinate system telemetry, execute autonomous workflows, and maintain real-time task orchestration.`;
    } else if (lower.includes('status') || lower.includes('health') || lower.includes('diagnostic') || lower.includes('telemetry')) {
      generatedContent = `System Diagnostics: All 8 neural nodes nominal. Memory subsystem active. SQLite database synchronized. Zero-cost policy strictly enforced ($0.00). Core temperature and resource allocation within optimal thresholds.`;
    } else if (lower.includes('time') || lower.includes('date') || lower.includes('clock')) {
      generatedContent = `Current system timestamp is ${new Date().toLocaleTimeString()} on ${new Date().toLocaleDateString()}. Subsystem clocks are synchronized with local hardware time.`;
    } else if (lower.includes('help') || lower.includes('capabilities') || lower.includes('what can you do')) {
      generatedContent = `I am equipped to handle:\n• Autonomous task execution and verification via the AGENTS subsystem\n• Security auditing and human-in-the-loop approvals via the APPROVALS hub\n• Persistent working memory retrieval via MEMORY EXPLORER\n• Real-time model routing and free-tier LLM inference (Groq, Ollama, OpenRouter).\n\nYou can issue commands directly here or configure providers in Settings.`;
    } else if (lower.includes('code') || lower.includes('python') || lower.includes('typescript') || lower.includes('javascript') || lower.includes('bug')) {
      generatedContent = `Understood, sir. Code synthesis task has been logged. The autonomous Coding Agent has been notified to inspect workspace boundaries. You can track execution in the TASKS and AGENTS telemetry panels.`;
    } else {
      generatedContent = `Understood, sir. I have processed your input: "${userPrompt}".\n\nAll local directives have been recorded into active working memory. For deep conversational reasoning or web research, ensure your free Groq or OpenRouter key is active in Settings > AI Providers.`;
    }

    return {
      id: `jarvis-core-${Date.now()}`,
      content: generatedContent,
      finishReason: 'stop',
      usage: {
        promptTokens: Math.max(5, Math.round(userPrompt.length / 4)),
        completionTokens: Math.max(10, Math.round(generatedContent.length / 4)),
        totalTokens: Math.max(15, Math.round((userPrompt.length + generatedContent.length) / 4)),
        estimatedCostUSD: 0.0, // Strictly ₹0 / $0
      },
    };
  }

  public async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    if (this.simulateRateLimit) {
      throw new ProviderUnavailableError(this.id, 'HTTP 429: Rate limit exceeded during stream');
    }
    if (this.simulateFailure) {
      throw new ProviderUnavailableError(this.id, 'Simulated stream connection failure');
    }

    const resp = await this.generate(request);
    const words = resp.content.split(' ');
    for (const word of words) {
      yield { delta: `${word} ` };
    }
    yield { delta: '', finishReason: 'stop' };
  }

  public getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsStructuredOutput: true,
      supportsVision: false,
    };
  }

  public async embed(text: string): Promise<number[]> {
    const vec = new Array(8).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[i % 8] += code;
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map((v) => Number((v / norm).toFixed(4)));
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
