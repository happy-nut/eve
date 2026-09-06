import { notes } from './notes.svelte';

/**
 * Sidebar folders, nested up to MAX_DEPTH. A group is a path like "Work/Projects/Alpha";
 * each note stores its full group path (so membership syncs). Only sibling order,
 * collapsed state and still-empty groups are local.
 */
const LS = 'eve.groups';
export const MAX_DEPTH = 3;

interface Saved { order: string[]; collapsed: string[]; icons: Record<string, string> }

function load(): Saved {
  try { return { order: [], collapsed: [], icons: {}, ...JSON.parse(localStorage.getItem(LS) ?? '{}') }; }
  catch { return { order: [], collapsed: [], icons: {} }; }
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
  notesIn(p: string, deep = false) { return notes.visible.filter((n) => !n.path && (deep ? within(n.group, p) : n.group === p)); }

  /** notes in the order the sidebar shows them: depth-first groups (subgroups before notes), then root */
  ordered() {
    const walk = (p: string): typeof notes.visible => [...this.children(p).flatMap(walk), ...this.notesIn(p)];
    return walk('');
  }

  private persist() { localStorage.setItem(LS, JSON.stringify(this.saved)); }

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
    this.saved.icons = Object.fromEntries(Object.entries(this.saved.icons).map(([g, i]) => [sub.includes(g) ? map(g) : g, i]));
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
    for (const g of sub) delete this.saved.icons[g];
    this.persist();
    for (const n of notes.all) if (!n.deleted && within(n.group, p)) notes.setGroup(n.id, '');
  }

  /** ensure a group (and its ancestors) are remembered in order so they survive their notes moving out */
  remember(p: string) {
    if (p && !this.saved.order.includes(p)) { this.saved.order = [...this.names]; this.persist(); }
  }
}

export const groups = new Groups();
