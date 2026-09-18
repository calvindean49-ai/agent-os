import { join } from 'node:path';

import { loadConfig } from './config.ts';
import { isAlive, startToken } from './procstart.ts';
import { createApp, reconcile } from './server.ts';
import { openStore, STORE_FILE } from './store.ts';
import { ensureToken } from './token.ts';

const root = process.cwd();
const config = loadConfig(root);
const token = ensureToken(root);
const store = openStore(join(root, STORE_FILE));
const probe = { isAlive, startToken };

const lost = reconcile(store, probe);
if (lost > 0) console.log(`[runner] marked ${lost} run(s) lost from a previous Runner`);

const app = createApp({ root, config, token, store, probe });
app.listen(config.port, '127.0.0.1', () => {
  console.log(`[runner] listening on http://127.0.0.1:${config.port} (token in .agent-os/token)`);
  console.log(`[runner] brain: ${config.brain ?? 'not configured'}; repos: ${Object.keys(config.repos).join(', ') || 'none'}`);
});
