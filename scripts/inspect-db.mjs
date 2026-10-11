import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/jarvis.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
for (const t of tables) {
  const count = db.prepare(`SELECT count(*) as count FROM "${t.name}"`).get();
  console.log(`${t.name}: ${count.count}`);
}
