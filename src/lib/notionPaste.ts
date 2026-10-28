/**
 * Blocks copied in Notion. Its copy puts them on the clipboard as markdown (text/plain) and as that markdown drawn
 * by markdown-it with HTML off (text/html), the HTML ending in `<!-- notionvc: … -->`: read as HTML, a to-do was a
 * bullet reading "[x]", a callout the words "<aside>", a quote plain text. The markdown says all of it, written
 * Notion's way (its export module's table of blocks, read with REA):
 *   - [x]  a to-do       one space more after the box
 *   <aside>              a callout: its icon first, its lines, then </aside>
 *   💡 its words
 *   </aside>
 * and Windows line ends on Windows. A toggle is written as a bullet there, so it comes in as one.
 */
export const NOTION_COPY = /<!--\s*notionvc:/;

const ICON = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;

/** Notion's copied markdown, written as a note here writes it */
export function fromNotion(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const aside = /^([ \t]*)<aside>\s*$/.exec(lines[i]);
    if (!aside) {
      out.push(lines[i].replace(/^([ \t]*[-*+] \[[ xX]\]) {2,}/, '$1 '));
      continue;
    }
    // a callout: > [!icon] (an icon of its own, as Eve writes one), then its lines; one with no emoji is a note
    const indent = aside[1], body: string[] = [];
    for (i++; i < lines.length && lines[i].trim() !== '</aside>'; i++) body.push(lines[i].startsWith(indent) ? lines[i].slice(indent.length) : lines[i].trimStart());
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();
    const icon = ICON.exec(body[0] ?? '');
    if (icon) body[0] = body[0].slice(icon[0].length);
    out.push(`${indent}> [!${icon ? icon[1] : 'note'}]`, ...body.map((l) => (l.trim() ? `${indent}> ${l}` : `${indent}>`)));
  }
  return out.join('\n');
}
