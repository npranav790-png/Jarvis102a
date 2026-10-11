import { JarvisEngine } from '../core/engine.js';
import { JobQueue } from './jobs/queue.js';
import { Scheduler } from './scheduler/scheduler.js';
import { AutomationEngine } from './automation/engine.js';
import { NotificationService } from './notifications/service.js';
import { ReminderService } from './reminders/service.js';
import { RuntimeStatus, RuntimeState } from './types.js';
import { 
  RuntimeJobRepository, 
  AutomationRepository, 
  ReminderRepository, 
  NotificationRepository,
  VoiceRepository 
} from '../database/runtime-repository.js';
import { VoiceRegistry } from '../voice/registry.js';
import { VoiceService } from '../voice/service.js';
import { rootLogger } from '../logging/logger.js';
import { createEvent } from '../events/types.js';
import { ApiServer } from '../api/server.js';
import { OpenCodeOrchestrator } from '../orchestration/opencode/orchestrator.js';

const logger = rootLogger.child('JarvisRuntime');

export class JarvisRuntime {
  public engine: JarvisEngine;
  public orchestrator!: OpenCodeOrchestrator;
  public jobQueue!: JobQueue;
  public scheduler!: Scheduler;
  public automationEngine!: AutomationEngine;
  public notificationService!: NotificationService;
  public reminderService!: ReminderService;
  public voiceRegistry!: VoiceRegistry;
  public voiceService!: VoiceService;
  public apiServer!: ApiServer;
  
  public jobRepo!: RuntimeJobRepository;
  public automationRepo!: AutomationRepository;
  public reminderRepo!: ReminderRepository;
  public notificationRepo!: NotificationRepository;
  public voiceRepo!: VoiceRepository;

  private state: RuntimeState = 'STOPPED';
  private startTime = 0;

  constructor(engine?: JarvisEngine) {
    this.engine = engine || new JarvisEngine();
  }

  public async start(): Promise<void> {
    if (this.state !== 'STOPPED' && this.state !== 'FAILED') {
      logger.warn(`Cannot start runtime from state: ${this.state}`);
      return;
    }

    this.state = 'STARTING';
    this.startTime = Date.now();
    logger.info('Starting JARVIS 2.0 Runtime...');

    try {
      // 1. Core Engine (Config -> DB -> EventBus -> Security -> Brain -> Tools -> Agents)
      await this.engine.initialize();
      
      const db = this.engine.db.connect();

      // 2. Runtime Repositories
      this.jobRepo = new RuntimeJobRepository(db);
      this.automationRepo = new AutomationRepository(db);
      this.reminderRepo = new ReminderRepository(db);
      this.notificationRepo = new NotificationRepository(db);
      this.voiceRepo = new VoiceRepository(db);

      // 3. Voice Abstractions & Service
      this.voiceRegistry = new VoiceRegistry(this.engine);
      this.voiceService = new VoiceService(this);
      await this.voiceService.initialize();

      // 4. Job Queue & Scheduler
      this.jobQueue = new JobQueue(this.engine, this.jobRepo);
      this.scheduler = new Scheduler(this.engine, this.jobQueue, this.automationRepo, this.reminderRepo);

      // 5. High-level Services
      this.automationEngine = new AutomationEngine(this.engine, this.automationRepo, this.jobQueue);
      this.notificationService = new NotificationService(this.engine, this.notificationRepo);
      this.reminderService = new ReminderService(this.engine, this.reminderRepo, this.jobQueue);
      this.orchestrator = new OpenCodeOrchestrator(
        this.engine.aiService,
        this.engine.approvalManager,
        this.engine.eventBus
      );

      // Start asynchronous services
      await this.jobQueue.start();
      await this.scheduler.start();

      // 6. Start API Server
      this.apiServer = new ApiServer(this);
      await this.apiServer.start();

      this.state = 'RUNNING';
      await this.engine.eventBus.emit(createEvent('runtime:started', 'JarvisRuntime', {}));
      logger.info('JARVIS 2.0 Runtime started successfully.');

    } catch (err) {
      this.state = 'FAILED';
      logger.error('Failed to start JARVIS 2.0 Runtime', undefined, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'STOPPED') return;

    this.state = 'STOPPING';
    logger.info('Stopping JARVIS 2.0 Runtime...');

    try {
      if (this.apiServer) {
        await this.apiServer.stop();
      }
      
      await this.scheduler.stop();
      await this.jobQueue.stop();
      
      this.state = 'STOPPED';
      await this.engine.eventBus.emit(createEvent('runtime:stopped', 'JarvisRuntime', {}));
      logger.info('JARVIS 2.0 Runtime stopped successfully.');
    } catch (err) {
      this.state = 'FAILED';
      logger.error('Error while stopping JARVIS 2.0 Runtime', undefined, err instanceof Error ? err : new Error(String(err)));
    }
  }

  public getStatus(): RuntimeStatus {
    let activeJobs = 0;
    let queuedJobs = 0;
    let pendingApprovals = 0;
    let activeAutomations = 0;

    if (this.state === 'RUNNING' && this.engine && this.engine.db.connect()) {
      try {
        const db = this.engine.db.connect();
        const activeJobsRes = db.prepare("SELECT COUNT(*) as cnt FROM runtime_jobs WHERE status IN ('DISPATCHED', 'RUNNING')").get() as any;
        activeJobs = activeJobsRes?.cnt || 0;
        const queuedJobsRes = db.prepare("SELECT COUNT(*) as cnt FROM runtime_jobs WHERE status = 'QUEUED'").get() as any;
        queuedJobs = queuedJobsRes?.cnt || 0;
        pendingApprovals = this.engine.approvalManager.listPending().length;
        activeAutomations = this.automationRepo ? this.automationRepo.listEnabled().length : 0;
      } catch (e) {
        // ignore
      }
    }

    return {
      state: this.state,
      uptime: this.state === 'RUNNING' ? (Date.now() - this.startTime) / 1000 : 0,
      activeJobs,
      queuedJobs,
      activeAutomations,
      pendingApprovals,
      voiceAvailable: this.voiceRegistry?.WakeWord !== undefined,
      schedulerRunning: true,
      workersHealthy: true,
      databaseHealthy: this.state !== 'FAILED'
    };
  }
}
