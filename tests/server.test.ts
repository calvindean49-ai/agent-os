import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import type { Config } from '../runner/config.ts';
import { isAlive, startToken } from '../runner/procstart.ts';
import { spawnRun } from '../runner/process.ts';
import { createApp, reconcile } from '../runner/server.ts';
import { openStore } from '../runner/store.ts';
import type { RunView } from '../shared/types.ts';
import { repoWithCommit, tmp, git } from './helpers.ts';

const probe = { isAlive, startToken };

async function up(config: Partial<Config> = {}, spawner = spawnRun) {
  const root = tmp('root-');
  const store = openStore(':memory:');
  const app = createApp({ root, config: { brain: null, repos: {}, codexBuildVerified: false, port: 0, ...config }, token: 'T', store, probe, spawner });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  const call = async (method: string, path: string, body?: unknown, token = 'T') => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* text */ }
    return { status: res.status, json: json as Record<string, unknown>, text };
  };
  return { root, store, call, close: () => new Promise((r) => server.close(r)) };
}

/** Pretend `sh` is the tool: the adapter's command is replaced by a script that echoes and exits as told. */
function fakeSpawner(script: string) {
  return (req: Parameters<typeof spawnRun>[0], logPath: string) => spawnRun({ command: 'sh', args: ['-c', script, 'sh', ...req.args], cwd: req.cwd }, logPath);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(f: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(50);
  }
}

test('the door: no token, wrong token, right token', async () => {
  const s = await up();
  assert.equal((await s.call('GET', '/api/status', undefined, '')).status, 401);
  assert.equal((await s.call('GET', '/api/status', undefined, 'nope')).status, 401);
  const ok = await s.call('GET', '/api/status');
  assert.equal(ok.status, 200);
  assert.equal((ok.json['git'] as { ok: boolean }).ok, true);
  await s.close();
});

test('refusals: bad tool, bad mode, no brief, unknown repo, stop file, codex build unverified', async () => {
  const { dir } = repoWithCommit();
  const s = await up({ repos: { r: dir } });
  assert.match((await s.call('POST', '/api/runs', { tool: 'gemini', mode: 'read', repo: 'r', brief: 'x' })).json['error'] as string, /tool must be/);
  assert.match((await s.call('POST', '/api/runs', { tool: 'claude', mode: 'fly', repo: 'r', brief: 'x' })).json['error'] as string, /mode must be/);
  assert.match((await s.call('POST', '/api/runs', { tool: 'claude', mode: 'read', repo: 'r', brief: ' ' })).json['error'] as string, /brief/);
  assert.match((await s.call('POST', '/api/runs', { tool: 'claude', mode: 'read', repo: 'nope', brief: 'x' })).json['error'] as string, /unknown repo/);
  assert.match((await s.call('POST', '/api/runs', { tool: 'codex', mode: 'build', repo: 'r', brief: 'x' })).json['error'] as string, /codexBuildVerified|no `codex`/);
  await s.call('POST', '/api/stop');
  assert.equal((await s.call('GET', '/api/status')).json['stopped'], true);
  assert.match((await s.call('POST', '/api/runs', { tool: 'claude', mode: 'read', repo: 'r', brief: 'x' })).json['error'] as string, /stopped/);
  await s.call('POST', '/api/resume');
  assert.equal((await s.call('GET', '/api/status')).json['stopped'], false);
  await s.close();
});

test('a run: starts, logs, ends succeeded, and the Runner files the report into the Brain and pushes', async (t) => {
  const brain = repoWithCommit(true);
  const { dir } = repoWithCommit();
  const s = await up({ brain: brain.dir, repos: { r: dir } }, fakeSpawner('echo "hello from $0"; echo "last message" > "$(echo "$@" | sed -n "s/.*-o \\([^ ]*\\).*/\\1/p")"; exit 0'));
  t.mock.method(await import('../runner/adapters/codex.ts').then((m) => m.codex), 'detect', () => ({ available: true, detail: 'fake' }));
  const started = await s.call('POST', '/api/runs', { tool: 'codex', mode: 'read', repo: 'r', brief: 'say hello' });
  assert.equal(started.status, 201, started.text);
  const run = started.json as unknown as RunView;
  assert.equal(run.state, 'running');
  assert.equal(run.liveness, 'running');
  await until(() => s.store.get(run.id)?.state === 'succeeded');
  const log = await s.call('GET', `/api/runs/${run.id}/log`);
  assert.match(log.text, /hello from/);
  await until(() => existsSync(run.report_path));
  const report = readFileSync(run.report_path, 'utf8');
  assert.match(report, /^# Run r-/);
  assert.match(report, /last message/);
  await until(() => git(brain.dir, ['log', '--oneline', 'origin/main']).includes(run.id));
  assert.equal(s.store.get(run.id)?.note, 'finished');
  await s.close();
});

test('one run per tool: a second start while the first runs is refused; cancel ends it', async (t) => {
  const { dir } = repoWithCommit();
  const s = await up({ repos: { r: dir } }, fakeSpawner('sleep 30'));
  t.mock.method(await import('../runner/adapters/claude.ts').then((m) => m.claude), 'detect', () => ({ available: true, detail: 'fake' }));
  const a = (await s.call('POST', '/api/runs', { tool: 'claude', mode: 'read', repo: 'r', brief: 'a' })).json as unknown as RunView;
  assert.equal(a.state, 'running');
  const b = await s.call('POST', '/api/runs', { tool: 'claude', mode: 'read', repo: 'r', brief: 'b' });
  assert.equal(b.status, 409);
  assert.match(b.json['error'] as string, new RegExp(a.id));
  assert.equal((await s.call('POST', `/api/runs/${a.id}/cancel`)).status, 200);
  await until(() => s.store.get(a.id)?.state === 'cancelled');
  await s.close();
});

test('claude build runs in a worktree on agent/<id>, never on main', async (t) => {
  const { dir } = repoWithCommit();
  const s = await up({ repos: { r: dir } }, fakeSpawner('git branch --show-current; exit 0'));
  t.mock.method(await import('../runner/adapters/claude.ts').then((m) => m.claude), 'detect', () => ({ available: true, detail: 'fake' }));
  const run = (await s.call('POST', '/api/runs', { tool: 'claude', mode: 'build', repo: 'r', brief: 'b' })).json as unknown as RunView;
  assert.equal(run.state, 'running', JSON.stringify(run));
  assert.ok(run.cwd.includes(join('.agent-os', 'worktrees', run.id)));
  await until(() => s.store.get(run.id)?.state === 'succeeded');
  assert.match(readFileSync(run.log_path, 'utf8'), new RegExp(`agent/${run.id}`));
  assert.equal(git(dir, ['branch', '--show-current']), 'main');
  await s.close();
});

test('reconcile marks a running row with a dead pid lost', () => {
  const store = openStore(':memory:');
  store.insert({ id: 'r-dead', tool: 'claude', mode: 'read', repo: 'x', cwd: '/x', brief: 'b', workflow: null, step: null, state: 'running', pid: 3_999_999, process_started_at: 'tok', requested_at: 't', started_at: 't', ended_at: null, exit_code: null, log_path: '/l', report_path: '/p', note: null, cancel_requested: 0 });
  assert.equal(reconcile(store, probe), 1);
  assert.equal(store.get('r-dead')?.state, 'lost');
});

test('log route refuses a path outside the run log directory', async () => {
  const s = await up();
  mkdirSync(join(s.root, 'elsewhere'), { recursive: true });
  writeFileSync(join(s.root, 'elsewhere', 'secret'), 'no');
  s.store.insert({ id: 'r-x', tool: 'claude', mode: 'read', repo: 'x', cwd: '/x', brief: 'b', workflow: null, step: null, state: 'failed', pid: null, process_started_at: null, requested_at: 't', started_at: null, ended_at: null, exit_code: 1, log_path: join(s.root, 'elsewhere', 'secret'), report_path: '/p', note: null, cancel_requested: 0 });
  assert.equal((await s.call('GET', '/api/runs/r-x/log')).status, 403);
  await s.close();
});
