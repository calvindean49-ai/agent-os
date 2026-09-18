import { existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

export interface Config {
  /** Absolute path of the Brain checkout on this machine. */
  readonly brain: string | null;
  /** Named repos the Desk can start runs in. Absolute paths. */
  readonly repos: Readonly<Record<string, string>>;
  /** Flipped to true by hand, once a real `codex exec --worktree -s workspace-write` run has been watched to succeed. */
  readonly codexBuildVerified: boolean;
  readonly port: number;
}

export const CONFIG_FILE = '.agent-os/config.json';
export const DEFAULT_PORT = 8800;

export function loadConfig(root: string): Config {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    return { brain: null, repos: {}, codexBuildVerified: false, port: DEFAULT_PORT };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<{
    brain: string;
    repos: Record<string, string>;
    codexBuildVerified: boolean;
    port: number;
  }>;
  const repos: Record<string, string> = {};
  for (const [name, p] of Object.entries(raw.repos ?? {})) {
    if (!isAbsolute(p)) throw new Error(`${CONFIG_FILE}: repos.${name} must be an absolute path, got ${p}`);
    repos[name] = p;
  }
  if (raw.brain !== undefined && !isAbsolute(raw.brain)) {
    throw new Error(`${CONFIG_FILE}: brain must be an absolute path, got ${raw.brain}`);
  }
  return {
    brain: raw.brain ?? null,
    repos,
    codexBuildVerified: raw.codexBuildVerified === true,
    port: raw.port ?? DEFAULT_PORT,
  };
}

/** Resolve a repo argument from a start request to a checkout path. */
export function resolveRepo(config: Config, repo: string): string | null {
  if (repo === 'brain') return config.brain;
  const named = config.repos[repo];
  if (named !== undefined) return named;
  if (isAbsolute(repo) && existsSync(repo)) return repo;
  return null;
}
