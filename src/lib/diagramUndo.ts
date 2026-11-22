export function editedLine(before: string, after: string): number | null {
  const a = before.split('\n'), b = after.split('\n');
  if (a.length !== b.length) return null;
  let at: number | null = null;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (at !== null) return null; at = i; }
  return at;
}
