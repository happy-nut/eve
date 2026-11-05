import { describe, expect, it, vi } from 'vitest';

// jsdom draws nothing: mermaid's drawing and the picture taken of it stand in, what is asked of them checked
const drawn: string[] = [];
vi.mock('./mermaid', () => ({
  renderMermaid: async (code: string) => (code.includes('oops') ? { error: 'Parse error on line 2' } : { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>${code.length}</text></svg>` }),
}));
vi.mock('./snapshot', () => ({
  pictureOf: async (el: Element) => { drawn.push(el.outerHTML); return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }); },
}));
const { mermaidBlocks, pictures } = await import('./pictures');
const { notes } = await import('./notes.svelte');
const { applyAll } = await import('./inbox');

const body = '# Flow\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n- in a list\n  ```mermaid\n  pie\n    "a" : 1\n  ```\n\n~~~mermaid\noops\n~~~\n\n```js\nnot one\n```\n';

describe("a note's diagrams as pictures (diagram_images)", () => {
  it('finds every mermaid block, in a list too, and only those', () => {
    expect(mermaidBlocks(body)).toEqual(['flowchart LR\n  A --> B', 'pie\n  "a" : 1', 'oops']);
  });

  it('draws each one as the note does, a PNG apiece, and says which could not be drawn', async () => {
    drawn.length = 0;
    const all = await pictures(body);
    expect(all.map((p) => [p.number, !!p.png, p.error ?? ''])).toEqual([[1, true, ''], [2, true, ''], [3, false, 'Parse error on line 2']]);
    expect(atob(all[0].png!)).toBe('\x89PNG');
    expect(drawn).toHaveLength(2);
    expect(document.querySelector('.diagram-canvas')).toBeNull(); // the card it was drawn in, gone again
    // one by its number; at most `most` without one
    expect((await pictures(body, 2)).map((p) => p.number)).toEqual([2]);
    expect((await pictures(body, undefined, 2)).map((p) => p.number)).toEqual([1, 2]);
  });

  it("comes through the app's inbox as the server's other asks do, its pictures in the answer", async () => {
    const n = notes.create(body);
    const answers: [string, { ok: boolean; text: string; pictures?: unknown[] }][] = [];
    await applyAll([JSON.stringify({ ask: 'p1', op: 'picture', id: n.id, number: 1 }), JSON.stringify({ ask: 'p2', op: 'picture', id: 'gone' })], (a, r) => answers.push([a, r]));
    expect(answers.map(([a, r]) => [a, r.ok, r.pictures?.length ?? 0])).toEqual([['p1', true, 1], ['p2', false, 0]]);
  });
});
