# Decisions

_Append-only. One dated entry per decision: what was decided, the alternatives, why._

## 2026-09-18 — the Brain is a git repo of markdown
Decided: every agent reads and writes this repo; nothing else is shared memory. Alternatives: Aether OS's SQLite (a CLI cannot read it without the server), a database (a second thing that can disagree with the files). Why: every CLI reads files and runs git; cloud sessions start from a clone.
