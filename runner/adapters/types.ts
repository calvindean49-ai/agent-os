import type { Mode, ToolId } from '../../shared/types.ts';
import type { SpawnRequest } from '../process.ts';

export type Availability =
  | { readonly available: true; readonly detail: string }
  | { readonly available: false; readonly why: string };

export interface StartRequest {
  readonly runId: string;
  readonly mode: Mode;
  readonly cwd: string;
  readonly brain: string | null;
  readonly prompt: string;
  readonly reportPath: string;
  /** Where a read-only tool's last message is written by the tool itself, when it can. */
  readonly lastMessagePath: string;
  readonly where?: 'local' | 'cloud';
}

export type RunOutcome = 'succeeded' | 'failed';

/**
 * One shape for every tool: detect, the command, how to read an exit. An
 * adapter is pure — it never spawns. Every command line comes from the tool's
 * own --help, recorded under docs/reports/, never guessed.
 */
export interface Adapter {
  readonly id: ToolId;
  readonly label: string;
  readonly modes: readonly Mode[];
  detect(): Availability;
  command(req: StartRequest): SpawnRequest;
  interpret(code: number | null, tail: string): { outcome: RunOutcome; note: string };
}

export function lastLine(tail: string): string {
  const lines = tail.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  return lines[lines.length - 1] ?? '';
}

/**
 * A shell profile can route the `claude` CLI off Anthropic entirely (Aether
 * measured this on 2 Sep 2026: a proxy answered 200 with HTML and the CLI died
 * in four seconds). These are removed from the environment of every claude run.
 */
export const CLI_ROUTING_VARS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;
