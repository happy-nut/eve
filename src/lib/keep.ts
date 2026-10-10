/**
 * Google Keep, as Google Takeout exports it: one `<note>.json` per note (an `.html` beside it for people,
 * and the note's pictures), plus a `Labels.txt`. Pure, so it can be tested in Node (keep.test.mjs);
 * transfer.ts reads the files and copies the pictures.
 */

export interface KeepNote {
  title?: string;
  textContent?: string;
  listContent?: { text?: string; isChecked?: boolean }[];
  labels?: { name?: string }[];
  attachments?: { filePath?: string; mimetype?: string }[];
  annotations?: { url?: string; title?: string }[];
  isPinned?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  userEditedTimestampUsec?: number;
  createdTimestampUsec?: number;
}

/** Is this parsed JSON a Keep note? (Takeout's other JSON files have neither a text nor a list.) */
export function isKeepNote(j: unknown): j is KeepNote {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
  const k = j as Record<string, unknown>;
  return ('textContent' in k || 'listContent' in k) && ('isTrashed' in k || 'userEditedTimestampUsec' in k);
}

/** Where Takeout may have put an attachment: the name the JSON gives, or the same with jpg↔jpeg swapped
 *  (Takeout writes `.jpeg` into the JSON for files it saved as `.jpg`, and the other way round). */
export function attachmentCandidates(filePath: string): string[] {
  const out = [filePath];
  const m = /\.(jpe?g)$/i.exec(filePath);
  if (m) out.push(filePath.slice(0, m.index) + (m[1].toLowerCase() === 'jpg' ? '.jpeg' : '.jpg'));
  return out;
}

/**
 * Keep is plain text: whatever markdown would read as something else stays text. The characters markdown
 * gives a meaning (emphasis, code, links, HTML, entities, headings, tables) are escaped wherever they are;
 * what only means something at the start of a line (a list's "- " or "1. ", a divider) is escaped there; and
 * an indent, which markdown takes for code or drops, is kept as no-break spaces.
 */
export const plain = (line: string) =>
  line
    .replace(/[\\`*_~[\]<>&#|]/g, '\\$&')
    .replace(/^(\s*)([-+=])/, '$1\\$2')
    .replace(/^(\s*\d+)([.)])/, '$1\\$2')
    .replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    ').replace(/ /g, '\u00a0'));
/** a link's address as markdown takes it whatever it holds (a space, brackets) */
const dest = (url: string) => (/[\s()<>]/.test(url) ? `<${url.replace(/[<>]/g, encodeURIComponent)}>` : url);
const BLANK = ' '; // an empty line kept as one (editor.ts BlankLine)
// the day it was written where the user is (daily.ts dayKey; a UTC date is the day before, mornings in Seoul)
const day = (usec: number | undefined) => {
  if (!usec) return '';
  const d = new Date(usec / 1000), pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const groupName = (s: string) => s.trim().replace(/\//g, '-');

export interface FromKeep {
  body: string;
  /** the group under the one the export sits in: its first label, or Archive */
  sub: string;
  /** when it was last edited in Keep, ms epoch (0 = unknown) */
  updatedAt: number;
  pinned: boolean;
}

/**
 * One Keep note as an Eve note, or null for one in Keep's trash. `files` maps each attachment's filePath
 * to where it was copied (assets/…); one missing from it was not found, or is a kind Eve cannot hold
 * (a voice memo), and the note says so.
 */
export function keepToNote(k: KeepNote, files: Record<string, string> = {}): FromKeep | null {
  if (k.isTrashed) return null;
  const lines = (k.textContent ?? '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();

  // no title in Keep: its first line is one, if it is short enough to read as one
  let title = (k.title ?? '').trim();
  if (!title && lines.length && !k.listContent?.length) {
    const first = lines[0].trim();
    const chars = Array.from(first); // by character: a cut through an emoji left half of it in the title
    if (chars.length <= 60) { title = first; lines.shift(); while (lines.length && !lines[0].trim()) lines.shift(); }
    else title = chars.slice(0, 40).join('').trimEnd() + '…';
  }
  title ||= day(k.createdTimestampUsec ?? k.userEditedTimestampUsec) || 'Untitled';

  const blocks: string[] = [];
  if (lines.length) blocks.push(lines.map((l) => (l.trim() ? plain(l) : BLANK)).join('\n\n'));
  if (k.listContent?.length) {
    blocks.push(k.listContent.map((i) => `- [${i.isChecked ? 'x' : ' '}] ${plain((i.text ?? '').replace(/\s*\n\s*/g, ' ').trim())}`).join('\n'));
  }
  for (const a of k.attachments ?? []) {
    if (!a.filePath) continue;
    const src = files[a.filePath];
    if (!src) blocks.push(`*(not brought over from Keep: ${plain(a.filePath)})*`);
    else blocks.push(/^image\//.test(a.mimetype ?? '') || /\.(png|jpe?g|gif|webp|heic)$/i.test(src) ? `![](${dest(src)})` : `[${plain(a.filePath)}](${dest(src)})`);
  }
  const links = (k.annotations ?? []).filter((a) => a.url);
  if (links.length) blocks.push(links.map((a) => `- [${plain((a.title || a.url)!.trim())}](${dest(a.url!)})`).join('\n'));

  const labels = (k.labels ?? []).map((l) => groupName(l.name ?? '')).filter(Boolean);
  const sub = k.isArchived ? 'Archive' : (labels[0] ?? '');
  // the labels that did not become the group stay with the note, as tags
  const rest = k.isArchived ? labels : labels.slice(1);
  if (rest.length) blocks.push(rest.map((l) => `\\#${plain(l.replace(/\s+/g, '_'))}`).join(' '));

  return {
    body: `# ${plain(title.replace(/\s*\n\s*/g, ' ').trim())}\n\n${blocks.join('\n\n')}\n`,
    sub,
    updatedAt: Math.round((k.userEditedTimestampUsec ?? k.createdTimestampUsec ?? 0) / 1000),
    pinned: !!k.isPinned,
  };
}

/** Keep's own order: pinned first, then the most recently edited. */
export const keepOrder = (a: FromKeep, b: FromKeep) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;
