import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

export const TOKEN_FILE = '.agent-os/token';

/**
 * The Runner's door. One token, mode 0600, gitignored, created on first start.
 * There is deliberately no unset-means-open branch: a process that starts
 * agents with write access needs a door even on localhost.
 */
export function ensureToken(root: string): string {
  const path = join(root, TOKEN_FILE);
  if (existsSync(path)) return readFileSync(path, 'utf8').trim();
  mkdirSync(dirname(path), { recursive: true });
  const token = randomBytes(32).toString('hex');
  writeFileSync(path, token + '\n', { mode: 0o600 });
  chmodSync(path, 0o600);
  return token;
}
