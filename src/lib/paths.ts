
export const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
export const stem = (name: string) => name.replace(/\.[^.]+$/, '');

export function commonDir(paths: string[]): string {
  if (paths.length < 2) return paths.length ? dirOf(paths[0]) : '';
  const parts = paths.map((p) => dirOf(p).split('/'));
  const first = parts[0];
  let i = 0;
  while (i < first.length && parts.every((p) => p[i] === first[i])) i++;
  return first.slice(0, i).join('/');
}

export function groupFor(path: string, root: string, maxDepth: number): string {
  const rel = dirOf(path).slice(root.length).replace(/^\//, '');
  if (!rel) return '';
  return rel.split('/').filter(Boolean).slice(0, maxDepth).join('/');
}

export function resolveLink(dir: string, rel: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith('/') || rel.startsWith('#')) return null;
  let target = rel.replace(/[?#].*$/, '');
  try { target = decodeURIComponent(target); } catch { }
  const out = dir ? dir.split('/') : [];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.length ? out.join('/') : null;
}
