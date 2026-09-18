import { useEffect, useRef, useState } from 'react';

import type { ChatDetail, ChatThreadView, ToolId } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { renderMarkdown } from '../md.ts';

const agentName = (tool: ToolId) => tool === 'claude' ? 'Claude' : 'ChatGPT / Codex';

function shortTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Chats() {
  const [threads, setThreads] = useState<ChatThreadView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [newTool, setNewTool] = useState<ToolId>('claude');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const loadThreads = () => api.chats().then((items) => {
    setThreads(items);
    setSelected((current) => current ?? items[0]?.id ?? null);
  }).catch((e: Error) => setError(e.message));

  const loadDetail = (id: string) => api.chat(id).then(setDetail).catch((e: Error) => setError(e.message));

  useEffect(() => { void loadThreads(); }, []);
  useEffect(() => {
    if (selected === null) {
      setDetail(null);
      return;
    }
    void loadDetail(selected);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadDetail(selected);
        void loadThreads();
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [selected]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [detail?.messages.length, detail?.messages.at(-1)?.body]);

  const beginNew = () => {
    setSelected(null);
    setDetail(null);
    setDraft('');
    setError(null);
  };

  const send = async () => {
    const text = draft.trim();
    if (text === '' || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    try {
      let id = selected;
      if (id === null) {
        const title = text.replace(/\s+/g, ' ').slice(0, 58);
        const thread = await api.createChat(newTool, title);
        id = thread.id;
        setSelected(id);
      }
      await api.sendChat(id, text);
      await Promise.all([loadThreads(), loadDetail(id)]);
    } catch (e) {
      setDraft(text);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const tool = detail?.thread.tool ?? newTool;
  const messages = detail?.messages ?? [];
  const running = messages.some((message) => message.role === 'assistant' && (message.state === 'running' || message.state === 'requested'));

  return (
    <section className="chats-shell">
      <aside className="thread-rail">
        <div className="thread-head">
          <div><span className="eyebrow">Conversations</span><strong>{threads.length}</strong></div>
          <button className="icon-button" onClick={beginNew} aria-label="New conversation">+</button>
        </div>
        <div className="thread-list">
          <button className={`thread-item new-thread ${selected === null ? 'active' : ''}`} onClick={beginNew}>
            <span className="thread-mark">+</span>
            <span><b>New conversation</b><small>Choose a mind and begin</small></span>
          </button>
          {threads.map((thread) => (
            <button key={thread.id} className={`thread-item ${selected === thread.id ? 'active' : ''}`} onClick={() => setSelected(thread.id)}>
              <span className={`thread-mark ${thread.tool}`}>{thread.tool === 'claude' ? 'C' : 'O'}</span>
              <span><b>{thread.title}</b><small>{agentName(thread.tool)} · {thread.turnCount} {thread.turnCount === 1 ? 'turn' : 'turns'}</small></span>
              {thread.lastState === 'running' && <i className="live-pip" />}
            </button>
          ))}
        </div>
        <div className="brain-route">
          <div className="orbit-mini"><i /><i /><span /></div>
          <div><b>Brain route</b><small>Each exchange is committed and shared.</small></div>
        </div>
      </aside>

      <div className="conversation">
        <header className="conversation-head">
          <div>
            <span className="eyebrow">{selected === null ? 'Start here' : agentName(tool)}</span>
            <h2>{detail?.thread.title ?? 'A conversation with your whole context'}</h2>
          </div>
          <div className={`agent-badge ${tool}`}><span>{tool === 'claude' ? 'C' : 'O'}</span>{agentName(tool)}</div>
        </header>

        <div className={`message-stream ${messages.length === 0 ? 'empty' : ''}`}>
          {messages.length === 0 && (
            <div className="chat-intro">
              <div className="orbit"><i /><i /><i /><span /></div>
              <span className="eyebrow">One Brain · two perspectives</span>
              <h3>Talk through a project, a decision, or the day ahead.</h3>
              <p>The selected agent reads the same committed Brain. Your message and its answer return there as one traceable run.</p>
              <div className="agent-choice" role="group" aria-label="Choose an agent">
                {(['claude', 'codex'] as ToolId[]).map((choice) => (
                  <button key={choice} className={newTool === choice ? 'active' : ''} onClick={() => setNewTool(choice)}>
                    <span>{choice === 'claude' ? 'C' : 'O'}</span>
                    <b>{agentName(choice)}</b>
                    <small>{choice === 'claude' ? 'Reflective and expansive' : 'Analytical and precise'}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="message-meta">
                <b>{message.role === 'user' ? 'You' : agentName(tool)}</b>
                <span>{shortTime(message.createdAt)}</span>
                {message.role === 'assistant' && message.state !== 'succeeded' && <span className={`state state-${message.state}`}>{message.state}</span>}
              </div>
              {message.role === 'assistant'
                ? message.body
                  ? <div className="message-body md-inline" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.body) }} />
                  : <div className="thinking"><i /><i /><i /><span>{message.state === 'running' ? 'Reading the Brain' : message.state}</span></div>
                : <div className="message-body">{message.body}</div>}
            </article>
          ))}
          <div ref={end} />
        </div>

        <div className="composer-wrap">
          {error && <div className="composer-error">{error}</div>}
          <div className="composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              aria-label={`Message ${agentName(tool)}`}
              placeholder={`Message ${agentName(tool)}…`}
              disabled={running}
            />
            <div className="composer-foot">
              <span><i className="brain-dot" /> Reads and writes through the Brain</span>
              <button onClick={() => void send()} disabled={draft.trim() === '' || sending || running}>{sending ? 'Starting…' : 'Send'}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
