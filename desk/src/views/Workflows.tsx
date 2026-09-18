import { useEffect, useState } from 'react';

import type { BrainReading, RunView, StatusReport, WorkflowStep, WorkflowView } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { renderMarkdown } from '../md.ts';
import { manualStepKey, workflowProgress } from '../workflow.ts';
import { StartForm } from './Runs.tsx';

export function Workflows({ status }: { status: StatusReport | null }) {
  const [b, setB] = useState<BrainReading | null>(null);
  const [runs, setRuns] = useState<RunView[]>([]);
  const [preset, setPreset] = useState<{ brief: string; workflow: string; step: number; tool: string } | undefined>(undefined);
  const [manualDone, setManualDone] = useState<Set<string>>(() => new Set());
  const [authorBrief, setAuthorBrief] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const loadRuns = () => api.runs().then(setRuns).catch(() => undefined);
  useEffect(() => {
    void api.brain().then(setB).catch(() => undefined);
    void loadRuns();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void loadRuns(); }, 5000);
    return () => clearInterval(timer);
  }, []);
  const prepare = (workflow: WorkflowView, step: WorkflowStep) => setPreset({ brief: step.text, workflow: workflow.path, step: step.n, tool: step.tool });
  const acknowledge = (workflow: WorkflowView, step: WorkflowStep) => {
    setManualDone((current) => new Set(current).add(manualStepKey(workflow.path, step.n)));
  };
  const author = () => {
    setMsg(null);
    api.start({ tool: 'claude', mode: 'build', repo: 'brain', brief: `Set up a workflow in workflows/ for: ${authorBrief}. Follow the workflow shape in AGENTS.md. Write the file, commit it, push, and write your run report.` })
      .then((r) => setMsg(`started ${r.id} — it will appear under Runs and, once pushed, here after Fetch`))
      .catch((e: Error) => setMsg(e.message));
  };
  return (
    <section>
      <div className="start">
        <textarea rows={2} value={authorBrief} onChange={(e) => setAuthorBrief(e.target.value)} placeholder="Describe a workflow to set up; a claude build run in the Brain writes it." />
        <button onClick={author} disabled={authorBrief.trim() === ''}>Set up workflow</button>
        {msg && <p>{msg}</p>}
      </div>
      {preset && (
        <div className="preset">
          <div className="handoff-kicker">Ready to hand off</div>
          <p>Step {preset.step} of {preset.workflow} is prefilled for {preset.tool}. Choose its access level and checkout, then start it.</p>
          <StartForm status={status} preset={preset} onStarted={(run) => { setPreset(undefined); setMsg(`started ${run.id}; the next step will appear here when it succeeds`); void loadRuns(); }} />
        </div>
      )}
      {(b?.workflows ?? []).map((w) => {
        const progress = workflowProgress(w, runs, manualDone);
        return (
          <details key={w.path} className="workflow" open>
            <summary>{w.title} <small>{w.path}</small></summary>
            <div className={`handoff ${progress.kind}`}>
              {progress.kind === 'running' && <><div className="handoff-kicker">In motion</div><p>Step {progress.step.n} is running as <b>{progress.runId}</b>. The next handoff will appear when it succeeds.</p></>}
              {progress.kind === 'manual' && <><div className="handoff-kicker">Your turn · step {progress.step.n}</div><p>{progress.step.text}</p><button onClick={() => acknowledge(w, progress.step)}>I’ve done this — continue</button></>}
              {progress.kind === 'ready' && <><div className="handoff-kicker">{progress.after === null ? 'Ready to begin' : `Step ${progress.after} succeeded · next`}</div><p><b>Step {progress.step.n} · {progress.step.tool}</b> — {progress.step.text}</p><button onClick={() => prepare(w, progress.step)}>Prepare step {progress.step.n}</button></>}
              {progress.kind === 'done' && <><div className="handoff-kicker">Workflow complete</div><p>Every step has been handed off.</p></>}
            </div>
            <ol className="steps">
              {w.steps.map((s) => (
                <li key={s.n} className={progress.kind !== 'done' && progress.step.n === s.n ? 'current' : ''}>
                  <span className="step-n">{s.n}</span><b>{s.tool}</b> — {s.text}{' '}
                  {(s.tool === 'claude' || s.tool === 'codex') && (
                    <button className="tiny" onClick={() => prepare(w, s)}>prepare</button>
                  )}
                </li>
              ))}
            </ol>
            <article className="md workflow-source" dangerouslySetInnerHTML={{ __html: renderMarkdown(w.body) }} />
          </details>
        );
      })}
      {b && b.workflows.length === 0 && <p>No workflows in the Brain yet.</p>}
    </section>
  );
}
