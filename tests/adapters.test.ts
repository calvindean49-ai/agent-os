import assert from 'node:assert/strict';
import { test } from 'node:test';

import { claude } from '../runner/adapters/claude.ts';
import { codex } from '../runner/adapters/codex.ts';
import { CLI_ROUTING_VARS } from '../runner/adapters/types.ts';

const req = { runId: 'r-1', cwd: '/repo', brain: '/brain', prompt: 'do it', reportPath: '/brain/runs/2026-09/r-1.md', lastMessagePath: '/x/r-1.last.md' } as const;

test('claude read: dontAsk, no prompts, reading tools only, routing vars unset', () => {
  const c = claude.command({ ...req, mode: 'read' });
  assert.equal(c.command, 'claude');
  assert.ok(c.args.includes('dontAsk'));
  assert.ok(c.args.includes('--permission-prompts') && c.args.includes('none'));
  assert.ok(!c.args.includes('bypassPermissions'));
  const allowed = c.args[c.args.indexOf('--allowedTools') + 1] ?? '';
  assert.ok(allowed.includes('Read') && !allowed.includes('Edit'));
  const dis = c.args[c.args.indexOf('--disallowedTools') + 1] ?? '';
  assert.ok(dis.includes('Edit') && dis.includes('Write') && dis.includes('Bash'));
  assert.deepEqual(c.unsetEnv, CLI_ROUTING_VARS);
  assert.equal(c.args[c.args.indexOf('-p') + 1], 'do it');
});

test('claude build: bypassPermissions and nothing read-only', () => {
  const c = claude.command({ ...req, mode: 'build' });
  assert.ok(c.args.includes('bypassPermissions'));
  assert.ok(!c.args.includes('--allowedTools'));
});

test('claude interpret: login failure named', () => {
  assert.match(claude.interpret(1, 'Please run /login').note, /not logged in/);
  assert.equal(claude.interpret(0, '').outcome, 'succeeded');
});

test('codex read: read-only sandbox, ephemeral, json, last message file, prompt last', () => {
  const c = codex.command({ ...req, mode: 'read' });
  assert.equal(c.command, 'codex');
  assert.deepEqual(c.args.slice(0, 3), ['exec', '-s', 'read-only']);
  assert.ok(c.args.includes('--ephemeral') && c.args.includes('--json'));
  assert.equal(c.args[c.args.indexOf('-o') + 1], '/x/r-1.last.md');
  assert.equal(c.args[c.args.length - 1], 'do it');
  assert.equal(c.cwd, '/repo');
});

test('codex review: the review subcommand against main, no -C', () => {
  const c = codex.command({ ...req, mode: 'review' });
  assert.deepEqual(c.args.slice(0, 4), ['exec', 'review', '--base', 'main']);
  assert.ok(!c.args.includes('-C'));
});

test('codex build: worktree feature enabled, workspace-write, brain writable, never the dangerous flag', () => {
  const c = codex.command({ ...req, mode: 'build' });
  assert.ok(c.args.includes('--worktree'));
  assert.equal(c.args[c.args.indexOf('--enable') + 1], 'worktrees');
  assert.equal(c.args[c.args.indexOf('-s') + 1], 'workspace-write');
  assert.equal(c.args[c.args.indexOf('--add-dir') + 1], '/brain');
  for (const a of c.args) assert.ok(!a.startsWith('--dangerously'), a);
  const noBrain = codex.command({ ...req, mode: 'build', brain: null });
  assert.ok(!noBrain.args.includes('--add-dir'));
});

test('codex interpret: trust and Xcode refusals are named', () => {
  assert.match(codex.interpret(1, 'Not inside a trusted directory and --skip-git-repo-check was not specified.').note, /trust/);
  assert.match(codex.interpret(1, 'You have not agreed to the Xcode license agreements').note, /xcodebuild -license/);
});
