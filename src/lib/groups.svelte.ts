import { notes } from './notes.svelte';

/**
 * Sidebar folders. Membership lives on each note (`group:` in frontmatter) so it syncs;
 * only order, collapsed state and still-empty groups are local.
 */
const LS = 'eve.groups';

interface Saved { order: string[]; collapsed: string[] }

function load(): Saved {
  try { return { order: [], collapsed: [], ...JSON.parse(localStorage.getItem(LS) ?? '{}') }; }
  catch { return { order: [], collapsed: [] }; }
}

class Groups {
  saved = $state<Saved>(load());
  /** group currently being renamed (inline input) */
  editing = $state<string | null>(null);

  /** all group names: saved order first, then any group that only exists on notes */
  names = $derived.by(() => {
    const seen = new Set(this.saved.order);
    const extra = [...new Set(notes.visible.map((n) => n.group).filter(Boolean))].filter((g) => !seen.has(g)).sort();
    return [...this.saved.order, ...extra];
  });

  /** notes in the order the sidebar shows them: each group in order, then root */
  ordered() {
    const v = notes.visible;
    return [...this.names.flatMap((g) => v.filter((n) => n.group === g)), ...v.filter((n) => !n.group)];
  }

  private persist() { localStorage.setItem(LS, JSON.stringify(this.saved)); }

  isCollapsed(g: string) { return this.saved.collapsed.includes(g); }
  toggle(g: string) {
    this.saved.collapsed = this.isCollapsed(g) ? this.saved.collapsed.filter((x) => x !== g) : [...this.saved.collapsed, g];
    this.persist();
  }

  create(): string {
    let name = 'New group', i = 2;
    while (this.names.includes(name)) name = `New group ${i++}`;
    this.saved.order = [...this.names, name];
    this.persist();
    this.editing = name;
    return name;
  }

  /** Returns the group's final name (unchanged on empty/duplicate input). */
  rename(from: string, to: string): string {
    to = to.trim();
    this.editing = null;
    if (!to || to === from || this.names.includes(to)) return from;
    this.saved.order = this.names.map((g) => (g === from ? to : g));
    this.saved.collapsed = this.saved.collapsed.map((g) => (g === from ? to : g));
    this.persist();
    for (const n of notes.all) if (n.group === from) notes.setGroup(n.id, to);
    return to;
  }

  /** delete a group; its notes go back to root */
  remove(g: string) {
    this.saved.order = this.names.filter((x) => x !== g);
    this.saved.collapsed = this.saved.collapsed.filter((x) => x !== g);
    this.persist();
    for (const n of notes.all) if (n.group === g) notes.setGroup(n.id, '');
  }

  /** ensure a group is remembered in order (so it survives its notes moving out) */
  remember(g: string) {
    if (g && !this.saved.order.includes(g)) { this.saved.order = [...this.names]; this.persist(); }
  }
}

export const groups = new Groups();
