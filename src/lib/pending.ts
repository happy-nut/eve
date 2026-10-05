/**
 * Edits an editor has not handed over yet. A long note is turned into markdown a moment after the typing stops
 * (editor.ts), not on every key; whatever reads or writes a note's text first runs these, so it never sees an
 * older one. Kept apart from editor.ts, so the notes store can call it without pulling the editor in.
 */
const pending = new Set<() => void>();

export const holdEdit = (flush: () => void) => pending.add(flush);
export const dropEdit = (flush: () => void) => pending.delete(flush);
/** every edit still waiting, handed over now */
export function flushEdits() { for (const flush of [...pending]) flush(); }
