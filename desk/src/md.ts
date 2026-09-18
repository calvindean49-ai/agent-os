/** A deliberately tiny markdown → HTML: headings, bold, code, lists, paragraphs. Escapes everything first. */
export function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => (/^https?:\/\//.test(u) ? `<a href="${u}" rel="noreferrer" target="_blank">${t}</a>` : t));
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join(' ')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  let inCode = false;
  let code: string[] = [];
  for (const raw of src.split('\n')) {
    if (raw.startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = [];
      } else {
        flushPara();
        flushList();
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(raw);
      continue;
    }
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (h) {
      flushPara();
      flushList();
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        flushList();
        list = kind;
        out.push(`<${kind}>`);
      }
      out.push(`<li>${inline((ul ?? ol)![1]!)}</li>`);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      if (list && /^\s{2,}/.test(raw)) {
        out.push(`<li class="cont">${inline(line.trim())}</li>`);
      } else {
        flushList();
        para.push(line);
      }
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}
