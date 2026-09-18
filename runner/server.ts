import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  MODES,
  TOOL_IDS,
  type ChatDetail,
  type ChatMessage,
  type ChatThreadView,
  type CreateChatBody,
  type Mode,
  type RunRow,
  type RunView,
  type SendChatMessageBody,
  type StartRunBody,
  type ToolId,
} from '../shared/types.ts';
import { ADAPTERS } from './adapters/index.ts';
import { composeBrief, composeChatTurn, composeCloudLaunchBrief, type ChatTranscriptTurn } from './brief.ts';
import { fetchBrain, readBrain, readRunReport } from './brain.ts';
import { isCodexTrusted, resolveRepo, type Config } from './config.ts';
import { withLiveness, type LivenessProbe } from './liveness.ts';
import { tryGit } from './git.ts';
import { signalGroup, spawnRun, type SpawnRequest, type Spawned } from './process.ts';
import { fileReport, reportPathFor } from './report.ts';
import { isStopped, readStatus, STOP_FILE } from './status.ts';
import { newChatId, newChatTurnId, newRunId, type Store } from './store.ts';
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
  readonly claudeLogin?: () => { readonly ok: boolean; readonly detail: string };
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

function answerFromReport(body: string): string {
  const marker = body.match(/\n## (?:Report|Log tail)[^\n]*\n\n/);
  if (!marker || marker.index === undefined) return body.trim();
  const answer = body.slice(marker.index + marker[0].length).trim();
  return answer.replace(/^# r-[^\n]*\n# (?:claude|codex)[^\n]*\n?/i, '').trim();
}

function assistantAnswer(root: string, config: Config, row: RunRow): string {
  const lastMessagePath = join(root, RUN_LOG_DIR, `${row.id}.last.md`);
  if (existsSync(lastMessagePath)) return readFileSync(lastMessagePath, 'utf8').trim();
  if (config.brain !== null) {
    const report = readRunReport(config.brain, row.report_path);
    if (report !== null) return answerFromReport(report.body);
  }
  return '';
}

export function createApp(deps: ServerDeps): express.Express {
  const { root, config, store, probe } = deps;
  const spawner = deps.spawner ?? spawnRun;
  const now = deps.now ?? (() => new Date());
  const status = () => readStatus(root, config, deps.claudeLogin);
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
    res.json(status());
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

  app.get('/api/runs/:id/report', (req, res) => {
    const row = store.get(String(req.params['id']));
    if (row === null) {
      res.status(404).json({ error: 'no such run' });
      return;
    }
    if (config.brain === null) {
      res.status(409).json({ error: 'no Brain configured' });
      return;
    }
    const report = readRunReport(config.brain, row.report_path);
    if (report === null) {
      res.status(404).json({ error: `report is not present at the Brain's current ref` });
      return;
    }
    res.json(report);
  });

  type StartResult = { readonly status: number; readonly payload: unknown };
  const startRun = (body: Partial<StartRunBody>, promptBrief?: string, chatId?: string): StartResult => {
    const refuse = (code: number, error: string): StartResult => ({ status: code, payload: { error } });

    if (isStopped(root)) return refuse(409, `stopped: remove ${STOP_FILE} or press Resume`);
    if (!body.tool || !(TOOL_IDS as readonly string[]).includes(body.tool)) return refuse(400, `tool must be one of ${TOOL_IDS.join(', ')}`);
    const tool = body.tool as ToolId;
    const where = body.where ?? 'local';
    if (where !== 'local' && where !== 'cloud') return refuse(400, 'where must be local or cloud');
    if (where === 'cloud' && tool !== 'claude') return refuse(400, 'cloud runs are available for claude only');
    const mode = where === 'cloud' ? 'read' : body.mode;
    if (!mode || !(MODES as readonly string[]).includes(mode)) return refuse(400, `mode must be one of ${MODES.join(', ')}`);
    if (typeof body.brief !== 'string' || body.brief.trim() === '') return refuse(400, 'a brief is required');
    const repoArg = where === 'cloud' ? 'brain' : body.repo;
    if (typeof repoArg !== 'string' || repoArg === '') return refuse(400, 'a repo is required: a name from config, "brain", or an absolute path');
    if (where === 'cloud' && config.brain === null) return refuse(409, 'cloud runs need a configured Brain repository');

    const adapter = ADAPTERS[tool];
    if (!adapter.modes.includes(mode)) return refuse(400, `${adapter.label} does not serve mode ${mode}`);
    const avail = adapter.detect();
    if (!avail.available) return refuse(409, `${adapter.label}: ${avail.why}`);
    if (tool === 'claude') {
      const login = status().tools.claude;
      if (!login.ok) return refuse(409, `Claude Code: ${login.detail}`);
    }
    if (tool === 'codex' && mode === 'build' && !config.codexBuildVerified) {
      return refuse(409, 'codex build is refused until a real `codex exec --worktree -s workspace-write` run has been watched to succeed; then set codexBuildVerified: true in .agent-os/config.json');
    }
    const repo = resolveRepo(config, repoArg);
    if (repo === null) return refuse(400, `unknown repo ${repoArg}`);
    if (tool === 'codex' && !isCodexTrusted(config, repo)) {
      return refuse(409, `Codex: ${repo} is not marked trusted. Open \`codex\` in that repo once and accept the trust prompt, then run \`npm run config:init -- --codex-trusted ${repoArg}\``);
    }

    const busy = store.byState('running').map((r) => withLiveness(r, probe)).find((r) => r.tool === tool && r.liveness === 'running');
    if (busy) return refuse(409, `${adapter.label} is busy with ${busy.id}; one run per tool at a time`);

    const id = newRunId(now());
    const requestedAt = now().toISOString();
    const logPath = join(root, RUN_LOG_DIR, `${id}.log`);
    const lastMessagePath = join(root, RUN_LOG_DIR, `${id}.last.md`);
    const reportPath = config.brain === null ? join(root, RUN_LOG_DIR, `${id}.report.md`) : reportPathFor(config.brain, id, now());
    mkdirSync(join(root, RUN_LOG_DIR), { recursive: true });

    let cwd = repo;
    const row: RunRow = {
      id, tool, mode, repo: repoArg, cwd, brief: body.brief, workflow: body.workflow ?? null,
      step: body.step ?? null, state: 'requested', pid: null, process_started_at: null, requested_at: requestedAt,
      started_at: null, ended_at: null, exit_code: null, log_path: logPath, report_path: reportPath, note: null, cancel_requested: 0,
    };

    try {
      if (mode === 'build' && tool === 'claude') {
        cwd = buildWorktree(repo, id);
        assertNotProtected(cwd);
      }
      const runBrief = promptBrief ?? (where === 'cloud'
        ? composeCloudLaunchBrief(config.brain as string, tryGit(config.brain as string, ['remote', 'get-url', 'origin']), body.brief)
        : body.brief);
      const prompt = composeBrief({
        runId: id, tool, mode, brain: config.brain, cwd, brief: runBrief, reportPath,
        workflow: row.workflow, step: row.step, ...(chatId ? { chat: chatId } : {}),
      });
      const spawnReq = adapter.command({ runId: id, mode, cwd, brain: config.brain, prompt, reportPath, lastMessagePath, where });
      writeFileSync(logPath, `# ${id} ${tool} ${mode} ${where} in ${cwd}\n# ${spawnReq.command} ${spawnReq.args.map((a) => (a.length > 80 ? a.slice(0, 77) + '…' : a)).join(' ')}\n`);
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
      return { status: 201, payload: withLiveness(store.get(id) as RunRow, probe) };
    } catch (e) {
      const note = e instanceof Error ? e.message : String(e);
      store.insert({ ...row, cwd, state: 'refused', note });
      return { status: 409, payload: { error: note, run: store.get(id) } };
    }
  };

  app.post('/api/runs', (req, res) => {
    const result = startRun(req.body as Partial<StartRunBody>);
    res.status(result.status).json(result.payload);
  });

  const chatView = (id: string): ChatDetail | null => {
    const thread = store.getChat(id);
    if (thread === null) return null;
    const messages: ChatMessage[] = [];
    for (const turn of store.listChatTurns(id)) {
      const run = store.get(turn.run_id);
      if (run === null) continue;
      messages.push({ id: `${turn.id}-user`, role: 'user', body: turn.body, createdAt: turn.created_at, runId: run.id, state: run.state });
      messages.push({ id: `${turn.id}-assistant`, role: 'assistant', body: assistantAnswer(root, config, run), createdAt: run.ended_at ?? run.started_at ?? turn.created_at, runId: run.id, state: run.state });
    }
    return { thread, messages };
  };

  app.get('/api/chats', (_req, res) => {
    const chats: ChatThreadView[] = store.listChats().map((thread) => {
      const turns = store.listChatTurns(thread.id);
      const last = turns[turns.length - 1];
      return { ...thread, turnCount: turns.length, lastState: last ? store.get(last.run_id)?.state ?? null : null };
    });
    res.json(chats);
  });

  app.post('/api/chats', (req, res) => {
    const body = req.body as Partial<CreateChatBody>;
    if (!body.tool || !(TOOL_IDS as readonly string[]).includes(body.tool)) {
      res.status(400).json({ error: `tool must be one of ${TOOL_IDS.join(', ')}` });
      return;
    }
    if (config.brain === null) {
      res.status(409).json({ error: 'chats need a configured Brain repository' });
      return;
    }
    const created = now().toISOString();
    const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim().slice(0, 72) : 'New conversation';
    const thread = { id: newChatId(now()), title, tool: body.tool as ToolId, created_at: created, updated_at: created };
    store.createChat(thread);
    res.status(201).json(thread);
  });

  app.get('/api/chats/:id', (req, res) => {
    const view = chatView(String(req.params['id']));
    if (view === null) {
      res.status(404).json({ error: 'no such chat' });
      return;
    }
    res.json(view);
  });

  app.post('/api/chats/:id/messages', (req, res) => {
    const id = String(req.params['id']);
    const thread = store.getChat(id);
    if (thread === null) {
      res.status(404).json({ error: 'no such chat' });
      return;
    }
    const body = req.body as Partial<SendChatMessageBody>;
    if (typeof body.body !== 'string' || body.body.trim() === '') {
      res.status(400).json({ error: 'a message is required' });
      return;
    }
    const turns = store.listChatTurns(id);
    const history: ChatTranscriptTurn[] = [];
    for (const turn of turns) {
      const run = store.get(turn.run_id);
      if (run === null) continue;
      const assistant = assistantAnswer(root, config, run);
      if (assistant !== '') history.push({ user: turn.body, assistant });
    }
    const message = body.body.trim();
    const prompt = composeChatTurn(thread.title, history, message);
    const result = startRun({ tool: thread.tool, mode: 'read', repo: 'brain', brief: message }, prompt, thread.id);
    if (result.status === 201) {
      const run = result.payload as RunView;
      const created = now().toISOString();
      store.addChatTurn({ id: newChatTurnId(id, turns.length + 1), chat_id: id, run_id: run.id, body: message, created_at: created });
      store.touchChat(id, created);
    }
    res.status(result.status).json(result.payload);
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
