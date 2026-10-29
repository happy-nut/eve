/**
 * A note's blocks as slides: a new one at each divider (the divider itself not shown) and at each heading of the
 * biggest size the note uses under its title. The title, and whatever comes before the first of those, is the first.
 */
export function slides(blocks: Element[]): Element[][] {
  const level = (b: Element) => Number(/^H([1-6])$/.exec(b.tagName)?.[1] ?? 9);
  const top = Math.min(9, ...blocks.slice(1).map(level));
  const out: Element[][] = [[]];
  blocks.forEach((b, i) => {
    if (isDivider(b)) return void out.push([]);
    if (i > 0 && top < 9 && level(b) === top && out.at(-1)!.length) out.push([]);
    out.at(-1)!.push(b);
  });
  return out.filter((s) => s.length);
}

const isDivider = (b: Element) => b.tagName === 'HR' || (b.childElementCount === 1 && b.firstElementChild!.tagName === 'HR' && !b.textContent?.trim());
