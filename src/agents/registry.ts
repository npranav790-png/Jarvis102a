import { IAgent, AgentHealth } from './types.js';
import { TaskType } from '../tasks/types.js';
import { AgentNotFoundError } from '../errors/base.js';
import { EventBus } from '../events/bus.js';
import { createEvent } from '../events/types.js';
import { rootLogger } from '../logging/logger.js';

const logger = rootLogger.child('AgentRegistry');

export class AgentRegistry {
  private agents = new Map<string, IAgent>();
  private disabledAgents = new Set<string>();

  constructor(private eventBus?: EventBus) {}

  public register(agent: IAgent): void {
    if (this.agents.has(agent.id)) {
      logger.warn(`Overwriting registered agent: ${agent.id}`);
    }
    this.agents.set(agent.id, agent);
    logger.info(`Agent registered: ${agent.name} (${agent.id}) - Role: ${agent.role}`);

    if (this.eventBus) {
      this.eventBus.emit(createEvent('agent:registered', 'AgentRegistry', {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        capabilities: agent.capabilities,
      }));
    }
  }

  public unregister(id: string): boolean {
    const deleted = this.agents.delete(id);
    this.disabledAgents.delete(id);
    return deleted;
  }

  public get(id: string): IAgent {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new AgentNotFoundError(id);
    }
    return agent;
  }

  public list(): IAgent[] {
    return Array.from(this.agents.values());
  }

  public has(id: string): boolean {
    return this.agents.has(id);
  }

  public isEnabled(id: string): boolean {
    return this.agents.has(id) && !this.disabledAgents.has(id);
  }

  public enable(id: string): void {
    if (!this.agents.has(id)) throw new AgentNotFoundError(id);
    this.disabledAgents.delete(id);
    logger.info(`Agent enabled: ${id}`);
  }

  public disable(id: string): void {
    if (!this.agents.has(id)) throw new AgentNotFoundError(id);
    this.disabledAgents.add(id);
    logger.info(`Agent disabled: ${id}`);
  }

  public findByCapability(capability: string): IAgent[] {
    return this.list()
      .filter(a => this.isEnabled(a.id))
      .filter(a => {
        const caps = a.capabilities || [];
        return caps.includes(capability) || caps.some(c => c.startsWith(`${capability}.`));
      });
  }

  public findByTaskType(taskType: TaskType): IAgent[] {
    return this.list()
      .filter(a => this.isEnabled(a.id))
      .filter(a => {
        const types = a.supportedTaskTypes || [];
        return types.includes(taskType);
      });
  }
}
