export * from './filesystem.js';
export * from './shell.js';
export * from './git.js';
export * from './process.js';
export * from './code-test.js';
export * from './web-search.js';
export * from './github.js';
export * from './screen-capture.js';
export * from './resource-monitor.js';
export * from './notification.js';
export * from './code-diagnose.js';

import {
  filesystemListTool,
  filesystemReadTool,
  filesystemWriteTool,
  filesystemCreateTool,
  filesystemDeleteTool,
  filesystemMoveTool,
  filesystemCopyTool,
  filesystemSearchTool,
} from './filesystem.js';
import { shellExecuteTool } from './shell.js';
import {
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitBranchTool,
  gitAddTool,
  gitCommitTool,
} from './git.js';
import { processStartTool, processStatusTool, processStopTool } from './process.js';
import { codeTestTool } from './code-test.js';
import { webSearchTool } from './web-search.js';
import { githubSearchTool } from './github.js';
import { screenCaptureTool } from './screen-capture.js';
import { systemResourceMonitorTool } from './resource-monitor.js';
import { systemNotificationTool } from './notification.js';
import { codeDiagnoseTool } from './code-diagnose.js';
import { ITool } from '../types.js';

export const ALL_BUILTIN_TOOLS: ITool<any, any>[] = [
  filesystemListTool,
  filesystemReadTool,
  filesystemWriteTool,
  filesystemCreateTool,
  filesystemDeleteTool,
  filesystemMoveTool,
  filesystemCopyTool,
  filesystemSearchTool,
  shellExecuteTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitBranchTool,
  gitAddTool,
  gitCommitTool,
  processStartTool,
  processStatusTool,
  processStopTool,
  codeTestTool,
  webSearchTool,
  githubSearchTool,
  screenCaptureTool,
  systemResourceMonitorTool,
  systemNotificationTool,
  codeDiagnoseTool,
];

