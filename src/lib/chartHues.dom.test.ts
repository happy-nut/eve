import { afterEach, describe, expect, it } from 'vitest';
import { chartHtml } from './charts';
import { held, huesOf } from './chartHues';

const F = (code: string) => document.createRange().createContextualFragment(chartHtml(code)!);
const tones = (frag: DocumentFragment, sel: string) => [...frag.querySelectorAll(sel)].map((e) => /\bc(\d+)\b/.exec(e.getAttribute('class')!)![1]);

afterEach(() => { held.hues.clear(); held.sides.clear(); });

describe('chart colours by name', () => {
  it("a slice keeps its colour when one before it is deleted or added", () => {
    const before = tones(F('pie\n  "Dogs" : 4\n  "Cats" : 3\n  "Rats" : 1'), '.pie-legend .dot');
    const gone = tones(F('pie\n  "Cats" : 3\n  "Rats" : 1'), '.pie-legend .dot');
    const added = tones(F('pie\n  "Fish" : 2\n  "Dogs" : 4\n  "Cats" : 3\n  "Rats" : 1'), '.pie-legend .dot');
    expect(gone).toEqual(before.slice(1));
    expect(added.slice(1)).toEqual(before);
  });

  it('names that come out the same take the next free colour, so no two alike', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Part ${i}`);
    expect(new Set(huesOf(many, many)).size).toBe(12);
  });

  it('a part being typed in keeps the colour it had', () => {
    held.hues.set('slice:0', 7);
    expect(tones(F('pie\n  "D" : 4\n  "Cats" : 3'), '.pie-legend .dot')[0]).toBe('7');
  });

  it("a mind map's first-step ideas keep their colour, and those under them take it", () => {
    const one = F('mindmap\n  root((Plan))\n    Work\n      Projects\n    Home\n    Travel');
    const two = F('mindmap\n  root((Plan))\n    Home\n    Travel');
    const hue = (f: DocumentFragment, t: string) => [...f.querySelectorAll('g.mm-node')].find((g) => g.textContent!.trim() === t)!.getAttribute('class')!.match(/\bc(\d+)\b/)![1];
    expect(hue(two, 'Home')).toBe(hue(one, 'Home'));
    expect(hue(two, 'Travel')).toBe(hue(one, 'Travel'));
    expect(hue(one, 'Projects')).toBe(hue(one, 'Work'));
  });

  it('while a mind map is edited, its ideas stay on their sides and a new one goes to the lighter side', () => {
    held.sides.set('A', true); held.sides.set('B', true); held.sides.set('C', false);
    const f = F('mindmap\n  root((Plan))\n    A\n    B\n    C\n    D');
    const x = (t: string) => +[...f.querySelectorAll('g.mm-node')].find((g) => g.textContent!.trim() === t)!.querySelector('text')!.getAttribute('x')!;
    const root = +f.querySelector('[data-spot="root"] text')!.getAttribute('x')!;
    expect([x('A') > root, x('B') > root, x('C') > root, x('D') > root]).toEqual([true, true, false, false]);
  });
});
