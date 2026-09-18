import { execFileSync } from 'node:child_process';

/** Every git call is a string argument vector, never a shell string. */
export function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function tryGit(cwd: string, args: readonly string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

export function isRepo(path: string): boolean {
  return tryGit(path, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

export function currentBranch(cwd: string): string | null {
  const b = tryGit(cwd, ['branch', '--show-current']);
  return b === null || b === '' ? null : b;
}

export function hasRef(cwd: string, ref: string): boolean {
  return tryGit(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;
}

export function showFile(cwd: string, ref: string, path: string): string | null {
  return tryGit(cwd, ['show', `${ref}:${path}`]);
}

/** Paths under `dir` at `ref`, recursive, files only. */
export function listFiles(cwd: string, ref: string, dir: string): readonly string[] {
  const out = tryGit(cwd, ['ls-tree', '-r', '--name-only', ref, '--', dir]);
  if (out === null || out === '') return [];
  return out.split('\n');
}

export function gitVersion(): { ok: boolean; detail: string } {
  try {
    const v = execFileSync('git', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return { ok: true, detail: v };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return { ok: false, detail: (err.stderr ?? err.message ?? 'git failed').toString().trim() };
  }
}
