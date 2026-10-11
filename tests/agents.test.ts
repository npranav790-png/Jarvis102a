import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AgentRegistry } from '../dist/agents/registry.js';
import type { IAgent } from '../dist/agents/types.js';
import { AgentNotFoundError } from '../dist/errors/base.js';

describe('Agent Architecture & Registry', () => {
  const dummyAgent: IAgent = {
    id: 'agent:researcher',
    name: 'Research Agent',
    role: 'Synthesize documentation and research',
    description: 'An agent dedicated to deep search and summarization',
    capabilities: ['web_search', 'document_parsing'],
    allowedTools: ['search', 'fetch'],
    modelRequirements: { minContextWindow: 8000, supportsTools: true },
    run: async (task) => {
      return {
        success: true,
        output: `Finished task: ${task.title}`,
      };
    },
  };

  it('registers and retrieves agent definitions', () => {
    const registry = new AgentRegistry();
    registry.register(dummyAgent);

    assert.strictEqual(registry.has('agent:researcher'), true);
    const agent = registry.get('agent:researcher');
    assert.strictEqual(agent.name, 'Research Agent');
    assert.strictEqual(agent.capabilities.length, 2);
  });

  it('throws AgentNotFoundError when querying unregistered agent', () => {
    const registry = new AgentRegistry();
    assert.throws(() => {
      registry.get('missing-agent');
    }, AgentNotFoundError);
  });
});
