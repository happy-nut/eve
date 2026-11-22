export interface Card { id: string; title: string; body: string; extra?: Record<string, unknown> }
export interface CardTemplate { title: string; body: string }
export interface Column { id: string; title: string; cards: Card[]; extra?: Record<string, unknown> }
export interface CardMore {
  caret?: 'title';
  columns?: { id: string; title: string }[]; column?: string; move?: (colId: string) => void;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function extraOf(o: unknown, known: string[]): Record<string, unknown> | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const rest = Object.entries(o).filter(([k]) => !known.includes(k));
  return rest.length ? Object.fromEntries(rest) : undefined;
}

export function parseBoard(text: string): Column[] | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(data?.columns) || extraOf(data, ['columns', 'template']) || extraOf(data.template, ['title', 'body'])) return null;
  return data.columns.map((c: any) => ({
    id: uid(),
    title: str(c?.title),
    cards: (Array.isArray(c?.cards) ? c.cards : []).map((k: any) => (typeof k === 'string'
      ? { id: uid(), title: k, body: '' }
      : { id: uid(), title: str(k?.title), body: str(k?.body), ...withExtra(k, ['title', 'body']) })),
    ...withExtra(c, ['title', 'cards']),
  }));
}
const withExtra = (o: unknown, known: string[]) => { const extra = extraOf(o, known); return extra ? { extra } : {}; };

export function parseTemplate(text: string): CardTemplate | null {
  let t: any;
  try { t = JSON.parse(text)?.template; } catch { return null; }
  return t && typeof t === 'object' ? { title: str(t.title), body: str(t.body) } : null;
}

export function serializeBoard(cols: Column[], template: CardTemplate | null = null): string {
  const columns = cols.map((c) => ({ title: c.title, cards: c.cards.map((k) => ({ title: k.title, body: k.body, ...k.extra })), ...c.extra }));
  const t = template && (template.title || template.body) ? { template: { title: template.title, body: template.body } } : {};
  return JSON.stringify({ columns, ...t }, null, 2);
}

export const defaultBoard = (): Column[] => ['To do', 'In progress', 'Done'].map((title) => ({ id: uid(), title, cards: [] }));

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
