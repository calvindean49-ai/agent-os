import { join } from 'node:path';

import { currentBranch, git, isRepo } from './git.ts';

export const PROTECTED_BRANCHES = ['main', 'master'];

/**
 * A build never runs in the checkout. Given a repo, this makes a worktree at
 * <repo>/.agent-os/worktrees/<runId> on a new branch agent/<runId> from HEAD,
 * and returns its path. The caller passes that path as the run's cwd.
 *
 * Codex does this itself with --worktree; this is for Claude, whose
 * bypassPermissions mode would otherwise edit whatever branch is checked out.
 */
export function buildWorktree(repo: string, runId: string): string {
  if (!isRepo(repo)) throw new Error(`${repo} is not a git repository; a build needs one`);
  const path = join(repo, '.agent-os', 'worktrees', runId);
  git(repo, ['worktree', 'add', '-b', `agent/${runId}`, path, 'HEAD']);
  return path;
}

/** The guard the adapter relies on: never a build on a protected branch. */
export function assertNotProtected(cwd: string): void {
  const b = currentBranch(cwd);
  if (b !== null && PROTECTED_BRANCHES.includes(b)) {
    throw new Error(`refusing a build on branch ${b} in ${cwd}`);
  }
}
