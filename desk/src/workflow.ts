import type { RunView, WorkflowStep, WorkflowView } from '../../shared/types.ts';

export type WorkflowProgress =
  | { readonly kind: 'ready'; readonly step: WorkflowStep; readonly after: number | null }
  | { readonly kind: 'manual'; readonly step: WorkflowStep; readonly after: number | null }
  | { readonly kind: 'running'; readonly step: WorkflowStep; readonly runId: string }
  | { readonly kind: 'done' };

export function manualStepKey(workflowPath: string, step: number): string {
  return `${workflowPath}:${step}`;
}

/** UI-only sequencing: run rows are the durable evidence; a manual acknowledgement lasts for this Desk session. */
export function workflowProgress(workflow: WorkflowView, runs: readonly RunView[], manualDone: ReadonlySet<string>): WorkflowProgress {
  const related = runs.filter((run) => run.workflow === workflow.path && run.step !== null);
  const latest = related[0];
  let candidate: WorkflowStep | undefined;
  let after: number | null = null;
  if (latest === undefined) {
    candidate = workflow.steps[0];
  } else {
    const step = workflow.steps.find((item) => item.n === latest.step);
    if (latest.state === 'running' || latest.state === 'requested') {
      return step === undefined ? { kind: 'done' } : { kind: 'running', step, runId: latest.id };
    }
    if (latest.state === 'succeeded') {
      after = latest.step;
      candidate = workflow.steps.find((item) => item.n > latest.step!);
    } else {
      candidate = step;
    }
  }
  while (candidate?.tool === 'me' && manualDone.has(manualStepKey(workflow.path, candidate.n))) {
    after = candidate.n;
    candidate = workflow.steps.find((item) => item.n > candidate!.n);
  }
  if (candidate === undefined) return { kind: 'done' };
  return candidate.tool === 'me' ? { kind: 'manual', step: candidate, after } : { kind: 'ready', step: candidate, after };
}
