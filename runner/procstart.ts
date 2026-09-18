import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * A process-start token, read once at spawn and compared at read time, so a
 * recycled pid is not mistaken for a live worker. Linux: field 22 of
 * /proc/<pid>/stat (start time in clock ticks, pure fs). macOS: `ps -o lstart=`
 * (one fixed argument vector; one-second granularity, so the window narrows
 * rather than closes).
 */
export function startToken(pid: number): string | null {
  try {
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const afterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return afterComm[19] ?? null;
    }
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out === '' ? null : out;
  } catch {
    return null;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}
