# Agent OS — handover to whoever finishes it

You are reading the repository's instruction file. Claude Code scaffolded this
on 18 Sep 2026; Calvin is handing it to Codex to code to completion. Read this
whole file, then `README.md`, then `docs/PLAN.md` §0–§6 (what Calvin asked for
and why every choice was made). Do not re-derive the design; the open
decisions are listed at the bottom and are Calvin's.

## The rules of this repository

1. **No API keys, ever.** Not in code, not in config, not in an env var read by this repo. A tool is in the team only if it runs headless from a subscription login. If you find yourself adding an HTTP client to a model vendor, stop.
2. **Every CLI flag comes from the real tool's `--help`,** recorded verbatim under `docs/reports/`, with the version. A command line that reads well but was never run is a guess; the Runner refuses guessed commands by construction (`codexBuildVerified`). If you need a flag that is not in `docs/reports/`, ask Calvin to run `--help` and paste it.
3. **Only `runner/process.ts` spawns.** Nothing under `desk/` and nothing else under `runner/` may call `child_process.spawn/exec` to start a tool. Git calls are string argument vectors (`runner/git.ts`), never shell strings.
4. **The Brain is read out of a commit** (`origin/main` as last fetched, else `HEAD`) and never the working tree; the Runner runs `git fetch`, never `git pull`, because a pull under a running agent is how uncommitted work dies.
5. **A build never runs in the checkout.** Claude builds go in a worktree on `agent/<run-id>` (`runner/worktree.ts`); Codex builds use `--worktree`. A build on `main`/`master` is refused.
6. **Every run leaves a report in the Brain** (`runs/YYYY-MM/<id>.md`), written by the agent if it could write, else by the Runner (`runner/report.ts`), then committed and pushed. The run row's `note` says when that failed.
7. **One run per tool at a time.** No caps, lanes, claims, cron or retries in v1. That is a decision (PLAN §2), not an omission. Concurrency is a v2 question answered from measured need.
8. **Tests are real:** they spawn real processes (`sh`), make real git repos in a temp dir, and never reach the network. `npm run verify` must be green before every commit. Do not mock what you can run.
9. Commit messages say what was measured and why the change; do not put a model name in a commit.

## What is built and verified (41 tests, tsc clean, Desk bundles)

- `shared/types.ts` — the contract between Runner and Desk.
- `runner/` — config (`.agent-os/config.json`), token door (`.agent-os/token`, 0600, no unset-means-open), SQLite store (`node:sqlite`, no native build), spawner with process groups and a start-time token, read-time liveness, adapters for `claude` and `codex`, brief composer, worktree guard, report filer, Brain reader, status probes, the HTTP server, and `reconcile()` for rows orphaned by a previous Runner.
- `desk/` — Vite + React: status strip, Runs (start form, live table, log tail, cancel, stop/resume), Brain (INDEX rendered, projects, recent reports, fetch), Workflows (list, run-a-step, author-a-workflow). The proxy adds the token and refuses a foreign Origin.
- `brain-template/` — `AGENTS.md` (the Brain's rulebook, workflow shape, report shape), `CLAUDE.md` → `@AGENTS.md`, `INDEX.md`, project/learning/schedule/workflow/inbox/decisions/runs skeletons, one real workflow.
- `scripts/brain-init.ts`, `scripts/config-init.ts`.

## Completion status (Codex, 18 Sep 2026)

Each item below is one commit with `npm run verify` green.

1. **Codex build measured.** `GET /api/runs/dry` returns the exact request without spawning. A disposable real-repo build created and committed a file in a detached managed worktree, exited 0, left the checkout untouched, and needed no `--approve-for-me`. See `docs/reports/codex-exec-help.txt`. Local `codexBuildVerified` is set.
2. **Claude headless measured.** A real Runner read completed and the Runner committed its report locally. Push is blocked by the local Brain's GitHub SSH host trust and invalid `gh` login; see `docs/reports/claude-headless.txt`.
3. **Trust and login preflights shipped.** Codex trust is recorded per absolute checkout. Claude's one-word login call is cached for five minutes. Status and starts both expose/refuse failed preconditions with repair commands.
4. **Workflow handoff shipped.** The Desk derives the relay position from run rows, exposes a `me` acknowledgement, and pre-fills the next agent step. Tests walk the example 1 → 2 → 3 without rewriting the workflow.
5. **Cloud shipped and measured.** A local read-only launcher created one disabled one-off routine and a successful 94-second web run through `RemoteTrigger`; the cloud report was pushed. No API or recurring schedule was added. Local Fetch is blocked because `/Users/calvin_dean0/second-brain` is a different history from origin/main and its GitHub auth is broken. See `docs/reports/claude-cloud.txt`.
6. **Runner `up`/`down` shipped.** Real acceptance: both services became ready, the Desk returned HTTP 200, and `down` stopped exactly the recorded PIDs whose start tokens matched. Xcode-licence repair text is covered.
7. **Reports beside logs shipped.** The report route reads the Brain commit, never the working tree. Real Desk-proxy acceptance returned the finished report at `HEAD`; tests prove a newer working-tree replacement is ignored.

Two external actions remain before the local Brain can follow the cloud result: restore GitHub authentication/SSH host trust, then decide how to reconcile the local old notes/derived-index history with the Agent OS Brain seed at origin/main. Agent OS intentionally did neither automatically. Browser visual automation was also unavailable (`agent-browser` absent; macOS Computer Use permission not granted), though the production bundle and UI-state tests pass.

## Things to leave alone unless Calvin decides otherwise

- The Foreman in `aether-os` — a different system for a different job; copy its patterns, never import it.
- Aether OS's database — never written from here.
- Adding Gemini or Freebuff (likely Codebuff) — parked by Calvin on 17 Sep; when unparked, one adapter file each, from their own `--help`.
- Any scheduler, queue, cap, or second conversation store.

## How to run the checks

```sh
npm ci
npm run verify        # tsc + 27 tests, ~3 s, no network
npm run build:desk    # Vite bundle
npm run dev           # then http://127.0.0.1:5180
```
