import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeBrief } from '../runner/brief.ts';

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
