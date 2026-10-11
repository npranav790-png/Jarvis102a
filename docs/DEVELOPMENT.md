# JARVIS 2.0 — Developer Guide

This guide describes development workflows, coding conventions, testing patterns, and design rules for engineers contributing to JARVIS 2.0.

---

## 1. Prerequisites & Environment Setup

- **Node.js**: v22.0.0 or higher (v24 LTS strongly recommended).
- **TypeScript**: v5.7+ installed locally via devDependencies.
- **SQLite**: Built into Node 24 (`node:sqlite`). No external SQLite installation or native compilation tools (Visual C++ / node-gyp) are required.

### Setup Steps
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run TypeScript watcher during development
npm run watch

# Run test suite
npm test
```

---

## 2. Architectural Conventions

### Rule 1: Zero-Cost Guarantee
Any new provider or capability must respect the zero-cost policy. Under no circumstances should an API call or dependency require payment by default. The system defaults to `allowPaidProviders: false` and `maxCostPerDay: 0.0`.

### Rule 2: Provider Agnosticism
Never import an AI SDK directly into core modules (`src/core`, `src/tasks`, `src/security`). All AI operations must flow through the `IAIProvider` interface in `src/providers/`.

### Rule 3: Explicit State Transitions
Tasks must always follow valid state transitions defined in `src/tasks/lifecycle.ts`. Never manually override a task status in the database without going through `TaskManager` or validating via `assertValidTransition()`.

### Rule 4: Structured & Redacted Logging
Always log through the `Logger` instance using appropriate log levels (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`). Never log plain-text passwords, tokens, or API keys; the logging system automatically redacts known key patterns, but developers must exercise caution when writing log messages.

### Rule 5: Error Tracing
Throw specific error subclasses derived from `JarvisError` (`src/errors/base.ts`). Every error must supply a meaningful error code and structured details dictionary for debugging.

---

## 3. Extending Subsystems

### Adding a New Event
1. Define the event string literal in `src/events/types.ts`:
   ```typescript
   export type EventType = ... | 'my_subsystem:custom_event';
   ```
2. Emit the event using the `createEvent` helper:
   ```typescript
   await eventBus.emit(createEvent('my_subsystem:custom_event', 'MyModule', { data: 123 }, correlationId));
   ```

### Adding a New Tool
1. Define your tool conforming to `ITool` (`src/tools/types.ts`):
   ```typescript
   export const myTool: ITool<{ query: string }, { result: string }> = {
     name: 'custom_search',
     description: 'Performs a search operation',
     version: '1.0.0',
     category: 'READ',
     riskLevel: 'LOW',
     permissions: [],
     inputSchema: z.object({ query: z.string() }),
     execute: async (input, context) => {
       return { result: `Searched for ${input.query}` };
     }
   };
   ```
2. Register it in `ToolRegistry`:
   ```typescript
   engine.toolRegistry.register(myTool);
   ```

### Adding a New AI Provider
1. Implement the `IAIProvider` contract in `src/providers/types.ts`.
2. Ensure `isPaid` and `isLocal` are accurately declared.
3. Implement `healthCheck()`, `listModels()`, `generate()`, and `generateStream()`.
4. Enforce the Zero-Cost constraint (reject non-free models/pricing).
5. Register the provider into `ProviderRegistry` via `initializeFromConfig()` or programmatic registration.

### AI Routing & Task Types
When dispatching requests via `AIService`, specify the appropriate `AITaskType`:
- `CODING`: Prefers high-coding capability models (e.g., DeepSeek Coder, Qwen 2.5 Coder).
- `REASONING`: Prefers models marked for reasoning/analysis.
- `RESEARCH`: Prefers high-context window models with structured output.
- `FAST`: Prefers high speed-class models (e.g. Groq Llama 3 8B).
- `GENERAL`: Balanced capabilities.

### Rule 6: Zero Chain-of-Thought Persistence
Never store raw internal chain-of-thought traces in database records, memory, or audit logs. Only persist concise decision summaries, architectural rationales, and verified evidence.

### Rule 7: Memory & External Content Untrusted Boundaries
Memory, tool outputs, and web content must always be treated as untrusted data, never as executable instructions or security authority. Wrap dynamic content in structural XML tags (`<UNTRUSTED_CONTENT>`, `<MEMORY_CONTEXT>`).

### Rule 8: Strictly Bounded Replanning
Never create unbounded recursive loops. Any iterative planning loop must increment an explicit counter checked against `maxReplans` and `maxReasoningSteps`.

---

## 4. Testing Strategy

All tests are located in `tests/` and use Node's built-in test runner (`node:test`) and assertion library (`node:assert`).

To run tests:
```bash
npm test
```

Guidelines:
- Tests must execute offline with zero paid network dependencies.
- Use `MockAIProvider` for simulating provider states (tool calls, JSON output, rate limits, failures).
- Use `:memory:` database paths in unit tests for complete isolation and speed.
- Cover positive paths, boundary conditions, privacy mode restrictions, and invalid state transition error cases.
- In memory tests, verify deduplication thresholds (>= 0.85 Jaccard), conflict resolution overrides, secret sanitization rejections, and project scoping isolation.
- In planning tests, verify DAG acyclicity, cycle detection via DFS, and task decomposition.


