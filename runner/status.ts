import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Mode, Probe, StatusReport, ToolId } from '../shared/types.ts';
import { ADAPTERS } from './adapters/index.ts';
import type { Config } from './config.ts';
import { gitVersion, isRepo } from './git.ts';

export const STOP_FILE = '.agent-os/stop';

export function isStopped(root: string): boolean {
  return existsSync(join(root, STOP_FILE));
}

/** Every line read from the machine now, never assumed. */
export function readStatus(root: string, config: Config): StatusReport {
  const tools = {} as Record<ToolId, Probe & { modes: readonly Mode[] }>;
  for (const a of Object.values(ADAPTERS)) {
    const d = a.detect();
    tools[a.id] = d.available ? { ok: true, detail: d.detail, modes: a.modes } : { ok: false, detail: d.why, modes: a.modes };
  }
  let brain: Probe & { path: string | null };
  if (config.brain === null) brain = { ok: false, detail: 'not configured', path: null };
  else if (!existsSync(config.brain)) brain = { ok: false, detail: 'path does not exist', path: config.brain };
  else if (!isRepo(config.brain)) brain = { ok: false, detail: 'not a git repository', path: config.brain };
  else brain = { ok: true, detail: 'ready', path: config.brain };
  return {
    runner: { pid: process.pid, node: process.version, root },
    git: gitVersion(),
    tools,
    brain,
    repos: config.repos,
    stopped: isStopped(root),
    codexBuildVerified: config.codexBuildVerified,
  };
}
