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

const level = (b: Element) => Number(/^H([1-6])$/.exec(b.tagName)?.[1] ?? 9);
/** the headings a block sits under, outermost first: the last of each level before it, a shallower one starting the
 *  path again (h2 h3 h3 h3 is h2 › the last h3, not every h3 in turn) */
export function path(before: Element[]): Element[] {
  const out: Element[] = [];
  for (const b of before) {
    if (level(b) === 9) continue;
    while (out.length && level(out.at(-1)!) >= level(b)) out.pop();
    out.push(b);
  }
  return out;
}

/**
 * Each diagram (`chart`) a slide of its own, under the headings it sits under (`again` copies of them, small, unless
 * nothing but those came before it on its slide): a diagram beside words was shrunk to a corner of the screen. What
 * comes after it goes on to a slide of its own under the same headings.
 */
export function alone(deck: Element[][], chart: (b: Element) => boolean, again: (h: Element) => Element): Element[][] {
  const small = (h: Element) => (h.classList.contains('again') ? h : again(h));
  const out: Element[][] = [];
  for (let s of deck) {
    for (let i = s.findIndex(chart); i >= 0 && s.length > 1; i = s.findIndex(chart)) {
      const before = s.slice(0, i), after = s.slice(i + 1), heads = path(before);
      const words = before.some((b) => level(b) === 9);
      if (words) out.push(before);
      out.push([...(words ? heads.map(small) : before), s[i]]);
      s = after.some((b) => b.tagName !== 'HR') ? [...heads.map(small), ...after] : [];
    }
    if (s.length) out.push(s);
  }
  return out;
}
