import * as Y from 'yjs';

/** Seed default TipTap/Yjs fragment from HTML (same shape as collab hydration). */
export function seedYDocFromHtml(ydoc: Y.Doc, html: string) {
  const text = html
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (text.length === 0) return;
  const frag = ydoc.getXmlFragment('default');
  ydoc.transact(() => {
    frag.insert(
      0,
      text.map((line) => {
        const p = new Y.XmlElement('paragraph');
        const t = new Y.XmlText();
        t.insert(0, line);
        p.insert(0, [t]);
        return p;
      })
    );
  });
}

/**
 * Encode a Yjs snapshot that matches sanitized HTML from the REST API.
 * Without this, PUT only updated contentHtml while loadDocFromStorage preferred stale contentBytes,
 * so reopen showed old or empty content.
 */
export function encodeYjsSnapshotFromSanitizedHtml(html: string): Buffer {
  const ydoc = new Y.Doc();
  const trimmed = (html || '').trim();
  if (trimmed) seedYDocFromHtml(ydoc, trimmed);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc));
}
