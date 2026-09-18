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

## What is built and verified (27 tests, tsc clean, Desk bundles)

- `shared/types.ts` — the contract between Runner and Desk.
- `runner/` — config (`.agent-os/config.json`), token door (`.agent-os/token`, 0600, no unset-means-open), SQLite store (`node:sqlite`, no native build), spawner with process groups and a start-time token, read-time liveness, adapters for `claude` and `codex`, brief composer, worktree guard, report filer, Brain reader, status probes, the HTTP server, and `reconcile()` for rows orphaned by a previous Runner.
- `desk/` — Vite + React: status strip, Runs (start form, live table, log tail, cancel, stop/resume), Brain (INDEX rendered, projects, recent reports, fetch), Workflows (list, run-a-step, author-a-workflow). The proxy adds the token and refuses a foreign Origin.
- `brain-template/` — `AGENTS.md` (the Brain's rulebook, workflow shape, report shape), `CLAUDE.md` → `@AGENTS.md`, `INDEX.md`, project/learning/schedule/workflow/inbox/decisions/runs skeletons, one real workflow.
- `scripts/brain-init.ts`, `scripts/config-init.ts`.

## What is NOT yet done, in the order to do it

Each item is one commit with `npm run verify` green. Done-criteria are written so a stranger can check them.

1. **Measure Codex build on the Mac.** Calvin runs, inside a real repo, the exact build command the adapter emits (print it with a dry run: add `GET /api/runs/dry?tool=codex&mode=build&repo=…` that returns the `SpawnRequest` without spawning). Watch it: does `workspace-write` wait on an approval nobody answers? If it hangs, try `--approve-for-me` and record the result in `docs/reports/codex-exec-help.txt`. Done when: one Codex build run has succeeded end to end and `codexBuildVerified` is set by `npm run config:init -- --codex-build-verified`.
2. **Confirm Claude's headless flags on this Mac** the same way (a `read` run against the Brain: `claude -p "what am I working on"`). Done when: a Claude read run's report is in the Brain, filed by the Runner.
3. **Trust and login probes in the status strip.** `codex` refuses an untrusted repo; `claude` refuses when logged out. Add per-repo `codexTrusted` and a `claude` login probe (Aether's: `claude -p "Reply with the single word ready." --output-format text`, checked for the word `ready`; note it costs one short call) so the strip says *logged out* before a run fails. Done when: with `claude` logged out, `GET /api/status` says so and a start is refused with the sign-in command.
4. **Workflow step handoff.** When a `me` step is next, the Desk should say so; when a run for step N succeeds, offer step N+1 with one click. Pure UI over the existing `workflow`/`step` fields. Done when: the example workflow can be walked 1 → 2 → 3 from the Desk with no typing.
5. **Cloud.** `POST /api/runs` with `where: "cloud"` for `claude` only: starts a *local* `claude` read run whose brief is to create a Claude Code on the web session against the Brain repo with the given brief (the only route to the cloud without an API is from inside a Claude session). Done when: a cloud session's report appears in the Brain after `Fetch`. If the local session cannot create a cloud session with the tools it has, record that as measured and stop; do not add an API.
6. **Runner `up`/`down`.** `npm run up` starts Runner and Desk, probes git and both CLIs first, prints the Desk URL, and fails naming the part that failed; `npm run down` stops exactly what `up` started (pid + start token under `.agent-os/`). Done when: with the Xcode licence unaccepted, `up` refuses and prints `sudo xcodebuild -license accept`.
7. **Reports as the Desk's history.** Show a run's report (from the Brain, at the ref) beside its log. Done when: clicking a finished run shows both.

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
