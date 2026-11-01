import { notes, nested, type Note } from './notes.svelte';
import { history } from './history.svelte';

/**
 * The list's pages as a tree, as Notion has them: pages in pages, no folders. Which pages show their sub-pages and
 * which are folded stays with each device. An older version kept notes in groups (folders, "Work/Projects"): any there
 * are, on this device or come in from another, are made pages here (toPages).
 */
const LS = 'eve.tree';
/** where an older version kept its groups' order, folds and icons, read once to make them pages */
const OLD = 'eve.groups';

interface Saved { folded: string[] }
interface OldGroups { order?: string[]; collapsed?: string[]; icons?: Record<string, string>; folded?: string[] }

const read = <T,>(key: string): Partial<T> => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}; } catch { return {}; } };

const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
const leafOf = (p: string) => p.split('/').pop() ?? p;
const depthOf = (p: string) => (p ? p.split('/').length : 0);

/** the page a group becomes: its id from its path, so two devices that each make the same group a page make one page,
 *  which syncs as one, not two of the same name */
export function pageIdOf(g: string) {
  let a = 5381, b = 2166136261;
  for (const c of g) { const k = c.codePointAt(0)!; a = ((a * 33) ^ k) >>> 0; b = Math.imul(b ^ k, 16777619) >>> 0; }
  return 'group-' + a.toString(36) + b.toString(36);
}

class Tree {
  // (folds kept from before, when they lived beside the groups)
  saved = $state<Saved>({ folded: read<Saved>(LS).folded ?? read<OldGroups>(OLD).folded ?? [] });

  /** the pages as the list stacks them: each followed by its sub-pages (not those of a folded page, with `hideFolded`) */
  pages(hideFolded = false): Note[] {
    return nested(notes.visible, hideFolded ? (id) => this.isFolded(id) : undefined).map((r) => r.n);
  }
  ordered() { return this.pages(); }
  /** only what the list shows: no page under a folded one */
  visibleOrdered() { return this.pages(true); }

  /** a page whose sub-pages are folded away */
  isFolded(id: string) { return this.saved.folded.includes(id); }
  fold(id: string) {
    this.saved.folded = this.isFolded(id) ? this.saved.folded.filter((x) => x !== id) : [...this.saved.folded, id];
    this.persist();
  }
  /** show a page's sub-pages (one tucked under it, or the open note brought into sight) */
  unfold(id: string) { if (this.isFolded(id)) this.fold(id); }
  /** A note's row brought into the list: the pages it sits under unfolded. */
  reveal(id: string) {
    for (let p = notes.all.find((x) => x.id === id && !x.deleted)?.parent; p; p = notes.all.find((x) => x.id === p)?.parent) this.unfold(p);
  }
  private persist() { localStorage.setItem(LS, JSON.stringify(this.saved)); }

  /** an older version's groups still about: in its notes (this device's from before, another's come in by sync, a
   *  folder imported by one) */
  get groups(): string[] {
    const out = new Set<string>();
    for (const n of notes.visible) {
      const parts = n.group ? n.group.split('/') : [];
      for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
    }
    return [...out];
  }

  /**
   * Every group made a page: a page of the group's name and icon where the group stood in the list, its notes pages
   * under it, a group inside it a page under that one, a folded group a folded page. The app does this whenever there
   * are any. Returns whether there were.
   */
  toPages(): boolean {
    const found = this.groups;
    if (!found.length) return false;
    const old = read<OldGroups>(OLD);
    // as the older version listed them: its own order first, then any only its notes name
    const order = [...(old.order ?? []).filter((g) => found.includes(g)), ...found.filter((g) => !old.order?.includes(g)).sort()];
    const was = new Set(order);
    const children = (up: string) => order.filter((g) => parentOf(g) === up);
    history.quietly(() => {
      const now = Date.now();
      // the top level's groups came after its pages; a group's groups before its own notes
      const top = Math.max(-1, ...notes.visible.filter((n) => !n.group && !n.parent).map((n) => n.order)) + 1;
      for (const g of [...order].sort((x, y) => depthOf(x) - depthOf(y))) { // a page before the pages under it
        const id = pageIdOf(g), up = parentOf(g);
        const sibs = children(up), i = sibs.indexOf(g);
        const rank = up ? Math.min(0, ...notes.visible.filter((n) => n.group === up).map((n) => n.order)) - (sibs.length - i) : top + i;
        const parent = up ? pageIdOf(up) : undefined, icon = old.icons?.[g];
        const page = notes.all.find((n) => n.id === id);
        // made before, here or on another device: back if deleted, and left where it has been put since
        if (page) { if (page.deleted) { Object.assign(page, { deleted: false, updatedAt: now }); notes.flush(id); } }
        else notes.addWithId({ id, body: `# ${leafOf(g)}\n`, updatedAt: now, deleted: false, ...(parent ? { parent } : {}), order: rank, ...(icon ? { icon } : {}) });
        if (old.collapsed?.includes(g) && !this.isFolded(id)) this.saved.folded = [...this.saved.folded, id];
      }
      // its notes, the Trash's too (restored, one would bring its group back): under its page, a sub-page staying
      // under its own page. One only in the Trash, its group not in the list, waits: restored, it goes the same way
      const groupOf = new Map(notes.all.map((n) => [n.id, n.group]));
      for (const n of notes.all) {
        if (!n.group || !was.has(n.group)) continue;
        const inside = !!n.parent && groupOf.get(n.parent) === n.group, page = pageIdOf(n.group);
        // never under itself or one of its own sub-pages (the group's page moved under it since): it stays where it is
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
// the notes open "the first one" or "the one next to it" as the list shows them, not by their bare rank
notes.sidebar = { shown: () => tree.visibleOrdered(), all: () => tree.ordered() };
