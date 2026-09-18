import assert from 'node:assert/strict';
import { test } from 'node:test';

import { withLiveness } from '../runner/liveness.ts';
import { isAlive, startToken } from '../runner/procstart.ts';
import type { RunRow } from '../shared/types.ts';

const row: RunRow = { id: 'r', tool: 'claude', mode: 'read', repo: 'x', cwd: '/x', brief: 'b', workflow: null, step: null, state: 'running', pid: 4242, process_started_at: 'tok-1', requested_at: 't', started_at: 't', ended_at: null, exit_code: null, log_path: '/l', report_path: '/p', note: null, cancel_requested: 0 };

test('dead pid reads ended-unwatched; the row is not changed', () => {
  const v = withLiveness(row, { isAlive: () => false, startToken: () => null });
  assert.equal(v.liveness, 'ended-unwatched');
  assert.equal(v.state, 'running');
});

test('alive pid with the same start token reads running; a recycled pid does not', () => {
  assert.equal(withLiveness(row, { isAlive: () => true, startToken: () => 'tok-1' }).liveness, 'running');
  assert.equal(withLiveness(row, { isAlive: () => true, startToken: () => 'tok-2' }).liveness, 'ended-unwatched');
  assert.equal(withLiveness(row, { isAlive: () => true, startToken: () => null }).liveness, 'running');
});

test('a finished row needs no liveness', () => {
  assert.equal(withLiveness({ ...row, state: 'succeeded' }, { isAlive: () => true, startToken: () => 'tok-1' }).liveness, 'not-needed');
});

test('the real probe: this process is alive with a token; a wild pid is not', () => {
  assert.equal(isAlive(process.pid), true);
  const tok = startToken(process.pid);
  assert.ok(tok === null || tok.length > 0);
  assert.equal(isAlive(2_000_000_000 % 4_000_000 + 3_000_000), false);
});
