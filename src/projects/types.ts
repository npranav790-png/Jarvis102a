export type ProjectStatus = 'ACTIVE' | 'ARCHIVED' | 'INACTIVE';

export interface Project {
  id: string;
  name: string;
  description: string;
  rootPath: string;
  metadata: Record<string, unknown>;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  rootPath: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  rootPath?: string;
  status?: ProjectStatus;
  metadata?: Record<string, unknown>;
}
