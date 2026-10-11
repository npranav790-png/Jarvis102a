import { SecurityPermission, ActionCategory, RiskLevel } from '../security/types.js';

export type MCPTransportType = 'STDIO' | 'IN_MEMORY';
export type MCPTrustLevel = 'UNTRUSTED' | 'SANDBOXED' | 'TRUSTED';
export type MCPConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'STARTING' | 'STOPPING';

export interface MCPServerConfig {
  id?: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: MCPTransportType;
  trustLevel?: MCPTrustLevel;
  permissions?: SecurityPermission[];
  enabled?: boolean;
}

export interface MCPToolParameterSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolParameterSchema;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
