import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ChatThread, RunRow, RunState } from '../shared/types.ts';

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

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tool TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_turns (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(chat_id) REFERENCES chats(id)
);
CREATE INDEX IF NOT EXISTS chat_turns_chat ON chat_turns(chat_id, created_at);
`;

export interface ChatTurnRow {
  readonly id: string;
  readonly chat_id: string;
  readonly run_id: string;
  readonly body: string;
  readonly created_at: string;
}

export interface Store {
  insert(row: RunRow): void;
  update(id: string, patch: Partial<RunRow>): void;
  get(id: string): RunRow | null;
  list(limit?: number): readonly RunRow[];
  byState(state: RunState): readonly RunRow[];
  createChat(row: ChatThread): void;
  getChat(id: string): ChatThread | null;
  listChats(): readonly ChatThread[];
  touchChat(id: string, updatedAt: string): void;
  addChatTurn(row: ChatTurnRow): void;
  listChatTurns(chatId: string): readonly ChatTurnRow[];
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
  const createChat = db.prepare('INSERT INTO chats (id, title, tool, created_at, updated_at) VALUES (@id, @title, @tool, @created_at, @updated_at)');
  const getChat = db.prepare('SELECT * FROM chats WHERE id = ?');
  const listChats = db.prepare('SELECT * FROM chats ORDER BY updated_at DESC');
  const touchChat = db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?');
  const addChatTurn = db.prepare('INSERT INTO chat_turns (id, chat_id, run_id, body, created_at) VALUES (@id, @chat_id, @run_id, @body, @created_at)');
  const listChatTurns = db.prepare('SELECT * FROM chat_turns WHERE chat_id = ? ORDER BY created_at ASC, id ASC');
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
    createChat(row) {
      createChat.run({ '@id': row.id, '@title': row.title, '@tool': row.tool, '@created_at': row.created_at, '@updated_at': row.updated_at });
    },
    getChat(id) {
      return (getChat.get(id) as ChatThread | undefined) ?? null;
    },
    listChats() {
      return listChats.all() as unknown as ChatThread[];
    },
    touchChat(id, updatedAt) {
      touchChat.run(updatedAt, id);
    },
    addChatTurn(row) {
      addChatTurn.run({ '@id': row.id, '@chat_id': row.chat_id, '@run_id': row.run_id, '@body': row.body, '@created_at': row.created_at });
    },
    listChatTurns(chatId) {
      return listChatTurns.all(chatId) as unknown as ChatTurnRow[];
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

let chatCounter = 0;
export function newChatId(now = new Date()): string {
  const d = now.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  chatCounter = (chatCounter + 1) % 4096;
  return `c-${d}-${chatCounter.toString(16).padStart(3, '0')}`;
}

export function newChatTurnId(chatId: string, n: number): string {
  return `${chatId}-t${String(n).padStart(4, '0')}`;
}
