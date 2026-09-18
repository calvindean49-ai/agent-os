import { execFileSync } from 'node:child_process';

export function onPath(bin: string): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === '' ? null : out.split('\n')[0] ?? null;
  } catch {
    return null;
  }
}
