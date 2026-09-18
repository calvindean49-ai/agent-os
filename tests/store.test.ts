import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newRunId, openStore } from '../runner/store.ts';
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
