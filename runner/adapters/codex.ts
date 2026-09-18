import { onPath } from './probe.ts';
import { lastLine, type Adapter } from './types.ts';

/**
 * OpenAI Codex CLI, headless. Every flag below is from `codex exec --help` and
 * `codex exec review --help` on codex-cli 0.154.0 (docs/reports/codex-exec-help.txt).
 *
 *  - read:   `codex exec -s read-only --ephemeral --json -o <last>`; the sandbox
 *            forbids writes, so the Runner files the last message as the report.
 *  - review: `codex exec review --base main ...` — the built-in review subcommand.
 *            It takes no -C, so the working directory is the repo.
 *  - build:  `codex exec --enable worktrees --worktree -s workspace-write --json
 *            --add-dir <brain>`; the Brain is writable so Codex writes its own report.
 *            ⚠️ Not yet watched to succeed on Calvin's Mac: the Runner refuses this
 *            mode until `codexBuildVerified` is true in .agent-os/config.json.
 *
 * Never `--dangerously-bypass-approvals-and-sandbox`; the Runner has no path that adds it.
 */
export const codex: Adapter = {
  id: 'codex',
  label: 'Codex',
  modes: ['read', 'review', 'build'],
  detect() {
    const found = onPath('codex');
    if (found === null) return { available: false, why: 'no `codex` on PATH' };
    return { available: true, detail: found };
  },
  command(req) {
    const common = ['--ephemeral', '--json', '-o', req.lastMessagePath];
    let args: string[];
    if (req.mode === 'review') {
      args = ['exec', 'review', '--base', 'main', ...common, req.prompt];
    } else if (req.mode === 'build') {
      const addDir = req.brain === null ? [] : ['--add-dir', req.brain];
      args = ['exec', '--enable', 'worktrees', '--worktree', '-s', 'workspace-write', '--json', ...addDir, '-o', req.lastMessagePath, req.prompt];
    } else {
      args = ['exec', '-s', 'read-only', ...common, req.prompt];
    }
    return { command: 'codex', args, cwd: req.cwd };
  },
  interpret(code, tail) {
    if (code === 0) return { outcome: 'succeeded', note: 'finished' };
    if (/Not inside a trusted directory/.test(tail)) {
      return { outcome: 'failed', note: 'codex refused: not a trusted directory. Open `codex` in that repo once and accept the trust prompt.' };
    }
    if (/Xcode license/.test(tail)) {
      return { outcome: 'failed', note: 'git is blocked until the Xcode licence is accepted: sudo xcodebuild -license accept' };
    }
    return { outcome: 'failed', note: lastLine(tail) || `exit ${code ?? 'unknown'}` };
  },
};
