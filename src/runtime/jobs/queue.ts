import crypto from 'node:crypto';
import { JarvisEngine } from '../../core/engine.js';
import { RuntimeJobRepository } from '../../database/runtime-repository.js';
import { RuntimeJob, JobStatus } from '../types.js';
import { ChatMessage } from '../../providers/types.js';
import { rootLogger } from '../../logging/logger.js';
import { createEvent } from '../../events/types.js';

const logger = rootLogger.child('JobQueue');

export class JobQueue {
  private workers: Set<Promise<void>> = new Set();
  private maxConcurrency = 2; // Can be configured
  private running = false;
  private intervalTimer?: NodeJS.Timeout;

  constructor(
    private engine: JarvisEngine,
    private repository: RuntimeJobRepository
  ) {}

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    logger.info('Starting Job Queue...');
    this.poll();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    logger.info('Stopping Job Queue... Waiting for workers to finish.');
    await Promise.all(this.workers);
    logger.info('Job Queue stopped.');
  }

  public async enqueue(job: Omit<RuntimeJob, 'id' | 'status' | 'attempts' | 'createdAt'>): Promise<string> {
    const id = crypto.randomUUID();
    const newJob: RuntimeJob = {
      ...job,
      id,
      status: 'QUEUED',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    this.repository.create({
      id: newJob.id,
      task_id: newJob.taskId || null,
      automation_id: newJob.automationId || null,
      type: newJob.type,
      priority: newJob.priority,
      payload_json: JSON.stringify(newJob.payload),
      status: newJob.status,
      attempts: newJob.attempts,
      max_attempts: newJob.maxAttempts,
      created_at: newJob.createdAt,
      scheduled_at: newJob.scheduledAt || null,
      started_at: null,
      completed_at: null,
      last_error: null,
      next_retry_at: null,
      recovery_policy: newJob.recoveryPolicy,
    });

    await this.engine.eventBus.emit(createEvent('job:queued', 'JobQueue', { jobId: id }, { jobId: id }));
    logger.debug(`Enqueued job ${id} of type ${job.type}`);
    
    // Attempt to process immediately if there's capacity
    setImmediate(() => this.processNextBatch());
    return id;
  }

  private poll(): void {
    if (!this.running) return;
    this.processNextBatch();
    this.intervalTimer = setTimeout(() => this.poll(), 5000); // 5 second polling interval
  }

  private async processNextBatch(): Promise<void> {
    if (!this.running || this.workers.size >= this.maxConcurrency) return;

    try {
      const availableCapacity = this.maxConcurrency - this.workers.size;
      const pendingJobs = this.repository.findPendingJobs(availableCapacity);

      for (const record of pendingJobs) {
        // Mark as dispatched
        record.status = 'DISPATCHED';
        this.repository.update(record);

        const workerPromise = this.processJob(record).finally(() => {
          this.workers.delete(workerPromise);
          setImmediate(() => this.processNextBatch());
        });
        
        this.workers.add(workerPromise);
      }
    } catch (err) {
      logger.error('Error polling for jobs', undefined, err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async processJob(record: any): Promise<void> {
    const jobId = record.id;
    try {
      record.status = 'RUNNING';
      record.attempts += 1;
      record.started_at = new Date().toISOString();
      this.repository.update(record);

      await this.engine.eventBus.emit(createEvent('job:started', 'JobQueue', { jobId }, { jobId }));
      
      const payload = JSON.parse(record.payload_json);
      
      // JOB EXECUTION LOGIC HERE
      // For Prompt 5, jobs could map to agent execution, reminders, etc.
      // E.g., if record.type === 'EXECUTE_AUTOMATION', run automation.
      // If record.type === 'TASK', use engine.agentExecutor.
      if (record.type === 'EXECUTE_TASK' && record.task_id) {
        await this.engine.agentExecutor.executeTask(record.task_id);
      } else if (record.type === 'PROCESS_CHAT') {
        try {
          const sessionId = payload.sessionId;
          let messagesList: ChatMessage[] = [];

          if (sessionId && this.engine.messageRepo) {
            const past = this.engine.messageRepo.listBySession(sessionId, 10);
            messagesList = past.map(m => ({
              role: m.role === 'jarvis' ? 'assistant' : (m.role as any),
              content: m.content
            }));
          }

          if (messagesList.length === 0) {
            messagesList = [{ role: 'user', content: payload.message }];
          } else if (messagesList[messagesList.length - 1].content !== payload.message) {
            messagesList.push({ role: 'user', content: payload.message });
          }

          const availableTools = this.engine.toolRegistry ? this.engine.toolRegistry.getDeclarations() : [];
          const maxToolSteps = 5;
          let currentStep = 0;
          let aiResult: any;

          while (currentStep < maxToolSteps) {
            aiResult = await this.engine.aiService.generate({
              modelId: '',
              messages: messagesList,
              tools: availableTools.length > 0 ? availableTools : undefined,
              routing: { taskType: payload.mode || 'GENERAL' }
            });

            if (!aiResult.toolCalls || aiResult.toolCalls.length === 0) {
              break;
            }

            // Record assistant message with tool calls
            messagesList.push({
              role: 'assistant',
              content: aiResult.content || '',
              toolCalls: aiResult.toolCalls,
            });

            // Execute tool calls
            for (const call of aiResult.toolCalls) {
              let parsedInput: any = {};
              try {
                parsedInput = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments || {};
              } catch {
                parsedInput = {};
              }

              await this.engine.eventBus.emit(createEvent('chat:tool_executing', 'JobQueue', {
                toolName: call.name,
                toolCallId: call.id,
                input: parsedInput,
                sessionId,
                taskId: record.task_id,
              }));

              let toolOutput = '';
              try {
                const toolRes = await this.engine.toolRegistry.executeTool({
                  callId: call.id,
                  toolName: call.name,
                  input: parsedInput,
                  context: { sessionId, taskId: record.task_id, actor: 'chat:user' }
                });

                if (toolRes.success) {
                  toolOutput = typeof toolRes.output === 'string'
                    ? toolRes.output
                    : JSON.stringify(toolRes.output ?? { success: true });
                } else {
                  toolOutput = JSON.stringify({ error: toolRes.error?.message || 'Tool execution failed' });
                }
              } catch (err: any) {
                toolOutput = JSON.stringify({ error: err.message || 'Execution error' });
              }

              messagesList.push({
                role: 'tool',
                name: call.name,
                toolCallId: call.id,
                content: toolOutput,
              });
            }

            currentStep++;
          }

          const assistMsgId = `msg_${Date.now()}_j`;
          if (this.engine.messageRepo) {
            this.engine.messageRepo.insert({
              id: assistMsgId,
              session_id: sessionId || null,
              role: 'jarvis',
              content: aiResult.content,
              task_id: record.task_id,
              metadata_json: '{}',
              created_at: new Date().toISOString()
            });
          }
          
          await this.engine.eventBus.emit(createEvent('chat_message', 'JobQueue', {
            id: assistMsgId,
            role: 'jarvis',
            content: aiResult.content,
            taskId: record.task_id,
            timestamp: new Date().toISOString()
          }));

          if (record.task_id) {
            try {
              const task = this.engine.taskManager.getTask(record.task_id);
              if (task.status === 'CREATED') {
                this.engine.taskManager.queueTask(record.task_id);
              }
              const current = this.engine.taskManager.getTask(record.task_id);
              if (current.status === 'QUEUED') {
                this.engine.taskManager.startTask(record.task_id);
              }
              this.engine.taskManager.completeTask(record.task_id, { response: aiResult.content });
            } catch (e) {
              logger.warn(`Could not complete task ${record.task_id}`, undefined, e as Error);
            }
          }
        } catch (chatErr) {
          const errMsg = (chatErr as Error).message || 'No AI engine available';
          const feedback = `AI subsystem offline or unavailable: ${errMsg}. Please configure Google Gemini or Groq in Settings.`;
          await this.engine.eventBus.emit(createEvent('chat_message', 'JobQueue', {
            id: Date.now().toString(),
            role: 'jarvis',
            content: feedback,
            taskId: record.task_id,
            timestamp: new Date().toISOString()
          }));
          if (record.task_id) {
            try {
              const task = this.engine.taskManager.getTask(record.task_id);
              if (task.status === 'CREATED') {
                this.engine.taskManager.queueTask(record.task_id);
              }
              const current = this.engine.taskManager.getTask(record.task_id);
              if (current.status === 'QUEUED') {
                this.engine.taskManager.startTask(record.task_id);
              }
              this.engine.taskManager.failTask(record.task_id, { code: 'AI_ERROR', message: errMsg }, false);
            } catch (e) {
              // ignore
            }
          }
          throw chatErr;
        }
      } else {
        logger.warn(`Unknown job type: ${record.type}`);
      }

      record.status = 'COMPLETED';
      record.completed_at = new Date().toISOString();
      this.repository.update(record);
      await this.engine.eventBus.emit(createEvent('job:completed', 'JobQueue', { jobId }, { jobId }));

    } catch (err) {
      logger.error(`Job ${jobId} failed`, undefined, err instanceof Error ? err : new Error(String(err)));
      
      record.last_error = err instanceof Error ? err.message : String(err);
      
      if (record.attempts < record.max_attempts) {
        record.status = 'RETRYING';
        // Exponential backoff
        const delayMs = Math.pow(2, record.attempts) * 1000; 
        record.next_retry_at = new Date(Date.now() + delayMs).toISOString();
        await this.engine.eventBus.emit(createEvent('job:retrying', 'JobQueue', { jobId, nextRetry: record.next_retry_at }, { jobId }));
      } else {
        record.status = 'FAILED';
        await this.engine.eventBus.emit(createEvent('job:failed', 'JobQueue', { jobId, error: record.last_error }, { jobId }));
      }
      this.repository.update(record);
    }
  }
}
