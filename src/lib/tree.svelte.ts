import { notes, nested, type Note } from './notes.svelte';
import { history } from './history.svelte';
import { saved, save } from './stored';

const LS = 'eve.tree';
const OLD = 'eve.groups';

interface Saved { folded: string[] }
interface OldGroups { order?: string[]; collapsed?: string[]; icons?: Record<string, string>; folded?: string[] }

const read = <T,>(key: string): Partial<T> => saved<Partial<T>>(key, {});

const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
const leafOf = (p: string) => p.split('/').pop() ?? p;
const depthOf = (p: string) => (p ? p.split('/').length : 0);

export function pageIdOf(g: string) {
  let a = 5381, b = 2166136261;
  for (const c of g) { const k = c.codePointAt(0)!; a = ((a * 33) ^ k) >>> 0; b = Math.imul(b ^ k, 16777619) >>> 0; }
  return 'group-' + a.toString(36) + b.toString(36);
}

class Tree {
  saved = $state<Saved>({ folded: read<Saved>(LS).folded ?? read<OldGroups>(OLD).folded ?? [] });

  pages(hideFolded = false): Note[] {
    return nested(notes.visible, hideFolded ? (id) => this.isFolded(id) : undefined).map((r) => r.n);
  }
  ordered() { return this.pages(); }
  visibleOrdered() { return this.pages(true); }

  isFolded(id: string) { return this.saved.folded.includes(id); }
  fold(id: string) {
    this.saved.folded = this.isFolded(id) ? this.saved.folded.filter((x) => x !== id) : [...this.saved.folded, id];
    this.persist();
  }
  unfold(id: string) { if (this.isFolded(id)) this.fold(id); }
  reveal(id: string) {
    for (let p = notes.all.find((x) => x.id === id && !x.deleted)?.parent; p; p = notes.all.find((x) => x.id === p)?.parent) this.unfold(p);
  }
  private persist() { save(LS, this.saved); }

  get groups(): string[] {
    const out = new Set<string>();
    for (const n of notes.visible) {
      const parts = n.group ? n.group.split('/') : [];
      for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
    }
    return [...out];
  }

  toPages(): boolean {
    const found = this.groups;
    if (!found.length) return false;
    const old = read<OldGroups>(OLD);
    const order = [...(old.order ?? []).filter((g) => found.includes(g)), ...found.filter((g) => !old.order?.includes(g)).sort()];
    const was = new Set(order);
    const children = (up: string) => order.filter((g) => parentOf(g) === up);
    history.quietly(() => {
      const now = Date.now();
      const top = Math.max(-1, ...notes.visible.filter((n) => !n.group && !n.parent).map((n) => n.order)) + 1;
      for (const g of [...order].sort((x, y) => depthOf(x) - depthOf(y))) {
        const id = pageIdOf(g), up = parentOf(g);
        const sibs = children(up), i = sibs.indexOf(g);
        const rank = up ? Math.min(0, ...notes.visible.filter((n) => n.group === up).map((n) => n.order)) - (sibs.length - i) : top + i;
        const parent = up ? pageIdOf(up) : undefined, icon = old.icons?.[g];
        const page = notes.all.find((n) => n.id === id);
        if (page) { if (page.deleted) { Object.assign(page, { deleted: false, updatedAt: now }); notes.flush(id); } }
        else notes.addWithId({ id, body: `# ${leafOf(g)}\n`, updatedAt: now, deleted: false, ...(parent ? { parent } : {}), order: rank, ...(icon ? { icon } : {}) });
        if (old.collapsed?.includes(g) && !this.isFolded(id)) this.saved.folded = [...this.saved.folded, id];
      }
      const groupOf = new Map(notes.all.map((n) => [n.id, n.group]));
      for (const n of notes.all) {
        if (!n.group || !was.has(n.group)) continue;
        const inside = !!n.parent && groupOf.get(n.parent) === n.group, page = pageIdOf(n.group);
        if (!inside && page !== n.id && !notes.isAncestor(n.id, page)) n.parent = page;
        delete n.group;
        n.updatedAt = now;
        notes.flush(n.id);
      }
      this.persist();
      localStorage.removeItem(OLD);
    });
    return true;
  }
}

export const tree = new Tree();
notes.sidebar = { shown: () => tree.visibleOrdered(), all: () => tree.ordered() };
