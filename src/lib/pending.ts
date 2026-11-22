const pending = new Set<() => void>();

export const holdEdit = (flush: () => void) => pending.add(flush);
export const dropEdit = (flush: () => void) => pending.delete(flush);
export function takeEditorKeys() { for (const flush of [...pending]) flush(); }
