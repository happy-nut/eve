/**
 * A note's blocks as slides, cut by itself: a new one at each heading of the biggest size the note uses under its title
 * (the title, and whatever comes before the first of those, is the first slide). One longer than the screen is
 * scrolled through, not cut (Present.svelte).
 */
export function slides(blocks: Element[]): Element[][] {
  const level = (b: Element) => Number(/^H([1-6])$/.exec(b.tagName)?.[1] ?? 9);
  const top = Math.min(9, ...blocks.slice(1).map(level));
  const out: Element[][] = [[]];
  blocks.forEach((b, i) => {
    if (i > 0 && top < 9 && level(b) === top) out.push([]);
    out.at(-1)!.push(b);
  });
  return out;
}
