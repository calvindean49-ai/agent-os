import assert from 'node:assert/strict';
import { test } from 'node:test';

import { interpretClaudeLogin } from '../runner/status.ts';

test('Claude login probe requires the ready word and names the repair command', () => {
  assert.deepEqual(interpretClaudeLogin(true, 'ready'), { ok: true, detail: 'logged in' });
  const failed = interpretClaudeLogin(false, 'Please run /login');
  assert.equal(failed.ok, false);
  assert.match(failed.detail, /run `claude`.*`\/login`/);
  assert.equal(interpretClaudeLogin(true, 'something else').ok, false);
});
