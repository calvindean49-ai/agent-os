# The Brain — read this first

This repository is the one context bank for every CLI agent (Claude Code, Codex)
that works for Calvin, and for Calvin himself. Every agent reads it as its
context and writes its results back into it. There is no other shared memory.

## How to read it

1. `INDEX.md` — one screen: what is in focus now, the projects, the next actions.
2. `projects/<name>.md` — one file per project: goal, current state, next step, where the code is.
3. `learning/` — mastery maps (maths first): what is proven, what is practised, what is next.
4. `schedule/` — the week plan, commitments, routines.
5. `workflows/` — things an agent can do step by step (shape below).
6. `decisions/log.md` — dated decisions, append-only.
7. `runs/YYYY-MM/<run-id>.md` — what agents did (shape below).
8. `inbox/` — raw captures not yet filed.

Read what your brief needs, not the whole tree.

## How to write it (five rules)

1. `INDEX.md`, `projects/*`, `learning/*`, `schedule/*` are **replaced in place**. Never append a dated layer; rewrite the section so it reads as if it had always been true. Old reasoning worth keeping goes to `decisions/log.md`.
2. `decisions/log.md`, `runs/`, `inbox/` are **append-only**.
3. Every commit message starts with the tool name and the run id: `codex r-20260918-0012-001: …`.
4. Never delete a file you did not create in this run.
5. A run ends by writing its report to `runs/YYYY-MM/<run-id>.md` (shape below), committing it, and pushing. **A run that did not push did not happen.** If you cannot write (read-only sandbox), your final message is your report and the Runner files it for you.

## A workflow is a file

`workflows/<name>.md`, in exactly this shape, so the Desk can list its steps and start each one:

```markdown
# Workflow: <title>
trigger: <when, or "typed at the Desk">
context: <files to read first, comma-separated>
steps:
  1. claude — <one step, one tool, imperative>
  2. me — <a step Calvin does by hand>
  3. codex — <one step, one tool>
done when: <something a stranger could check>
```

A step line is `  N. <tool> — <text>` with an em dash. Tools are `claude`, `codex`, or `me`.
To **set up** a workflow when asked: write one of these, commit, push, report.
To **run** a workflow step: read the file, do that step only, report, stop.

## A run report is a file

`runs/YYYY-MM/<run-id>.md`:

```markdown
# Run <run-id>
- tool: claude | codex
- mode: read | review | build
- repo: <name or path>
- workflow: <path> step <n>   (if any)
- outcome: <one line>

## What I did
<short, factual, with file paths>

## What changed in the Brain
<files replaced or appended, or "nothing">

## Next
<the next step, or "none">
```

## What you must not do

- Do not invent facts about Calvin's learning, schedule or projects. If the Brain does not say it, say it is unknown.
- Do not write to Aether OS's database or repositories unless the brief names them as the working directory.
- Do not touch `.agent-os/` anywhere; it belongs to the Runner.
