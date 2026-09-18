import { useEffect, useState } from 'react';

import type { StatusReport } from '../../shared/types.ts';
import { api } from './api.ts';
import { Brain } from './views/Brain.tsx';
import { Runs } from './views/Runs.tsx';
import { Workflows } from './views/Workflows.tsx';

type Tab = 'brain' | 'runs' | 'workflows';

function Light({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <span className={`light ${ok ? 'ok' : 'bad'}`} title={detail}>
      <i /> {label}
    </span>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('runs');
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.status().then((s) => { setStatus(s); setError(null); }).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Agent OS</h1>
        <nav>
          {(['runs', 'brain', 'workflows'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <div className="strip">
          {error && <span className="light bad"><i /> runner: {error}</span>}
          {status && (
            <>
              <Light ok={status.git.ok} label="git" detail={status.git.detail} />
              {Object.entries(status.tools).map(([id, p]) => <Light key={id} ok={p.ok} label={id} detail={p.detail} />)}
              <Light ok={status.brain.ok} label="brain" detail={`${status.brain.detail} ${status.brain.path ?? ''}`} />
              <Light ok={!status.stopped} label={status.stopped ? 'stopped' : 'starting allowed'} detail="the stop file" />
              <button className="tiny" onClick={() => (status.stopped ? api.resume() : api.stop()).then(refresh)}>
                {status.stopped ? 'Resume' : 'Stop starting work'}
              </button>
            </>
          )}
        </div>
      </header>
      <main>
        {tab === 'runs' && <Runs status={status} />}
        {tab === 'brain' && <Brain />}
        {tab === 'workflows' && <Workflows status={status} />}
      </main>
    </div>
  );
}
