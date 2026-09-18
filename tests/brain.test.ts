import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

import { parseWorkflow, readBrain } from '../runner/brain.ts';
import { git, tmp } from './helpers.ts';

function seededBrain(): string {
  const dir = tmp('brain-');
  execFileSync('node', ['--import', 'tsx', resolve('scripts/brain-init.ts'), dir], { encoding: 'utf8' });
  return dir;
}

test('brain-init seeds the template, makes a repo, and refuses a non-empty dir', () => {
  const dir = seededBrain();
  assert.ok(existsSync(join(dir, 'AGENTS.md')));
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8').trim(), '@AGENTS.md');
  assert.equal(git(dir, ['branch', '--show-current']), 'main');
  assert.throws(() => execFileSync('node', ['--import', 'tsx', resolve('scripts/brain-init.ts'), dir], { encoding: 'utf8', stdio: 'pipe' }));
});

test('readBrain reads INDEX, projects and the example workflow out of HEAD, and says why origin/main is missing', () => {
  const dir = seededBrain();
  const b = readBrain(dir);
  assert.equal(b.ref, 'HEAD');
  assert.match(b.index ?? '', /^# Index/);
  assert.deepEqual(b.projects, ['agent-os']);
  const w = b.workflows.find((x) => x.name === 'weekly-maths-probe');
  assert.ok(w);
  assert.equal(w.title, 'weekly maths probe');
  assert.deepEqual(w.steps.map((s) => [s.n, s.tool]), [[1, 'claude'], [2, 'me'], [3, 'codex']]);
  assert.ok(b.unavailable.some((u) => /origin\/main/.test(u)));
});

test('readBrain reads origin/main, not the working tree', () => {
  const dir = seededBrain();
  const origin = tmp('origin-');
  git(origin, ['init', '-q', '--bare', '-b', 'main']);
  git(dir, ['remote', 'add', 'origin', origin]);
  git(dir, ['push', '-q', '-u', 'origin', 'main']);
  writeFileSync(join(dir, 'INDEX.md'), '# Uncommitted\n');
  mkdirSync(join(dir, 'runs', '2026-09'), { recursive: true });
  writeFileSync(join(dir, 'runs', '2026-09', 'r-1.md'), '# Run r-1\n');
  const before = readBrain(dir);
  assert.equal(before.ref, 'origin/main');
  assert.match(before.index ?? '', /^# Index/);
  assert.equal(before.runs.length, 0);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'x']);
  assert.match(readBrain(dir).index ?? '', /^# Index/, 'committed but not pushed: still the old text');
  git(dir, ['push', '-q']);
  git(dir, ['fetch', '-q']);
  const after = readBrain(dir);
  assert.match(after.index ?? '', /^# Uncommitted/);
  assert.equal(after.runs[0]?.firstLine, '# Run r-1');
});

test('parseWorkflow tolerates a hyphen and mixed case, ignores prose', () => {
  const w = parseWorkflow('x', 'workflows/x.md', '# Workflow: X\nsteps:\n  1. Claude - do a\n  2. codex — do b\nnot a step 3. here\n');
  assert.deepEqual(w.steps.map((s) => s.tool), ['claude', 'codex']);
});
