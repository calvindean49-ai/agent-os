import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig } from '../runner/config.ts';
import { clearUpState, preflight, readUpState, serviceMatches, UP_LOG_DIR, writeUpState, type UpState } from '../runner/lifecycle.ts';
import { signalGroup, spawnRun } from '../runner/process.ts';

const root = process.cwd();
const config = loadConfig(root);
const failures = preflight(root, config);
if (failures.length > 0) {
  console.error('Agent OS did not start:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const previous = readUpState(root);
if (previous !== null) {
  const live = Object.entries(previous.services).filter(([, service]) => service !== undefined && serviceMatches(service));
  if (live.length > 0) {
    console.error(`Agent OS is already up (${live.map(([name, service]) => `${name} pid ${service!.pid}`).join(', ')}).`);
    process.exit(1);
  }
  clearUpState(root);
}

const logDir = join(root, UP_LOG_DIR);
mkdirSync(logDir, { recursive: true });
let state: UpState = { startedAt: new Date().toISOString(), services: {} };

function start(name: 'runner' | 'desk', args: readonly string[], marker: string) {
  const logPath = join(logDir, `${name}.log`);
  writeFileSync(logPath, '');
  const spawned = spawnRun({ command: 'npm', args, cwd: root }, logPath);
  const service = { pid: spawned.pid, processStartedAt: spawned.processStartedAt, logPath };
  state = { ...state, services: { ...state.services, [name]: service } };
  writeUpState(root, state);
  return { service, marker };
}

async function waitReady(id: 'runner' | 'desk', label: string, service: { pid: number; logPath: string }, marker: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const log = existsSync(service.logPath) ? readFileSync(service.logPath, 'utf8') : '';
    if (log.includes(marker)) return;
    if (!serviceMatches({ ...service, processStartedAt: state.services[id]?.processStartedAt ?? null })) {
      throw new Error(`${label} exited before it became ready. See ${service.logPath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not become ready within 15 seconds. See ${service.logPath}`);
}

try {
  const runner = start('runner', ['run', 'runner'], '[runner] listening on');
  await waitReady('runner', 'Runner', runner.service, runner.marker);
  const desk = start('desk', ['run', 'dev:desk'], 'Local:');
  await waitReady('desk', 'Desk', desk.service, desk.marker);
  console.log(`Agent OS is up: http://127.0.0.1:${Number(process.env['DESK_PORT'] ?? 5180)}`);
  console.log(`Runner pid ${runner.service.pid}; Desk pid ${desk.service.pid}. Logs: ${logDir}`);
} catch (error) {
  for (const service of Object.values(state.services)) {
    if (service !== undefined && serviceMatches(service)) signalGroup(service.pid, 'SIGTERM');
  }
  clearUpState(root);
  console.error(`Agent OS did not start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
