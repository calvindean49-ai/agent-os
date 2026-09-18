import type { BrainReading, RunReportDocument, RunView, StartRunBody, StatusReport } from '../../shared/types.ts';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* not json */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  status: () => call<StatusReport>('/api/status'),
  brain: () => call<BrainReading>('/api/brain'),
  fetchBrain: () => call<{ ok: boolean; note: string | null; reading: BrainReading }>('/api/brain/fetch', { method: 'POST' }),
  runs: () => call<RunView[]>('/api/runs'),
  start: (body: StartRunBody) => call<RunView>('/api/runs', { method: 'POST', body: JSON.stringify(body) }),
  cancel: (id: string) => call<{ ok: boolean }>(`/api/runs/${id}/cancel`, { method: 'POST' }),
  log: async (id: string) => (await fetch(`/api/runs/${id}/log`)).text(),
  report: (id: string) => call<RunReportDocument>(`/api/runs/${id}/report`),
  stop: () => call<{ stopped: boolean }>('/api/stop', { method: 'POST' }),
  resume: () => call<{ stopped: boolean }>('/api/resume', { method: 'POST' }),
};
