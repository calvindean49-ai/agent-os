import { useEffect, useState } from 'react';

import type { BrainReading } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { renderMarkdown } from '../md.ts';

export function Brain() {
  const [b, setB] = useState<BrainReading | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = () => api.brain().then(setB).catch((e: Error) => setNote(e.message));
  useEffect(() => { void load(); }, []);
  const fetchNow = () => api.fetchBrain().then((r) => { setB(r.reading); setNote(r.note); }).catch((e: Error) => setNote(e.message));
  if (b === null) return <section><p>{note ?? 'Loading…'}</p></section>;
  return (
    <section className="brain">
      <div className="stamp">
        <span>{b.path || 'no Brain'}</span>
        {b.commit && <span>{b.ref} @ {b.commit}</span>}
        <span>{b.fetchedAt ? `fetched ${new Date(b.fetchedAt).toLocaleString()}` : 'never fetched'}</span>
        <button className="tiny" onClick={fetchNow}>Fetch &amp; re-read</button>
        {note && <span className="error">{note}</span>}
      </div>
      {b.unavailable.map((u) => <p key={u} className="error">{u}</p>)}
      <div className="cols">
        <article className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.index ?? '_no INDEX.md at this ref_') }} />
        <aside>
          <h3>Projects</h3>
          <ul>{b.projects.map((p) => <li key={p}>{p}</li>)}{b.projects.length === 0 && <li>none</li>}</ul>
          <h3>Recent runs</h3>
          <ul>{b.runs.map((r) => <li key={r.path} title={r.path}>{r.firstLine.replace(/^#\s*/, '')}</li>)}{b.runs.length === 0 && <li>none filed yet</li>}</ul>
        </aside>
      </div>
    </section>
  );
}
