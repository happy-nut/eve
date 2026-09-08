/**
 * Kanban board data + its file form (pure; tested in Node). Lives in the note as a fenced block of JSON:
 *
 *   ```kanban
 *   { "columns": [ { "title": "To do", "cards": [ { "title": "…", "body": "markdown" } ] } ] }
 *   ```
 *
 * JSON rather than a line format: a lost indent can't turn a body line into a card, and a block that does
 * not parse is left as a code block (nothing is silently reinterpreted or dropped).
 * ids are per-session only (keys for animation and focus), never written to the file.
 */
export interface Card { id: string; title: string; body: string }
export interface Column { id: string; title: string; cards: Card[] }

export const uid = () => Math.random().toString(36).slice(2, 9);

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** null when the text is not a board (bad JSON or shape). */
export function parseBoard(text: string): Column[] | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(data?.columns)) return null;
  return data.columns.map((c: any) => ({
    id: uid(),
    title: str(c?.title),
    cards: (Array.isArray(c?.cards) ? c.cards : []).map((k: any) => ({ id: uid(), title: str(k?.title), body: str(k?.body) })),
  }));
}

export function serializeBoard(cols: Column[]): string {
  return JSON.stringify({ columns: cols.map((c) => ({ title: c.title, cards: c.cards.map((k) => ({ title: k.title, body: k.body })) })) }, null, 2);
}

export const defaultBoard = (): Column[] => ['To do', 'In progress', 'Done'].map((title) => ({ id: uid(), title, cards: [] }));

/** Card `id` placed at `index` of column `colId` (index clamps); same column reorders. */
export function moveCard(cols: Column[], id: string, colId: string, index: number): Column[] {
  const card = cols.flatMap((c) => c.cards).find((k) => k.id === id);
  if (!card) return cols;
  return cols.map((c) => {
    const cards = c.cards.filter((k) => k.id !== id);
    if (c.id !== colId) return { ...c, cards };
    cards.splice(Math.max(0, Math.min(index, cards.length)), 0, card);
    return { ...c, cards };
  });
}

export function moveColumn(cols: Column[], id: string, index: number): Column[] {
  const i = cols.findIndex((c) => c.id === id);
  if (i < 0) return cols;
  const out = cols.filter((c) => c.id !== id);
  out.splice(Math.max(0, Math.min(index, out.length)), 0, cols[i]);
  return out;
}

export function patchCard(cols: Column[], id: string, patch: Partial<Card>): Column[] {
  return cols.map((c) => ({ ...c, cards: c.cards.map((k) => (k.id === id ? { ...k, ...patch } : k)) }));
}
