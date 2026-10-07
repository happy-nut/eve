/** Markdown line helpers shared by notes, the board and the card page (pure; tested in Node). */

/** Strip markdown syntax from one line for display. */
export function plain(line: string): string {
  return line
    // HTML a note keeps (html.ts) is not part of what it says: <span …>Plan</span> reads "Plan" (an escaped \<b\>,
    // Keep's text, is text and stays)
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/(?<!\\)<\/?[a-z][a-z0-9-]*(\s[^>]*?)?(?<!\\)>/gi, '')
    .replace(/^[#>\-*+\s]+|^\d+\.\s+|^\[[ x]\]\s*/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/==(?=\S)(.+?)==/g, '$1')
    .replace(/[*_`~]/g, '')
    // a link reads as its alias when it has one
    .replace(/\[\[(.+?)\]\]/g, (_, inner: string) => { const [title, alias] = splitAlias(inner); return alias || title; })
    .trim();
}

/** A line that is only HTML tags or a comment (a README's <div align="center">, a <!-- note -->): no title. */
export const onlyHtml = (line: string) => /^\s*(<!--.*?(-->|$)\s*|<\/?[a-z][a-z0-9-]*(\s[^>]*?)?>\s*)+$/i.test(line);

/** `Title|alias` inside a `[[…]]` (the bar maybe escaped, as in a table cell) -> [title, alias] ('' = none) */
export function splitAlias(inner: string): [string, string] {
  const bar = inner.search(/\\?\|/);
  if (bar < 0) return [inner.trim(), ''];
  return [inner.slice(0, bar).trim(), inner.slice(inner.indexOf('|', bar) + 1).trim()];
}

/**
 * The `## …` lines of a note, in order — its sections, for a `[[Title#Section]]` link. The first line
 * is the note's title rather than a section of it, and a `#` inside a code fence is a comment, not a heading.
 */
export function headingsOf(body: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of body.split('\n').slice(1)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced || !/^#{1,6}\s+\S/.test(line)) continue;
    const text = plain(line);
    if (text) out.push(text);
  }
  return out;
}

/** `Title#Section` -> its two halves ('' when the link points at the page itself). */
export function splitLink(link: string, isTitle?: (title: string) => boolean): [title: string, section: string] {
  // a title may hold a "#" itself ("C# notes", "Issue #12"): the longest title that is a note's wins, the
  // whole link first; failing any, the first "#" splits, as written by hand
  if (isTitle) {
    if (isTitle(link.trim())) return [link.trim(), ''];
    for (let i = link.lastIndexOf('#'); i > 0; i = link.lastIndexOf('#', i - 1)) {
      if (isTitle(link.slice(0, i).trim())) return [link.slice(0, i).trim(), link.slice(i + 1).trim()];
    }
  }
  const i = link.indexOf('#');
  return i < 0 ? [link.trim(), ''] : [link.slice(0, i).trim(), link.slice(i + 1).trim()];
}

/**
 * A kanban card as one document: its title is the leading `# …` line, its body the rest. The board file keeps
 * the two fields apart, so the card page composes the document when it opens and splits it back on every edit
 * — one editing host, so a drag that starts in the title runs on into the body.
 */
export const cardDoc = (title: string, body: string) => `# ${title}\n\n${body}`;

export function splitCard(md: string): { title: string; body: string } {
  const nl = md.indexOf('\n');
  const first = nl < 0 ? md : md.slice(0, nl);
  if (!/^#\s/.test(first)) return { title: '', body: md }; // heading deleted: all of it is body
  return { title: plain(first), body: nl < 0 ? '' : md.slice(nl + 1).replace(/^\n+/, '') };
}
