import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function tmp(prefix = 'agent-os-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** A git repo with one commit on main, optionally with an `origin` bare remote. */
export function repoWithCommit(withOrigin = false): { dir: string; origin: string | null } {
  const dir = tmp();
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'README.md'), '# t\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
  if (!withOrigin) return { dir, origin: null };
  const origin = tmp('origin-');
  git(origin, ['init', '-q', '--bare', '-b', 'main']);
  git(dir, ['remote', 'add', 'origin', origin]);
  git(dir, ['push', '-q', '-u', 'origin', 'main']);
  return { dir, origin };
}
