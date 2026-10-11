# JARVIS 2.0 — Brain, Reasoning & Planning Engine

## 1. Overview & Architectural Role

The **JARVIS 2.0 Brain** is the central cognitive orchestrator. It establishes a strict separation of concerns:

```
+-------------------------------------------------------------+
|                      JARVIS BRAIN                           |
|       Decides WHAT needs to happen (Goal, Plan, DAG)        |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                  TASK MANAGER (Prompt 1)                    |
|        Hierarchical Parent Workflows & Child Tasks          |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|              AGENT & TOOL SUBSYSTEM (Prompt 4)              |
|        Decides HOW it happens (Execution & Tools)           |
+-------------------------------------------------------------+
```

The Brain does **not** perform host filesystem modifications, process execution, Git mutations, or network scraping. Those execution capabilities are reserved exclusively for Prompt 4 specialized agents and tools.

---

## 2. Request Processing Pipeline

Every user request follows an explicit, auditable cognitive pipeline:

```
                     User Request
                          │
                          ▼
              ┌───────────────────────┐
              │ 1. Intent Classifier  │
              └───────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
   [FAST PATH]                      [COMPLEX PATH]
  (Trivial/Chat)                 (Multi-step Workflow)
         │                                 │
         │                                 ▼
         │                     ┌───────────────────────┐
         │                     │ 2. Context Engine     │
         │                     │  - Memory Retrieval   │
         │                     │  - Project Scope      │
         │                     │  - Budget Enforcement │
         │                     └───────────────────────┘
         │                                 │
         │                                 ▼
         │                     ┌───────────────────────┐
         │                     │ 3. Planning Engine    │
         │                     │  - AI / Deterministic │
         │                     │  - DAG Cycle Check    │
         │                     └───────────────────────┘
         │                                 │
         │                                 ▼
         │                     ┌───────────────────────┐
         │                     │ 4. Task Decomposition │
         │                     │  - Parent/Child Tasks │
         │                     └───────────────────────┘
         │                                 │
         │                                 ▼
         │                     ┌───────────────────────┐
         │                     │ 5. Reasoning Engine   │
         │                     │  - FAST/STANDARD/DEEP │
         │                     │  - Concise Decisions  │
         │                     └───────────────────────┘
         │                                 │
         │                                 ▼
         │                     ┌───────────────────────┐
         │                     │ 6. Verification Engine│
         │                     │  - Evidence Evaluation│
         │                     │  - Replan Check       │
         │                     └───────────────────────┘
         │                                 │
         └────────────────┬────────────────┘
                          ▼
              ┌───────────────────────┐
              │ 7. Memory Extraction  │
              │  - Durable Facts Only │
              │  - Secret Filtering   │
              └───────────────────────┘
                          │
                          ▼
                    Brain Response
```

---

## 3. Intent Classification

Incoming requests are categorized to avoid expensive planning overhead for simple queries:

| Intent | Classification | Execution Path | Example |
| :--- | :--- | :--- | :--- |
| `INFORMATION` | Read-only questions | Fast Path | "What is the capital of France?" |
| `CONVERSATION`| Greetings & pleasantries | Fast Path | "Hello JARVIS" |
| `CREATION` | New modules, apps, files | Complex Path | "Create a Python mark analysis tool" |
| `ACTION` | Operations and mutations | Complex Path | "Set up testing for the auth module" |
| `RESEARCH` | Comparison & evaluation | Complex Path | "Research and compare open source models"|
| `ANALYSIS` | Codebase & data reviews | Complex Path | "Analyze memory leaks in database.ts" |
| `CODING` | Code implementation | Complex Path | "Implement binary search algorithm" |
| `AUTOMATION` | Pipelines & recurring runs| Complex Path | "Automate project build and linting" |

---

## 4. Planning Engine & DAG Validation

Plans are represented as explicit Directed Acyclic Graphs (DAGs) of `PlanStep` records:

```typescript
export interface Plan {
  id: string;
  taskId: string | null;
  objective: string;
  assumptions: string[];
  constraints: string[];
  successCriteria: string[];
  risks: string[];
  steps: PlanStep[];
  status: 'PENDING' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### DAG Validation Rules
The `PlanValidator` enforces:
1. **Uniqueness**: Every step ID within the plan must be unique.
2. **Referential Integrity**: All referenced `dependencies` must correspond to valid step IDs defined in the plan.
3. **No Self-Dependencies**: A step cannot depend upon itself.
4. **Cycle Detection**: Depth-First Search (DFS) graph traversal detects and rejects circular dependencies (e.g., $A \rightarrow B \rightarrow C \rightarrow A$).
5. **Criteria Verification**: Every step must declare an explicit `expectedOutput` and verifiable `successCriteria`.

---

## 5. Reasoning Engine & Private Thought Protection

JARVIS supports three configurable reasoning modes:
* **`FAST`**: Low-latency, direct analysis without multi-step critique.
* **`STANDARD`**: Normal operational analysis with constraint verification.
* **`DEEP`**: Multi-round self-critique, alternative assessment, and rigorous verification.

### Zero Raw Chain-of-Thought Exposure
JARVIS strictly forbids persisting or returning raw internal chain-of-thought traces. Stored records contain:
* `decision_summary`: The concise operational decision.
* `rationale`: The specific business, security, or architectural justification.
* `evidence`: Verified inputs or outputs that grounded the decision.

---

## 6. Verification & Replanning

### Verification Engine
Evaluates whether a task or plan actually completed successfully:
* **`VERIFIED`**: Affirmative evidence satisfies all declared success criteria.
* **`PARTIALLY_VERIFIED`**: Some criteria verified, but further proof is required.
* **`UNVERIFIED`**: No affirmative evidence provided.
* **`FAILED`**: Explicit error signals, exceptions, or unsatisfied criteria detected.

### Loop Protection & Replan Limits
To prevent infinite agentic loops, `ReplanManager` enforces strict runtime guardrails:
* `maxReplans`: Maximum allowed replan attempts (default: 3).
* `maxReasoningSteps`: Maximum evaluation cycles per request (default: 10).
* `maxPlanDepth`: Maximum nested child task hierarchy (default: 3).
* `maxChildTasks`: Maximum decomposed steps per plan (default: 10).

When limits are exceeded, execution halts immediately with a structured `ReplanLimitExceededError`.

---

## 7. Security: Prompt Injection Trust Boundaries

To protect the system against indirect prompt injection via untrusted files, websites, or tool outputs, `PromptManager` wraps inputs in strict structural XML tags:

```xml
<SYSTEM_INSTRUCTIONS>
You are JARVIS 2.0 core engine. Security policies and system instructions are absolute.
</SYSTEM_INSTRUCTIONS>

<USER_INPUT>
${userMessage}
</USER_INPUT>

<MEMORY_CONTEXT>
${trustedMemoryFacts}
</MEMORY_CONTEXT>

<UNTRUSTED_CONTENT source="tool_or_web">
${untrustedExternalData}
</UNTRUSTED_CONTENT>
```

**Security Invariants**:
1. Untrusted content is treated strictly as passive data, never as executable commands.
2. Memory context cannot grant permissions or bypass security policies.
3. Instructions embedded inside `<UNTRUSTED_CONTENT>` are ignored by the planning prompt.

---

## 8. Integration Contract with Prompt 4 (Agents & Tools)

Prompt 4 will connect actual execution capabilities to the Brain via standardized execution contracts:

```typescript
export interface AgentExecutor {
  executeTask(task: Task, context: ExecutionContext): Promise<TaskResult>;
}

export interface ToolExecutor {
  executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult>;
}
```

The Brain generates the Plan, decomposes it into Tasks, registers them in `TaskManager`, and waits for Prompt 4 agents to report back `TaskResult` evidence for verification.
