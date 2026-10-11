export type ActionCategory =
  | 'READ'
  | 'WRITE'
  | 'EXECUTE'
  | 'NETWORK'
  | 'DESTRUCTIVE'
  | 'SYSTEM';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const RISK_LEVEL_SEVERITY: Record<RiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface SecurityPermission {
  name: string;
  action: ActionCategory;
  riskLevel: RiskLevel;
  description: string;
}

export interface SecurityContext {
  actor: string;
  projectId?: string;
  rootPath?: string;
  allowedPermissions?: Set<string>;
}

export interface ApprovalRequest {
  id: string;
  action: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  actor: string;
  target: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export type ApprovalDecision = 'APPROVED' | 'DENIED';

export type ApproverHandler = (request: ApprovalRequest) => Promise<boolean> | boolean;
