# Agent OS — a standalone centre for CLI agents and one second brain

**Draft 2 · 17 September 2026 · for back-and-forth, nothing decided.**
Draft 1 proposed finishing Aether's Foreman. Calvin ruled that out: *this is its own OS, separate from Aether, and it is about communication with the CLIs only.* This draft is built on that ruling.

---

## 0. Context Calvin has given (the brief, in his words, restructured)

**First message**
- A front / an OS that communicates with the Claude CLI, Codex, ChatGPT etc. and gets stuff done.
- **Number 1:** a centre for CLI workflows — Claude communicating with Codex etc., delegating among a team of spun-up CLI agents. The work may happen in the desktop app or a terminal; the OS must **show what is going on**.
- The CLIs must be able to **set up workflows when prompted**, or understand how to.
- A centre for **UI design and 3D game machinery** too.
- **Number 2:** one context bank / second brain that everything writes into and the CLIs read from and edit. Not only for building things: the CLIs cooperate on personal projects — maths mastery, scheduling.
- Has **Freebuff**, **Codex**, and plan subscriptions. Work must run **in the cloud and locally**, be **controlled from the OS**, with the workflow **visible**.
- CLIs such as Claude Code must be **contactable through the OS**, set up a workflow, and **report everything back** for display.
- **No API anywhere.** Subscriptions only.
- Don't over-architect. Grounded in certainty of success.

**Second message (answers to draft 1's questions)**
- Codex is installed on the Mac.
- Freebuff is a free coding tool.
- The CLIs **read and write** the second brain.
- The OS is **standalone**: separate from Aether, and **not the Foreman**. Something can be written into Aether later, but the OS is its own thing: one place to build and organise across multiple CLIs.
- The second brain gets its **own home** (the `second-brain` repo).
- The **Mac is on all day** except while he sleeps.

**Third message (17 Sep, later)**
- The OS is called **Agent OS**, in a new repo `agent-os`.
- **No Freebuff and no Gemini yet.** Team for v1 is Claude Code and Codex.
- Claude write mode: **yes** — bypass permissions only on a branch, enforced by the adapter.
- **Same stack as aether-os**: React / Vite / TypeScript, Express, SQLite.
- Codex trial runs inside a repo: not yet run (the placeholder path was typed literally; see §5.1).

**Facts measured from the repos** (for grounding, not as the plan): Aether's Foreman (`aether-os/src/foreman/`) already drives `claude -p` workers, reads state out of git, stores runs in a local SQLite and polls it from a page — it is Aether-specific and stays Aether's. `calvindean49-ai/second-brain` is an empty repo. Aether's own knowledge lives in SQLite a CLI cannot read; its `pinned_memories` table is constrained so a model cannot write a mastery claim.

---

## 1. What this is, in one paragraph

A small local system on the Mac with three parts. **The Brain** is a git repo of markdown that every CLI reads as its context and writes its results into. **The Runner** is a tiny local service that starts a CLI (`claude`, `codex`, `gemini`, Freebuff if it has a terminal mode) in a chosen repo with a chosen brief, keeps its log, and records how it ended. **The Desk** is a web page on `127.0.0.1` that shows the Brain, the runs, and the workflows, and is where you type a brief. No API keys: every tool is a logged-in CLI on your subscription. Cloud work is Claude Code on the web, started *by a local Claude session* (the only route to it without an API), working on a clone of the Brain and pushing back. Agents never talk to each other directly; they read and write the same files, and git is the bus.

## 2. Honest assessment

**Rating, as now scoped: 7/10.** Standalone is the right call *because* the Foreman is welded to Aether's constitution, five-lane queue and 535-row backlog, none of which a maths plan or a scheduling workflow needs. The two points off are one real risk each:

1. **The Runner is where over-architecture will try to creep in.** The Foreman's dispatcher took three days and had four cold-review defects (dead workers reading as running, pid reuse, a stalled wake-up, an unreachable verb). Every one of those came from concurrency and caps. **So v1 has no caps, no lanes, no claims: one run at a time per tool, started by you or by a workflow step, and that is the whole scheduler.** Concurrency is a later decision, taken from measured need.
2. **"The CLIs set up workflows" is only certain if a workflow is a file.** Any engine that interprets workflows is a second thing that can disagree with what the agent actually did. In v1 a workflow is a markdown file with a fixed shape; the Runner only ever runs *one step* (one tool, one brief); the agent reading the file does the sequencing and reports each step into the Brain. That is certain to work on day one with zero code, and it is how Aether's lanes already work.

**What I would copy from the Foreman, as patterns, not code:** read state out of a commit (`git show`), append-only files where two writers can collide, a run store separate from the content repo, dead-run detection by pid plus process-start time, a stop file as the kill switch, and the adapter shape *detect / command / interpret* with the command line taken from the real tool's `--help` and never guessed.

**Uncertain, stated rather than guessed:** whether Freebuff has a headless terminal mode and a login (Q1 below). Whether Codex cloud tasks can be started from a terminal on a ChatGPT plan without an API (unmeasured; Claude is the cloud path until it is).

## 3. Principles

1. **No API keys.** A tool is in the team only if it runs headless from a subscription login.
2. **Git and markdown are the bus.** An agent's instruction is a file it reads; its report is a file it commits.
3. **Brain and code are separate repos.** A CLI session opened in the Brain sees only your context, never the OS's source or tokens.
4. **The Runner is the only thing that spawns a process.** The web page never does.
5. **Every step is one session's work with a done-criterion a stranger can check.**

## 4. The Brain (`calvindean49-ai/second-brain`)

### 4.1 Layout

```
second-brain/
  AGENTS.md            the single instruction file (Codex reads it natively).
                       What this repo is, how to read it, how to write it,
                       what a workflow file looks like, how to report a run.
  CLAUDE.md            "@AGENTS.md"  (Claude Code imports it)
  INDEX.md             one screen: current focus, projects, next actions. Replaced in place.
  projects/<name>.md   goal · state · next · repo/branch links   (aether-os, lockdown, …)
  learning/maths/      mastery map, what is proven vs practised, next probes
  schedule/            week plan, commitments, routines (markdown tables)
  workflows/<name>.md  a workflow a CLI can execute (§4.3)
  inbox/               raw captures; triaged into the above
  decisions/log.md     append-only, dated
  runs/YYYY-MM/<id>.md what an agent did: tool, brief, files touched, outcome, next
```

### 4.2 Write rules (the whole rulebook; five lines, in `AGENTS.md`)

1. `INDEX.md`, `projects/*`, `learning/*`, `schedule/*` are **replaced in place**, never appended with dated layers.
2. `decisions/`, `runs/`, `inbox/` are **append-only**.
3. Every agent commit message starts with the tool and run id: `codex r-0142: …`.
4. An agent never deletes a file it did not create in the same run.
5. Every run ends by writing its `runs/` file and pushing. **A run that did not push did not happen.**

### 4.3 A workflow is a file

```markdown
# Workflow: weekly maths probe
trigger: Sunday evening, or "run maths probe" typed at the Desk
context: learning/maths/map.md, schedule/week.md
steps:
  1. claude  — read the map, pick the three weakest proven-claims, write 3 probe questions to inbox/probe-<date>.md
  2. me      — answer them on paper, type answers into the same file
  3. codex   — mark against the map, update learning/maths/map.md, write runs/<id>.md
done when: map.md has today's date on each of the three claims
```

`AGENTS.md` says: *to set up a workflow, write one of these; to run one, follow its steps in order, and report each step into `runs/`.* That is the whole "CLIs can set up workflows" mechanism. A Claude or Codex session can author one from a sentence you type because the shape is in the file it already loaded.

### 4.4 Cross-CLI delegation, concretely

You type at the Desk: *"plan the Lockdown motion spike and get it reviewed."* The Runner starts `claude` in `second-brain/` with that brief. Claude writes `workflows/lockdown-motion-spike.md` with steps for itself and for Codex, and writes its own `runs/` file. The Desk shows the new workflow. You (or a later automation) press *run step 2*: the Runner starts `codex exec` in the Lockdown repo with the step's brief and the Brain path in the prompt. Codex works, commits on a branch, writes `runs/` in the Brain, pushes. Claude never messages Codex. They share files. This is the same protocol the Foreman proved across five lanes for three weeks.

## 5. The Runner (local service on the Mac, `127.0.0.1`, token in a 0600 file)

**Does exactly this:**

| Action | Detail |
|---|---|
| `start` | `{tool, repo, brief, workflow?, step?}` → spawns the tool's command in that repo, own process group, log to `runs/<id>.log`, row in a local SQLite (`id, tool, repo, brief, state, pid, started, ended, exit, note`) |
| `status` | runs with live/dead decided at read time (pid + process-start token) |
| `log` | tail of a run's log |
| `cancel` | signal the process group |
| stop file | `.agent-os/stop` halts all new starts within one tick |
| `pull` | `git fetch` the Brain; never pull under a running agent |

**Adapters, one file each, command taken from the tool's own `--help` saved under `reports/<tool>-help.txt`:**

| Tool | Local headless (to measure on the Mac) | Write access | Notes |
|---|---|---|---|
| Claude Code | `claude -p "<brief>" --output-format text` with a permission mode you choose per run | edits allowed | in use in Aether today, no key, `env -u` the `ANTHROPIC_*` routing vars |
| Codex | **measured 17 Sep** (`docs/reports/codex-exec-help.txt`), see §5.1 | `-s read-only` / `-s workspace-write` | reads `AGENTS.md`; ChatGPT login; version not yet recorded |
| Gemini CLI, Freebuff | **not in v1** (Calvin, 17 Sep) | — | one adapter file each, later, from their own `--help` |

### 5.1 The Codex adapter, from the real `--help`

Three flags in that output settle three design questions:

- **`--add-dir <DIR>`** makes the Brain writable *alongside* the repo Codex is working in. So a Codex run in the Lockdown repo can write its `runs/` report into the Brain itself. That is the report-back mechanism for building runs, with no glue.
- **`-o <FILE>`** writes the agent's last message to a file. For a **read-only** run (a review) Codex cannot write the Brain, so the Runner points `-o` at `runs/<id>.md` in the Brain and commits it. The Runner reports on behalf of read-only tools; writing tools report themselves.
- **`--json`** streams events as JSONL to stdout. The Runner logs that stream and the Desk tails it, which is how "see what is going on" works for Codex. (`claude -p --output-format stream-json` is the equivalent, already used in Aether.)

Two command shapes, both to be run once by hand before the adapter is written, so the adapter copies a line that worked rather than one that reads well:

```sh
# code review of a branch: the built-in subcommand, read-only by nature, verdict via -o
codex exec review -C <repo> --base main --ephemeral --json \
  -o <brain>/runs/<id>.md "<review brief>"

# any other read-only job (a plan, an audit, a maths marking): cannot touch the tree
codex exec -C <repo> -s read-only --ephemeral --json \
  -o <brain>/runs/<id>.md "<brief>"

# build: edits inside the repo, on a managed worktree (never the checkout), Brain writable for the report
codex exec -C <repo> --enable worktrees --worktree -s workspace-write --json \
  --add-dir <brain> -o <brain>/runs/<id>.last.md "<brief>"
```

**Measured 17 Sep, codex-cli 0.154.0** (`docs/reports/codex-exec-help.txt`): `codex exec review` exists and takes `--base <branch>`, `--commit <sha>` or `--uncommitted`, so reviewing a worker's branch is one flag and not a prompt. From a directory that is not a git repo, exec refuses: *"Not inside a trusted directory and --skip-git-repo-check was not specified"* — so the Runner always passes `-C <repo>`, and a repo Codex has not been trusted in is refused rather than run, which is the safe direction. `--worktree` refuses without `--enable worktrees`.

**Still to measure before the build adapter ships:** (1) the same two trial commands run **inside** a real repo — the first two attempts ran from `~` and from a tool's state folder, and the second was stopped by Apple's git refusing to run until the Xcode licence is accepted (18 Sep), which is a Mac precondition the Runner's status strip must probe (`git --version` exits 0) before it starts anything; (2) what `workspace-write` does when a command would need approval — the help offers `--approve-for-me` and it must be tried, because a run that silently waits for a prompt nobody will answer is the Foreman's first-live-run failure again; (3) whether "trusted directory" is per-repo state that has to be set once interactively (`codex` in the repo, accept the trust prompt) — if so, that is a one-time step per repo and the Desk should say so when a run is refused. **Never** `--dangerously-bypass-approvals-and-sandbox`: the Runner refuses that flag by construction.

**Not in v1:** caps, lanes, claims, scheduling by cron, retries. One run per tool at a time. A second `start` for a busy tool is refused with the running run's id.

## 6. The Desk (web page, same Mac)

Three views, all read from the Brain's last fetched commit and from the Runner's store:

- **Brain** — `INDEX.md` rendered, projects, schedule, inbox count, last ten `runs/`.
- **Runs** — live table from the Runner (polled every 5 s while visible), log viewer, cancel, stop file switch.
- **Workflows** — every `workflows/*.md` with a *run step N with <tool>* button, and a brief box that starts a `claude` run with "set up a workflow for: …".

**Amendment, 18 Sep 2026 — decided by Calvin:** Chats is now the default fourth
view. A chat turn is a normal read-only Runner session in the Brain checkout;
the exchange is filed, committed and pushed as its run report. Thread metadata
and run links live in the Runner's existing SQLite, and recent filed turns are
composed into the next stateless CLI prompt. This deliberately opens the
previously parked conversation-store decision without adding API keys, vendor
HTTP clients, another process, or a second agent protocol.

Stack: React/Vite/TS front, Express/SQLite Runner — the stack you already run, so any CLI can build on it (decided 17 Sep). Repo: **`calvindean49-ai/agent-os`**, new, **never** the Brain.

## 7. Cloud

The only route to Claude Code on the web without an API is from inside a Claude Code session (Aether's `lanes` skill reaches routines the same way). So: the Desk's *run in cloud* starts a **local** `claude -p` run whose only job is to create the cloud session or routine against the Brain repo with the brief. The cloud session clones the Brain, works, writes `runs/`, pushes. The Desk sees it on the next fetch. Codex cloud: unmeasured; not in v1.

## 8. Aether

Nothing in v1. When you want it: one Aether HUD button that opens the Desk, or a read-only panel that polls the Runner's `status`. Neither writes to Aether's database. Not before v1 has run for a week.

## 9. UI design and 3D

The Brain gets `projects/<game>.md` and a `workflows/` file per pipeline; the Runner starts the same tools in those repos. Aether's `threejs-devtools-mcp` / `unreal-mcp` config and design skills can be copied into a game repo's `.mcp.json` / `.claude/skills` when needed. No OS feature required.

## 10. Execution steps (each ≤ one session, in order)

| # | Who | Step | Done when |
|---|---|---|---|
| 1 | you | ~~`codex exec --help`, `--version`, `review --help`~~ done 17 Sep. Still: the two trial runs **inside a repo** (§5.1). (`claude --help` is not needed; Aether already runs it headless with measured flags.) | I have the real flags and one successful run of each shape. |
| 2 | session | Seed the Brain: `AGENTS.md`, `CLAUDE.md`, `INDEX.md`, the folders, `projects/aether-os.md` + `projects/lockdown.md` from the two READMEs, one real `workflows/` file (§4.3), one `learning/maths/map.md` skeleton. | In `second-brain/`, `claude -p "what am I working on"` and `codex exec "what am I working on"` both answer from `INDEX.md`. |
| 3 | session | Runner v1: `start / status / log / cancel`, stop file, SQLite store, adapters for `claude` and `codex` from step 1's help output, liveness by pid + start time. | A run started with `curl` against `127.0.0.1` writes a `runs/` file into the Brain and pushes; killing the process reads `dead` within one poll. |
| 4 | session | Desk v1: Brain, Runs, Workflows views; brief box; run-step buttons. | You type a brief in the browser, watch the run, and see its `runs/` file appear after fetch. No curl. |
| 5 | session | Cloud: the *run in cloud* path via a local Claude session. | A cloud session's `runs/` file appears in the Desk. |
| 6 | you | Use it for a week on real work (the Lockdown motion spike, a maths probe). Write what hurt into `inbox/`. | Decide, from that: concurrency, cron, Aether panel. |

Steps 2 and 3 are independent and can run in parallel. Step 4 waits on 3. Step 5 waits on 4.

## 11. Decisions taken and what is still open

**Decided by Calvin, 17 Sep:** the OS is `agent-os`, a new repo; Claude Code and Codex only in v1; Claude runs may bypass permissions only on a branch and the adapter enforces it; stack is aether-os's.

**Still open, and the only thing blocking the Codex build adapter:** the two trial runs inside a real repo (§5.1). Everything else in steps 2–4 can start now.

**Claude adapter, for the record.** Two shapes, both already measured in Aether's `scripts/aether-run.sh` and `src/foreman/adapters/`:

```sh
# read-only (plan, review, marking): no edit tools, no shell
claude -p "<brief>" --output-format stream-json --permission-mode dontAsk \
  --permission-prompts none --allowedTools Read,Grep,Glob --disallowedTools Edit,Write,Bash

# build: full write, but only after the adapter has checked out a branch in a worktree
claude -p "<brief>" --output-format stream-json --permission-mode bypassPermissions
```

The adapter refuses the second shape unless `git rev-parse --abbrev-ref HEAD` in the run's cwd is not `main`/`master`, and it always runs under `env -u` for the six `ANTHROPIC_*` routing variables so the CLI cannot be routed off Anthropic by a shell profile (Aether hit exactly that on 2 Sep).

## 12. Persona pass (aether-os review personas as lenses)

- **cold-reviewer:** every command line in §5 is a hypothesis until step 1's help output exists; the doc says so. The claim that Codex reads `AGENTS.md` natively is from OpenAI's docs and is checked by step 2's done-criterion. "Codex cloud without API" is marked unmeasured, not assumed.
- **risk-assessor:** the plan reaches no Aether gate and writes no Aether database. The one line to hold: **Aether never writes the Brain from an automated path**, so the Brain cannot become a route for self-report into Aether's learning evidence. The Runner's bypass-permissions mode is the sharpest edge; §11 Q4 confines it to branches.
- **architect:** the Brain's single owner is `AGENTS.md`; the OS's is its own README. This document should move to the OS repo's `docs/` once Q2 is answered; it lives in the Lockdown repo only because that is this session's branch.
- **designer:** no visual claim until step 4; the Desk can borrow Aether's dark register or not, your call, and it does not matter for v1.

## Council notes

- The passes disagreed on whether to extract the Foreman's dispatcher into a shared package versus copy its patterns into a ~300-line Runner. Copy won: extraction would couple the OS to Aether's verify chain, which is the opposite of standalone.
- Genuinely uncertain: Freebuff's headless mode; Codex cloud; whether one-run-per-tool is enough throughput for you (it is enough to learn from, which is v1's job).
- Assumption to check: that "communication to the CLIs only" means the OS never needs to *host* builds or render 3D — it starts tools in other repos and shows results. If you want previews of a game build inside the Desk, that is a v2 feature and a different size of project.
