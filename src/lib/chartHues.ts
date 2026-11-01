/**
 * The colours of a pie's slices and a mind map's branches, by their names rather than their places: by place, one
 * deleted or added before the others gave every one after it another colour. Names that come out the same take the
 * next free colour, in the order they are drawn.
 *
 * While a part is being typed in, its colour is held (`held.hues`, by its key), so it does not change at each letter;
 * it takes its name's once it is done. While a mind map is being edited, its branches keep the side they were on
 * (`held.sides`, by name): a new one goes to the lighter side, rather than the two sides being split again at each
 * change. ChartEditor.svelte sets and clears both.
 */
export const held = { hues: new Map<string, number>(), sides: new Map<string, boolean>() };

function hash(s: string) {
  let h = 5381;
  for (const c of s.trim().toLowerCase()) h = ((h * 33) ^ c.codePointAt(0)!) >>> 0;
  return h;
}

/** each name's colour, one of `count` from `from`: `keys[i]` the part's key, to find one held */
export function huesOf(names: string[], keys: string[], count = 12, from = 0): number[] {
  const out: number[] = new Array(names.length), taken = new Set<number>();
  names.forEach((_, i) => { const h = held.hues.get(keys[i]); if (h !== undefined) { out[i] = h; taken.add(h); } });
  names.forEach((n, i) => {
    if (out[i] !== undefined) return;
    let h = from + (hash(n) % count);
    // the next free one (all taken, as with more parts than colours: its own)
    for (let k = 0; k < count && taken.has(h); k++) h = from + ((h - from + 1) % count);
    out[i] = h;
    taken.add(h);
  });
  return out;
}
