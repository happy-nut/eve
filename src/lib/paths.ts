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

/**
 * Where a link written in a file points, as a path among the files imported with it: `rel` read from the folder
 * `dir` (`../img/a.png` from `Notes/Trip` is `Notes/img/a.png`). Null for what is no file of the import: an
 * address (https:, mailto:, data:), an absolute path, a link inside the page (#…), or one climbing out of it.
 */
export function resolveLink(dir: string, rel: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith('/') || rel.startsWith('#')) return null;
  let target = rel.replace(/[?#].*$/, '');
  try { target = decodeURIComponent(target); } catch { /* a bare % : taken as written */ }
  const out = dir ? dir.split('/') : [];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.length ? out.join('/') : null;
}
