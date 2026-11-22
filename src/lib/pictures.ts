import { renderMermaid } from './mermaid';
import { pictureOf } from './snapshot';
import { spreadLabels } from './edgeLabels';
import { b64 } from './github';

export interface Picture { number: number; code: string; png?: string; error?: string }

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

async function base64(b: Blob): Promise<string> {
  return b64(new Uint8Array(await b.arrayBuffer()));
}

export async function pictures(body: string, number?: number, most = 6): Promise<Picture[]> {
  const codes = mermaidBlocks(body).map((code, i) => ({ code, number: i + 1 }));
  const wanted = number ? codes.filter((c) => c.number === number) : codes.slice(0, most);
  const out: Picture[] = [];
  for (const { code, number } of wanted) {
    const drawn = await renderMermaid(code);
    if ('error' in drawn) { out.push({ number, code, error: drawn.error }); continue; }
    const card = document.createElement('div');
    card.className = 'mermaid-view diagram-canvas';
    card.style.cssText = 'position: fixed; left: -100000px; top: 0; width: 720px;';
    document.body.append(card);
    try {
      card.innerHTML = drawn.svg;
      const el = card.firstElementChild!;
      if (el instanceof SVGSVGElement) spreadLabels(el);
      out.push({ number, code, png: await base64(await pictureOf(el, getComputedStyle(card).backgroundColor)) });
    } catch (e) {
      out.push({ number, code, error: e instanceof Error ? e.message : String(e) });
    } finally {
      card.remove();
    }
  }
  return out;
}
