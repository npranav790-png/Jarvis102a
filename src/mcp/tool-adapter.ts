import { z } from 'zod';
import { ITool, ToolDefinition, ToolExecutionContext } from '../tools/types.js';
import { MCPClient } from './client.js';
import { MCPTool, MCPServerConfig } from './types.js';
import { ActionCategory, RiskLevel, SecurityPermission } from '../security/types.js';

export class MCPToolAdapter implements ITool<Record<string, unknown>, { content: string; raw: any }> {
  public readonly name: string;
  public readonly description: string;
  public readonly version: string = '1.0.0';
  public readonly category: ActionCategory = 'NETWORK';
  public readonly riskLevel: RiskLevel;
  public readonly permissions: SecurityPermission[];
  public readonly inputSchema: z.ZodType<Record<string, unknown>>;
  public readonly capabilities: string[];

  constructor(
    private client: MCPClient,
    private serverConfig: MCPServerConfig,
    private mcpTool: MCPTool
  ) {
    this.name = `mcp:${serverConfig.name}:${mcpTool.name}`;
    this.description = `[MCP: ${serverConfig.name}] ${mcpTool.description || 'External MCP tool'}`;

    // Risk level mapped from MCP server trust level
    if (serverConfig.trustLevel === 'TRUSTED') {
      this.riskLevel = 'LOW';
    } else if (serverConfig.trustLevel === 'SANDBOXED') {
      this.riskLevel = 'MEDIUM';
    } else {
      this.riskLevel = 'HIGH'; // UNTRUSTED by default
    }

    this.permissions = serverConfig.permissions || [
      { name: `mcp:${serverConfig.name}`, action: 'NETWORK', riskLevel: this.riskLevel, description: `Execute tool on MCP server ${serverConfig.name}` },
    ];

    this.capabilities = [`mcp.${serverConfig.name}.${mcpTool.name}`, 'mcp.tool'];

    // Dynamic schema validation for arguments
    this.inputSchema = z.record(z.unknown());
  }

  public definition(): ToolDefinition {
    return {
      id: this.name,
      name: this.name,
      description: this.description,
      version: this.version,
      category: this.category,
      riskLevel: this.riskLevel,
      capabilities: this.capabilities,
      permissions: this.permissions,
      inputSchema: this.inputSchema,
      supportsDryRun: false,
      supportsCancellation: false,
      status: this.client.status === 'CONNECTED' ? 'AVAILABLE' : 'DEGRADED',
    };
  }

  private executionCount = 0;
  private maxExecutionBudget = 100; // Hard limit per adapter instance to prevent runaway zero-cost

  public async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<{ content: string; raw: any }> {
    if (this.executionCount >= this.maxExecutionBudget) {
      throw new Error(`ZERO COST ENFORCEMENT: MCP Tool ${this.name} exceeded maximum execution budget of ${this.maxExecutionBudget}.`);
    }
    this.executionCount++;

    const rawResult = await this.client.callTool(this.mcpTool.name, input);

    // Extract text contents
    const textPieces = (rawResult.content || [])
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');

    // Structural XML encapsulation to enforce prompt injection defense boundary
    const untrustedWrapped = `<UNTRUSTED_CONTENT source="mcp:${this.serverConfig.name}:${this.mcpTool.name}">\n${textPieces}\n</UNTRUSTED_CONTENT>`;

    return {
      content: untrustedWrapped,
      raw: rawResult,
    };
  }
}
