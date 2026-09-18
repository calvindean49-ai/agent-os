import type { RunRow, RunView } from '../shared/types.ts';

export interface LivenessProbe {
  isAlive(pid: number): boolean;
  startToken(pid: number): string | null;
}

/**
 * Decided at read time, writing nothing: the store still says `running`, the
 * view says what the machine says now. A row whose pid is gone, or whose pid
 * is alive but with a different start token (recycled), reads `ended-unwatched`.
 */
export function withLiveness(row: RunRow, probe: LivenessProbe): RunView {
  if (row.state !== 'running' || row.pid === null) return { ...row, liveness: 'not-needed' };
  if (!probe.isAlive(row.pid)) return { ...row, liveness: 'ended-unwatched' };
  const token = probe.startToken(row.pid);
  if (token !== null && row.process_started_at !== null && token !== row.process_started_at) {
    return { ...row, liveness: 'ended-unwatched' };
  }
  return { ...row, liveness: 'running' };
}
