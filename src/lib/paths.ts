/** File-path helpers for importing: pure, so they can be tested in Node (paths.test.mjs). */

export const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
export const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
/** File name without its extension — the title a file gives its note. */
export const stem = (name: string) => name.replace(/\.[^.]+$/, '');

/** The deepest folder every path shares. One file has no structure to keep, so it stays at the root. */
export function commonDir(paths: string[]): string {
  if (paths.length < 2) return paths.length ? dirOf(paths[0]) : '';
  const parts = paths.map((p) => dirOf(p).split('/'));
  const first = parts[0];
  let i = 0;
  while (i < first.length && parts.every((p) => p[i] === first[i])) i++;
  return first.slice(0, i).join('/');
}

/** Folders between `root` and a file become the note's group ("Work/Specs"), as deep as groups go. */
export function groupFor(path: string, root: string, maxDepth: number): string {
  const rel = dirOf(path).slice(root.length).replace(/^\//, '');
  if (!rel) return '';
  return rel.split('/').filter(Boolean).slice(0, maxDepth).join('/');
}
