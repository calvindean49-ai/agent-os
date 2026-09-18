import { onPath } from './probe.ts';
import { CLI_ROUTING_VARS, lastLine, type Adapter } from './types.ts';

/**
 * Claude Code, headless. Flags measured in aether-os (`scripts/aether-run.sh`,
 * `src/foreman/adapters/review.ts`), in daily use there since August 2026.
 *
 *  - read / review: `--permission-mode dontAsk --permission-prompts none`, an
 *    allowlist of reading tools, and Edit/Write/Bash disallowed. Anything not
 *    allowed is denied rather than asked, because nobody is there to answer.
 *  - build: `--permission-mode bypassPermissions`. The Runner only ever starts
 *    this on a branch in a worktree it created (see worktree.ts); the adapter
 *    does not know about branches and must not be called for `main`.
 */
const READ_ALLOWED = ['Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git status:*)'];

export const claude: Adapter = {
  id: 'claude',
  label: 'Claude Code',
  modes: ['read', 'review', 'build'],
  detect() {
    const bin = process.env['CLAUDE_BIN'] ?? 'claude';
    const found = onPath(bin);
    if (found === null) return { available: false, why: `no \`${bin}\` on PATH` };
    return { available: true, detail: found };
  },
  command(req) {
    const bin = process.env['CLAUDE_BIN'] ?? 'claude';
    const base = ['-p', req.prompt, '--output-format', 'text', '--no-session-persistence'];
    const readAllowed = req.where === 'cloud' ? [...READ_ALLOWED, 'ToolSearch', 'RemoteTrigger'] : READ_ALLOWED;
    const args =
      req.mode === 'build'
        ? [...base, '--permission-mode', 'bypassPermissions']
        : [
            ...base,
            '--permission-mode',
            'dontAsk',
            '--permission-prompts',
            'none',
            '--allowedTools',
            readAllowed.join(','),
            '--disallowedTools',
            'Edit,Write,NotebookEdit,Bash',
          ];
    return { command: bin, args, cwd: req.cwd, unsetEnv: CLI_ROUTING_VARS };
  },
  interpret(code, tail) {
    if (code === 0) return { outcome: 'succeeded', note: 'finished' };
    const last = lastLine(tail);
    if (/not logged in|\/login|Invalid API key|authentication/i.test(tail)) {
      return { outcome: 'failed', note: 'claude is not logged in: run `claude`, then /login' };
    }
    return { outcome: 'failed', note: last || `exit ${code ?? 'unknown'}` };
  },
};
