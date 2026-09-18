import { useEffect, useState } from 'react';

import type { StatusReport } from '../../shared/types.ts';
import { api } from './api.ts';
import { Brain } from './views/Brain.tsx';
import { Chats } from './views/Chats.tsx';
import { Runs } from './views/Runs.tsx';
import { Workflows } from './views/Workflows.tsx';

type Tab = 'chats' | 'runs' | 'brain' | 'workflows';

const navigation: readonly { id: Tab; label: string; mark: string; description: string }[] = [
  { id: 'chats', label: 'Chats', mark: '◌', description: 'Think with an agent' },
  { id: 'runs', label: 'Runs', mark: '↗', description: 'Direct work' },
  { id: 'brain', label: 'Brain', mark: '◎', description: 'Shared context' },
  { id: 'workflows', label: 'Workflows', mark: '⌁', description: 'Multi-step relays' },
];

const titles: Record<Tab, { eyebrow: string; title: string }> = {
  chats: { eyebrow: 'Personal space', title: 'Conversations' },
  runs: { eyebrow: 'Operations', title: 'Agent runs' },
  brain: { eyebrow: 'Shared memory', title: 'The Brain' },
  workflows: { eyebrow: 'Coordination', title: 'Workflows' },
};

export function App() {
  const [tab, setTab] = useState<Tab>('chats');
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.status().then((value) => { setStatus(value); setError(null); }).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10_000);
    return () => clearInterval(timer);
  }, []);

  const trust = Object.values(status?.codexTrusted ?? {});
  const healthy = status !== null
    && status.git.ok
    && status.brain.ok
    && Object.values(status.tools).every((tool) => tool.ok)
    && trust.every(Boolean)
    && !status.stopped;
  const current = titles[tab];

  return (
    <div className="app-shell">
      <aside className="primary-rail">
        <div className="brand">
          <div className="brand-orbit"><i /><i /><span /></div>
          <div><strong>Agent</strong><b>OS</b></div>
        </div>
        <p className="brand-line">One Brain.<br />Two minds.</p>

        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
              <span className="nav-mark">{item.mark}</span>
              <span><b>{item.label}</b><small>{item.description}</small></span>
            </button>
          ))}
        </nav>

        <div className="rail-status">
          <div className="status-heading"><span className={`status-pip ${healthy ? 'ok' : 'bad'}`} /><b>{healthy ? 'Systems ready' : 'Needs attention'}</b></div>
          {error && <p>{error}</p>}
          {status && (
            <div className="status-grid">
              <span title={status.brain.detail}><i className={status.brain.ok ? 'ok' : ''} />Brain</span>
              <span title={status.tools.claude.detail}><i className={status.tools.claude.ok ? 'ok' : ''} />Claude</span>
              <span title={status.tools.codex.detail}><i className={status.tools.codex.ok ? 'ok' : ''} />Codex</span>
              <span title={`${trust.filter(Boolean).length}/${trust.length} trusted`}><i className={trust.every(Boolean) ? 'ok' : ''} />Trust</span>
            </div>
          )}
          {status && (
            <button className="stop-control" onClick={() => (status.stopped ? api.resume() : api.stop()).then(refresh)}>
              {status.stopped ? 'Resume new work' : 'Pause new work'}
            </button>
          )}
        </div>
      </aside>

      <div className="workspace">
        <header className="workspace-head">
          <div><span className="eyebrow">{current.eyebrow}</span><h1>{current.title}</h1></div>
          <div className="context-seal"><span className="brain-dot" />Committed context <b>origin/main</b></div>
        </header>
        <main>
          {tab === 'chats' && <Chats />}
          {tab === 'runs' && <Runs status={status} />}
          {tab === 'brain' && <Brain />}
          {tab === 'workflows' && <Workflows status={status} />}
        </main>
      </div>
    </div>
  );
}
