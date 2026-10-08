import { notes, nested } from './notes.svelte';
import { appearance } from './appearance.svelte';
import { randomIcon } from './icons';

/**
 * Sidebar folders, nested up to MAX_DEPTH. A group is a path like "Work/Projects/Alpha";
 * each note stores its full group path (so membership syncs). The groups' icons and their order
 * sync too, as one small file in the repository (notes/groups.json, see shared()/takeRemote());
 * which ones are folded stays with each device.
 */
const LS = 'eve.groups';
export const MAX_DEPTH = 3;

interface Saved { order: string[]; collapsed: string[]; icons: Record<string, string>; folded: string[]; sharedAt?: number }

/** the synced half of a device's groups, as the repository keeps it */
export interface SharedGroups { updated: number; icons: Record<string, string>; order: string[] }
const sharedText = (icons: Record<string, string>, order: string[]) =>
  JSON.stringify({ icons: Object.fromEntries(Object.entries(icons).sort(([a], [b]) => a.localeCompare(b))), order });

function load(): Saved {
  try { return { order: [], collapsed: [], icons: {}, folded: [], ...JSON.parse(localStorage.getItem(LS) ?? '{}') }; }
  catch { return { order: [], collapsed: [], icons: {}, folded: [] }; }
}

export const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
export const leafOf = (p: string) => p.split('/').pop() ?? p;
export const depthOf = (p: string) => (p ? p.split('/').length : 0);
const within = (p: string, root: string) => p === root || p.startsWith(root + '/');

class Groups {
  saved = $state<Saved>(load());
  /** group currently being renamed (inline input) */
  editing = $state<string | null>(null);

  /** every group path, in display order: saved order first, then any path that only exists on notes */
  names = $derived.by(() => {
    const seen = new Set(this.saved.order);
    const extra = new Set<string>();
    for (const n of notes.visible) {
      // a note in "a/b/c" implies groups "a", "a/b", "a/b/c"
      const parts = n.group ? n.group.split('/') : [];
      for (let i = 1; i <= parts.length; i++) {
        const p = parts.slice(0, i).join('/');
        if (!seen.has(p)) extra.add(p);
      }
    }
    return [...this.saved.order, ...[...extra].sort()];
  });

  children(parent: string) { return this.names.filter((g) => parentOf(g) === parent); }
  subtree(p: string) { return this.names.filter((g) => within(g, p)); }
  /** height of a group's subtree (itself = 1) */
  height(p: string) { return Math.max(...this.subtree(p).map(depthOf)) - depthOf(p) + 1; }
  notesIn(p: string, deep = false) { return notes.visible.filter((n) => (deep ? within(n.group, p) : n.group === p)); }

  /** notes of a group as the sidebar stacks them: each page followed by its sub-pages */
  pagesIn(p: string, hideFolded = false) {
    return nested(this.notesIn(p), hideFolded ? (id) => this.isFolded(id) : undefined).map((r) => r.n);
  }

  /** a page whose sub-pages are folded away (sidebar layout, like a collapsed group) */
  isFolded(id: string) { return this.saved.folded.includes(id); }
  fold(id: string) {
    this.saved.folded = this.isFolded(id) ? this.saved.folded.filter((x) => x !== id) : [...this.saved.folded, id];
    this.persist();
  }

  /** show a page's sub-pages (used when one is tucked under it) */
  unfold(id: string) { if (this.isFolded(id)) this.fold(id); }

  /** notes in the order the sidebar shows them: the root's notes first, then each group depth-first
   *  (inside a group, its subgroups before its own notes) */
  ordered() {
    const walk = (p: string): typeof notes.visible => [...this.children(p).flatMap(walk), ...this.pagesIn(p)];
    return [...this.pagesIn(''), ...this.children('').flatMap(walk)];
  }

  /** like ordered(), but only what the sidebar currently shows (collapsed groups skipped) */
  visibleOrdered() {
    const inner = (p: string): typeof notes.visible =>
      [...this.children(p).flatMap((c) => (this.isCollapsed(c) ? [] : inner(c))), ...this.pagesIn(p, true)];
    return [...this.pagesIn('', true), ...this.children('').flatMap((c) => (this.isCollapsed(c) ? [] : inner(c)))];
  }

  /** what icons + order last looked like, to tell a change to them from a fold */
  private lastShared = sharedText(this.saved.icons, this.saved.order);
  private persist() {
    const now = sharedText(this.saved.icons, this.saved.order);
    if (now !== this.lastShared) { this.saved.sharedAt = Date.now(); this.lastShared = now; }
    localStorage.setItem(LS, JSON.stringify(this.saved));
  }

  /** The synced half, for the repository. A device from before this existed dates what it has to now,
   *  so icons made on it win over a phone that has none. */
  shared(): SharedGroups {
    if (this.saved.sharedAt === undefined) {
      // only icons count: a phone that merely listed its groups must not outrank the Mac's icons
      this.saved.sharedAt = Object.keys(this.saved.icons).length ? Date.now() : 0;
      localStorage.setItem(LS, JSON.stringify(this.saved));
    }
    return { updated: this.saved.sharedAt, icons: this.saved.icons, order: this.saved.order };
  }
  /** The repository's copy: the later one wins; on a tie the same one wins on every device, so two
   *  devices never hand the file back and forth. Order keeps any local group the remote lacks. */
  takeRemote(r: SharedGroups) {
    const mine = this.shared();
    const theirs = sharedText(r.icons ?? {}, r.order ?? []), ours = sharedText(mine.icons, mine.order);
    if (theirs === ours) return;
    if (r.updated < mine.updated || (r.updated === mine.updated && theirs < ours)) return;
    const order = [...(r.order ?? [])];
    for (const g of this.saved.order) if (!order.includes(g)) order.push(g);
    this.saved.icons = { ...(r.icons ?? {}) };
    this.saved.order = order;
    this.saved.sharedAt = r.updated;
    this.lastShared = sharedText(this.saved.icons, this.saved.order);
    localStorage.setItem(LS, JSON.stringify(this.saved));
  }

  /** stable identity that survives renames and moves (sidebar row key, so rows animate instead of re-mounting).
   *  Plain Map, not $state: it is filled lazily from inside a $derived. */
  private ids = new Map<string, string>();
  id(g: string) {
    let id = this.ids.get(g);
    if (!id) { id = Math.random().toString(36).slice(2, 10); this.ids.set(g, id); }
    return id;
  }

  icon(g: string) { return this.saved.icons[g] ?? ''; }
  setIcon(g: string, icon: string) {
    icon = icon.trim();
    if (icon) this.saved.icons[g] = icon; else delete this.saved.icons[g];
    this.persist();
  }

  isCollapsed(g: string) { return this.saved.collapsed.includes(g); }
  toggle(g: string) {
    this.saved.collapsed = this.isCollapsed(g) ? this.saved.collapsed.filter((x) => x !== g) : [...this.saved.collapsed, g];
    this.persist();
  }
  expand(g: string) { if (this.isCollapsed(g)) this.toggle(g); }

  /** new empty group inside `parent` ('' = root); falls back to the parent's level when too deep */
  create(parent = ''): string {
    while (depthOf(parent) >= MAX_DEPTH) parent = parentOf(parent);
    const siblings = this.children(parent).map(leafOf);
    let leaf = 'New group', i = 2;
    while (siblings.includes(leaf)) leaf = `New group ${i++}`;
    const p = parent ? `${parent}/${leaf}` : leaf;
    this.saved.order = [...this.names, p];
    if (appearance.s.autoIcon) this.saved.icons[p] = randomIcon(); // like a new note, unless the setting is off
    this.persist();
    if (parent) this.expand(parent);
    this.editing = p;
    return p;
  }

  /** Can `p` (with its subtree) live under `parent`? */
  canPlace(p: string, parent: string, leaf = leafOf(p)) {
    if (within(parent, p)) return false; // into itself / a descendant
    if (depthOf(parent) + this.height(p) > MAX_DEPTH) return false;
    const target = parent ? `${parent}/${leaf}` : leaf;
    return target === p || !this.names.includes(target);
  }

  /**
   * Move (and/or rename) a group with everything inside it. `before` = sibling path to insert in front of,
   * null = last among siblings. Returns the group's new path, or null if refused.
   */
  move(p: string, parent: string, before: string | null, leaf = leafOf(p)): string | null {
    leaf = leaf.trim().replace(/\//g, '-');
    if (!leaf || !this.canPlace(p, parent, leaf)) return null;
    const np = parent ? `${parent}/${leaf}` : leaf;
    const sub = this.subtree(p);
    const map = (old: string) => np + old.slice(p.length);
    const rest = this.names.filter((g) => !sub.includes(g));
    const idx = before && before !== p ? rest.indexOf(before) : -1;
    const moved = sub.map(map);
    if (idx < 0) rest.push(...moved); else rest.splice(idx, 0, ...moved);
    this.saved.order = rest;
    this.saved.collapsed = this.saved.collapsed.map((g) => (sub.includes(g) ? map(g) : g));
    this.saved.icons = Object.fromEntries(Object.entries(this.saved.icons).map(([g, v]) => [sub.includes(g) ? map(g) : g, v]));
    this.ids = new Map([...this.ids].map(([g, v]) => [sub.includes(g) ? map(g) : g, v]));
    this.persist();
    if (np !== p) for (const n of notes.all) if (!n.deleted && within(n.group, p)) notes.relabel(n.id, map(n.group));
    return np;
  }

  /** Returns the group's final path (unchanged on empty/duplicate input). */
  rename(p: string, leaf: string): string {
    this.editing = null;
    return this.move(p, parentOf(p), this.nextSibling(p), leaf) ?? p;
  }
  nextSibling(p: string): string | null {
    const sib = this.children(parentOf(p));
    return sib[sib.indexOf(p) + 1] ?? null;
  }
  prevSibling(p: string): string | null {
    const sib = this.children(parentOf(p));
    return sib[sib.indexOf(p) - 1] ?? null;
  }

  /** delete a group and its subgroups; all their notes go back to root */
  remove(p: string) {
    const sub = this.subtree(p);
    this.saved.order = this.names.filter((g) => !sub.includes(g));
    this.saved.collapsed = this.saved.collapsed.filter((g) => !sub.includes(g));
    for (const g of sub) { delete this.saved.icons[g]; this.ids.delete(g); }
    this.persist();
    // its notes go to the top level as the list showed them, each group's in turn, and a page's sub-pages stay under
    // it (they follow their page); one at a time from storage order, they came out reversed and flattened
    const moving = sub.flatMap((g) => this.pagesIn(g));
    const ids = new Set(moving.map((n) => n.id));
    for (const n of moving) if (!n.parent || !ids.has(n.parent)) notes.place(n.id, '', '', null);
  }

  /** ensure a group (and its ancestors) are remembered in order so they survive their notes moving out */
  remember(p: string) {
    if (p && !this.saved.order.includes(p)) { this.saved.order = [...this.names]; this.persist(); }
  }
}

export const groups = new Groups();
