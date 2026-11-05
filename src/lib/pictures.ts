/**
 * A note's diagrams as pictures, for the MCP server's diagram_images (src-tauri/src/core.rs): only the app can draw
 * them (mermaid, and the charts Eve draws itself, run in its page), so the server asks through the inbox (inbox.ts)
 * and gets PNGs back. Each is drawn as the note draws it, in a card of the note's look off screen, and taken as Copy
 * image takes it (snapshot.ts): what Claude sees is what the user sees, in the theme they have.
 */
import { renderMermaid } from './mermaid';
import { pictureOf } from './snapshot';
import { spreadLabels } from './edgeLabels';

export interface Picture { number: number; code: string; png?: string; error?: string }

/** the code of each ```mermaid (or ~~~mermaid) block, in order: at the top level or indented in a list or quote */
export function mermaidBlocks(body: string): string[] {
  const out: string[] = [];
  let open: { fence: string; indent: number; lines: string[] } | null = null;
  for (const line of body.split('\n')) {
    if (!open) {
      const m = /^(\s*(?:>\s*)*)(`{3,}|~{3,})\s*mermaid\s*$/.exec(line);
      if (m) open = { fence: m[2], indent: m[1].length, lines: [] };
      continue;
    }
    if (line.trim().replace(/^(>\s*)+/, '').startsWith(open.fence) && /^[`~]+$/.test(line.trim().replace(/^(>\s*)+/, ''))) {
      out.push(open.lines.join('\n'));
      open = null;
      continue;
    }
    open.lines.push(line.slice(Math.min(open.indent, line.length - line.trimStart().length)));
  }
  return out;
}

/** the PNG as base64, as JSON carries it to the server */
async function base64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** the note's diagrams drawn: `number` alone (1 is the first), or the first `most` */
export async function pictures(body: string, number?: number, most = 6): Promise<Picture[]> {
  const codes = mermaidBlocks(body).map((code, i) => ({ code, number: i + 1 }));
  const wanted = number ? codes.filter((c) => c.number === number) : codes.slice(0, most);
  const out: Picture[] = [];
  for (const { code, number } of wanted) {
    const drawn = await renderMermaid(code);
    if ('error' in drawn) { out.push({ number, code, error: drawn.error }); continue; }
    // a card as the note's, as wide as a note's column, out of sight: its styles are read as they are on screen
    const card = document.createElement('div');
    card.className = 'mermaid-view diagram-canvas';
    card.style.cssText = 'position: fixed; left: -100000px; top: 0; width: 720px;';
    document.body.append(card);
    try {
      card.innerHTML = drawn.svg;
      const el = card.firstElementChild!;
      if (el instanceof SVGSVGElement) spreadLabels(el); // a line's label off another's, as in the note
      out.push({ number, code, png: await base64(await pictureOf(el, getComputedStyle(card).backgroundColor)) });
    } catch (e) {
      out.push({ number, code, error: e instanceof Error ? e.message : String(e) });
    } finally {
      card.remove();
    }
  }
  return out;
}
