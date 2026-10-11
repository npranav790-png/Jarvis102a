import { Command } from 'commander';
import readline from 'node:readline';
import { JarvisEngine } from '../core/engine.js';
import { getConfig, getRedactedConfig } from '../config/config.js';
import { JarvisError } from '../errors/base.js';
import { AITaskType, PrivacyMode } from '../providers/types.js';
import { JarvisRuntime } from '../runtime/runtime.js';

export function createCli(): Command {
  const program = new Command();
  const config = getConfig();

  program
    .name('jarvis')
    .description('JARVIS 2.0 — Autonomous Personal AI Operating & Orchestration System')
    .version(config.app.version);

  // Status / Diagnostics Command
  program
    .command('status')
    .description('Display detailed health and diagnostics for JARVIS subsystems')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const status = await engine.status();
        console.log('\n======================================================');
        console.log(`🤖 JARVIS 2.0 SYSTEM STATUS [${status.application.env.toUpperCase()}]`);
        console.log('======================================================');
        console.log(`Version       : ${status.application.version}`);
        console.log(`Uptime        : ${status.application.uptimeSeconds}s`);
        console.log(`Offline Mode  : ${status.application.offline ? 'YES (Cloud Disabled)' : 'NO'}`);
        console.log(`Privacy Mode  : ${status.privacy.mode}`);
        console.log(`Database      : ${status.database.status} (${status.database.path})`);
        console.log(`Security Mode : ${status.security.mode.toUpperCase()} (Approval: >= ${status.security.approvalThreshold})`);
        console.log(`Cost Policy   : Paid Providers Allowed: ${status.costPolicy.allowPaidProviders} (Max Daily Cost: $${status.costPolicy.maxCostPerDay.toFixed(2)})`);
        console.log(`Discovered Models: ${status.models.discoveredCount} verified free models`);
        console.log(`AI Providers  : ${status.providers.count} registered`);

        for (const [id, health] of Object.entries(status.providers.health as Record<string, any>)) {
          const statusTag = health.status === 'ONLINE' ? 'ONLINE' : health.status;
          console.log(`  - [${statusTag.padEnd(12)}] ${id.padEnd(14)}: ${health.message || 'Ready'}`);
        }

        console.log('\nEntity Totals:');
        console.log(`  Projects : ${status.counts.projects}`);
        console.log(`  Sessions : ${status.counts.sessions}`);
        console.log(`  Tasks    : ${status.counts.tasks}`);
        console.log(`  Events   : ${status.counts.events}`);
        console.log(`  Memories : ${status.counts.memories}`);
        console.log(`  Plans    : ${status.counts.plans}`);
        console.log(`  Tools    : ${status.counts.tools}`);
        console.log(`  Agents   : ${status.counts.agents}`);
        console.log(`  MCP      : ${status.execution.mcpServersCount}`);
        console.log(`  Pending Approvals: ${status.execution.pendingApprovalsCount}`);
        console.log('======================================================\n');
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Config Command
  program
    .command('config')
    .description('Display the active configuration (sensitive keys redacted)')
    .action(() => {
      try {
        const redacted = getRedactedConfig();
        console.log('\n=== JARVIS Active Configuration ===');
        console.log(JSON.stringify(redacted, null, 2));
      } catch (err) {
        handleCliError(err);
      }
    });

  // Interactive Chat / REPL Command
  program
    .command('chat [message]')
    .description('Interactive conversational AI chat session with JARVIS 2.0')
    .option('-s, --session <id>', 'Resume an existing session ID')
    .option('-m, --mode <mode>', 'Task routing mode (GENERAL, CODING, REASONING, FAST)', 'GENERAL')
    .action(async (initialMessage: string | undefined, options: { session?: string; mode: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();

        // 1. Resolve or create session
        let sessionId = options.session;
        if (sessionId) {
          try {
            engine.sessionManager.getSession(sessionId);
          } catch {
            console.log(`⚠️ Session '${sessionId}' not found. Initializing a new session.`);
            sessionId = undefined;
          }
        }

        if (!sessionId) {
          const session = engine.sessionManager.createSession({
            title: `Terminal Chat ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          });
          sessionId = session.id;
        }

        let currentMode = (options.mode.toUpperCase() || 'GENERAL') as AITaskType;

        const handleTurn = async (userText: string) => {
          const userMsgId = `msg_${Date.now()}_u`;
          if (engine.messageRepo) {
            engine.messageRepo.insert({
              id: userMsgId,
              session_id: sessionId!,
              role: 'user',
              content: userText,
              task_id: null,
              metadata_json: JSON.stringify({ mode: currentMode }),
              created_at: new Date().toISOString(),
            });
          }

          let history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
          if (engine.messageRepo) {
            const past = engine.messageRepo.listBySession(sessionId!, 12);
            history = past.map(m => ({
              role: m.role === 'jarvis' ? 'assistant' : (m.role as any),
              content: m.content,
            }));
          }
          if (history.length === 0) {
            history = [{ role: 'user', content: userText }];
          } else if (history[history.length - 1].content !== userText) {
            history.push({ role: 'user', content: userText });
          }

          process.stdout.write('\x1b[36mJARVIS:\x1b[0m ');
          let fullResponse = '';

          try {
            const stream = engine.aiService.stream({
              modelId: '',
              messages: history,
              routing: { taskType: currentMode },
            });

            for await (const chunk of stream) {
              if (chunk.delta) {
                fullResponse += chunk.delta;
                process.stdout.write(chunk.delta);
              }
            }
            console.log('\n');

            const assistMsgId = `msg_${Date.now()}_j`;
            if (engine.messageRepo) {
              engine.messageRepo.insert({
                id: assistMsgId,
                session_id: sessionId!,
                role: 'jarvis',
                content: fullResponse,
                task_id: null,
                metadata_json: '{}',
                created_at: new Date().toISOString(),
              });
            }
          } catch (err: any) {
            console.log(`\n\x1b[31m[AI Error]\x1b[0m ${err?.message || 'Inference failed'}\n`);
          }
        };

        // If one-shot message argument was provided, execute and exit
        if (initialMessage && initialMessage.trim()) {
          await handleTurn(initialMessage.trim());
          return;
        }

        // Interactive REPL banner
        console.log('\n======================================================');
        console.log('🤖 JARVIS 2.0 INTERACTIVE TERMINAL INTERFACE');
        console.log(`   Session : \x1b[36m${sessionId}\x1b[0m`);
        console.log(`   Mode    : \x1b[33m${currentMode}\x1b[0m`);
        console.log('   Commands: \x1b[90m/help, /mode, /status, /history, /approvals, /clear, /exit\x1b[0m');
        console.log('======================================================\n');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: '\x1b[32myou\x1b[0m \x1b[90m>\x1b[0m ',
        });

        rl.prompt();

        for await (const rawLine of rl) {
          const line = rawLine.trim();

          if (!line) {
            rl.prompt();
            continue;
          }

          // Slash commands
          if (line.startsWith('/')) {
            const [cmd, ...args] = line.split(' ');
            const command = cmd.toLowerCase();

            if (command === '/exit' || command === '/quit') {
              console.log('Disconnecting from JARVIS core...');
              break;
            } else if (command === '/help') {
              console.log('\n--- Available Slash Commands ---');
              console.log('  /mode <GENERAL|CODING|REASONING|FAST> : Change AI routing mode');
              console.log('  /status                              : Show system and provider diagnostics');
              console.log('  /history                             : Show recent dialogue turns');
              console.log('  /approvals                           : View and approve pending security requests');
              console.log('  /clear                               : Clear terminal screen');
              console.log('  /exit, /quit                         : Exit interactive shell\n');
            } else if (command === '/clear') {
              console.clear();
            } else if (command === '/mode') {
              if (args[0]) {
                currentMode = args[0].toUpperCase() as AITaskType;
                console.log(`Routing mode changed to: \x1b[33m${currentMode}\x1b[0m`);
              } else {
                console.log(`Current routing mode: \x1b[33m${currentMode}\x1b[0m`);
              }
            } else if (command === '/status') {
              const status = await engine.status();
              console.log(`\nSystem status: [${status.application.env}] | Discovered Models: ${status.models.discoveredCount} | Registered Providers: ${status.providers.count}`);
            } else if (command === '/history') {
              const past = engine.messageRepo?.listBySession(sessionId!, 10) || [];
              console.log(`\n--- Session History (${past.length} messages) ---`);
              for (const m of past) {
                const tag = m.role === 'user' ? '\x1b[32mUSER\x1b[0m' : '\x1b[36mJARVIS\x1b[0m';
                console.log(`[${tag}] ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`);
              }
              console.log('');
            } else if (command === '/approvals') {
              const pending = engine.approvalManager.listPending();
              if (pending.length === 0) {
                console.log('\nNo pending approvals.');
              } else {
                console.log(`\n--- Pending Approvals (${pending.length}) ---`);
                for (const p of pending) {
                  console.log(`[${p.id}] Action: ${p.action} (Risk: ${p.risk_level}) Target: ${p.target}`);
                }
              }
            } else {
              console.log(`Unknown command: '${command}'. Type /help for options.`);
            }

            rl.prompt();
            continue;
          }

          // Process AI chat turn
          await handleTurn(line);
          rl.prompt();
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Start Server Command
  program
    .command('start')
    .description('Start the JARVIS 2.0 API Server and Runtime daemon')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const runtime = new JarvisRuntime(engine);
        await runtime.start();

        process.on('unhandledRejection', (reason) => {
          console.error('[Daemon Warning] Unhandled rejection intercepted:', reason);
        });

        process.on('uncaughtException', (err) => {
          console.error('[Daemon Warning] Uncaught exception intercepted:', err);
        });

        process.on('SIGINT', async () => {
          console.log('\nShutting down JARVIS...');
          await runtime.stop();
          await engine.shutdown();
          process.exit(0);
        });

        // Keep process alive
        await new Promise(() => {});
      } catch (err) {
        handleCliError(err);
      }
    });

  // Provider Group
  const providerCmd = program.command('provider').description('Manage and inspect AI providers');

  providerCmd
    .command('list')
    .description('List all registered AI providers')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const providers = engine.providerRegistry.list();
        console.log('\n--- Registered AI Providers ---');
        for (const p of providers) {
          const type = p.isLocal ? 'LOCAL' : 'CLOUD';
          const paid = p.isPaid ? 'PAID' : 'FREE';
          console.log(`[${p.id.padEnd(14)}] ${p.name}`);
          console.log(`  Type: ${type} | Cost: ${paid}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  providerCmd
    .command('health')
    .description('Check connectivity and health of all AI providers')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        console.log('\nPinging AI providers...');
        const healthMap = await engine.providerRegistry.checkAllHealth(true);
        console.log('\n--- AI Provider Health Report ---');
        for (const [id, health] of Object.entries(healthMap)) {
          console.log(`[${id.padEnd(14)}] Status: ${health.status.padEnd(12)} Latency: ${health.latencyMs ?? 'N/A'}ms`);
          if (health.message) console.log(`  Note: ${health.message}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Model Group
  const modelCmd = program.command('model').description('Inspect discovered AI models and capabilities');

  modelCmd
    .command('list')
    .description('List all verified free models and their capabilities')
    .option('-p, --provider <providerId>', 'Filter by provider')
    .option('-c, --capability <capability>', 'Filter by capability (CODING, REASONING, etc.)')
    .action(async (options: { provider?: string; capability?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const models = await engine.modelRegistry.listModels({
          providerId: options.provider,
          capability: options.capability as any,
        });

        if (models.length === 0) {
          console.log('No models matched the specified criteria.');
          return;
        }

        console.log(`\n--- Verified Free Models (${models.length}) ---`);
        for (const m of models) {
          console.log(`[${m.id}] (${m.name})`);
          console.log(`  Provider: ${m.providerId} | Context: ${m.contextWindow.toLocaleString()} tokens | Speed: ${m.speedClass}`);
          console.log(`  Capabilities: ${m.capabilities.join(', ')}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // AI Pipeline & Router Group
  const aiCmd = program.command('ai').description('Interact with the AI routing and inference pipeline');

  aiCmd
    .command('route')
    .description('Explain routing decision and fallback chain for a task type')
    .option('-t, --type <taskType>', 'Task type (GENERAL, CODING, REASONING, RESEARCH, FAST)', 'GENERAL')
    .option('-p, --privacy <mode>', 'Privacy mode (LOCAL_ONLY, PREFER_LOCAL, ALLOW_CLOUD, CLOUD_PREFERRED)')
    .action(async (options: { type: string; privacy?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const decision = await engine.modelRouter.route({
          taskType: options.type.toUpperCase() as AITaskType,
          privacyMode: options.privacy ? options.privacy.toUpperCase() as PrivacyMode : undefined,
        });

        console.log('\n--- AI Router Decision ---');
        console.log(`Task Type       : ${options.type.toUpperCase()}`);
        console.log(`Privacy Mode    : ${decision.privacyMode}`);
        console.log(`Selected Provider: ${decision.selectedProviderId}`);
        console.log(`Selected Model   : ${decision.selectedModelId}`);
        console.log(`Explanation     : ${decision.reason}`);
        console.log(`Cost Status     : ${decision.costStatus} (₹0.00 / $0.00)`);

        console.log('\nCandidate Ranking:');
        for (const c of decision.candidates) {
          console.log(`  - [${c.providerId}] ${c.modelId.padEnd(36)} Score: ${c.score}`);
        }

        if (decision.fallbackChain.length > 0) {
          console.log('\nFallback Chain:');
          decision.fallbackChain.forEach((fb, idx) => {
            console.log(`  ${idx + 1}. [${fb.providerId}] ${fb.modelId}`);
          });
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  aiCmd
    .command('test [prompt]')
    .description('Run a test generation through the router, fallback, and zero-cost pipeline')
    .option('-t, --type <taskType>', 'Task type (GENERAL, CODING, REASONING, FAST)', 'GENERAL')
    .action(async (promptArg: string | undefined, options: { type: string }) => {
      const engine = new JarvisEngine();
      const prompt = promptArg || 'Hello JARVIS! Are you operational?';

      try {
        await engine.initialize();
        console.log(`\nRouting request for task type: ${options.type}...`);
        const result = await engine.aiService.generate({
          modelId: '', // Router selects optimal model
          messages: [{ role: 'user', content: prompt }],
          routing: { taskType: options.type.toUpperCase() as AITaskType },
        });

        console.log('\n✅ AI Generation Succeeded!');
        console.log(`Provider Used : ${result.providerId}`);
        console.log(`Model Used    : ${result.modelId}`);
        console.log(`Tokens        : ${result.usage.totalTokens} (Prompt: ${result.usage.promptTokens}, Completion: ${result.usage.completionTokens})`);
        console.log(`Cost          : $${result.usage.estimatedCostUSD.toFixed(4)} (Total: ₹0)`);
        console.log(`Fallbacks Run : ${result.fallbackCount}`);
        console.log('\nResponse:');
        console.log(result.content);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Brain Subsystem Group
  const brainCmd = program.command('brain').description('Interact with JARVIS reasoning, planning, and task brain');

  brainCmd
    .command('status')
    .description('Display status and limits of the Brain reasoning engine')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const status = await engine.status();
        console.log('\n--- JARVIS Brain Subsystem ---');
        console.log(`Reasoning Modes : FAST, STANDARD, DEEP`);
        console.log(`Max Replans     : ${engine.brain.limits.maxReplans}`);
        console.log(`Max Plan Depth  : ${engine.brain.limits.maxPlanDepth}`);
        console.log(`Max Child Tasks : ${engine.brain.limits.maxChildTasks}`);
        console.log(`Context Budget  : ${engine.brain.limits.maxContextTokens} tokens`);
        console.log(`Active Plans    : ${status.brain.plansCount}`);
        console.log(`Stored Memories : ${status.brain.memoriesCount}`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  brainCmd
    .command('plan <objective>')
    .description('Generate, validate, and decompose a structured plan for an objective')
    .option('-t, --type <taskType>', 'Task type (CODING, RESEARCH, PLANNING)', 'PLANNING')
    .action(async (objective: string, options: { type: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        console.log(`\nGenerating execution plan for: "${objective}"...`);
        const plan = await engine.brain.planningEngine.generatePlan({
          objective,
          intent: options.type.toUpperCase() as any,
        });

        const decomposition = engine.brain.taskDecomposer.decomposePlan(plan);

        console.log('\n✅ Plan Created & Validated Successfully!');
        console.log(`Plan ID     : ${plan.id}`);
        console.log(`Parent Task : ${decomposition.parentTask.id}`);
        console.log(`Status      : ${plan.status}`);
        console.log(`Steps (${plan.steps.length}):`);
        for (const s of plan.steps) {
          const deps = s.dependencies.length > 0 ? ` (depends on: ${s.dependencies.join(', ')})` : '';
          console.log(`  ${s.stepIndex}. [${s.type.padEnd(8)}] ${s.title}${deps}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  brainCmd
    .command('process <prompt>')
    .description('Execute end-to-end request processing through Brain (intent, memory, context, plan/fast-path)')
    .option('-m, --mode <mode>', 'Reasoning mode (FAST, STANDARD, DEEP)', 'STANDARD')
    .option('-p, --project <projectId>', 'Target project scope ID')
    .action(async (prompt: string, options: { mode: string; project?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        console.log(`\nBrain processing request: "${prompt}"...`);
        const res = await engine.brain.process({
          userInput: prompt,
          reasoningMode: options.mode.toUpperCase() as any,
          projectId: options.project,
        });

        console.log('\n--- Brain Response ---');
        console.log(`Execution Status : ${res.executionStatus}`);
        console.log(`Confidence       : ${res.confidenceStatus}`);
        console.log(`Reasoning Summary: ${res.reasoningSummary}`);
        if (res.plan) {
          console.log(`Generated Plan   : ${res.plan.id} (${res.plan.steps.length} steps)`);
        }
        if (res.memoryUpdates.length > 0) {
          console.log(`Memories Learned : ${res.memoryUpdates.length}`);
        }
        console.log('\nResponse Output:');
        console.log(res.finalResponse);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Memory Subsystem Group
  const memoryCmd = program.command('memory').description('Inspect and manage persistent long-term memories');

  memoryCmd
    .command('list')
    .description('List stored memories')
    .option('-p, --project <projectId>', 'Filter by project ID')
    .option('-t, --type <memoryType>', 'Filter by memory type (SEMANTIC, PROJECT, USER_PREFERENCE, EPISODIC)')
    .action(async (options: { project?: string; type?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const memories = engine.memoryService.listMemories({
          projectId: options.project,
          type: options.type?.toUpperCase() as any,
        });

        if (memories.length === 0) {
          console.log('No memories found.');
          return;
        }

        console.log(`\n--- Stored Memories (${memories.length}) ---`);
        for (const m of memories) {
          const scope = m.projectId ? `[Proj: ${m.projectId}]` : '[Global]';
          console.log(`[${m.id}] [${m.type}] [${m.importance}] ${scope}`);
          console.log(`  Content: ${m.content}`);
          if (m.summary) console.log(`  Summary: ${m.summary}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  memoryCmd
    .command('search <query>')
    .description('Perform ranked semantic/lexical memory search')
    .option('-p, --project <projectId>', 'Filter by project ID')
    .action(async (query: string, options: { project?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const ranked = await engine.memoryService.search(query, {
          targetProjectId: options.project,
        });

        if (ranked.length === 0) {
          console.log('No relevant memories found.');
          return;
        }

        console.log(`\n--- Ranked Memories for "${query}" (${ranked.length}) ---`);
        for (const r of ranked) {
          console.log(`[${r.memory.id}] (Score: ${(r.score * 100).toFixed(1)}%, Rel: ${(r.relevanceScore * 100).toFixed(0)}%, Imp: ${(r.importanceScore * 100).toFixed(0)}%)`);
          console.log(`  Type   : ${r.memory.type} | Importance: ${r.memory.importance}`);
          console.log(`  Content: ${r.memory.content}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  memoryCmd
    .command('show <id>')
    .description('Display detailed information for a specific memory record')
    .action(async (id: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const m = engine.memoryService.getMemory(id);
        console.log('\n--- Memory Record ---');
        console.log(`ID         : ${m.id}`);
        console.log(`Type       : ${m.type}`);
        console.log(`Importance : ${m.importance}`);
        console.log(`Confidence : ${m.confidence}`);
        console.log(`Status     : ${m.status}`);
        console.log(`Project ID : ${m.projectId || 'None (Global)'}`);
        console.log(`Session ID : ${m.sessionId || 'None'}`);
        console.log(`Subject    : ${m.subject || 'N/A'}`);
        console.log(`Predicate  : ${m.predicate || 'N/A'}`);
        console.log(`Content    : ${m.content}`);
        console.log(`Created At : ${m.createdAt}`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  memoryCmd
    .command('delete <id>')
    .description('Delete a specific memory record')
    .action(async (id: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        await engine.memoryService.deleteMemory(id);
        console.log(`\n🗑️ Memory '${id}' deleted successfully.`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Plan Group
  const planCmd = program.command('plan').description('Inspect and validate execution plans');

  planCmd
    .command('show <id>')
    .description('Display details and steps of an execution plan')
    .action(async (id: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const plan = engine.planningEngine.getPlan(id);
        if (!plan) {
          console.log(`Plan not found: '${id}'`);
          return;
        }

        console.log('\n--- Plan Details ---');
        console.log(`ID         : ${plan.id}`);
        console.log(`Objective  : ${plan.objective}`);
        console.log(`Status     : ${plan.status}`);
        console.log(`Parent Task: ${plan.taskId || 'None'}`);
        console.log(`Steps (${plan.steps.length}):`);
        for (const s of plan.steps) {
          const deps = s.dependencies.length > 0 ? ` (depends on: ${s.dependencies.join(', ')})` : '';
          console.log(`  ${s.stepIndex}. [${s.type.padEnd(8)}] ${s.title} [${s.status}]${deps}`);
          if (s.description) console.log(`     Desc: ${s.description}`);
          if (s.expectedOutput) console.log(`     Expected: ${s.expectedOutput}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  planCmd
    .command('validate <id>')
    .description('Validate the dependency graph and constraints of an execution plan')
    .action(async (id: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const plan = engine.planningEngine.getPlan(id);
        if (!plan) {
          console.log(`Plan not found: '${id}'`);
          return;
        }

        const { PlanValidator } = await import('../brain/planner.js');
        PlanValidator.validate(plan);
        console.log(`\n✅ Plan '${id}' is VALID. DAG graph is acyclic with ${plan.steps.length} steps.`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Project Group
  const projectCmd = program.command('project').description('Manage projects and workspace contexts');

  projectCmd
    .command('list')
    .description('List all registered projects')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const projects = engine.projectManager.listProjects();
        if (projects.length === 0) {
          console.log('No projects registered. Create one with `jarvis project create <name>`.');
          return;
        }

        console.log('\n--- Projects ---');
        for (const p of projects) {
          console.log(`[${p.id}] ${p.name} (${p.status})`);
          console.log(`  Path: ${p.rootPath}`);
          if (p.description) console.log(`  Desc: ${p.description}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  projectCmd
    .command('create <name> [rootPath]')
    .description('Create a new project workspace')
    .option('-d, --description <desc>', 'Project description')
    .action(async (name: string, rootPath?: string, options?: { description?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const project = engine.projectManager.createProject({
          name,
          rootPath: rootPath || process.cwd(),
          description: options?.description,
        });
        console.log(`\n✅ Project created: ${project.name} (${project.id})`);
        console.log(`   Root: ${project.rootPath}`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Session Group
  const sessionCmd = program.command('session').description('Manage interaction and dialogue sessions');

  sessionCmd
    .command('list')
    .description('List active sessions')
    .option('-p, --project <projectId>', 'Filter by project ID')
    .action(async (options: { project?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const sessions = engine.sessionManager.listSessions(options.project);
        if (sessions.length === 0) {
          console.log('No sessions found. Create one with `jarvis session create`.');
          return;
        }

        console.log('\n--- Sessions ---');
        for (const s of sessions) {
          console.log(`[${s.id}] "${s.title}" (Status: ${s.status}, Project: ${s.projectId || 'None'})`);
          console.log(`  Last Active: ${s.lastActiveAt}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  sessionCmd
    .command('create')
    .description('Create a new session')
    .option('-t, --title <title>', 'Session title')
    .option('-p, --project <projectId>', 'Associated project ID')
    .action(async (options: { title?: string; project?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const session = engine.sessionManager.createSession({
          title: options.title,
          projectId: options.project,
        });
        console.log(`\n✅ Session created: "${session.title}" (${session.id})`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Task Group
  const taskCmd = program.command('task').description('Manage tasks and workflow execution');

  taskCmd
    .command('list')
    .description('List tasks with optional filters')
    .option('-p, --project <projectId>', 'Filter by project')
    .option('-s, --session <sessionId>', 'Filter by session')
    .option('--status <status>', 'Filter by task status')
    .action(async (options: { project?: string; session?: string; status?: any }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const tasks = engine.taskManager.listTasks({
          projectId: options.project,
          sessionId: options.session,
          status: options.status,
        });

        if (tasks.length === 0) {
          console.log('No tasks found.');
          return;
        }

        console.log('\n--- Tasks ---');
        for (const t of tasks) {
          console.log(`[${t.id}] ${t.title} [Status: ${t.status}] (Pri: ${t.priority}, Type: ${t.type})`);
          if (t.error) console.log(`  Error: ${t.error.code} - ${t.error.message}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  taskCmd
    .command('create <title>')
    .description('Create a new task')
    .option('-d, --description <desc>', 'Task description')
    .option('-p, --project <projectId>', 'Associated project ID')
    .option('-s, --session <sessionId>', 'Associated session ID')
    .option('--priority <priority>', 'Task priority (1-10)', '5')
    .option('--type <type>', 'Task type (GENERAL, PLANNING, CODING, etc.)', 'GENERAL')
    .action(async (title: string, options: {
      description?: string;
      project?: string;
      session?: string;
      priority: string;
      type: string;
    }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const task = engine.taskManager.createTask({
          title,
          description: options.description,
          projectId: options.project,
          sessionId: options.session,
          priority: parseInt(options.priority, 10),
          type: options.type as any,
        });

        console.log(`\n✅ Task created: "${task.title}" (${task.id})`);
        console.log(`   Status: ${task.status} | Priority: ${task.priority}`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  taskCmd
    .command('show <id>')
    .description('Show full details for a task')
    .action(async (id: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const task = engine.taskManager.getTask(id);
        console.log('\n--- Task Details ---');
        console.log(`ID         : ${task.id}`);
        console.log(`Title      : ${task.title}`);
        console.log(`Type       : ${task.type}`);
        console.log(`Status     : ${task.status}`);
        console.log(`Priority   : ${task.priority}`);
        console.log(`Project    : ${task.projectId || 'None'}`);
        console.log(`Session    : ${task.sessionId || 'None'}`);
        console.log(`Retries    : ${task.retryCount} / ${task.maxRetries}`);
        console.log(`Created At : ${task.createdAt}`);
        console.log(`Started At : ${task.startedAt || 'Not started'}`);
        console.log(`Completed  : ${task.completedAt || 'Not completed'}`);
        if (task.description) console.log(`Description: ${task.description}`);
        if (task.output) console.log(`Output     : ${JSON.stringify(task.output, null, 2)}`);
        if (task.error) console.log(`Error      : ${JSON.stringify(task.error, null, 2)}`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  taskCmd
    .command('cancel <id>')
    .description('Cancel an active or queued task')
    .option('-r, --reason <reason>', 'Cancellation reason')
    .action(async (id: string, options: { reason?: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const task = engine.taskManager.cancelTask(id, options.reason);
        console.log(`\n🚫 Task cancelled: ${task.id} (Status: ${task.status})`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  taskCmd
    .command('execute <id>')
    .description('Execute a task through the Prompt 4 autonomous Agent + Tool pipeline')
    .action(async (id: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        console.log(`\n🚀 Executing task '${id}'...`);
        const result = await engine.executeTask(id);
        if (result.success) {
          console.log(`\n✅ Task '${id}' completed successfully in ${result.durationMs}ms`);
          if (result.evidence) console.log(`   Evidence: ${result.evidence}`);
          if (result.output) console.log(`   Output:`, JSON.stringify(result.output, null, 2));
        } else {
          console.log(`\n❌ Task '${id}' failed: ${result.error}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Agent Group
  const agentCmd = program.command('agent').description('Manage and inspect autonomous agents');

  agentCmd
    .command('list')
    .description('List all registered agents')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const agents = engine.agentRegistry.list();
        console.log('\n--- Registered Autonomous Agents ---');
        for (const a of agents) {
          const status = engine.agentRegistry.isEnabled(a.id) ? 'ENABLED' : 'DISABLED';
          console.log(`[${a.id.padEnd(20)}] ${a.name} (${status})`);
          console.log(`  Role        : ${a.role}`);
          console.log(`  Capabilities: ${a.capabilities.join(', ')}`);
          console.log(`  Supported   : ${(a.supportedTaskTypes || []).join(', ')}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  agentCmd
    .command('status [id]')
    .description('Inspect agent status and health')
    .action(async (id?: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        if (id) {
          const a = engine.agentRegistry.get(id);
          console.log('\n--- Agent Details ---');
          console.log(`ID          : ${a.id}`);
          console.log(`Name        : ${a.name}`);
          console.log(`Role        : ${a.role}`);
          console.log(`Status      : ${a.status || 'READY'}`);
          console.log(`Enabled     : ${engine.agentRegistry.isEnabled(a.id)}`);
          console.log(`Description : ${a.description}`);
          console.log(`Capabilities: ${a.capabilities.join(', ')}`);
          console.log(`Tasks       : ${(a.supportedTaskTypes || []).join(', ')}`);
        } else {
          const agents = engine.agentRegistry.list();
          console.log('\n--- Agents Health & Status ---');
          for (const a of agents) {
            console.log(`- ${a.id.padEnd(20)} [${a.status || 'READY'}] (Enabled: ${engine.agentRegistry.isEnabled(a.id)})`);
          }
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Tool Group
  const toolCmd = program.command('tool').description('Manage, inspect, and test tools');

  toolCmd
    .command('list')
    .description('List all registered tools')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const tools = engine.toolRegistry.list();
        console.log('\n--- Registered Tools ---');
        for (const t of tools) {
          const status = engine.toolRegistry.getStatus(t.name);
          console.log(`[${t.name.padEnd(25)}] v${t.version} (${status}) [Category: ${t.category}, Risk: ${t.riskLevel}]`);
          console.log(`  Description : ${t.description}`);
          if (t.capabilities) console.log(`  Capabilities: ${t.capabilities.join(', ')}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  toolCmd
    .command('inspect <name>')
    .description('Inspect schema and permissions of a tool')
    .action(async (name: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const tool = engine.toolRegistry.get(name);
        console.log('\n--- Tool Specification ---');
        console.log(`Name        : ${tool.name}`);
        console.log(`Version     : ${tool.version}`);
        console.log(`Description : ${tool.description}`);
        console.log(`Category    : ${tool.category}`);
        console.log(`Risk Level  : ${tool.riskLevel}`);
        console.log(`Status      : ${engine.toolRegistry.getStatus(tool.name)}`);
        console.log(`Permissions : ${JSON.stringify(tool.permissions, null, 2)}`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  toolCmd
    .command('test <name>')
    .description('Dry-run test a tool')
    .option('-i, --input <json>', 'Input JSON parameters', '{}')
    .action(async (name: string, options: { input: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const inputData = JSON.parse(options.input);
        console.log(`\n🧪 Testing tool '${name}' with input:`, inputData);
        const result = await engine.toolRegistry.executeTool({
          callId: `tcall_test_${Date.now()}`,
          toolName: name,
          input: inputData,
          context: { actor: 'cli-test' },
          dryRun: true,
        });
        console.log(`Result: ${result.status} (Success: ${result.success}, Duration: ${result.durationMs}ms)`);
        if (result.evidence) console.log(`Evidence: ${result.evidence}`);
        if (result.output) console.log(`Output:`, JSON.stringify(result.output, null, 2));
        if (result.error) console.log(`Error:`, JSON.stringify(result.error, null, 2));
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Approval Group
  const approvalCmd = program.command('approval').description('Manage security approvals');

  approvalCmd
    .command('list')
    .description('List pending approval requests')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const pending = engine.approvalManager.listPending();
        console.log('\n--- Pending Approval Requests ---');
        if (pending.length === 0) {
          console.log('No approvals currently pending.');
        } else {
          for (const req of pending) {
            console.log(`[${req.id}] Action: ${req.action} (Risk: ${req.risk_level}, Actor: ${req.actor})`);
            console.log(`  Target  : ${req.target}`);
            console.log(`  Reason  : ${req.reason || 'N/A'}`);
            console.log(`  Expires : ${req.expires_at}`);
          }
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  approvalCmd
    .command('approve <id>')
    .description('Approve a pending request')
    .action(async (id: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const approved = engine.approvalManager.approve(id, 'cli:user');
        console.log(`\n✅ Approved request '${id}' for action '${approved.action}'`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  approvalCmd
    .command('deny <id>')
    .description('Deny a pending request')
    .option('-r, --reason <reason>', 'Denial reason', 'User denied from CLI')
    .action(async (id: string, options: { reason: string }) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const denied = engine.approvalManager.deny(id, 'cli:user', options.reason);
        console.log(`\n🚫 Denied request '${id}' for action '${denied.action}'`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // MCP Group
  const mcpCmd = program.command('mcp').description('Manage Model Context Protocol (MCP) servers');

  mcpCmd
    .command('list')
    .description('List configured MCP servers')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const servers = engine.mcpRegistry.listServers();
        console.log('\n--- Configured MCP Servers ---');
        if (servers.length === 0) {
          console.log('No external MCP servers configured.');
        } else {
          for (const s of servers) {
            const status = engine.mcpRegistry.getStatus(s.name);
            console.log(`[${s.name.padEnd(20)}] (${status}) - Command: ${s.command}`);
            console.log(`  Transport   : ${s.transport || 'STDIO'} | Trust: ${s.trustLevel || 'UNTRUSTED'}`);
          }
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  mcpCmd
    .command('status [name]')
    .description('Inspect connection status of MCP servers')
    .action(async (name?: string) => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        if (name) {
          const status = engine.mcpRegistry.getStatus(name);
          console.log(`\nMCP Server '${name}' status: ${status}`);
        } else {
          const servers = engine.mcpRegistry.listServers();
          console.log('\n--- MCP Connection Status ---');
          for (const s of servers) {
            console.log(`- ${s.name.padEnd(20)}: ${engine.mcpRegistry.getStatus(s.name)}`);
          }
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  // Runtime Group
  const runtimeCmd = program.command('runtime').description('Manage the JARVIS background runtime (Prompt 5)');

  runtimeCmd
    .command('status')
    .description('Display status of the background runtime')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const runtime = new JarvisRuntime(engine);
        // In a real CLI this would connect to the running daemon, 
        // but for now we just show database queue state
        console.log('\n--- JARVIS Runtime Status ---');
        console.log(`State       : ${runtime.getStatus().state}`);
        const result = engine.db.connect().prepare('SELECT count(*) as c FROM runtime_jobs WHERE status IN (?, ?)').get('QUEUED', 'RUNNING') as any;
        console.log(`Active Jobs : ${result.c}`);
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  runtimeCmd
    .command('jobs')
    .description('List queued and running background jobs')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const runtime = new JarvisRuntime(engine);
        const pending = runtime.jobRepo.findPendingJobs(20);
        console.log(`\n--- Pending Jobs (${pending.length}) ---`);
        for (const j of pending) {
          console.log(`[${j.id}] ${j.type} (Pri: ${j.priority}, Status: ${j.status}) - Created: ${j.created_at}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  runtimeCmd
    .command('automations')
    .description('List active automations')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const runtime = new JarvisRuntime(engine);
        const autos = runtime.automationRepo.listEnabled();
        console.log(`\n--- Enabled Automations (${autos.length}) ---`);
        for (const a of autos) {
          console.log(`[${a.id}] ${a.name} - Trigger: ${a.trigger_type}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  runtimeCmd
    .command('reminders')
    .description('List active reminders')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const db = engine.db.connect();
        const reminders = db.prepare('SELECT * FROM reminders WHERE status = ?').all('SCHEDULED') as any[];
        console.log(`\n--- Scheduled Reminders (${reminders.length}) ---`);
        for (const r of reminders) {
          console.log(`[${r.id}] ${r.title} - Scheduled for: ${r.scheduled_at}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  runtimeCmd
    .command('notifications')
    .description('List recent notifications')
    .action(async () => {
      const engine = new JarvisEngine();
      try {
        await engine.initialize();
        const db = engine.db.connect();
        const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10').all() as any[];
        console.log(`\n--- Recent Notifications ---`);
        for (const n of notifications) {
          console.log(`[${n.id}] [${n.priority}] ${n.title} (Status: ${n.status}) - ${n.created_at}`);
        }
      } catch (err) {
        handleCliError(err);
      } finally {
        await engine.shutdown();
      }
    });

  return program;
}

function handleCliError(err: unknown): void {
  if (err instanceof JarvisError) {
    console.error(`\n❌ [${err.code}] ${err.message}`);
    if (Object.keys(err.details).length > 0) {
      console.error('   Details:', JSON.stringify(err.details));
    }
  } else if (err instanceof Error) {
    console.error(`\n❌ Error: ${err.message}`);
  } else {
    console.error('\n❌ An unknown error occurred:', err);
  }
  process.exitCode = 1;
}
