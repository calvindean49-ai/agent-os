import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { startToken } from './procstart.ts';

export interface SpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /** Variables REMOVED from the inherited environment. Nothing is ever added. */
  readonly unsetEnv?: readonly string[];
}

export interface Spawned {
  readonly pid: number;
  readonly processStartedAt: string | null;
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

/**
 * The only place in the Runner that starts a process. Own process group
 * (`detached`), so a cancel signals the whole tree and stopping the Runner
 * leaves a worker to finish. stdout+stderr go to one log file, opened here,
 * so the tail the Desk shows is exactly what the tool printed.
 */
export function spawnRun(req: SpawnRequest, logPath: string): Spawned {
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, 'a');
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of req.unsetEnv ?? []) delete env[k];
  const child = spawn(req.command, [...req.args], {
    cwd: req.cwd,
    env,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  const pid = child.pid;
  if (pid === undefined) {
    closeSync(fd);
    throw new Error(`could not start ${req.command}`);
  }
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => {
      closeSync(fd);
      resolve({ code, signal });
    });
    child.on('error', () => {
      try { closeSync(fd); } catch { /* already closed */ }
      resolve({ code: null, signal: null });
    });
  });
  child.unref();
  return { pid, processStartedAt: startToken(pid), exited };
}

/** Signal the process group: TERM first; the caller may follow with KILL. */
export function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}
