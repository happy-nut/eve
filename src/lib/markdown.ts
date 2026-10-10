/** Markdown line helpers shared by notes, the board and the card page (pure; tested in Node). */

/** Strip markdown syntax from one line for display. */
export function plain(line: string): string {
  return line
    // HTML a note keeps (html.ts) is not part of what it says: <span …>Plan</span> reads "Plan" (an escaped \<b\>,
    // Keep's text, is text and stays)
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/(?<!\\)<\/?[a-z][a-z0-9-]*(\s[^>]*?)?(?<!\\)>/gi, '')
    .replace(/^[#>\-*+\s]+|^\d+\.\s+|^\[[ x]\]\s*/g, '')
    // a formula reads as what is written in it: "Energy $E=mc^2$" is the title "Energy E=mc^2" (a dollar that is
    // only a dollar is saved escaped, \$, and stays)
    .replace(/(?<!\\)\$\$(.+?)(?<!\\)\$\$/g, '$1')
    .replace(/(?<![\\$])\$(?![\s$])((?:[^$\\]|\\.)*?[^\s\\])\$(?!\$)/g, '$1')
    // a link reads as its words, a picture as what it shows (its alt text, else nothing): "Meeting with [Bob](https://…)"
    // is "Meeting with Bob", the title a [[link]] to it is written with — not a page of its own made from the raw line
    .replace(/(?<!\\)(!?)\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, (_, img: string, text: string, url: string) => (img ? text : text || url))
    .replace(/==(?=\S)(.+?)==/g, '$1')
    // marks come off; a character written escaped is text and stays, and so does a "_" inside a word (no mark
    // there either): "my\_func" and "my_func" read "my_func", as on screen
    .replace(/(?<!\\)(?:[*`~]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}]))/gu, '')
    // a link reads as its alias when it has one
    .replace(/\[\[(.+?)\]\]/g, (_, inner: string) => { const [title, alias] = splitAlias(inner); return alias || title; })
    .replace(/\\(.)/g, '$1')
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

/**
 * What a note says under its title, as one line of plain text: a phone's list shows it under the title, the way
 * the widget's cards do. Blank lines, HTML, code (a board is a fenced block too), dividers and a table's rule are
 * passed over; a picture is nothing, a link its text.
 */
export function previewOf(body: string, max = 160): string {
  const lines = body.split('\n');
  const first = lines.findIndex((l) => l.trim() && !onlyHtml(l));
  const out: string[] = [];
  let fence = '';
  for (const line of lines.slice(first + 1)) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) { if (f && f[0] === fence[0] && f.length >= fence.length && !line.trim().slice(f.length).trim()) fence = ''; continue; }
    if (f) { fence = f; continue; }
    if (!line.trim() || onlyHtml(line) || /^\s*([-*_]\s*){3,}$/.test(line) || /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)) continue;
    const text = plain(line.replace(/^\s*([-*+]|\d+[.)])\s+\[[ xX]\]\s*/, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\|/g, ' ')).replace(/\s+/g, ' ');
    if (text) out.push(text);
    if (out.join(' ').length >= max) break;
  }
  const all = out.join(' ');
  return all.length > max ? all.slice(0, max).trimEnd() + '…' : all;
}
