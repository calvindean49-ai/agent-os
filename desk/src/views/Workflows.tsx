import { useEffect, useState } from 'react';

import type { BrainReading, StatusReport } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { renderMarkdown } from '../md.ts';
import { StartForm } from './Runs.tsx';

export function Workflows({ status }: { status: StatusReport | null }) {
  const [b, setB] = useState<BrainReading | null>(null);
  const [preset, setPreset] = useState<{ brief: string; workflow: string; step: number; tool: string } | undefined>(undefined);
  const [authorBrief, setAuthorBrief] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api.brain().then(setB).catch(() => undefined); }, []);
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
          <p>Run step {preset.step} of {preset.workflow} with {preset.tool}:</p>
          <StartForm status={status} preset={preset} onStarted={() => { setPreset(undefined); setMsg('started; see Runs'); }} />
        </div>
      )}
      {(b?.workflows ?? []).map((w) => (
        <details key={w.path} className="workflow">
          <summary>{w.title} <small>{w.path}</small></summary>
          <ol className="steps">
            {w.steps.map((s) => (
              <li key={s.n}>
                <b>{s.tool}</b> — {s.text}{' '}
                {(s.tool === 'claude' || s.tool === 'codex') && (
                  <button className="tiny" onClick={() => setPreset({ brief: s.text, workflow: w.path, step: s.n, tool: s.tool })}>run this step</button>
                )}
              </li>
            ))}
          </ol>
          <article className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(w.body) }} />
        </details>
      ))}
      {b && b.workflows.length === 0 && <p>No workflows in the Brain yet.</p>}
    </section>
  );
}
