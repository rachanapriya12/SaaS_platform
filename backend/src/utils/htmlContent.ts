/** True when HTML has no visible text (empty doc / placeholder). */
export function isHtmlEffectivelyEmpty(html: string): boolean {
  if (!html || typeof html !== 'string') return true;
  const t = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length === 0;
}
