/**
 * Write .agent-os/config.json without hand-editing JSON.
 *
 *   npm run config:init -- --brain /abs/second-brain --repo lockdown=/abs/Productivity --repo aether=/abs/aether-os
 *
 * Re-running merges: a repo given again is replaced, others are kept.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const root = process.cwd();
const path = join(root, '.agent-os', 'config.json');
const current = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : {};
const repos = { ...((current['repos'] as Record<string, string> | undefined) ?? {}) };
let brain = (current['brain'] as string | undefined) ?? null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--brain') {
    brain = args[++i] ?? null;
  } else if (a === '--repo') {
    const spec = args[++i] ?? '';
    const eq = spec.indexOf('=');
    if (eq < 1) { console.error(`--repo wants name=/abs/path, got ${spec}`); process.exit(2); }
    repos[spec.slice(0, eq)] = spec.slice(eq + 1);
  } else if (a === '--codex-build-verified') {
    current['codexBuildVerified'] = true;
  }
}
for (const [k, v] of Object.entries({ brain, ...repos })) {
  if (v !== null && !isAbsolute(v)) { console.error(`${k}: ${v} is not an absolute path`); process.exit(2); }
}
mkdirSync(join(root, '.agent-os'), { recursive: true });
const next = { ...current, brain, repos };
writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
console.log(`wrote ${path}:\n${JSON.stringify(next, null, 2)}`);
