import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeBrief, composeChatTurn, composeCloudLaunchBrief } from '../runner/brief.ts';

const base = { runId: 'r-9', tool: 'codex' as const, brain: '/b', cwd: '/r', brief: '  fix the thing  ', reportPath: '/b/runs/2026-09/r-9.md', workflow: null, step: null };

test('read brief names the Brain, says read-only, ends with the brief', () => {
  const p = composeBrief({ ...base, mode: 'read' });
  assert.match(p, /\/b\/AGENTS\.md first/);
  assert.match(p, /read-only/);
  assert.ok(p.endsWith('fix the thing'));
  assert.ok(!/commit/.test(p));
});

test('build brief tells the agent to report, commit and push', () => {
  const p = composeBrief({ ...base, mode: 'build', workflow: 'workflows/x.md', step: 2 });
  assert.match(p, /step 2 of workflow workflows\/x\.md/);
  assert.match(p, /\/b\/runs\/2026-09\/r-9\.md/);
  assert.match(p, /did not push did not happen/);
});

test('no Brain is said, not hidden', () => {
  assert.match(composeBrief({ ...base, mode: 'read', brain: null }), /No Brain is configured/);
});

test('cloud launcher forbids APIs and recurring substitutes, and carries the real task', () => {
  const prompt = composeCloudLaunchBrief('/brain', 'git@example.test:brain.git', 'do the thing');
  assert.match(prompt, /RemoteTrigger/);
  assert.match(prompt, /Never use curl.*API key/);
  assert.match(prompt, /Do not create a recurring schedule/);
  assert.ok(prompt.endsWith('do the thing'));
});

test('chat brief stays conversational and carries recent turns into a stateless session', () => {
  const turn = composeChatTurn('Maths plan', [{ user: 'I lose momentum', assistant: 'Make the next step smaller.' }], 'What should I do tonight?');
  assert.match(turn, /Use the Brain as the shared source of context/);
  assert.match(turn, /Person: I lose momentum/);
  assert.match(turn, /Assistant: Make the next step smaller/);
  assert.ok(turn.endsWith('What should I do tonight?'));
  const prompt = composeBrief({ ...base, mode: 'read', brief: turn, chat: 'c-1' });
  assert.match(prompt, /Answer the person directly and naturally/);
  assert.doesNotMatch(prompt, /final message is your report/);
});
