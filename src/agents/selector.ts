import { AgentRegistry } from './registry.js';
import { IAgent } from './types.js';
import { Task, TaskType } from '../tasks/types.js';
import { AgentSelectionError } from '../errors/base.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('AgentSelector');

export interface AgentSelectionDecision {
  selectedAgent: IAgent;
  reason: string;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  alternatives: string[];
}

export class AgentSelector {
  constructor(private registry: AgentRegistry) {}

  /**
   * Selects the most capable and healthy agent for a given task.
   */
  public selectForTask(task: Task, requiredCapabilities: string[] = []): AgentSelectionDecision {
    const allAgents = this.registry.list().filter(a => this.registry.isEnabled(a.id));

    if (allAgents.length === 0) {
      throw new AgentSelectionError('No enabled agents registered in the system.');
    }

    // 1. Try to find agent matching required capabilities
    if (requiredCapabilities.length > 0) {
      const candidates = allAgents.filter(a => {
        const caps = a.capabilities || [];
        return requiredCapabilities.every(req => caps.includes(req) || caps.some(c => c.startsWith(`${req}.`)));
      });

      if (candidates.length > 0) {
        const selected = candidates[0];
        const alternatives = candidates.slice(1).map(c => c.id);
        logger.info(`Selected agent '${selected.id}' matching required capabilities: [${requiredCapabilities.join(', ')}]`);
        return {
          selectedAgent: selected,
          reason: `Matched all ${requiredCapabilities.length} required capabilities.`,
          requiredCapabilities,
          missingCapabilities: [],
          alternatives,
        };
      }
    }

    // 2. Match by TaskType
    const typeMatches = allAgents.filter(a => {
      const types = a.supportedTaskTypes || [];
      return types.includes(task.type);
    });

    if (typeMatches.length > 0) {
      const selected = typeMatches[0];
      const alternatives = typeMatches.slice(1).map(c => c.id);
      logger.info(`Selected agent '${selected.id}' matching task type '${task.type}'`);
      return {
        selectedAgent: selected,
        reason: `Matched specialized task type '${task.type}'.`,
        requiredCapabilities,
        missingCapabilities: [],
        alternatives,
      };
    }

    // 3. Fallback to GeneralAgent or first available agent
    const generalAgent = allAgents.find(a => a.id === 'agent:general') || allAgents[0];
    logger.info(`Fallback to agent '${generalAgent.id}' for task '${task.title}'`);

    return {
      selectedAgent: generalAgent,
      reason: `No specialized agent found for task type '${task.type}'. Defaulting to general agent.`,
      requiredCapabilities,
      missingCapabilities: requiredCapabilities,
      alternatives: allAgents.filter(a => a.id !== generalAgent.id).map(a => a.id),
    };
  }
}
