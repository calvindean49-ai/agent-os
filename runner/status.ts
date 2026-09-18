import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Mode, Probe, StatusReport, ToolId } from '../shared/types.ts';
import { ADAPTERS } from './adapters/index.ts';
import { CLI_ROUTING_VARS } from './adapters/types.ts';
import type { Config } from './config.ts';
import { isCodexTrusted } from './config.ts';
import { gitVersion, isRepo } from './git.ts';
import { runProbe } from './process.ts';

export const STOP_FILE = '.agent-os/stop';

export function isStopped(root: string): boolean {
  return existsSync(join(root, STOP_FILE));
}

const CLAUDE_LOGIN_TTL_MS = 5 * 60_000;
let cachedClaudeLogin: { readonly checkedAt: number; readonly probe: Probe } | null = null;

export function interpretClaudeLogin(ok: boolean, output: string): Probe {
  if (ok && /\bready\b/i.test(output)) return { ok: true, detail: 'logged in' };
  const repair = 'run `claude`, then `/login`';
  if (!ok && /timed out|timeout/i.test(output)) return { ok: false, detail: `login probe timed out; ${repair}` };
  return { ok: false, detail: `logged out or login probe failed; ${repair}` };
}

/** One short subscription call, cached so the Desk's ten-second polling is not billable. */
export function probeClaudeLogin(now = Date.now()): Probe {
  if (cachedClaudeLogin !== null && now - cachedClaudeLogin.checkedAt < CLAUDE_LOGIN_TTL_MS) return cachedClaudeLogin.probe;
  const command = process.env['CLAUDE_BIN'] ?? 'claude';
  const result = runProbe({
    command,
    args: ['-p', 'Reply with the single word ready.', '--output-format', 'text'],
    cwd: process.cwd(),
    unsetEnv: CLI_ROUTING_VARS,
    timeoutMs: 45_000,
  });
  const probe = interpretClaudeLogin(result.ok, result.output);
  cachedClaudeLogin = { checkedAt: now, probe };
  return probe;
}

/** Every line read from the machine now, never assumed. */
export function readStatus(root: string, config: Config, claudeLogin = probeClaudeLogin): StatusReport {
  const tools = {} as Record<ToolId, Probe & { modes: readonly Mode[] }>;
  for (const a of Object.values(ADAPTERS)) {
    const d = a.detect();
    tools[a.id] = d.available ? { ok: true, detail: d.detail, modes: a.modes } : { ok: false, detail: d.why, modes: a.modes };
  }
  if (tools.claude.ok) tools.claude = { ...claudeLogin(), modes: tools.claude.modes };
  let brain: Probe & { path: string | null };
  if (config.brain === null) brain = { ok: false, detail: 'not configured', path: null };
  else if (!existsSync(config.brain)) brain = { ok: false, detail: 'path does not exist', path: config.brain };
  else if (!isRepo(config.brain)) brain = { ok: false, detail: 'not a git repository', path: config.brain };
  else brain = { ok: true, detail: 'ready', path: config.brain };
  const codexTrusted: Record<string, boolean> = {};
  if (config.brain !== null) codexTrusted['brain'] = isCodexTrusted(config, config.brain);
  for (const [name, path] of Object.entries(config.repos)) codexTrusted[name] = isCodexTrusted(config, path);
  return {
    runner: { pid: process.pid, node: process.version, root },
    git: gitVersion(),
    tools,
    brain,
    repos: config.repos,
    codexTrusted,
    stopped: isStopped(root),
    codexBuildVerified: config.codexBuildVerified,
  };
}
