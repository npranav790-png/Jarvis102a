export type SessionStatus = 'ACTIVE' | 'IDLE' | 'CLOSED' | 'ARCHIVED';

export interface Session {
  id: string;
  projectId: string | null;
  title: string;
  metadata: Record<string, unknown>;
  status: SessionStatus;
  createdAt: string;
  lastActiveAt: string;
}

export interface CreateSessionInput {
  title?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}
