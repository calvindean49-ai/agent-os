import { useEffect, useState } from 'react';

import type { Mode, RunView, StatusReport, ToolId } from '../../../shared/types.ts';
import { api } from '../api.ts';

export function StartForm({ status, preset, onStarted }: { status: StatusReport | null; preset?: { brief: string; workflow: string; step: number; tool: string }; onStarted: () => void }) {
  const [tool, setTool] = useState<ToolId>('claude');
  const [mode, setMode] = useState<Mode>('read');
  const [repo, setRepo] = useState('brain');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (preset) {
      setBrief(preset.brief);
      if (preset.tool === 'claude' || preset.tool === 'codex') setTool(preset.tool);
    }
  }, [preset]);
  const repos = ['brain', ...Object.keys(status?.repos ?? {})];
  const submit = () => {
    setError(null);
    const body = preset ? { tool, mode, repo, brief, workflow: preset.workflow, step: preset.step } : { tool, mode, repo, brief };
    api.start(body).then(() => { setBrief(''); onStarted(); }).catch((e: Error) => setError(e.message));
  };
  return (
    <div className="start">
      <select value={tool} onChange={(e) => setTool(e.target.value as ToolId)}>
        <option value="claude">claude</option>
        <option value="codex">codex</option>
      </select>
      <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
        <option value="read">read (no edits)</option>
        <option value="review">review (branch vs main)</option>
        <option value="build">build (branch in a worktree)</option>
      </select>
      <select value={repo} onChange={(e) => setRepo(e.target.value)}>
        {repos.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Brief: what this run should do. One step, one tool." rows={3} />
      <button onClick={submit} disabled={brief.trim() === ''}>Start run</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function Runs({ status }: { status: StatusReport | null }) {
  const [runs, setRuns] = useState<RunView[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [log, setLog] = useState('');
  const load = () => api.runs().then(setRuns).catch(() => undefined);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (open === null) return;
    const pull = () => api.log(open).then(setLog).catch(() => undefined);
    void pull();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void pull(); }, 4000);
    return () => clearInterval(t);
  }, [open]);
  return (
    <section>
      <StartForm status={status} onStarted={load} />
      <table>
        <thead><tr><th>id</th><th>tool</th><th>mode</th><th>repo</th><th>state</th><th>brief</th><th>note</th><th /></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className={r.liveness === 'ended-unwatched' ? 'warn' : ''}>
              <td><button className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{r.id}</button></td>
              <td>{r.tool}</td>
              <td>{r.mode}</td>
              <td>{r.repo}</td>
              <td>{r.state}{r.liveness === 'ended-unwatched' ? ' (process gone)' : ''}</td>
              <td className="brief" title={r.brief}>{r.brief.slice(0, 80)}</td>
              <td className="note">{r.note ?? ''}</td>
              <td>{r.state === 'running' && r.liveness === 'running' && <button className="tiny" onClick={() => api.cancel(r.id).then(load)}>cancel</button>}</td>
            </tr>
          ))}
          {runs.length === 0 && <tr><td colSpan={8}>No runs yet.</td></tr>}
        </tbody>
      </table>
      {open && (
        <div className="log">
          <div className="log-head"><span>{open}</span><button className="tiny" onClick={() => setOpen(null)}>close</button></div>
          <pre>{log || '(empty log)'}</pre>
        </div>
      )}
    </section>
  );
}
