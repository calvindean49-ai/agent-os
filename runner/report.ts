import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import type { RunRow } from '../shared/types.ts';
import { tryGit } from './git.ts';

/** `runs/2026-09/r-….md` inside the Brain. */
export function reportPathFor(brain: string, runId: string, now = new Date()): string {
  const month = now.toISOString().slice(0, 7);
  return join(brain, 'runs', month, `${runId}.md`);
}

function tail(path: string, bytes: number): string {
  if (!existsSync(path)) return '';
  const s = readFileSync(path, 'utf8');
  return s.length > bytes ? s.slice(-bytes) : s;
}

/**
 * Every run leaves a report in the Brain, whether or not the agent wrote one.
 * A writing agent is told to write its own; if it did, this leaves it alone.
 * A read-only agent cannot, so the Runner writes it from the tool's last
 * message (Codex `-o`) or the log tail (Claude text output), then commits and
 * pushes. Errors are returned as a note, never thrown: the run has ended and
 * the row must say so regardless.
 */
export function fileReport(brain: string | null, row: RunRow, lastMessagePath: string): string | null {
  if (brain === null) return 'no Brain configured; report not filed';
  const path = row.report_path;
  if (!existsSync(path)) {
    const last = existsSync(lastMessagePath) ? readFileSync(lastMessagePath, 'utf8').trim() : '';
    const body = last !== '' ? last : tail(row.log_path, 6000);
    const md = [
      `# Run ${row.id}`,
      '',
      `- tool: ${row.tool}`,
      `- mode: ${row.mode}`,
      `- repo: ${row.repo}`,
      `- state: ${row.state}${row.note ? ` — ${row.note}` : ''}`,
      `- started: ${row.started_at ?? '?'}`,
      `- ended: ${row.ended_at ?? '?'}`,
      row.workflow ? `- workflow: ${row.workflow} step ${row.step ?? '?'}` : null,
      '',
      '## Brief',
      '',
      row.brief.trim(),
      '',
      last !== '' ? '## Report (the agent\'s last message, filed by the Runner)' : '## Log tail (filed by the Runner; the agent wrote no report)',
      '',
      body,
      '',
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, md);
  }
  const rel = relative(brain, path);
  if (tryGit(brain, ['add', '--', rel]) === null) return `report written at ${rel} but git add failed`;
  const committed = tryGit(brain, ['commit', '-q', '-m', `${row.tool} ${row.id}: run report`, '--', rel]);
  if (committed === null) return `report at ${rel}; nothing to commit or commit failed`;
  const pushed = tryGit(brain, ['push', '-q']);
  return pushed === null ? `report committed at ${rel}; push failed (no remote, or offline)` : null;
}
