/**
 * Which line of a diagram's code a write changed, to tell the note's undo where one change ends: a step added (lines
 * come or go) or another line written is a change of its own; more letters on the line written last go with it, as
 * typing in the note does. Without it a step added and its name typed within half a second came back as one ↶ (#324).
 */
export function editedLine(before: string, after: string): number | null {
  const a = before.split('\n'), b = after.split('\n');
  if (a.length !== b.length) return null;
  let at: number | null = null;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (at !== null) return null; at = i; }
  return at;
}
