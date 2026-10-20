import { Router } from 'express';
import { JarvisRuntime } from '../runtime/runtime.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { rateLimit, RateLimits } from './middleware/rate-limit.js';
import { AuthController } from './controllers/auth.js';
import { RuntimeController } from './controllers/runtime.js';
import { TasksController } from './controllers/tasks.js';
import { JobsController } from './controllers/jobs.js';
import { ApprovalsController } from './controllers/approvals.js';
import { AutomationsController } from './controllers/automations.js';
import { RemindersController } from './controllers/reminders.js';
import { NotificationsController } from './controllers/notifications.js';
import { ChatController } from './controllers/chat.js';
import { VoiceController } from './controllers/voice.js';
import { MemoryController } from './controllers/memory.js';
import { ProvidersController } from './controllers/providers.js';
import { OrchestratorController } from './controllers/orchestrator.js';
import { MCPController } from './controllers/mcp.js';

export function setupRoutes(runtime: JarvisRuntime): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(runtime);

  // Controllers
  const auth = new AuthController(runtime);
  const runtimeCtrl = new RuntimeController(runtime);
  const tasks = new TasksController(runtime);
  const jobs = new JobsController(runtime);
  const approvals = new ApprovalsController(runtime);
  const automations = new AutomationsController(runtime);
  const reminders = new RemindersController(runtime);
  const notifications = new NotificationsController(runtime);
  const chat = new ChatController(runtime);
  const voice = new VoiceController(runtime);
  const memoryCtrl = new MemoryController(runtime);
  const providersCtrl = new ProvidersController(runtime);
  const orchestrator = new OrchestratorController(runtime);
  const mcp = new MCPController(runtime);

  // Health - Public
  router.get('/health', runtimeCtrl.health);

  // Auth & Pairing - Public (STRICT RATE LIMITING)
  const pairingLimiter = rateLimit('pairing', RateLimits.PAIRING);
  router.post('/devices/pair/start', pairingLimiter, auth.startPairing);
  router.post('/devices/pair/complete', pairingLimiter, auth.completePairing);
  router.post('/auth/refresh', rateLimit('auth_refresh', RateLimits.MODERATE), auth.refreshTokens);

  // Protected routes below
  router.use(authMiddleware);
  
  // Apply a base rate limit to all authenticated routes
  router.use(rateLimit('api_base', RateLimits.HIGHER));

  // Devices
  router.get('/devices', auth.listDevices);
  router.post('/devices/:id/revoke', rateLimit('revoke_device', RateLimits.STRICT), auth.revokeDevice);

  // Runtime
  router.get('/runtime/status', runtimeCtrl.status);

  // Chat (MODERATE RATE LIMITING)
  const chatLimiter = rateLimit('chat', RateLimits.MODERATE);
  router.post('/chat', chatLimiter, chat.processMessage);
  router.post('/chat/stream', chatLimiter, chat.processMessageStream);
  router.get('/chat/messages', chatLimiter, chat.listMessages);

  // Tasks
  router.get('/tasks', tasks.list);
  router.get('/tasks/:id', tasks.get);
  router.post('/tasks/:id/cancel', tasks.cancel);
  router.post('/tasks/:id/retry', tasks.retry);

  // Jobs
  router.get('/jobs', jobs.list);
  router.get('/jobs/:id', jobs.get);
  router.post('/jobs/:id/cancel', jobs.cancel);

  // Approvals (STRICT RATE LIMITING)
  const approvalLimiter = rateLimit('approvals', RateLimits.STRICT);
  router.get('/approvals', approvals.list);
  router.get('/approvals/:id', approvals.get);
  router.post('/approvals/:id/approve', approvalLimiter, approvals.approve);
  router.post('/approvals/:id/deny', approvalLimiter, approvals.deny);

  // Automations
  router.get('/automations', automations.list);
  router.get('/automations/:id', automations.get);
  router.post('/automations', automations.create);
  router.patch('/automations/:id', automations.update);
  router.delete('/automations/:id', automations.delete);
  router.post('/automations/:id/enable', automations.enable);
  router.post('/automations/:id/disable', automations.disable);
  router.post('/automations/:id/run', automations.run);

  // Reminders
  router.get('/reminders', reminders.list);
  router.post('/reminders', reminders.create);
  router.get('/reminders/:id', reminders.get);
  router.post('/reminders/:id/cancel', reminders.cancel);

  // Notifications
  router.get('/notifications', notifications.list);
  router.get('/notifications/:id', notifications.get);
  router.post('/notifications/:id/read', notifications.read);
  router.post('/notifications/read-all', notifications.readAll);

  // Voice
  router.get('/voice/status', voice.getStatus);
  router.post('/voice/sessions', voice.createSession);
  router.get('/voice/sessions/:id', voice.getSession);
  router.post('/voice/sessions/:id/audio', voice.processAudio);
  router.post('/voice/transcribe', voice.transcribe);
  router.post('/voice/synthesize', voice.synthesize);
  router.post('/voice/sessions/:id/finish', voice.finishSession);
  router.post('/voice/sessions/:id/interrupt', voice.interruptSession);
  router.post('/voice/sessions/:id/cancel', voice.cancelSession);

  // Memory Explorer
  router.get('/memory', memoryCtrl.list);
  router.get('/memory/search', memoryCtrl.search);
  router.post('/memory', memoryCtrl.create);
  router.delete('/memory/:id', memoryCtrl.delete);

  // AI Providers & Models
  router.get('/providers', providersCtrl.list);
  router.post('/providers/configure', providersCtrl.configure);
  router.post('/providers/test', providersCtrl.test);

  // OpenCode / Kilo Code Orchestrator
  router.get('/orchestrator/status', orchestrator.getStatus);
  router.get('/orchestrator/jobs', orchestrator.listJobs);
  router.get('/orchestrator/jobs/:id', orchestrator.getJob);
  router.post('/orchestrator/jobs', orchestrator.submitOrder);
  router.post('/orchestrator/jobs/:id/approve-plan', orchestrator.approvePlan);
  router.post('/orchestrator/jobs/:id/reject-plan', orchestrator.rejectPlan);
  router.post('/orchestrator/jobs/:id/approve', orchestrator.approveJob);
  router.post('/orchestrator/jobs/:id/reject', orchestrator.rejectJob);
  router.post('/orchestrator/jobs/:id/edit-prompt', orchestrator.updatePrompt);
  router.post('/orchestrator/jobs/:id/cancel', orchestrator.cancelJob);
  router.post('/orchestrator/jobs/:id/phase/:phaseNumber', orchestrator.executePhase);
  router.post('/orchestrator/jobs/:id/self-heal', orchestrator.selfHeal);
  router.post('/orchestrator/jobs/:id/rollback', orchestrator.rollback);

  // MCP Servers Ecosystem
  router.get('/mcp/servers', mcp.list);
  router.post('/mcp/servers/:name/connect', mcp.connect);
  router.post('/mcp/servers/:name/disconnect', mcp.disconnect);
  router.post('/mcp/servers/:name/toggle', mcp.toggle);

  return router;
}
