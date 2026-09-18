import type { Mode, ToolId } from '../shared/types.ts';

export interface BriefInput {
  readonly runId: string;
  readonly tool: ToolId;
  readonly mode: Mode;
  readonly brain: string | null;
  readonly cwd: string;
  readonly brief: string;
  readonly reportPath: string;
  readonly workflow: string | null;
  readonly step: number | null;
}

/**
 * The prompt every run gets: who it is, where the Brain is, what it may do,
 * and where its report goes. The tool's own instruction file (AGENTS.md /
 * CLAUDE.md in the Brain) carries the rulebook; this only points at it.
 */
export function composeBrief(b: BriefInput): string {
  const lines: string[] = [];
  lines.push(`You are Agent OS run ${b.runId}: tool ${b.tool}, mode ${b.mode}. Working directory: ${b.cwd}.`);
  if (b.brain !== null) {
    lines.push(`The Brain (the shared context bank) is the git repository at ${b.brain}. Read ${b.brain}/AGENTS.md first and follow its rules.`);
  } else {
    lines.push('No Brain is configured for this Runner; there is no shared context to read.');
  }
  if (b.workflow !== null) {
    lines.push(`This run is step ${b.step ?? '?'} of workflow ${b.workflow}. Read that file, do only that step, and stop.`);
  }
  if (b.mode === 'build') {
    lines.push('You may edit files and run commands in the working directory. It is a branch in a worktree, never the main checkout. Commit your work with a message that starts with the tool name and run id.');
    lines.push(`When done, write your run report to ${b.reportPath} (shape in AGENTS.md), commit it in the Brain, and push. A run that did not push did not happen.`);
  } else {
    lines.push('This run is read-only: you cannot edit files. Your final message is your report and the Runner will file it in the Brain for you.');
  }
  lines.push('');
  lines.push('Brief:');
  lines.push(b.brief.trim());
  return lines.join('\n');
}
