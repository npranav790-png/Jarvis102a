import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/jarvis.db');

db.exec(`
  DELETE FROM plan_steps;
  DELETE FROM plans;
  DELETE FROM tasks;
  DELETE FROM events;
  DELETE FROM runtime_jobs;
  DELETE FROM reasoning_runs;
  DELETE FROM verifications;
  DELETE FROM tool_calls;
  DELETE FROM approvals;
  DELETE FROM voice_sessions;
  DELETE FROM voice_transcripts;
  VACUUM;
`);

console.log('Database cleaned successfully.');
