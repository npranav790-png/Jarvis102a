import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { CodebaseResearcher } from '../dist/orchestration/opencode/researcher.js';
import { SpecPromptEngine } from '../dist/orchestration/opencode/prompt-engineer.js';
import { OpenCodeBridge } from '../dist/orchestration/opencode/bridge.js';
import { OpenCodeOrchestrator } from '../dist/orchestration/opencode/orchestrator.js';

describe('JARVIS 2.0 — OpenCode & Kilobyte Orchestrator Subsystem', () => {
  const testWorkspace = path.resolve(process.cwd());

  it('1. CodebaseResearcher accurately identifies manifests, tech stack, and structure', async () => {
    const researcher = new CodebaseResearcher();
    const result = await researcher.research(testWorkspace, 'implement jwt authentication and voice routes');

    assert.ok(result.projectRoot.length > 0);
    assert.ok(result.manifests.includes('package.json'), 'Must detect package.json');
    assert.ok(result.manifests.includes('tsconfig.json'), 'Must detect tsconfig.json');
    assert.ok(result.techStack.includes('TypeScript'), 'Must detect TypeScript');
    assert.ok(result.techStack.includes('Node.js'), 'Must detect Node.js');
    assert.ok(result.relevantFiles.length > 0, 'Must identify relevant files');
    assert.ok(result.projectStructureSummary.length > 0, 'Must produce structure summary');
  });

  it('2. SpecPromptEngine brainstorms architecture and crafts structured OpenCode prompt', async () => {
    const researcher = new CodebaseResearcher();
    const research = await researcher.research(testWorkspace, 'add health check endpoint for api');

    const promptEngine = new SpecPromptEngine();
    const { brainstorm, prompt } = await promptEngine.analyzeAndEngineer(
      {
        orderText: 'add health check endpoint for api',
        targetWorkspace: testWorkspace,
        engine: 'opencode',
      },
      research
    );

    assert.ok(brainstorm.architecturalApproach.length > 0);
    assert.ok(brainstorm.technicalDecisions.length > 0);
    assert.ok(brainstorm.affectedComponents.length > 0);

    assert.ok(prompt.title.length > 0);
    assert.ok(prompt.promptText.includes('JARVIS DIRECTIVE FOR OPENCODE / KILO CODE'));
    assert.ok(prompt.promptText.includes('add health check endpoint for api'));
    assert.ok(prompt.instructions.length > 0);
    assert.ok(prompt.constraints.length > 0);
  });

  it('3. OpenCodeBridge detects host binary status for OpenCode and Kilo Code', async () => {
    const bridge = new OpenCodeBridge();
    const status = await bridge.getStatus();

    assert.ok(typeof status.opencodeInstalled === 'boolean');
    assert.ok(typeof status.kiloInstalled === 'boolean');
    assert.ok(status.supportedModels.length > 0);
    // On this machine, both opencode and kilo are installed
    assert.ok(status.opencodeInstalled || status.kiloInstalled, 'At least one coding engine must be detected');
  });

  it('4. OpenCodeOrchestrator manages full job lifecycle with two-stage approval gates (plan then prompt)', async () => {
    const orchestrator = new OpenCodeOrchestrator();

    // 1. Submit Order -> Pauses at Gate 1: AWAITING_PLAN_APPROVAL
    const job = await orchestrator.submitOrder({
      orderText: 'Create a utility function to validate email addresses with regex',
      targetWorkspace: testWorkspace,
      engine: 'opencode',
    });

    assert.ok(job.id.startsWith('orch_'));
    assert.strictEqual(job.status, 'AWAITING_PLAN_APPROVAL', 'Job must pause at AWAITING_PLAN_APPROVAL for plan review');
    assert.strictEqual(job.planApprovalStatus, 'PENDING');
    assert.ok(job.research, 'Job must contain research');
    assert.ok(job.brainstorm, 'Job must contain brainstorm');
    assert.ok(job.projectPlan, 'Job must contain phased project plan');
    assert.ok(job.projectPlan.phases.length >= 2, 'Project plan must contain multiple phases');
    assert.strictEqual(job.engineeredPrompt, undefined, 'Prompt should not be generated before plan approval');

    // 2. Approve Plan (Gate 1) -> Advances to Stage 2 & Pauses at Gate 2: AWAITING_APPROVAL
    const planApprovedJob = await orchestrator.approvePlan(job.id);
    assert.strictEqual(planApprovedJob.status, 'AWAITING_APPROVAL', 'Job must pause at AWAITING_APPROVAL for prompt review');
    assert.strictEqual(planApprovedJob.approvalStatus, 'PENDING');
    assert.ok(planApprovedJob.engineeredPrompt, 'Job must now contain engineered prompt');
    assert.ok(planApprovedJob.engineeredPrompt.report, 'Prompt must contain brief report');
    assert.ok(planApprovedJob.engineeredPrompt.report.whatItDoes.length > 0, 'Report must describe what it does');

    // 3. Allow user to edit prompt before final approval
    const updated = orchestrator.updatePromptText(job.id, '# Custom refined prompt\nValidate email format.');
    assert.strictEqual(updated.engineeredPrompt?.promptText, '# Custom refined prompt\nValidate email format.');
    assert.strictEqual(updated.engineeredPrompt?.version, 2);

    // 4. User Rejection Flow
    const rejectedJob = await orchestrator.rejectJob(job.id, 'Scope needs refinement');
    assert.strictEqual(rejectedJob.status, 'REJECTED');
    assert.strictEqual(rejectedJob.approvalStatus, 'REJECTED');
    assert.strictEqual(rejectedJob.rejectionReason, 'Scope needs refinement');
  });

  it('5. OpenCodeOrchestrator lists and retrieves jobs cleanly', async () => {
    const orchestrator = new OpenCodeOrchestrator();

    await orchestrator.submitOrder({
      orderText: 'Job 1',
      targetWorkspace: testWorkspace,
    });
    await orchestrator.submitOrder({
      orderText: 'Job 2',
      targetWorkspace: testWorkspace,
    });

    const list = orchestrator.listJobs();
    assert.strictEqual(list.length, 2);

    const fetched = orchestrator.getJob(list[0].id);
    assert.ok(fetched);
    assert.strictEqual(fetched?.id, list[0].id);
  });
});
