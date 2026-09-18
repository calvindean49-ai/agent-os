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
  readonly chat?: string;
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
  if (b.chat) {
    lines.push(`This is a conversation in Agent OS chat ${b.chat}. Answer the person directly and naturally. The Runner archives the exchange in the Brain, so do not wrap the answer in run-report boilerplate.`);
  }
  if (b.mode === 'build') {
    lines.push('You may edit files and run commands in the working directory. It is a branch in a worktree, never the main checkout. Commit your work with a message that starts with the tool name and run id.');
    lines.push(`When done, write your run report to ${b.reportPath} (shape in AGENTS.md), commit it in the Brain, and push. A run that did not push did not happen.`);
  } else if (b.chat) {
    lines.push('This conversation turn is read-only. Read the committed Brain for context; your final answer will be filed back into the Brain by the Runner.');
  } else {
    lines.push('This run is read-only: you cannot edit files. Your final message is your report and the Runner will file it in the Brain for you.');
  }
  lines.push('');
  lines.push('Brief:');
  lines.push(b.brief.trim());
  return lines.join('\n');
}

export interface ChatTranscriptTurn {
  readonly user: string;
  readonly assistant: string;
}

/** Stateless CLI sessions receive the recent committed conversation explicitly. */
export function composeChatTurn(title: string, history: readonly ChatTranscriptTurn[], message: string): string {
  const lines = [
    `Conversation: ${title}`,
    '',
    'Use the Brain as the shared source of context. Read AGENTS.md and the relevant committed notes before answering.',
    'This is a personal conversation, not a task ticket. Be direct, thoughtful, and conversational.',
  ];
  if (history.length > 0) {
    lines.push('', 'Recent conversation:');
    for (const turn of history.slice(-8)) {
      lines.push('', `Person: ${turn.user}`, `Assistant: ${turn.assistant}`);
    }
  }
  lines.push('', 'New message:', message.trim());
  return lines.join('\n');
}

/** The local Claude run is only a launcher. RemoteTrigger is the subscription-authenticated path; HTTP/API keys are forbidden. */
export function composeCloudLaunchBrief(brain: string, remote: string | null, brief: string): string {
  return [
    'Create one Claude Code on the web run for the task below. Do not perform the task locally.',
    'Use the subscription-authenticated RemoteTrigger tool through ToolSearch. Never use curl, an HTTP client, an API key, or a guessed action/field.',
    `The Brain checkout is ${brain}.`,
    remote === null ? 'The Brain has no readable origin remote; measure whether the tool can proceed and report that limitation if it cannot.' : `The Brain origin is ${remote}.`,
    'The web run must work against the Brain repository, read AGENTS.md first, write its run report under runs/YYYY-MM/, commit it, and push it.',
    'RemoteTrigger exposes routines rather than a direct session primitive. Use only actions and body fields you can verify from the live tool or an existing matching routine.',
    'If a safe one-off run cannot be created, make no remote changes, state the measured limitation in your final response, and stop. Do not create a recurring schedule as a substitute.',
    '',
    'Cloud task:',
    brief.trim(),
  ].join('\n');
}
