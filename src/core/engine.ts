import path from 'node:path';
import { DatabaseConnection } from '../database/connection.js';
import { initializeSchema } from '../database/schema.js';
import {
  ProjectRepository,
  SessionRepository,
  TaskRepository,
  EventRepository,
  AuditRepository,
  PlanRepository,
  MemoryRepository,
  ReasoningRepository,
  VerificationRepository,
  ToolCallRepository,
  ApprovalRepository,
  ArtifactRepository,
  MCPRepository,
  WorkspaceLockRepository,
  MessageRepository,
} from '../database/repository.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { SecurityPolicy } from '../security/policy.js';
import { ApprovalGatekeeper } from '../security/approval.js';
import { ApprovalManager } from '../security/approval-manager.js';
import { AuditLogger } from '../security/audit.js';
import { ProjectManager } from '../projects/manager.js';
import { SessionManager } from '../sessions/manager.js';
import { TaskManager } from '../tasks/manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { ToolSelector } from '../tools/selector.js';
import { ArtifactManager } from '../tools/artifacts.js';
import { ALL_BUILTIN_TOOLS } from '../tools/builtin/index.js';
import { AgentRegistry } from '../agents/registry.js';
import { AgentSelector } from '../agents/selector.js';
import { AgentExecutor } from '../agents/executor.js';
import {
  GeneralAgent,
  CodingAgent,
  ResearchAgent,
  AnalysisAgent,
  AutomationAgent,
} from '../agents/specialized/index.js';
import { AgentExecutionContext, AgentExecutionResult } from '../agents/types.js';
import { WorkspaceManager } from '../workspace/manager.js';
import { MCPRegistry } from '../mcp/registry.js';
import { ProviderRegistry } from '../providers/registry.js';
import { ModelRegistry } from '../providers/model-registry.js';
import { ModelRouter } from '../providers/router.js';
import { AIService } from '../providers/ai-service.js';
import { MemoryService } from '../brain/memory/memory-service.js';
import { ContextEngine } from '../brain/context/context-engine.js';
import { PlanningEngine } from '../brain/planner.js';
import { ReasoningEngine } from '../brain/reasoning.js';
import { VerificationEngine } from '../brain/verification.js';
import { Brain } from '../brain/brain.js';
import { JarvisConfig } from '../config/schema.js';
import { getConfig } from '../config/config.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('JarvisEngine');

export interface EngineDiagnostics {
  application: {
    name: string;
    version: string;
    env: string;
    uptimeSeconds: number;
    offline: boolean;
  };
  database: {
    status: 'CONNECTED' | 'ERROR';
    path: string;
  };
  security: {
    mode: string;
    approvalThreshold: string;
  };
  privacy: {
    mode: string;
  };
  costPolicy: {
    allowPaidProviders: boolean;
    maxCostPerDay: number;
    allowFreeModelsOnly: boolean;
  };
  providers: {
    count: number;
    health: Record<string, unknown>;
  };
  models: {
    discoveredCount: number;
  };
  brain: {
    plansCount: number;
    memoriesCount: number;
  };
  execution: {
    toolsCount: number;
    agentsCount: number;
    mcpServersCount: number;
    pendingApprovalsCount: number;
  };
  counts: {
    projects: number;
    sessions: number;
    tasks: number;
    events: number;
    memories: number;
    plans: number;
    tools: number;
    agents: number;
  };
}

export class JarvisEngine {
  public readonly config: JarvisConfig;
  private dbConnection?: DatabaseConnection;
  private startTime = Date.now();
  private initialized = false;

  public eventBus!: EventBus;
  public securityPolicy!: SecurityPolicy;
  public auditLogger!: AuditLogger;
  public approvalGatekeeper!: ApprovalGatekeeper;
  public approvalManager!: ApprovalManager;
  public workspaceManager!: WorkspaceManager;
  public artifactManager!: ArtifactManager;
  public projectManager!: ProjectManager;
  public sessionManager!: SessionManager;
  public messageRepo!: MessageRepository;
  public taskManager!: TaskManager;
  public toolRegistry!: ToolRegistry;
  public toolSelector!: ToolSelector;
  public agentRegistry!: AgentRegistry;
  public agentSelector!: AgentSelector;
  public agentExecutor!: AgentExecutor;
  public mcpRegistry!: MCPRegistry;
  public providerRegistry!: ProviderRegistry;
  public modelRegistry!: ModelRegistry;
  public modelRouter!: ModelRouter;
  public aiService!: AIService;
  public memoryService!: MemoryService;
  public contextEngine!: ContextEngine;
  public planningEngine!: PlanningEngine;
  public reasoningEngine!: ReasoningEngine;
  public verificationEngine!: VerificationEngine;
  public brain!: Brain;

  constructor(config?: JarvisConfig) {
    this.config = config || getConfig();
  }

  public get db() {
    if (!this.dbConnection) {
      throw new Error('Database not initialized');
    }
    return this.dbConnection;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info(`Initializing ${this.config.app.name} v${this.config.app.version} [env=${this.config.app.env}, offline=${this.config.app.offline}]...`);

    // 1. Storage & Database
    this.dbConnection = new DatabaseConnection(this.config.database.path);
    const db = this.dbConnection.connect();
    initializeSchema(db);

    const projectRepo = new ProjectRepository(db);
    const sessionRepo = new SessionRepository(db);
    this.messageRepo = new MessageRepository(db);
    const taskRepo = new TaskRepository(db);
    const eventRepo = new EventRepository(db);
    const auditRepo = new AuditRepository(db);
    const planRepo = new PlanRepository(db);
    const memoryRepo = new MemoryRepository(db);
    const reasoningRepo = new ReasoningRepository(db);
    const verificationRepo = new VerificationRepository(db);
    const toolCallRepo = new ToolCallRepository(db);
    const approvalRepo = new ApprovalRepository(db);
    const artifactRepo = new ArtifactRepository(db);
    const mcpRepo = new MCPRepository(db);
    const workspaceLockRepo = new WorkspaceLockRepository(db);

    // 2. Events & Observability
    this.eventBus = new EventBus(eventRepo);

    // 3. Security & Sandboxing
    this.securityPolicy = new SecurityPolicy(
      this.config.security.mode,
      this.config.security.approvalThreshold
    );
    this.auditLogger = new AuditLogger(auditRepo);
    this.approvalGatekeeper = new ApprovalGatekeeper(
      this.securityPolicy,
      this.eventBus,
      this.auditLogger
    );
    this.approvalManager = new ApprovalManager(
      this.securityPolicy,
      approvalRepo,
      this.eventBus,
      this.auditLogger
    );
    this.workspaceManager = new WorkspaceManager(workspaceLockRepo, this.eventBus);
    this.artifactManager = new ArtifactManager(artifactRepo, this.eventBus);

    // 4. Subsystem Managers
    this.projectManager = new ProjectManager(projectRepo, this.eventBus);
    this.sessionManager = new SessionManager(sessionRepo, this.projectManager, this.eventBus);
    this.taskManager = new TaskManager(taskRepo, this.eventBus);

    // 5. Tools & MCP Layer
    this.toolRegistry = new ToolRegistry(
      this.approvalGatekeeper,
      this.eventBus,
      this.approvalManager,
      toolCallRepo,
      this.artifactManager
    );
    for (const tool of ALL_BUILTIN_TOOLS) {
      this.toolRegistry.register(tool);
    }
    this.toolSelector = new ToolSelector(this.toolRegistry);
    this.mcpRegistry = new MCPRegistry(this.toolRegistry, mcpRepo, this.eventBus);
    if (this.config.mcp?.configPath) {
      await this.mcpRegistry.loadFromConfigFile(
        this.config.mcp.configPath,
        this.config.mcp.autoConnect
      );
    }

    // 6. AI Providers & Zero-Cost Guard
    this.providerRegistry = new ProviderRegistry(
      this.config.cost.allowPaidProviders,
      this.config.cost.maxCostPerDay,
      this.eventBus
    );

    // Auto-discover and register configured providers (Ollama, Groq, OpenRouter, HF, Mock)
    this.providerRegistry.initializeFromConfig(this.config);

    // 7. Model Registry & Hybrid Router
    this.modelRegistry = new ModelRegistry(
      this.providerRegistry,
      this.config.cost.allowPaidProviders,
      this.eventBus
    );

    this.modelRouter = new ModelRouter(
      this.modelRegistry,
      this.providerRegistry,
      {
        defaultPrivacyMode: this.config.privacy.mode,
        providerPriority: this.config.providers.priority,
        offlineMode: this.config.app.offline,
        preferredModel: this.config.providers.defaultModel || process.env.JARVIS_DEFAULT_MODEL || process.env.JARVIS_MODEL,
      }
    );

    // 8. Unified AIService (Pipeline, fallback, validation)
    this.aiService = new AIService(
      this.modelRouter,
      this.providerRegistry,
      this.modelRegistry,
      this.eventBus
    );

    // 9. Brain, Memory, Context & Reasoning Layer
    this.memoryService = new MemoryService(memoryRepo, this.eventBus);
    this.contextEngine = new ContextEngine(this.projectManager, this.sessionManager);
    this.planningEngine = new PlanningEngine(planRepo, this.aiService, this.eventBus);
    this.reasoningEngine = new ReasoningEngine(reasoningRepo, this.aiService);
    this.verificationEngine = new VerificationEngine(verificationRepo, this.eventBus);

    this.brain = new Brain({
      eventBus: this.eventBus,
      aiService: this.aiService,
      taskManager: this.taskManager,
      projectManager: this.projectManager,
      sessionManager: this.sessionManager,
      contextEngine: this.contextEngine,
      memoryService: this.memoryService,
      planningEngine: this.planningEngine,
      reasoningEngine: this.reasoningEngine,
      verificationEngine: this.verificationEngine,
    });

    // 10. Autonomous Agents & Execution Engine
    this.agentRegistry = new AgentRegistry(this.eventBus);
    this.agentRegistry.register(new GeneralAgent({ toolRegistry: this.toolRegistry, aiService: this.aiService }));
    this.agentRegistry.register(new CodingAgent({ toolRegistry: this.toolRegistry, aiService: this.aiService }));
    this.agentRegistry.register(new ResearchAgent({ toolRegistry: this.toolRegistry, aiService: this.aiService }));
    this.agentRegistry.register(new AnalysisAgent({ toolRegistry: this.toolRegistry, aiService: this.aiService }));
    this.agentRegistry.register(new AutomationAgent({ toolRegistry: this.toolRegistry, aiService: this.aiService }));

    this.agentSelector = new AgentSelector(this.agentRegistry);
    this.agentExecutor = new AgentExecutor({
      agentRegistry: this.agentRegistry,
      taskManager: this.taskManager,
      agentSelector: this.agentSelector,
      verificationEngine: this.verificationEngine,
      memoryService: this.memoryService,
      workspaceManager: this.workspaceManager,
      eventBus: this.eventBus,
    });

    this.initialized = true;

    await this.eventBus.emit(
      createEvent('system:started', 'JarvisEngine', {
        version: this.config.app.version,
        env: this.config.app.env,
        dbPath: this.config.database.path,
        offline: this.config.app.offline,
        privacyMode: this.config.privacy.mode,
      })
    );

    logger.info('JARVIS Core Engine initialized successfully with AI Intelligence & Brain Layer.');
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Shutting down JARVIS Core Engine...');
    if (this.eventBus) {
      await this.eventBus.emit(createEvent('system:shutdown', 'JarvisEngine', {}));
    }

    if (this.dbConnection) {
      this.dbConnection.close();
    }

    this.initialized = false;
    logger.info('JARVIS Core Engine shutdown complete.');
  }

  public async status(): Promise<EngineDiagnostics> {
    if (!this.initialized) {
      await this.initialize();
    }

    const providerHealth = await this.providerRegistry.checkAllHealth();
    const availableModels = await this.modelRegistry.getAvailableModels();
    const projects = this.projectManager.listProjects();
    const sessions = this.sessionManager.listSessions();
    const tasks = this.taskManager.listTasks();
    const db = this.dbConnection!.getDb();

    let eventCount = 0;
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
      eventCount = row.count;
    } catch {
      eventCount = 0;
    }

    let memoriesCount = 0;
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
      memoriesCount = row.count;
    } catch {
      memoriesCount = 0;
    }

    let plansCount = 0;
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM plans').get() as { count: number };
      plansCount = row.count;
    } catch {
      plansCount = 0;
    }

    return {
      application: {
        name: this.config.app.name,
        version: this.config.app.version,
        env: this.config.app.env,
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
        offline: this.config.app.offline,
      },
      database: {
        status: 'CONNECTED',
        path: this.config.database.path,
      },
      security: {
        mode: this.config.security.mode,
        approvalThreshold: this.config.security.approvalThreshold,
      },
      privacy: {
        mode: this.config.privacy.mode,
      },
      costPolicy: {
        allowPaidProviders: this.config.cost.allowPaidProviders,
        maxCostPerDay: this.config.cost.maxCostPerDay,
        allowFreeModelsOnly: this.config.providers.allowFreeModelsOnly,
      },
      providers: {
        count: this.providerRegistry.list().length,
        health: providerHealth,
      },
      models: {
        discoveredCount: availableModels.length,
      },
      brain: {
        plansCount,
        memoriesCount,
      },
      execution: {
        toolsCount: this.toolRegistry.list().length,
        agentsCount: this.agentRegistry.list().length,
        mcpServersCount: this.mcpRegistry.listServers().length,
        pendingApprovalsCount: this.approvalManager.listPending().length,
      },
      counts: {
        projects: projects.length,
        sessions: sessions.length,
        tasks: tasks.length,
        events: eventCount,
        memories: memoriesCount,
        plans: plansCount,
        tools: this.toolRegistry.list().length,
        agents: this.agentRegistry.list().length,
      },
    };
  }

  /**
   * Executes a task using the Prompt 4 autonomous Agent + Tool execution engine.
   */
  public async executeTask(taskId: string, contextOverride: Partial<AgentExecutionContext> = {}): Promise<AgentExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.agentExecutor.executeTask(taskId, contextOverride);
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}
