# Agent OS

A standalone centre for CLI agents and one second brain. It is not Aether OS
and not Aether's Foreman; it starts tools in *other* repositories and shows
what they did. **No API keys anywhere**: every tool is a logged-in CLI on a
subscription (`claude` on Max, `codex` on ChatGPT).

Three parts:

| Part | What | Where |
|---|---|---|
| **The Brain** | A git repo of markdown every agent reads as context and writes results into. Seeded from `brain-template/`. | your `second-brain` checkout |
| **The Runner** | A local service on `127.0.0.1:8800` that starts one tool in one repo with one brief, logs it, records how it ended, and files a report into the Brain. The only thing that spawns a process. | `runner/` |
| **The Desk** | A page on `127.0.0.1:5180` that shows the Brain, the runs and the workflows, and is where you type a brief. | `desk/` |

Agents never talk to each other. They read and write the same files; git is the bus.

The full plan, with everything Calvin specified and why each choice was made: `docs/PLAN.md`.
The handover for whoever finishes it: `AGENTS.md`.

## Run it (Mac)

```sh
npm ci
npm run brain:init -- /absolute/path/to/second-brain      # once; then add a remote and push
npm run config:init -- --brain /absolute/path/to/second-brain --repo lockdown=/abs/Productivity
npm run dev                                               # Runner + Desk; open http://127.0.0.1:5180
```

Preconditions the status strip checks for you: `git --version` works (on a Mac
this needs the Xcode licence accepted: `sudo xcodebuild -license accept`),
`claude` and `codex` on PATH and logged in, the Brain path is a git repo.

## Verify

```sh
npm run verify      # tsc, then node --test (real spawns, real git, no network)
npm run build:desk  # the Vite bundle, into dist-desk/
```

## What a run is

`POST /api/runs {tool, mode, repo, brief, workflow?, step?}`:

- **read** — no edits, no shell. Claude: `dontAsk`, reading tools only. Codex: `-s read-only`. The tool's last message becomes the report; the Runner files it in the Brain and pushes.
- **review** — Codex's built-in `codex exec review --base main`; Claude as read with a review brief.
- **build** — edits on a branch in a worktree, never the checkout. Claude: the Runner makes `agent/<run-id>` under `<repo>/.agent-os/worktrees/`. Codex: `--worktree`, refused until `codexBuildVerified` is set in `.agent-os/config.json` after a real run has been watched to succeed.

One run per tool at a time. `.agent-os/stop` halts all new starts. Everything the Runner writes lives under `.agent-os/` (gitignored) except the reports, which go into the Brain.
