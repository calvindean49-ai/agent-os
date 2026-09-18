import assert from 'node:assert/strict';
import { test } from 'node:test';

import { preflight, serviceMatches } from '../runner/lifecycle.ts';
import type { Config } from '../runner/config.ts';
import { repoWithCommit } from './helpers.ts';

test('preflight names the Xcode licence repair and a logged-out Claude', () => {
  const { dir } = repoWithCommit();
  const config: Config = { brain: dir, repos: {}, codexTrusted: [], codexBuildVerified: false, port: 0 };
  const errors = preflight(dir, config, {
    git: () => ({ ok: false, detail: 'You have not agreed to the Xcode license agreements' }),
    claudeLogin: () => ({ ok: false, detail: 'logged out; run `claude`, then `/login`' }),
    tools: () => [],
  });
  assert.ok(errors.some((error) => error.includes('sudo xcodebuild -license accept')));
  assert.ok(errors.some((error) => error.includes('Claude Code') && error.includes('/login')));
});

test('down safety requires the recorded process-start token', () => {
  const service = { pid: 42, processStartedAt: 'one', logPath: '/log' };
  assert.equal(serviceMatches(service, () => true, () => 'one'), true);
  assert.equal(serviceMatches(service, () => true, () => 'two'), false);
  assert.equal(serviceMatches({ ...service, processStartedAt: null }, () => true, () => null), false);
  assert.equal(serviceMatches(service, () => false, () => 'one'), false);
});
