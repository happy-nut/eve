/** Markdown line helpers shared by notes, the board and the card page (pure; tested in Node). */

/** Strip markdown syntax from one line for display. */
export function plain(line: string): string {
  return line
    .replace(/^[#>\-*+\s]+|^\d+\.\s+|^\[[ x]\]\s*/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\[\[(.+?)\]\]/g, '$1')
    .trim();
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
export function splitLink(link: string): [title: string, section: string] {
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
