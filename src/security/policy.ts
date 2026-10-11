import { ActionCategory, RiskLevel, RISK_LEVEL_SEVERITY, SecurityPermission } from './types.js';

export class SecurityPolicy {
  constructor(
    private securityMode: 'strict' | 'permissive' | 'autonomous' = 'strict',
    private approvalThreshold: RiskLevel = 'HIGH'
  ) {}

  public getMode(): string {
    return this.securityMode;
  }

  public getApprovalThreshold(): RiskLevel {
    return this.approvalThreshold;
  }

  /**
   * Determine default risk level for an action category
   */
  public getDefaultRiskForCategory(category: ActionCategory): RiskLevel {
    switch (category) {
      case 'READ':
        return 'LOW';
      case 'WRITE':
        return 'MEDIUM';
      case 'NETWORK':
        return 'MEDIUM';
      case 'EXECUTE':
        return 'HIGH';
      case 'DESTRUCTIVE':
      case 'SYSTEM':
        return 'CRITICAL';
      default:
        return 'HIGH';
    }
  }

  /**
   * Determine whether an action requires explicit human or gatekeeper approval
   */
  public requiresApproval(riskLevel: RiskLevel): boolean {
    if (this.securityMode === 'permissive') {
      return RISK_LEVEL_SEVERITY[riskLevel] >= RISK_LEVEL_SEVERITY['CRITICAL'];
    }
    if (this.securityMode === 'autonomous') {
      return false;
    }
    // Strict mode (default)
    return RISK_LEVEL_SEVERITY[riskLevel] >= RISK_LEVEL_SEVERITY[this.approvalThreshold];
  }
}
