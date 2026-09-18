import { clearUpState, readUpState, serviceMatches } from '../runner/lifecycle.ts';
import { isAlive, startToken } from '../runner/procstart.ts';
import { signalGroup } from '../runner/process.ts';

const root = process.cwd();
const state = readUpState(root);
if (state === null) {
  console.log('Agent OS is not up (no .agent-os/up.json).');
  process.exit(0);
}

const signalled: { readonly name: string; readonly pid: number; readonly token: string }[] = [];
let unsafe = false;
for (const [name, service] of Object.entries(state.services)) {
  if (service === undefined || !isAlive(service.pid)) continue;
  if (!serviceMatches(service)) {
    console.error(`Refusing to stop ${name} pid ${service.pid}: its process-start token does not match .agent-os/up.json.`);
    unsafe = true;
    continue;
  }
  if (signalGroup(service.pid, 'SIGTERM')) signalled.push({ name, pid: service.pid, token: service.processStartedAt as string });
}

const deadline = Date.now() + 5_000;
while (signalled.some((service) => isAlive(service.pid)) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
for (const service of signalled) {
  if (isAlive(service.pid) && startToken(service.pid) === service.token) signalGroup(service.pid, 'SIGKILL');
}

if (unsafe) {
  console.error('Agent OS down was incomplete; the state file was kept for inspection.');
  process.exit(1);
}
clearUpState(root);
console.log(signalled.length === 0 ? 'Agent OS processes were already stopped.' : `Agent OS is down: stopped ${signalled.map((service) => `${service.name} pid ${service.pid}`).join(', ')}.`);
