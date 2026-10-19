/**
 * The app's own undo: what was done to the notes and the groups (made, deleted, moved, nested, renamed, an icon), as
 * opposed to the text inside a note, which is the note's own undo. Each store says how to take a picture of itself
 * and how to be put back to one (undoSource); every method that changes them calls record() first. Whatever one
 * action does — a group deleted moves its notes out, a deleted open note opens the next — is one step: the picture is
 * taken at its first change and the step closes when the action's own code has run (a microtask later).
 * ⌘Z outside any text (ui.undoKey) takes back the newest step; a toast's Undo, its own.
 */
export interface UndoSource<S = unknown> { take(): S; put(s: S): void }
export interface Step { snaps: unknown[] }

const sources: UndoSource[] = [];
const stack: Step[] = [];
let open: Step | null = null;
let paused = 0;
const LIMIT = 100;

export function undoSource<S>(s: UndoSource<S>) { sources.push(s as UndoSource); }

export const history = {
  /** about to change the notes or the groups: the step this change belongs to (null while undoing or loading) */
  record(): Step | null {
    if (paused) return null;
    if (open) return open;
    const step: Step = { snaps: sources.map((s) => s.take()) };
    open = step;
    queueMicrotask(() => {
      open = null;
      // a change that came to nothing (a move onto the same spot) is no step
      if (sources.some((s, i) => JSON.stringify(s.take()) !== JSON.stringify(step.snaps[i]))) {
        stack.push(step);
        if (stack.length > LIMIT) stack.shift();
      }
    });
    return step;
  },
  /** changes that are no one's to undo: the notes loaded, sync bringing another device's, an undo itself */
  quietly<T>(run: () => T): T {
    paused++;
    try { return run(); } finally { paused--; }
  },
  /** the newest step taken back (or `step`, if it is the newest). False when there was nothing, or something newer */
  undo(step?: Step | null): boolean {
    const top = stack.at(-1);
    if (!top || (step && step !== top)) return false;
    stack.pop();
    history.quietly(() => sources.forEach((s, i) => s.put(top.snaps[i])));
    return true;
  },
  get size() { return stack.length; },
  /** for tests: nothing to undo, nothing open */
  clear() { stack.length = 0; open = null; },
};
