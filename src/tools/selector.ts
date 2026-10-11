import { ToolRegistry } from './registry.js';
import { ITool, ToolDefinition } from './types.js';
import { TaskType } from '../tasks/types.js';

export interface ToolSelectionRequest {
  taskType?: TaskType;
  requiredCapabilities?: string[];
  allowedToolNames?: string[];
  maxTools?: number;
}

export interface ToolSelectionResult {
  tools: ITool<any, any>[];
  toolNames: string[];
  reason: string;
  missingCapabilities: string[];
}

export class ToolSelector {
  constructor(private registry: ToolRegistry) {}

  /**
   * Discovers and selects the optimal set of tools for a task or agent.
   */
  public selectTools(request: ToolSelectionRequest): ToolSelectionResult {
    const allTools = this.registry.list();
    const availableTools = allTools.filter(t => this.registry.getStatus(t.name) === 'AVAILABLE');

    let candidates = availableTools;

    // Filter by allowedToolNames if specified
    if (request.allowedToolNames && request.allowedToolNames.length > 0) {
      candidates = candidates.filter(t => request.allowedToolNames!.includes(t.name));
    }

    const selected: ITool<any, any>[] = [];
    const missingCapabilities: string[] = [];

    // Match required capabilities
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      for (const cap of request.requiredCapabilities) {
        const matching = candidates.find(t => {
          const tCaps = t.capabilities || [];
          return tCaps.includes(cap) || tCaps.some(c => c.startsWith(`${cap}.`));
        });
        if (matching) {
          if (!selected.includes(matching)) {
            selected.push(matching);
          }
        } else {
          missingCapabilities.push(cap);
        }
      }
    } else {
      // Default tool selection based on task type
      if (request.taskType === 'CODING') {
        selected.push(...candidates.filter(t =>
          t.name.startsWith('filesystem.') || t.name === 'shell.execute' || t.name === 'code.test' || t.name.startsWith('git.')
        ));
      } else if (request.taskType === 'RESEARCH') {
        selected.push(...candidates.filter(t =>
          t.name === 'filesystem.list' || t.name === 'filesystem.read' || t.name === 'filesystem.search'
        ));
      } else {
        selected.push(...candidates);
      }
    }

    // Limit maximum tools returned
    const max = request.maxTools || 10;
    const finalTools = selected.slice(0, max);

    const reason = missingCapabilities.length > 0
      ? `Selected ${finalTools.length} tools. Note: missing capabilities: ${missingCapabilities.join(', ')}.`
      : `Selected ${finalTools.length} tools satisfying requirements.`;

    return {
      tools: finalTools,
      toolNames: finalTools.map(t => t.name),
      reason,
      missingCapabilities,
    };
  }
}
