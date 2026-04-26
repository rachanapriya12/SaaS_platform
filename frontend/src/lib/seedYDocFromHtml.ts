import * as Y from 'yjs';

/** Match server collab seed so client Y.Doc matches MongoDB HTML before WebSocket sync. */
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
