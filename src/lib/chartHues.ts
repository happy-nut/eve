export const held = { hues: new Map<string, number>(), sides: new Map<string, boolean>() };

function hash(s: string) {
  let h = 5381;
  for (const c of s.trim().toLowerCase()) h = ((h * 33) ^ c.codePointAt(0)!) >>> 0;
  return h;
}

export function huesOf(names: string[], keys: string[], count = 12, from = 0): number[] {
  const out: number[] = new Array(names.length), taken = new Set<number>();
  names.forEach((_, i) => { const h = held.hues.get(keys[i]); if (h !== undefined) { out[i] = h; taken.add(h); } });
  names.forEach((n, i) => {
    if (out[i] !== undefined) return;
    let h = from + (hash(n) % count);
    for (let k = 0; k < count && taken.has(h); k++) h = from + ((h - from + 1) % count);
    out[i] = h;
    taken.add(h);
  });
  return out;
}
