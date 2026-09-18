/** Types shared by the Runner and the Desk. */

export const TOOL_IDS = ['claude', 'codex'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/**
 * What a run may do.
 *  - read:   no edits, no shell. A plan, an audit, a marking. The report is the final message.
 *  - review: a code review of a branch against its base. Read-only by nature.
 *  - build:  edits, on a branch in a worktree, never the checkout.
 */
export const MODES = ['read', 'review', 'build'] as const;
export type Mode = (typeof MODES)[number];

export const RUN_STATES = ['requested', 'running', 'succeeded', 'failed', 'cancelled', 'lost', 'refused'] as const;
export type RunState = (typeof RUN_STATES)[number];

export interface RunRow {
  readonly id: string;
  readonly tool: ToolId;
  readonly mode: Mode;
  readonly repo: string;
  readonly cwd: string;
  readonly brief: string;
  readonly workflow: string | null;
  readonly step: number | null;
  readonly state: RunState;
  readonly pid: number | null;
  readonly process_started_at: string | null;
  readonly requested_at: string;
  readonly started_at: string | null;
  readonly ended_at: string | null;
  readonly exit_code: number | null;
  readonly log_path: string;
  readonly report_path: string;
  readonly note: string | null;
  readonly cancel_requested: number;
}

/** A run as the Desk sees it: the row plus what liveness decided at read time. */
export interface RunView extends RunRow {
  readonly liveness: 'running' | 'ended-unwatched' | 'not-needed';
}

export interface Probe {
  readonly ok: boolean;
  readonly detail: string;
}

export interface StatusReport {
  readonly runner: { readonly pid: number; readonly node: string; readonly root: string };
  readonly git: Probe;
  readonly tools: Readonly<Record<ToolId, Probe & { readonly modes: readonly Mode[] }>>;
  readonly brain: Probe & { readonly path: string | null };
  readonly repos: Readonly<Record<string, string>>;
  /** Codex trust is a deliberate per-checkout acknowledgement, keyed as the Desk names each repo. */
  readonly codexTrusted: Readonly<Record<string, boolean>>;
  readonly stopped: boolean;
  readonly codexBuildVerified: boolean;
}

export interface WorkflowStep {
  readonly n: number;
  readonly tool: string;
  readonly text: string;
}

export interface WorkflowView {
  readonly name: string;
  readonly path: string;
  readonly title: string;
  readonly steps: readonly WorkflowStep[];
  readonly body: string;
}

export interface RunReportView {
  readonly path: string;
  readonly firstLine: string;
}

export interface RunReportDocument {
  readonly path: string;
  readonly ref: string;
  readonly body: string;
}

export interface BrainReading {
  readonly path: string;
  readonly ref: string;
  readonly commit: string | null;
  readonly fetchedAt: string | null;
  readonly index: string | null;
  readonly projects: readonly string[];
  readonly workflows: readonly WorkflowView[];
  readonly runs: readonly RunReportView[];
  readonly unavailable: readonly string[];
}

export interface StartRunBody {
  readonly tool: ToolId;
  readonly mode: Mode;
  /** A repo name from config, or an absolute path. "brain" means the Brain itself. */
  readonly repo: string;
  readonly brief: string;
  readonly where?: 'local' | 'cloud';
  readonly workflow?: string;
  readonly step?: number;
}
