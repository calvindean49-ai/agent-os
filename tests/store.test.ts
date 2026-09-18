import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newChatId, newChatTurnId, newRunId, openStore } from '../runner/store.ts';
import type { RunRow } from '../shared/types.ts';

const row = (id: string): RunRow => ({ id, tool: 'codex', mode: 'read', repo: 'brain', cwd: '/b', brief: 'x', workflow: null, step: null, state: 'requested', pid: null, process_started_at: null, requested_at: id, started_at: null, ended_at: null, exit_code: null, log_path: '/l', report_path: '/p', note: null, cancel_requested: 0 });

test('insert, update, get, list, byState', () => {
  const s = openStore(':memory:');
  s.insert(row('a'));
  s.insert(row('b'));
  s.update('a', { state: 'running', pid: 7, process_started_at: 'tok' });
  assert.equal(s.get('a')?.state, 'running');
  assert.equal(s.get('a')?.pid, 7);
  assert.equal(s.get('zzz'), null);
  assert.deepEqual(s.list().map((r) => r.id), ['b', 'a']);
  assert.deepEqual(s.byState('running').map((r) => r.id), ['a']);
  s.update('a', { id: 'hack', note: 'n' } as Partial<RunRow>);
  assert.equal(s.get('a')?.note, 'n');
  assert.equal(s.get('hack'), null);
  s.close();
});

test('run ids sort by time and do not repeat within a process', () => {
  const a = newRunId(new Date('2026-09-18T10:00:00Z'));
  const b = newRunId(new Date('2026-09-18T10:00:00Z'));
  assert.notEqual(a, b);
  assert.match(a, /^r-20260918-1000-[0-9a-f]{3}$/);
});

test('chat threads and turns persist beside runs', () => {
  const s = openStore(':memory:');
  const chat = { id: 'c-1', title: 'A personal project', tool: 'claude' as const, created_at: '1', updated_at: '1' };
  s.createChat(chat);
  s.insert(row('r-1'));
  s.addChatTurn({ id: 'c-1-t0001', chat_id: 'c-1', run_id: 'r-1', body: 'Help me think', created_at: '2' });
  s.touchChat('c-1', '3');
  assert.equal(s.getChat('c-1')?.title, 'A personal project');
  assert.equal(s.listChats()[0]?.updated_at, '3');
  assert.deepEqual(s.listChatTurns('c-1').map((turn) => [turn.run_id, turn.body]), [['r-1', 'Help me think']]);
  assert.equal(s.getChat('missing'), null);
  s.close();
});

test('chat ids are distinct and turn ids sort within a thread', () => {
  const a = newChatId(new Date('2026-09-18T10:00:00Z'));
  const b = newChatId(new Date('2026-09-18T10:00:00Z'));
  assert.notEqual(a, b);
  assert.match(a, /^c-20260918-1000-[0-9a-f]{3}$/);
  assert.equal(newChatTurnId('c-x', 7), 'c-x-t0007');
});
