export interface UndoSource<S = unknown> { take(): S; put(s: S): void }
export interface Step { snaps: unknown[] }

const sources: UndoSource[] = [];
const stack: Step[] = [];
let open: Step | null = null;
let paused = 0;
const LIMIT = 100;

export function undoSource<S>(s: UndoSource<S>) { sources.push(s as UndoSource); }

export const history = {
  record(): Step | null {
    if (paused) return null;
    if (open) return open;
    const step: Step = { snaps: sources.map((s) => s.take()) };
    open = step;
    queueMicrotask(() => {
      open = null;
      if (sources.some((s, i) => JSON.stringify(s.take()) !== JSON.stringify(step.snaps[i]))) {
        stack.push(step);
        if (stack.length > LIMIT) stack.shift();
      }
    });
    return step;
  },
  quietly<T>(run: () => T): T {
    paused++;
    try { return run(); } finally { paused--; }
  },
  undo(step?: Step | null): boolean {
    const top = stack.at(-1);
    if (!top || (step && step !== top)) return false;
    stack.pop();
    history.quietly(() => sources.forEach((s, i) => s.put(top.snaps[i])));
    return true;
  },
  get size() { return stack.length; },
  clear() { stack.length = 0; open = null; },
};
