import assert from 'node:assert/strict';
import { test } from 'node:test';

import { manualStepKey, workflowProgress } from '../desk/src/workflow.ts';
import type { RunView, WorkflowView } from '../shared/types.ts';

const workflow: WorkflowView = {
  name: 'probe', path: 'workflows/probe.md', title: 'probe', body: '',
  steps: [
    { n: 1, tool: 'claude', text: 'write questions' },
    { n: 2, tool: 'me', text: 'answer them' },
    { n: 3, tool: 'codex', text: 'mark answers' },
  ],
};

const run = (state: RunView['state'], step: number): RunView => ({
  id: `r-${step}`, tool: step === 3 ? 'codex' : 'claude', mode: 'build', repo: 'brain', cwd: '/b', brief: 'x',
  workflow: workflow.path, step, state, pid: null, process_started_at: null, requested_at: String(step), started_at: null,
  ended_at: null, exit_code: null, log_path: '/l', report_path: '/p', note: null, cancel_requested: 0, liveness: 'not-needed',
});

test('workflow handoff walks agent to me to agent without rewriting the workflow', () => {
  assert.deepEqual(workflowProgress(workflow, [], new Set()), { kind: 'ready', step: workflow.steps[0], after: null });
  assert.deepEqual(workflowProgress(workflow, [run('running', 1)], new Set()), { kind: 'running', step: workflow.steps[0], runId: 'r-1' });
  assert.deepEqual(workflowProgress(workflow, [run('succeeded', 1)], new Set()), { kind: 'manual', step: workflow.steps[1], after: 1 });
  const acknowledged = new Set([manualStepKey(workflow.path, 2)]);
  assert.deepEqual(workflowProgress(workflow, [run('succeeded', 1)], acknowledged), { kind: 'ready', step: workflow.steps[2], after: 2 });
  assert.deepEqual(workflowProgress(workflow, [run('succeeded', 3), run('succeeded', 1)], acknowledged), { kind: 'done' });
});

test('a failed agent step is offered again', () => {
  assert.deepEqual(workflowProgress(workflow, [run('failed', 3)], new Set()), { kind: 'ready', step: workflow.steps[2], after: null });
});
