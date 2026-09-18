import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { BrainReading, WorkflowStep, WorkflowView } from '../shared/types.ts';
import { hasRef, isRepo, listFiles, showFile, tryGit } from './git.ts';

/**
 * The Brain is read out of a commit, never the working tree: `origin/main` as
 * last fetched when it exists, else HEAD. So a half-written file never shows,
 * and what the Desk shows is what a fresh clone would get. `fetchBrain` runs
 * `git fetch` and never pull, because a pull under a running agent is how
 * uncommitted work dies.
 */
export function fetchBrain(brain: string): string | null {
  return tryGit(brain, ['fetch', '-q']) === null ? 'git fetch failed (no remote, or offline)' : null;
}

export function parseWorkflow(name: string, path: string, text: string): WorkflowView {
  const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? name).replace(/^Workflow:\s*/i, '').trim();
  const steps: WorkflowStep[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\.\s+([A-Za-z][\w-]*)\s+[—–-]+\s+(.+)$/);
    if (m) steps.push({ n: Number(m[1]), tool: (m[2] ?? '').toLowerCase(), text: (m[3] ?? '').trim() });
  }
  return { name, path, title, steps, body: text };
}

export function readBrain(brain: string | null): BrainReading {
  const unavailable: string[] = [];
  if (brain === null) {
    return { path: '', ref: '', commit: null, fetchedAt: null, index: null, projects: [], workflows: [], runs: [], unavailable: ['no Brain configured: run `npm run config:init -- --brain <path>`'] };
  }
  if (!existsSync(brain)) unavailable.push(`Brain path does not exist: ${brain}`);
  else if (!isRepo(brain)) unavailable.push(`Brain is not a git repository: ${brain}`);
  if (unavailable.length > 0) {
    return { path: brain, ref: '', commit: null, fetchedAt: null, index: null, projects: [], workflows: [], runs: [], unavailable };
  }
  const ref = hasRef(brain, 'origin/main') ? 'origin/main' : 'HEAD';
  if (ref === 'HEAD') unavailable.push('no origin/main: reading HEAD (nothing pushed by cloud sessions can appear here)');
  const commit = tryGit(brain, ['rev-parse', '--short', ref]);
  const fetchHead = join(brain, '.git', 'FETCH_HEAD');
  const fetchedAt = existsSync(fetchHead) ? statSync(fetchHead).mtime.toISOString() : null;

  const index = showFile(brain, ref, 'INDEX.md');
  const projects = listFiles(brain, ref, 'projects')
    .filter((p) => p.endsWith('.md') && !p.endsWith('README.md'))
    .map((p) => p.replace(/^projects\//, '').replace(/\.md$/, ''));
  const workflows = listFiles(brain, ref, 'workflows')
    .filter((p) => p.endsWith('.md') && !p.endsWith('README.md'))
    .map((p) => {
      const text = showFile(brain, ref, p) ?? '';
      return parseWorkflow(p.replace(/^workflows\//, '').replace(/\.md$/, ''), p, text);
    });
  const runs = listFiles(brain, ref, 'runs')
    .filter((p) => p.endsWith('.md') && !p.endsWith('README.md'))
    .sort()
    .reverse()
    .slice(0, 20)
    .map((p) => {
      const text = showFile(brain, ref, p) ?? '';
      const firstLine = text.split('\n').find((l) => l.trim() !== '') ?? '';
      return { path: p, firstLine };
    });
  return { path: brain, ref, commit, fetchedAt, index, projects, workflows, runs, unavailable };
}
