# JARVIS 2.0 — Autonomous Agents Architecture

## Overview

In JARVIS 2.0:
- **Brain** decides **WHAT** to achieve (Intent, Plan, Criteria).
- **Agent** decides **HOW** to achieve it (Workflow, Tool Selection, Step Ordering).
- **Tool** performs the concrete **ACTION**.
- **Verification Engine** evaluates **DID IT WORK?**.

---

## Agent Hierarchy & Roles

JARVIS provides 5 specialized autonomous agents:

```
                  ┌──────────────────────┐
                  │      BaseAgent       │
                  └──────────┬───────────┘
                             │
     ┌───────────────┬───────┴───────┬───────────────┬────────────────┐
     ▼               ▼               ▼               ▼                ▼
GeneralAgent   CodingAgent    ResearchAgent   AnalysisAgent   AutomationAgent
```

### 1. General Agent (`agent:general`)
- **Role**: General-purpose problem solving, multi-tool coordination, directory inspection.
- **Capabilities**: `general.execute`, `task.orchestration`, `filesystem.read`, `filesystem.list`.
- **Supported Task Types**: `GENERAL`, `PLANNING`.

### 2. Coding Agent (`agent:coding`)
- **Role**: Software engineering, file modifications, running tests, debugging, refactoring.
- **Capabilities**: `code.inspect`, `code.modify`, `code.test`, `code.debug`, `code.refactor`, `filesystem.write`, `filesystem.read`.
- **Supported Task Types**: `CODING`.

### 3. Research Agent (`agent:research`)
- **Role**: Codebase exploration, search, and information gathering.
- **Capabilities**: `research.gather`, `research.search`, `information.summarize`, `filesystem.search`, `filesystem.read`.
- **Supported Task Types**: `RESEARCH`.

### 4. Analysis Agent (`agent:analysis`)
- **Role**: Codebase health, log inspection, metrics, git history analysis.
- **Capabilities**: `analysis.inspect`, `analysis.logs`, `analysis.metrics`, `git.read`.
- **Supported Task Types**: `PLANNING`, `GENERAL`.

### 5. Automation Agent (`agent:automation`)
- **Role**: Operational workflows, process execution, script automation.
- **Capabilities**: `automation.workflow`, `process.control`, `shell.script`, `shell.execute`.
- **Supported Task Types**: `AUTOMATION`, `EXECUTION`.

---

## Capability-Based Agent Discovery (`AgentSelector`)

The Brain does not hard-code agent IDs. The `AgentSelector` evaluates:
1. Exact required capabilities matching.
2. Supported task type specialization (`CODING`, `RESEARCH`, `AUTOMATION`).
3. Agent availability and health (`READY`, `BUSY`, `DISABLED`).
4. Fallback to `GeneralAgent` if no specialized agent matches.

Returns an explainable decision structure:
```typescript
export interface AgentSelectionDecision {
  selectedAgent: IAgent;
  reason: string;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  alternatives: string[];
}
```

---

## Controlled Agent Loop (`AgentExecutor`)

```
RECEIVE TASK
   ↓
AgentSelector.selectForTask()
   ↓
TaskManager: CREATED → QUEUED → RUNNING
   ↓
WorkspaceManager: acquireLock(workspacePath, taskId)
   ↓
Agent.run(task, context)
   ├── Step Loop (Max 10 steps, Max 20 tool calls)
   ├── Loop Guard: detectRepeatedActions() -> AgentLoopLimitError
   └── Tool Execution via ToolRegistry.executeTool()
   ↓
VerificationEngine.verify(evidence, criteria)
   ├── PASS → Complete Task
   └── FAIL → Fail Task / Trigger Replan
   ↓
MemoryService.createMemory() (Episodic Record)
   ↓
WorkspaceManager: releaseLock(workspacePath, taskId)
   ↓
TaskManager: completeTask() or failTask()
```
