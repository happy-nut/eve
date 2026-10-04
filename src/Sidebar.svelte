<script lang="ts">
  import { isMobile } from './lib/platform';
  import { hints } from './lib/hints.svelte';
  import { updates } from './lib/updates.svelte';
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { notes, nested, titleOf, CALENDAR, type Note } from './lib/notes.svelte';
  import { isDailyId, DAILY_TEMPLATE_ID, CALENDAR_NOTE_ID } from './lib/daily';
  import { groups, parentOf, leafOf, depthOf, MAX_DEPTH } from './lib/groups.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { ui, hooks, type MenuItem } from './lib/ui.svelte';
  import { importFromFinder, importFromFolder, exportNote, exportCurrent, type ExportAs } from './lib/transfer';
  import Icon from './Icon.svelte';
  import { appearance } from './lib/appearance.svelte';
  import * as moves from './lib/moves';

  let { open = $bindable(true), searchEl = $bindable<HTMLInputElement | null>(null), cmdHeld = false, onSettings, onNew }:
    { open: boolean; searchEl: HTMLInputElement | null; cmdHeld?: boolean; onSettings: () => void; onNew?: () => void } = $props();
  /** ⌘ held: 1…9 badges on the notes in the order shown */
  const jumpNumbers = $derived.by(() => {
    const m = new Map<string, number>();
    if (cmdHeld && !q) groups.visibleOrdered().slice(0, 9).forEach((n, i) => m.set(n.id, i + 1));
    return m;
  });

  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  // daily notes stay out of the tree, but a search still finds them
  // …only while daily notes are on here: off on this device, they are nowhere on it (list, search, widget)
  const hits = $derived([...notes.visible, ...(appearance.s.dailyNotes ? notes.daily : [])].filter((n) => n.body.toLowerCase().includes(q)));

  /**
   * One flat, keyed list of rows (groups, notes, placeholders). A single {#each} lets
   * animate:flip carry a row smoothly to its new place even when it changes group or nesting.
   */
  type Row =
    | { kind: 'group'; key: string; g: string; depth: number }
    | { kind: 'note'; key: string; n: Note; depth: number; kids?: boolean }
    | { kind: 'empty'; key: string; text: string; g: string; depth: number };
  const rows = $derived.by((): Row[] => {
    if (q) return hits.length ? hits.map((n) => ({ kind: 'note', key: n.id, n, depth: 0 })) : [{ kind: 'empty', key: 'empty:search', text: 'No matches', g: '', depth: 0 }];
    const out: Row[] = [];
    // Notes first, above the groups (the daily notes' calendar is one of them: it moves like a note)
    const root = nested(groups.notesIn(''), (id) => groups.isFolded(id));
    // no heading over them: notes outside a group simply come first
    for (const { n, depth, kids } of root) out.push({ kind: 'note', key: n.id, n, depth, kids });

    const walk = (parent: string, depth: number) => {
      for (const g of groups.children(parent)) {
        out.push({ kind: 'group', key: 'g:' + groups.id(g), g, depth });
        if (groups.isCollapsed(g)) continue;
        const own = nested(groups.notesIn(g), (id) => groups.isFolded(id));
        walk(g, depth + 1);
        for (const { n, depth: d, kids } of own) out.push({ kind: 'note', key: n.id, n, depth: depth + 1 + d, kids });
        // an open group with nothing in it says so, rather than looking like it failed to open
        if (!own.length && !groups.children(g).length) out.push({ kind: 'empty', key: 'empty:' + groups.id(g), text: 'No notes', g, depth: depth + 1 });
      }
    };
    walk('', 0);
    return out;
  });

  // ---- "+" menu: new note / new group, relative to the focused row (the app's one menu, Menu.svelte) ----
  let ctxGroup = $state('');
  hooks.openPlus = (anchor?: HTMLElement) => {
    if (ui.menu) { ui.closeMenu(); return; }
    const el = document.activeElement as HTMLElement | null;
    const row = el?.closest<HTMLElement>('[data-row]');
    const r = (anchor ?? row ?? searchEl)?.getBoundingClientRect();
    ctxGroup = row?.dataset.group ?? notes.all.find((n) => n.id === row?.dataset.note)?.group ?? '';
    ui.openMenu(r ? { clientX: r.left + (row && !anchor ? 8 : 0), clientY: r.bottom + 4 } : { clientX: 12, clientY: 40 }, plusItems);
  };
  /** Import / export. A failed export says so instead of doing nothing at all. */
  async function transfer(run: () => Promise<unknown>) {
    try { await run(); } catch (err) { await ui.ask(String(err), false); }
  }
  const opened = (first: Note | null) => { if (first) { ui.focusOwner = 'editor'; notes.currentId = first.id; } };
  const importFiles = () => transfer(async () => opened(await importFromFinder()));
  const importFolder = () => transfer(async () => opened(await importFromFolder()));
  const exportAs = (as: ExportAs) => () => exportCurrent(as);

  const plusItems = $derived.by(() => {
    // a new note goes straight into the editor (deleting keeps focus in the list)
    const newNote = (g: string) => async () => { ui.focusOwner = 'editor'; notes.create('', g); await tick(); document.querySelector<HTMLElement>('.tiptap, .calendar .day.cursor')?.focus(); };
    const items: { label: string; run: () => void; sep?: boolean }[] = [
      { label: ctxGroup ? `New note in “${leafOf(ctxGroup)}”` : 'New note', run: newNote(ctxGroup) },
      { label: ctxGroup && depthOf(ctxGroup) < MAX_DEPTH ? `New group in “${leafOf(ctxGroup)}”` : 'New group', run: () => groups.create(ctxGroup) },
    ];
    if (ctxGroup) items.push({ label: 'New note at top level', run: newNote('') }, { label: 'New group at top level', run: () => groups.create('') });
    if (appearance.s.dailyNotes) items.push({ label: "Today's daily note", run: () => { ui.focusOwner = 'editor'; notes.caretEnd = true; notes.openDaily(); } });
    items.push(
      { label: 'Import files…', run: importFiles, sep: true },
      { label: 'Import folder…', run: importFolder },
      { label: 'Export as Markdown…', run: exportAs('md') },
      { label: 'Export as PDF…', run: exportAs('pdf') },
      { label: 'Export as image…', run: exportAs('png') },
    );
    return items;
  });
  // ---- drag & drop (native HTML5): notes and whole groups ----
  let drag = $state<{ note?: string; group?: string } | null>(null);
  /**
   * where it would land: into a group ('' = root), or before a note / a group. A note dropped on a note
   * row also says under which page (`parent`, '' = a page of its own), as the list shows it; `afterNote`
   * is only for the line drawn under the row it follows, when nothing comes after it.
   */
  let dropAt = $state<{ into?: string; beforeNote?: string; beforeGroup?: string; parent?: string; afterNote?: string } | null>(null);

  function dragStartNote(e: DragEvent, n: Note) {
    drag = { note: n.id };
    e.dataTransfer?.setData('text/plain', n.id);
    e.dataTransfer!.effectAllowed = 'move';
  }
  function dragStartGroup(e: DragEvent, g: string) {
    drag = { group: g };
    e.dataTransfer?.setData('text/plain', 'group:' + g);
    e.dataTransfer!.effectAllowed = 'move';
    e.stopPropagation();
  }
  function allow(e: DragEvent) { e.preventDefault(); e.stopPropagation(); e.dataTransfer!.dropEffect = 'move'; }
  /** empty area of a group / root: drop into it */
  function overSection(e: DragEvent, g: string) {
    if (!drag) return;
    if (drag.group !== undefined && !groups.canPlace(drag.group, g)) { e.stopPropagation(); return; } // don't let an ancestor accept it
    allow(e);
    dropAt = { into: g };
  }
  /**
   * Over a note row: the gap above it or below it, in the order the list shows. Above: before it, beside
   * it. Below: its first sub-page's place when its sub-pages show, else right after it, beside it. So a
   * page lands where the line was drawn, a sub-page included, never into its own sub-pages.
   */
  function overNote(e: DragEvent, n: Note) {
    if (!drag || drag.note === n.id) return;
    if (drag.group !== undefined) { overSection(e, n.group); return; } // groups can't sit between notes
    const inGroup = groups.notesIn(n.group);
    const parentOfNote = (x: Note) => (x.parent && inGroup.some((m) => m.id === x.parent) ? x.parent : '');
    const pagesUnder = (p: string) => inGroup.filter((x) => parentOfNote(x) === p && x.id !== drag?.note);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const below = e.clientY >= r.top + r.height / 2;
    const kids = below && !groups.isFolded(n.id) ? pagesUnder(n.id) : [];
    let at: { parent: string; before: string | null; after?: string };
    if (!below) at = { parent: parentOfNote(n), before: n.id };
    else if (kids.length) at = { parent: n.id, before: kids[0].id };
    else {
      const sibs = pagesUnder(parentOfNote(n));
      const next = sibs[sibs.indexOf(n) + 1];
      at = { parent: parentOfNote(n), before: next?.id ?? null, after: next ? undefined : n.id };
    }
    const mover = drag.note!;
    // the calendar's row is never a sub-page, and a page never goes under its own sub-pages
    if (at.parent && (mover === CALENDAR_NOTE_ID || at.parent === CALENDAR_NOTE_ID || at.parent === mover || notes.isAncestor(mover, at.parent))) return;
    allow(e);
    dropAt = { into: n.group, parent: at.parent, beforeNote: at.before ?? undefined, afterNote: at.after };
  }
  /** over a group header: top third = before it (sibling), else = into it */
  function overGroup(e: DragEvent, g: string) {
    if (!drag || drag.group === g) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = drag.group !== undefined && e.clientY < r.top + r.height * 0.4;
    if (drag.group !== undefined && !groups.canPlace(drag.group, before ? parentOf(g) : g)) { e.stopPropagation(); return; }
    allow(e);
    dropAt = before ? { beforeGroup: g, into: parentOf(g) } : { into: g };
  }
  function drop(e: DragEvent) {
    if (!drag) return; // a file dragged in from Finder belongs to the app's own drop handler
    e.preventDefault(); e.stopPropagation();
    const d = drag, at = dropAt;
    dragEnd();
    if (!d || !at) return;
    const into = at.into ?? '';
    if (!isMobile) hints.show('sidebarMove', 'Move notes from the keyboard: open the list, then ⌥↑↓', shortcuts.keysFor('focusSidebar'));
    if (d.note) {
      groups.remember(into);
      if (at.parent === undefined) notes.move(d.note, into, at.beforeNote ?? null); // into a group, at its end
      else { if (at.parent) groups.unfold(at.parent); notes.place(d.note, into, at.parent, at.beforeNote ?? null); }
    }
    else if (d.group !== undefined) groups.move(d.group, into, at.beforeGroup ?? null);
  }
  function dragEnd() { drag = null; dropAt = null; }

  /**
   * A phone has no mouse to drag with: a long press lifts the row; move the finger and it goes where
   * the mouse would have dropped it (the same overNote / overGroup / drop as above), or let go without
   * moving and the row's menu opens. Auto-scrolls near the top and bottom of the list.
   *
   * The lifted row rides under the finger (a copy, the row itself left faint in its place) and the line
   * says where it will land, so the move is seen while it is made, not only after the finger lifts.
   */
  function touchReorder(tree: HTMLElement) {
    if (!isMobile) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number; row: HTMLElement } | null = null;
    let lifted = false, moved = false, x = 0, y = 0;
    let ghost: HTMLElement | null = null, liftH = 0;
    const lift = (row: HTMLElement) => {
      const li = row.closest<HTMLElement>('li.row');
      if (!li) return;
      const r = li.getBoundingClientRect();
      liftH = r.height;
      ghost = li.cloneNode(true) as HTMLElement;
      ghost.classList.add('lifted');
      Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
      document.body.append(ghost);
      navigator.vibrate?.(12);
    };
    // it rides just above the fingertip: the finger hides neither the row nor the line it points at
    const follow = () => { if (ghost) ghost.style.top = `${y - liftH - 14}px`; };
    const land = () => { ghost?.remove(); ghost = null; };
    const as = (el: HTMLElement) => ({
      clientX: x, clientY: y, currentTarget: el, target: el,
      preventDefault() {}, stopPropagation() {}, dataTransfer: { dropEffect: '' },
    }) as unknown as DragEvent;
    const down = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('[data-row]');
      if (!row || e.touches.length !== 1 || t.closest('.fold, input')) return;
      x = e.touches[0].clientX; y = e.touches[0].clientY;
      start = { x, y, row }; lifted = moved = false;
      timer = setTimeout(() => {
        lifted = true;
        const n = row.dataset.note, g = row.dataset.group;
        lift(row); // copied before the row turns faint
        drag = n ? { note: n } : g !== undefined ? { group: g } : null;
      }, 420);
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      x = e.touches[0].clientX; y = e.touches[0].clientY;
      if (!lifted) {
        if (Math.hypot(x - start.x, y - start.y) > 8) { clearTimeout(timer); start = null; } // a scroll
        return;
      }
      e.preventDefault(); // the list stays put under a lifted row
      if (Math.hypot(x - start.x, y - start.y) > 8) moved = true;
      follow();
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const noteRow = el?.closest<HTMLElement>('.note-row');
      const gname = el?.closest<HTMLElement>('.gname');
      if (noteRow) {
        const id = noteRow.querySelector<HTMLElement>('[data-note]')?.dataset.note;
        const n = notes.all.find((m) => m.id === id);
        if (n) overNote(as(noteRow), n);
      } else if (gname?.dataset.group !== undefined) overGroup(as(gname), gname.dataset.group);
      else if (el && tree.contains(el)) overSection(as(tree), '');
      const r = tree.getBoundingClientRect();
      if (y < r.top + 56) tree.scrollTop -= 14;
      else if (y > r.bottom - 56) tree.scrollTop += 14;
    };
    const up = (e: TouchEvent) => {
      clearTimeout(timer);
      if (!start) return;
      const row = start.row;
      start = null;
      if (!lifted) return; // a tap: the row's own click handles it
      e.preventDefault(); // and no click after a lift
      land();
      if (moved && dropAt) { drop(as(tree)); (document.activeElement as HTMLElement | null)?.blur(); } // no focus ring left behind
      else { dragEnd(); rowMenu(as(row) as unknown as MouseEvent, row); }
    };
    const cancel = () => { clearTimeout(timer); start = null; land(); dragEnd(); };
    tree.addEventListener('touchstart', down, { passive: true });
    tree.addEventListener('touchmove', move, { passive: false });
    tree.addEventListener('touchend', up);
    tree.addEventListener('touchcancel', cancel);
    return {
      destroy() {
        land();
        tree.removeEventListener('touchstart', down);
        tree.removeEventListener('touchmove', move);
        tree.removeEventListener('touchend', up);
        tree.removeEventListener('touchcancel', cancel);
      },
    };
  }

  // ---- keyboard ----
  async function removeGroup(g: string) {
    const n = groups.notesIn(g, true).length, sub = groups.subtree(g).length - 1;
    const extra = [sub ? `${sub} subgroup${sub > 1 ? 's' : ''}` : '', n ? `${n} note${n > 1 ? 's' : ''} (moved out of the group)` : ''].filter(Boolean).join(', ');
    if (await ui.ask(`Delete group “${leafOf(g)}”?${extra ? ` Contains ${extra}.` : ''}`)) groups.remove(g);
  }
  async function removeNote(n: Note) {
    if (n.id === notes.currentId) hints.action('deleteNote', 'Delete the open note');
    if (await ui.ask(`Delete “${titleOf(n)}”?`)) notes.remove(n.id);
  }
  const rowsNow = () => [...document.querySelectorAll<HTMLElement>('aside [data-row]')];
  async function focusRow(sel: string) {
    await tick();
    (document.querySelector<HTMLElement>(`aside ${sel}`) ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus();
  }
  const groupSel = (g: string) => `[data-group="${CSS.escape(g)}"]`;

  // ⌥ + arrows (lib/moves.ts), then the moved row keeps the focus
  function nudgeNote(id: string, dir: 1 | -1) { if (moves.nudgeNote(id, dir)) focusRow(`[data-note="${id}"]`); }
  function nestNote(id: string, dir: 'in' | 'out') {
    const rows = rowsNow();
    const above = rows[rows.findIndex((r) => r.dataset.note === id) - 1]?.dataset.note;
    if (moves.nestNote(id, dir, above)) focusRow(`[data-note="${id}"]`);
  }
  function nudgeGroup(g: string, key: string) { const np = moves.nudgeGroup(g, key); if (np) focusRow(groupSel(np)); }
  function treeKey(e: KeyboardEvent) {
    if (ui.pending) return;
    const rows = rowsNow();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!el || (e.target as HTMLElement).tagName === 'INPUT') return;
    const i = rows.indexOf(el);
    const noteId = el.dataset.note, group = el.dataset.group;
    if (e.altKey && e.key.startsWith('Arrow')) {
      e.preventDefault(); e.stopPropagation();
      if (noteId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) nudgeNote(noteId, e.key === 'ArrowUp' ? -1 : 1);
      else if (noteId) nestNote(noteId, e.key === 'ArrowRight' ? 'in' : 'out');
      else if (group) nudgeGroup(group, e.key);
      return;
    }
    switch (e.key) {
      case ' ': if (group) groups.toggle(group); else if (noteId) groups.fold(noteId); else return; break;
      case 'ArrowDown': rows[i + 1]?.focus(); break;
      case 'ArrowUp': rows[i - 1]?.focus(); break;
      case 'ArrowLeft':
        if (group && !groups.isCollapsed(group)) groups.toggle(group);
        else { const p = group ? parentOf(group) : notes.all.find((n) => n.id === noteId)?.group; if (p) focusRow(groupSel(p)); else return; }
        break;
      // → opens a folded group; anywhere else it steps over into the note, as Escape does
      case 'ArrowRight':
        if (group && groups.isCollapsed(group)) groups.toggle(group);
        else document.querySelector<HTMLElement>('.tiptap, .calendar .day.cursor')?.focus();
        break;
      case 'Backspace': case 'Delete': {
        const nb = rows[i + 1] ?? rows[i - 1];
        const sel = nb?.dataset.note ? `[data-note="${nb.dataset.note}"]` : nb?.dataset.group ? groupSel(nb.dataset.group) : '[data-row]';
        const done = noteId ? removeNote(notes.all.find((n) => n.id === noteId)!) : group ? removeGroup(group) : Promise.resolve();
        done.then(() => focusRow(sel));
        break;
      }
      case 'Enter':
        if (e.altKey) { rowMenu(e, el); return; } // ⌥↩ is the right button, for people who are not holding one
        if (group) { groups.editing = group; break; }
        return;
      case 'i': if (group) pickIcon({ group }); else pickIcon({ note: notes.all.find((n) => n.id === noteId) }); break;
      case 'Escape': document.querySelector<HTMLElement>('.tiptap, .calendar .day.cursor')?.focus(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  // ---- icons (emoji) ----
  async function pickIcon(target: { note?: Note; group?: string }, anchor?: HTMLElement) {
    const current = target.note ? target.note.icon ?? '' : groups.icon(target.group!);
    const el = anchor ?? document.querySelector<HTMLElement>(target.note ? `aside [data-note="${target.note.id}"]` : `aside [data-group="${CSS.escape(target.group!)}"]`);
    const v = await ui.pickEmoji(el ?? new DOMRect(60, 60, 0, 0), current);
    if (v === null) return;
    if (target.note) notes.setIcon(target.note.id, v); else groups.setIcon(target.group!, v);
  }

  /**
   * A row's own export. Markdown is written straight from the note, but a PDF prints the window and a
   * picture is drawn from the note on screen — so those two open the row's note first and let it render.
   */
  async function exportRow(n: Note, as: ExportAs) {
    if (as === 'md') return transfer(() => exportNote(n, as));
    if (notes.currentId !== n.id) {
      await openNote(n);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // painted, not just mounted
    }
    await exportCurrent(as);
  }

  /**
   * Right-click on a row: what the row can do, in one place. Everything here is a command the keyboard
   * already has (⌥↑↓ moves, ⌥←→ nests, ⌫ deletes, `i` picks an icon) — the menu just makes them findable.
   */
  function rowMenu(e: MouseEvent | KeyboardEvent, from?: HTMLElement) {
    const row = from ?? (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!row) return; // empty space below the list: nothing of its own to offer
    e.preventDefault();
    e.stopPropagation();
    row.focus();
    ui.focusOwner = 'sidebar';
    const g = row.dataset.group;
    const n = row.dataset.note ? notes.all.find((x) => x.id === row.dataset.note) : undefined;
    if (n?.id === CALENDAR_NOTE_ID) return; // the calendar's row has nothing to offer but moving (drag, ⌥↑↓)
    const items: MenuItem[] = g
      ? [
          { label: `New note in “${leafOf(g)}”`, run: () => { ui.focusOwner = 'editor'; notes.create('', g); } },
          { label: 'New group inside', run: () => groups.create(g), hide: depthOf(g) >= MAX_DEPTH },
          { label: 'Rename', sep: true, run: () => (groups.editing = g) },
          { label: 'Change icon…', run: () => pickIcon({ group: g }) },
          { label: 'Move up', sep: true, run: () => nudgeGroup(g, 'ArrowUp') },
          { label: 'Move down', run: () => nudgeGroup(g, 'ArrowDown') },
          { label: 'Move out', run: () => nudgeGroup(g, 'ArrowLeft'), hide: !parentOf(g) },
          { label: 'Nest under previous', run: () => nudgeGroup(g, 'ArrowRight'), hide: !groups.prevSibling(g) },
          { label: 'Delete group', sep: true, danger: true, run: () => removeGroup(g) },
        ]
      : n
        ? [
            { label: 'Open', run: () => openNote(n) },
            { label: 'Change icon…', run: () => pickIcon({ note: n }) },
            { label: 'Export as Markdown…', sep: true, keys: shortcuts.keysFor('exportMd'), run: () => exportRow(n, 'md') },
            { label: 'Export as PDF…', keys: shortcuts.keysFor('exportPdf'), run: () => exportRow(n, 'pdf') },
            { label: 'Export as image…', keys: shortcuts.keysFor('exportPng'), run: () => exportRow(n, 'png') },
            { label: 'Move up', sep: true, run: () => nudgeNote(n.id, -1) },
            { label: 'Move down', run: () => nudgeNote(n.id, 1) },
            { label: 'Nest under previous', run: () => nestNote(n.id, 'in') },
            { label: 'Move out', run: () => nestNote(n.id, 'out'), hide: !n.parent },
            { label: 'Delete note', sep: true, danger: true, run: () => removeNote(n) },
          ]
        : [];
    // from the keyboard there is no pointer to open at: the row's own corner stands in for one
    const box = row.getBoundingClientRect();
    const at = 'clientX' in e && e.clientX ? e : { clientX: Math.round(box.left + 12), clientY: Math.round(box.bottom) };
    if (items.length) ui.openMenu(at, items);
  }

  // ---- rename ----
  function renameKey(e: KeyboardEvent, g: string) {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
    if (e.key === 'Escape') { groups.editing = null; focusRow(groupSel(g)); }
    e.stopPropagation();
  }
  function finishRename(g: string, value: string) {
    if (groups.editing !== g) return; // Esc already handled
    focusRow(groupSel(groups.rename(g, value)));
  }
  const focusInput = (el: HTMLInputElement) => { el.focus(); el.select(); };

  // ---- misc ----
  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { query = ''; searchEl?.blur(); e.preventDefault(); }
    if (e.key === 'Enter' && hits[0]) { notes.currentId = hits[0].id; searchEl?.blur(); e.preventDefault(); }
  }
  /**
   * On a phone the list is a drawer: it slides in from the left and out again, and a swipe to the left
   * takes it away, following the finger (only when there is a note to go back to). The desktop keeps
   * its sideways fold.
   */
  let pull = $state(0); // px the drawer is pulled left, while a finger holds it
  let leaving = $state(false); // let go far enough: sliding the rest of the way out
  // before the drawer mounts again: its slide-in and its style must not see the last swipe's "leaving"
  $effect.pre(() => { if (open) leaving = false; });
  let touch: { x: number; y: number; axis: '' | 'x' | 'y' } | null = null;
  function drawer(node: HTMLElement) {
    if (!isMobile) return slide(node, { axis: 'x', duration: 220, easing: cubicOut });
    if (leaving) return { duration: 0 }; // already swiped off-screen
    return { duration: 240, easing: cubicOut, css: (t: number) => `transform: translateX(${(t - 1) * 100}%)` };
  }
  function pullStart(e: TouchEvent) {
    if (!isMobile || !notes.current || e.touches.length !== 1) return;
    if ((e.target as HTMLElement).closest('input, .fab, .menu')) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: '' };
  }
  function pullMove(e: TouchEvent) {
    if (!touch) return;
    const dx = e.touches[0].clientX - touch.x, dy = e.touches[0].clientY - touch.y;
    if (!touch.axis && Math.hypot(dx, dy) > 10) touch.axis = Math.abs(dx) > Math.abs(dy) * 1.4 && dx < 0 ? 'x' : 'y';
    if (touch.axis === 'x') pull = Math.min(0, dx);
  }
  function pullEnd(e: TouchEvent) {
    if (!touch) return;
    const far = pull < -Math.min(90, (e.currentTarget as HTMLElement).offsetWidth * 0.25);
    touch = null;
    // not far enough: it springs back (the inline style drops, the CSS eases it). Far enough: the rest
    // of the way out from where the finger let go, then gone without a second animation. Both through
    // the style binding: a style set by hand here would be wiped by the binding's next update.
    if (far) { leaving = true; setTimeout(() => (open = false), 180); }
    pull = 0;
  }
  const drawerStyle = $derived(
    leaving ? 'transform: translateX(-100%); transition: transform 0.18s ease-out'
    : pull ? `transform: translateX(${pull}px); transition: none` : undefined);

  const syncLabel = $derived(sync.enabled ? (sync.status === 'error' ? 'sync error' : sync.status === 'syncing' ? 'syncing…' : 'synced') : 'local only');
  // a gear that reads as settings at a glance (the Lucide "settings" outline)
  const GEAR = '<svg class="gear-i" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

  /** click or Enter on a note: open it and move into the editor */
  /** the daily notes' calendar, in the editor's place */
  async function openCalendar() {
    notes.currentId = CALENDAR;
    if (isMobile) { open = false; return; }
    await tick();
    document.querySelector<HTMLElement>('.calendar .day.cursor')?.focus(); // arrows move through the days from here
  }
  /** the calendar, or one of its days or its template, is what the editor shows */
  const onCalendar = $derived(notes.currentId === CALENDAR || !!(notes.current && (isDailyId(notes.current.id) || notes.current.id === DAILY_TEMPLATE_ID)));
  async function openNote(n: Note) {
    if (n.id === CALENDAR_NOTE_ID) return openCalendar(); // the calendar's row opens the calendar
    const list = groups.ordered(), from = list.findIndex((x) => x.id === notes.currentId), to = list.findIndex((x) => x.id === n.id);
    if (from >= 0 && to === from + 1) hints.action('nextNote', 'The next note is a key away');
    else if (from >= 0 && to === from - 1) hints.action('prevNote', 'The previous note is a key away');
    ui.focusOwner = 'editor';
    notes.currentId = n.id;
    moves.openedFromList.id = n.id; // ⌥↑ / ⌥↓ right after still move it here
    if (isMobile) { open = false; return; } // a phone shows the list or the note, never both — and opens it to read
    await tick();
    document.querySelector<HTMLElement>('.tiptap, .calendar .day.cursor')?.focus();
  }
</script>

{#if open}
{#snippet updateBanner()}
  <!-- a newer Eve on the phone: one tap downloads it and opens Android's installer -->
  <div class="update">
    <span class="utext"><b>Eve {updates.available?.version}</b>
      <span class="usub">{updates.doing || 'A new version is ready'}</span></span>
    <button class="ubtn" disabled={updates.busy} onclick={() => updates.install()}>
      {#if updates.busy}<span class="uspin" aria-hidden="true"></span>{/if}Update
    </button>
  </div>
{/snippet}
  <aside transition:drawer style={drawerStyle}
    ontouchstart={pullStart} ontouchmove={pullMove} ontouchend={pullEnd} ontouchcancel={pullEnd}>
    {#if isMobile}
      <!-- a phone: the title, then sync and settings up here, so nothing sits over the bottom of the list -->
      <div class="mtop">
        <h1 class="mtitle">Eve</h1>
        <span class="sync {sync.status}">{syncLabel}</span>
        <button class="icon gear" aria-label="Settings" onclick={onSettings}>{@html GEAR}</button>
      </div>
    {/if}
    {#if isMobile && updates.available}{@render updateBanner()}{/if}
    <div class="top" data-tauri-drag-region>
      <input bind:this={searchEl} bind:value={query} onkeydown={onSearchKey}
        onmousedown={() => { if (document.activeElement !== searchEl) hints.action('search', 'Search from anywhere'); }}
        placeholder={isMobile ? 'Search' : `Search  ${prettyKeys(shortcuts.keysFor('search'))}`} spellcheck="false" />
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul class="tree" role="tree" tabindex="-1" onkeydown={treeKey} use:touchReorder
      oncontextmenu={(e) => { if (isMobile) e.preventDefault(); else rowMenu(e); }}
      ondragover={(e) => overSection(e, '')} ondrop={drop}>
      {#each rows as r (r.key)}
        <li animate:flip={{ duration: 220, easing: cubicOut }} in:fade={{ duration: 140 }} out:slide={{ duration: 180, easing: cubicOut }}
          class="row {r.kind}" style="--d: {'depth' in r ? r.depth : 0}"
          class:over={r.kind !== 'note' && dropAt?.into === r.g && !dropAt.beforeNote && !dropAt.beforeGroup}
          class:drop-before={(r.kind === 'note' && dropAt?.beforeNote === r.n.id) || (r.kind === 'group' && dropAt?.beforeGroup === r.g)}
          class:drop-after={r.kind === 'note' && dropAt?.afterNote === r.n.id}
          class:dragging={(r.kind === 'note' && drag?.note === r.n.id) || (r.kind === 'group' && drag?.group === r.g)}>

          {#if r.kind === 'note'}
            {@const n = r.n}
            <div class="note-row" class:collapsed={groups.isFolded(n.id)} draggable={!isMobile} ondragstart={(e) => dragStartNote(e, n)} ondragend={dragEnd}
              ondragover={(e) => overNote(e, n)} ondrop={drop} role="presentation">
              <button data-row data-note={n.id} class:active={n.id === CALENDAR_NOTE_ID ? onCalendar : n.id === notes.currentId} onclick={() => openNote(n)}>
                <span class="title">
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <span class="ico-slot" role="button" tabindex="-1" data-tip="Change icon" onclick={(e) => { e.stopPropagation(); pickIcon({ note: n }, e.currentTarget); }}>
                    {#if jumpNumbers.has(n.id)}<span class="num">{jumpNumbers.get(n.id)}</span>
                    {:else if n.icon}<Icon icon={n.icon} />{:else}
                    <svg class="ico" viewBox="0 0 16 16"><path d="M4 1.5h5l3.5 3.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5M5.5 8.5h5M5.5 11h5"/></svg>{/if}
                  </span>
                  <span class="t">{titleOf(n)}</span>
                </span>
              </button>
              <!-- unfolds on hover, like a group's tools; the fold chevron keeps its place at the edge -->
              {#if n.id !== CALENDAR_NOTE_ID}
              <span class="tools">
                <button class="icon mini tip-right" data-tip="Delete note" onclick={() => removeNote(n)}>×</button>
              </span>
              {/if}
              {#if r.kids}
                <button class="icon mini fold tip-right" aria-label={groups.isFolded(n.id) ? 'Expand' : 'Collapse'}
                  data-tip={groups.isFolded(n.id) ? 'Expand' : 'Collapse'} onclick={() => groups.fold(n.id)}>
                  <svg class="chev" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              {/if}
            </div>

          {:else if r.kind === 'group'}
            {@const g = r.g}
            <div class="ghead" class:collapsed={groups.isCollapsed(g)}>
              {#if groups.editing === g}
                <input class="rename" value={leafOf(g)} use:focusInput onkeydown={(e) => renameKey(e, g)}
                  onblur={(e) => finishRename(g, e.currentTarget.value)} spellcheck="false" />
              {:else}
                <button class="gname" data-row data-group={g} draggable={!isMobile}
                  ondragstart={(e) => dragStartGroup(e, g)} ondragend={dragEnd} ondragover={(e) => overGroup(e, g)} ondrop={drop}
                  onclick={() => groups.toggle(g)}>
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <span class="ico-slot" role="button" tabindex="-1" data-tip="Change icon" onclick={(e) => { e.stopPropagation(); pickIcon({ group: g }, e.currentTarget); }}>
                    {#if groups.icon(g)}<Icon icon={groups.icon(g)} />{:else}
                    <svg class="ico" viewBox="0 0 16 16"><path d="M1.5 4.5v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5H2.5a1 1 0 0 0-1 1z"/></svg>{/if}
                  </span>
                  <!-- double-click exactly on the name renames; anywhere else on the row just folds -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span class="t" ondblclick={(e) => { e.stopPropagation(); groups.editing = g; }}>{leafOf(g)}</span>
                </button>
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <span class="tail" role="presentation" onclick={() => groups.toggle(g)}>
                  <span class="count">{groups.notesIn(g, true).length}</span>
                </span>
                <!-- on hover the tools unfold between the count and the chevron; the chevron stays at the edge -->
                <span class="tools">
                  <button class="icon mini tip-right" data-tip="New note here" onclick={async () => { ui.focusOwner = 'editor'; notes.create('', g); await tick(); document.querySelector<HTMLElement>('.tiptap, .calendar .day.cursor')?.focus(); }}>+</button>
                  <button class="icon mini tip-right" data-tip="Delete group" onclick={() => removeGroup(g)}>×</button>
                </span>
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <button class="icon mini fold tip-right" aria-label={groups.isCollapsed(g) ? 'Expand' : 'Collapse'} data-tip={groups.isCollapsed(g) ? 'Expand' : 'Collapse'} onclick={() => groups.toggle(g)}><svg class="chev" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg></button>
              {/if}
            </div>

          {:else}
            <div class="empty" role="presentation" ondragover={(e) => overSection(e, r.g)} ondrop={drop}>{r.text}</div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if isMobile && onNew}
      <button class="fab" aria-label="New note" onclick={onNew}><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg></button>
    {/if}
    {#if !isMobile}
    <footer>
      <span class="sync {sync.status}" title={sync.error || (sync.enabled ? 'Synced' : 'Sync off')}>
        {syncLabel}
      </span>
      <!-- a newer Eve: one button by Settings installs it and restarts; what it is doing shows on hover -->
      {#if updates.available}
        <button class="icon tip-up gear upd" class:failed={updates.state === 'error'} aria-label="Update Eve"
          data-tip={updates.doing || `Update to Eve ${updates.available.version}`} disabled={updates.busy} onclick={() => updates.install()}>
          {#if updates.busy}<span class="uspin" aria-hidden="true"></span>
          {:else}<svg class="gear-i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v8.5M8.5 12.5 12 16l3.5-3.5"/></svg>{/if}
        </button>
      {/if}
      <button class="icon tip-up gear" aria-label="Settings" data-tip="Settings" data-keys={shortcuts.keysFor('settings')} onclick={onSettings}>
        <svg class="gear-i" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
    </footer>
    {/if}
  </aside>
{/if}

<style>
  aside {
    width: 260px; flex: none; display: flex; flex-direction: column;
    background: var(--bg-side); border-right: 1px solid var(--line); overflow: hidden;
  }
  .top { display: flex; gap: 4px; padding: 50px 16px 8px; } /* toolbar bottom (34) + 16 */
  .top input {
    flex: 1; min-width: 0; border: 0; border-radius: 6px; padding: 6px 8px;
    background: var(--bg-input); color: inherit; font: inherit; font-size: 13px; outline: none; transition: box-shadow 0.15s;
  }
  .top input:focus { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); }

  .tree { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 10px 8px; margin: 0; list-style: none; }
  .row { position: relative; padding-left: calc(var(--d) * 18px); border-radius: 6px; transition: opacity 0.15s, background 0.15s, box-shadow 0.15s; }
  .row.dragging { opacity: 0.4; }
  .row.over { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent); }
  .ico { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; opacity: 0.75; }
  .ico-slot { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: none; border-radius: 4px; transition: background 0.12s; }
  .ico-slot:hover { background: var(--bg-active); }
  .emoji { font-size: 13px; line-height: 1; }
  .num {
    width: 16px; height: 16px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
    animation: num-in 0.25s ease-out;
  }
  @keyframes num-in { from { opacity: 0; } }

  .ghead { position: relative; display: flex; align-items: center; padding: 1px 2px 1px 0; border-radius: 6px; transition: background 0.12s; }
  /* keyboard cursor colours the whole header row (not just the name button) */
  .ghead:focus-within { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  /* + and × unfold between the count and the chevron on hover; the chevron never moves */
  .tools { display: flex; gap: 2px; width: 0; opacity: 0; overflow: hidden; transform: translateX(6px);
    transition: width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.16s, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .ghead:hover .tools, .tools:focus-within { width: 46px; opacity: 1; transform: none; }
  .note-row:hover .tools, .note-row .tools:focus-within { width: 22px; opacity: 1; transform: none; }
  .tools .icon.mini, .fold { width: 22px; height: 22px; font-size: 14px; flex: none; }
  .fold { margin-left: 2px; }
  .tail { display: flex; align-items: center; cursor: default; }
  .gname {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px;
    border: 0; background: none; color: var(--fg); font: inherit; font-size: 13px; font-weight: 600;
    padding: 4px 6px; border-radius: 6px; text-align: left; white-space: nowrap; overflow: hidden;
  }
  .gname .t { overflow: hidden; text-overflow: ellipsis; }
  /* disclosure chevron lives on the right, so group icons sit flush left and notes indent just one column */
  /* an SVG, not a "›" glyph: text glyphs sit off-centre in their box, which shows once rotated */
  .fold { display: inline-flex; align-items: center; justify-content: center; }
  .chev { display: block; width: 14px; height: 14px; fill: none; stroke: var(--fg-dim); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1); transform: rotate(90deg); }
  .collapsed .chev { transform: rotate(0deg); }
  .count { font-weight: 500; font-size: 11px; color: var(--fg-dim); padding: 0 2px 0 6px; }
  .rename {
    flex: 1; min-width: 0; font: inherit; font-size: 12.5px; padding: 3px 6px; border-radius: 4px;
    border: 1px solid var(--accent); background: var(--bg-input); color: var(--fg); outline: none; box-shadow: var(--glow);
  }

  .empty { padding: 5px 10px; font-size: 11.5px; color: var(--fg-dim); opacity: 0.7; }

  .row.drop-before::before, .row.drop-after::after {
    content: ''; position: absolute; left: calc(var(--d) * 18px); right: 8px; top: -1px; height: 2px; border-radius: 1px;
    background: var(--accent); box-shadow: var(--glow); pointer-events: none; z-index: 1;
  }
  .row.drop-after::after { top: auto; bottom: -1px; }
  .note-row { display: flex; align-items: center; }
  .note-row > button:first-child {
    flex: 1; min-width: 0; text-align: left; border: 0; background: none; color: inherit; font: inherit;
    padding: 5px 6px; border-radius: 6px; display: flex; flex-direction: column;
    cursor: default; transition: background 0.12s, transform 0.12s;
  }
  .note-row > button:first-child:hover { background: var(--bg-hover); }
  .note-row > button:first-child:active { transform: scale(0.985); }
  .note-row > button.active { background: var(--bg-active); }
  /* Keyboard cursor: the row's own background, and it appears at once. The rows fade their background
     over 0.12s, which a held arrow key never gives them — focus moved on before the colour arrived, so
     the list looked unmarked while scrolling through it. A group row had no focus colour at all. */
  .note-row > [data-row]:focus, .gname:focus {
    outline: none; transition: none; background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .note-row > button.active:focus { transition: none; background: color-mix(in srgb, var(--accent) 24%, var(--bg-active)); }
  .title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; min-width: 0; width: 100%; }
  .title .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .gear { width: 28px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
  .gear svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
  .update {
    display: flex; align-items: center; gap: 12px; margin: 4px 16px 10px; padding: 10px 10px 10px 14px; border-radius: 14px;
    background: var(--accent-soft); color: var(--fg);
  }
  .utext { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 15px; }
  .usub { font-size: 13px; color: var(--fg-dim); }
  .ubtn { flex: none; border: 0; border-radius: 10px; padding: 9px 16px; background: var(--accent); color: #fff; font: inherit; font-size: 15px; font-weight: 600; }
  .ubtn:disabled { opacity: 0.85; }
  /* the Mac's sidebar is 13px type: the same banner, smaller */
  /* the Mac's update: an icon in the footer, in the accent colour so it is noticed */
  .upd { margin-left: auto; color: var(--accent); }
  .upd.failed { color: #ff453a; }
  .upd .uspin { margin: 0; border-color: var(--accent-soft); border-top-color: var(--accent); }
  :global(.gear-i) { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px 8px 18px; font-size: 11.5px; color: var(--fg-dim); border-top: 1px solid var(--line);
  }
  .sync::before {
    content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px;
    background: var(--fg-dim); transition: background 0.3s;
  }
  .sync.ok::before { background: var(--accent); box-shadow: var(--glow); }
  .sync.error::before { background: #ff453a; }
  .sync.syncing::before { background: var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  /* downloading: the button spins, so a slow download never looks like a tap that did nothing */
  .uspin {
    display: inline-block; width: 13px; height: 13px; margin: 0 7px -2px 0; border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.45); border-top-color: #fff; animation: uspin 0.7s linear infinite;
  }
  @keyframes uspin { to { transform: rotate(360deg); } }
</style>
