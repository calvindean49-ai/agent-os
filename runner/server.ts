import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { MODES, TOOL_IDS, type Mode, type RunRow, type StartRunBody, type ToolId } from '../shared/types.ts';
import { ADAPTERS } from './adapters/index.ts';
import { composeBrief } from './brief.ts';
import { fetchBrain, readBrain } from './brain.ts';
import { resolveRepo, type Config } from './config.ts';
import { withLiveness, type LivenessProbe } from './liveness.ts';
import { signalGroup, spawnRun, type SpawnRequest, type Spawned } from './process.ts';
import { fileReport, reportPathFor } from './report.ts';
import { isStopped, readStatus, STOP_FILE } from './status.ts';
import { newRunId, type Store } from './store.ts';
import { assertNotProtected, buildWorktree } from './worktree.ts';

export interface ServerDeps {
  readonly root: string;
  readonly config: Config;
  readonly token: string;
  readonly store: Store;
  readonly probe: LivenessProbe;
  /** Injected so tests can start `sh` instead of a real tool. Defaults to spawnRun. */
  readonly spawner?: (req: SpawnRequest, logPath: string) => Spawned;
  readonly now?: () => Date;
}

export const RUN_LOG_DIR = '.agent-os/runs';

interface DryRunQuery {
  readonly tool: ToolId;
  readonly mode: Mode;
  readonly repo: string;
  readonly brief: string;
}

function tailFile(path: string, bytes: number): string {
  if (!existsSync(path)) return '';
  const s = readFileSync(path, 'utf8');
  return s.length > bytes ? s.slice(-bytes) : s;
}

export function createApp(deps: ServerDeps): express.Express {
  const { root, config, store, probe } = deps;
  const spawner = deps.spawner ?? spawnRun;
  const now = deps.now ?? (() => new Date());
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const auth = req.header('authorization') ?? '';
    if (auth !== `Bearer ${deps.token}`) {
      res.status(401).json({ error: 'missing or wrong token' });
      return;
    }
    next();
  });

  app.get('/api/status', (_req, res) => {
    res.json(readStatus(root, config));
  });

  app.get('/api/brain', (_req, res) => {
    res.json(readBrain(config.brain));
  });

  app.post('/api/brain/fetch', (_req, res) => {
    if (config.brain === null) {
      res.status(409).json({ error: 'no Brain configured' });
      return;
    }
    const err = fetchBrain(config.brain);
    res.json({ ok: err === null, note: err, reading: readBrain(config.brain) });
  });

  app.get('/api/runs', (_req, res) => {
    res.json(store.list(100).map((r) => withLiveness(r, probe)));
  });

  app.get('/api/runs/dry', (req, res) => {
    const tool = String(req.query['tool'] ?? '');
    const mode = String(req.query['mode'] ?? '');
    const repoArg = String(req.query['repo'] ?? '');
    const brief = String(req.query['brief'] ?? 'Verify this Agent OS command end to end, make no unnecessary changes, and report what happened.');
    if (!(TOOL_IDS as readonly string[]).includes(tool)) {
      res.status(400).json({ error: `tool must be one of ${TOOL_IDS.join(', ')}` });
      return;
    }
    if (!(MODES as readonly string[]).includes(mode)) {
      res.status(400).json({ error: `mode must be one of ${MODES.join(', ')}` });
      return;
    }
    if (repoArg === '') {
      res.status(400).json({ error: 'a repo is required: a name from config, "brain", or an absolute path' });
      return;
    }
    const repo = resolveRepo(config, repoArg);
    if (repo === null) {
      res.status(400).json({ error: `unknown repo ${repoArg}` });
      return;
    }
    const q: DryRunQuery = { tool: tool as ToolId, mode: mode as Mode, repo: repoArg, brief };
    const adapter = ADAPTERS[q.tool];
    if (!adapter.modes.includes(q.mode)) {
      res.status(400).json({ error: `${adapter.label} does not serve mode ${q.mode}` });
      return;
    }
    const id = 'dry-run';
    const reportPath = config.brain === null ? join(root, RUN_LOG_DIR, `${id}.report.md`) : reportPathFor(config.brain, id, now());
    const lastMessagePath = join(root, RUN_LOG_DIR, `${id}.last.md`);
    const prompt = composeBrief({
      runId: id,
      tool: q.tool,
      mode: q.mode,
      brain: config.brain,
      cwd: repo,
      brief: q.brief,
      reportPath,
      workflow: null,
      step: null,
    });
    res.json(adapter.command({ runId: id, mode: q.mode, cwd: repo, brain: config.brain, prompt, reportPath, lastMessagePath }));
  });

  app.get('/api/runs/:id', (req, res) => {
    const row = store.get(String(req.params['id']));
    if (row === null) {
      res.status(404).json({ error: 'no such run' });
      return;
    }
    res.json(withLiveness(row, probe));
  });

  app.get('/api/runs/:id/log', (req, res) => {
    const row = store.get(String(req.params['id']));
    if (row === null) {
      res.status(404).json({ error: 'no such run' });
      return;
    }
    const logDir = resolve(root, RUN_LOG_DIR);
    if (!resolve(row.log_path).startsWith(logDir)) {
      res.status(403).json({ error: 'log path outside the run log directory' });
      return;
    }
    res.type('text/plain').send(tailFile(row.log_path, 24_000));
  });

  app.post('/api/runs', (req, res) => {
    const body = req.body as Partial<StartRunBody>;
    const refuse = (status: number, error: string) => res.status(status).json({ error });

    if (isStopped(root)) return refuse(409, `stopped: remove ${STOP_FILE} or press Resume`);
    if (!body.tool || !(TOOL_IDS as readonly string[]).includes(body.tool)) return refuse(400, `tool must be one of ${TOOL_IDS.join(', ')}`);
    if (!body.mode || !(MODES as readonly string[]).includes(body.mode)) return refuse(400, `mode must be one of ${MODES.join(', ')}`);
    if (typeof body.brief !== 'string' || body.brief.trim() === '') return refuse(400, 'a brief is required');
    if (typeof body.repo !== 'string' || body.repo === '') return refuse(400, 'a repo is required: a name from config, "brain", or an absolute path');

    const adapter = ADAPTERS[body.tool];
    if (!adapter.modes.includes(body.mode)) return refuse(400, `${adapter.label} does not serve mode ${body.mode}`);
    const avail = adapter.detect();
    if (!avail.available) return refuse(409, `${adapter.label}: ${avail.why}`);
    if (body.tool === 'codex' && body.mode === 'build' && !config.codexBuildVerified) {
      return refuse(409, 'codex build is refused until a real `codex exec --worktree -s workspace-write` run has been watched to succeed; then set codexBuildVerified: true in .agent-os/config.json');
    }
    const repo = resolveRepo(config, body.repo);
    if (repo === null) return refuse(400, `unknown repo ${body.repo}`);

    const busy = store.byState('running').map((r) => withLiveness(r, probe)).find((r) => r.tool === body.tool && r.liveness === 'running');
    if (busy) return refuse(409, `${adapter.label} is busy with ${busy.id}; one run per tool at a time`);

    const id = newRunId(now());
    const requestedAt = now().toISOString();
    const logPath = join(root, RUN_LOG_DIR, `${id}.log`);
    const lastMessagePath = join(root, RUN_LOG_DIR, `${id}.last.md`);
    const reportPath = config.brain === null ? join(root, RUN_LOG_DIR, `${id}.report.md`) : reportPathFor(config.brain, id, now());
    mkdirSync(join(root, RUN_LOG_DIR), { recursive: true });

    let cwd = repo;
    const row: RunRow = {
      id, tool: body.tool, mode: body.mode, repo: body.repo, cwd, brief: body.brief, workflow: body.workflow ?? null,
      step: body.step ?? null, state: 'requested', pid: null, process_started_at: null, requested_at: requestedAt,
      started_at: null, ended_at: null, exit_code: null, log_path: logPath, report_path: reportPath, note: null, cancel_requested: 0,
    };

    try {
      if (body.mode === 'build' && body.tool === 'claude') {
        cwd = buildWorktree(repo, id);
        assertNotProtected(cwd);
      }
      const prompt = composeBrief({ runId: id, tool: body.tool, mode: body.mode, brain: config.brain, cwd, brief: body.brief, reportPath, workflow: row.workflow, step: row.step });
      const spawnReq = adapter.command({ runId: id, mode: body.mode, cwd, brain: config.brain, prompt, reportPath, lastMessagePath });
      writeFileSync(logPath, `# ${id} ${body.tool} ${body.mode} in ${cwd}\n# ${spawnReq.command} ${spawnReq.args.map((a) => (a.length > 80 ? a.slice(0, 77) + '…' : a)).join(' ')}\n`);
      const spawned = spawner(spawnReq, logPath);
      store.insert({ ...row, cwd, state: 'running', pid: spawned.pid, process_started_at: spawned.processStartedAt, started_at: now().toISOString() });
      void spawned.exited.then(({ code, signal }) => {
        const current = store.get(id);
        const cancelled = current?.cancel_requested === 1 || signal !== null;
        const verdict = adapter.interpret(code, tailFile(logPath, 4000));
        const state = cancelled ? 'cancelled' : verdict.outcome;
        store.update(id, { state, exit_code: code, ended_at: now().toISOString(), note: cancelled ? `cancelled (${signal ?? 'by request'})` : verdict.note });
        const after = store.get(id);
        if (after !== null) {
          const filed = fileReport(config.brain, after, lastMessagePath);
          if (filed !== null) store.update(id, { note: [after.note, filed].filter(Boolean).join('; ') });
        }
      });
      res.status(201).json(withLiveness(store.get(id) as RunRow, probe));
    } catch (e) {
      const note = e instanceof Error ? e.message : String(e);
      store.insert({ ...row, cwd, state: 'refused', note });
      res.status(409).json({ error: note, run: store.get(id) });
    }
  });

  app.post('/api/runs/:id/cancel', (req, res) => {
    const row = store.get(String(req.params['id']));
    if (row === null) {
      res.status(404).json({ error: 'no such run' });
      return;
    }
    if (row.state !== 'running' || row.pid === null) {
      res.status(409).json({ error: `run is ${row.state}` });
      return;
    }
    store.update(row.id, { cancel_requested: 1 });
    const sent = signalGroup(row.pid, 'SIGTERM');
    setTimeout(() => {
      const again = store.get(row.id);
      if (again?.state === 'running' && again.pid !== null) signalGroup(again.pid, 'SIGKILL');
    }, 10_000).unref();
    res.json({ ok: sent });
  });

  app.post('/api/stop', (_req, res) => {
    mkdirSync(join(root, '.agent-os'), { recursive: true });
    writeFileSync(join(root, STOP_FILE), new Date().toISOString() + '\n');
    res.json({ stopped: true });
  });

  app.post('/api/resume', (_req, res) => {
    const p = join(root, STOP_FILE);
    if (existsSync(p)) unlinkSync(p);
    res.json({ stopped: false });
  });

  return app;
}

/** On start, a row still `running` from a previous Runner whose process is gone is `lost`. */
export function reconcile(store: Store, probe: LivenessProbe, now = () => new Date()): number {
  let n = 0;
  for (const r of store.byState('running')) {
    if (withLiveness(r, probe).liveness === 'ended-unwatched') {
      store.update(r.id, { state: 'lost', ended_at: now().toISOString(), note: 'process gone while no Runner was watching' });
      n++;
    }
  }
  return n;
}
