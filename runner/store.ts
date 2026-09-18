import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { RunRow, RunState } from '../shared/types.ts';

export const STORE_FILE = '.agent-os/runner.sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  mode TEXT NOT NULL,
  repo TEXT NOT NULL,
  cwd TEXT NOT NULL,
  brief TEXT NOT NULL,
  workflow TEXT,
  step INTEGER,
  state TEXT NOT NULL,
  pid INTEGER,
  process_started_at TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  exit_code INTEGER,
  log_path TEXT NOT NULL,
  report_path TEXT NOT NULL,
  note TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_state ON runs(state);
`;

export interface Store {
  insert(row: RunRow): void;
  update(id: string, patch: Partial<RunRow>): void;
  get(id: string): RunRow | null;
  list(limit?: number): readonly RunRow[];
  byState(state: RunState): readonly RunRow[];
  close(): void;
}

const COLUMNS = [
  'id', 'tool', 'mode', 'repo', 'cwd', 'brief', 'workflow', 'step', 'state', 'pid', 'process_started_at',
  'requested_at', 'started_at', 'ended_at', 'exit_code', 'log_path', 'report_path', 'note', 'cancel_requested',
] as const;

export function openStore(path: string): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(DDL);
  const insert = db.prepare(`INSERT INTO runs (${COLUMNS.join(',')}) VALUES (${COLUMNS.map((c) => '@' + c).join(',')})`);
  const get = db.prepare('SELECT * FROM runs WHERE id = ?');
  const list = db.prepare('SELECT * FROM runs ORDER BY requested_at DESC LIMIT ?');
  const byState = db.prepare('SELECT * FROM runs WHERE state = ? ORDER BY requested_at DESC');
  return {
    insert(row) {
      const params: Record<string, string | number | null> = {};
      for (const c of COLUMNS) params['@' + c] = row[c] ?? null;
      insert.run(params);
    },
    update(id, patch) {
      const keys = Object.keys(patch).filter((k) => (COLUMNS as readonly string[]).includes(k) && k !== 'id');
      if (keys.length === 0) return;
      const sets = keys.map((k) => `${k} = @${k}`).join(', ');
      const params: Record<string, string | number | null> = { '@id': id };
      for (const k of keys) params['@' + k] = (patch as Record<string, string | number | null | undefined>)[k] ?? null;
      db.prepare(`UPDATE runs SET ${sets} WHERE id = @id`).run(params);
    },
    get(id) {
      return (get.get(id) as RunRow | undefined) ?? null;
    },
    list(limit = 100) {
      return list.all(limit) as unknown as RunRow[];
    },
    byState(state) {
      return byState.all(state) as unknown as RunRow[];
    },
    close() {
      db.close();
    },
  };
}

let counter = 0;
/** `r-20260918-0012-3f`: sortable, readable, and unique within one Runner process. */
export function newRunId(now = new Date()): string {
  const d = now.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  counter = (counter + 1) % 4096;
  return `r-${d}-${counter.toString(16).padStart(3, '0')}`;
}
