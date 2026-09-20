<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, slide, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { notes, nested, titleOf, type Note } from './lib/notes.svelte';
  import { groups, parentOf, leafOf, depthOf, MAX_DEPTH } from './lib/groups.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { ui, hooks, type MenuItem } from './lib/ui.svelte';
  import { importFromFinder, importFromFolder, exportNote, type ExportAs } from './lib/transfer';
  import Icon from './Icon.svelte';

  let { open = $bindable(true), searchEl = $bindable<HTMLInputElement | null>(null), cmdHeld = false, onSettings }:
    { open: boolean; searchEl: HTMLInputElement | null; cmdHeld?: boolean; onSettings: () => void } = $props();
  /** ⌘ held: 1…9 badges on the notes in the order shown */
  const jumpNumbers = $derived.by(() => {
    const m = new Map<string, number>();
    if (cmdHeld && !q) groups.visibleOrdered().slice(0, 9).forEach((n, i) => m.set(n.id, i + 1));
    return m;
  });

  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const hits = $derived(notes.visible.filter((n) => n.body.toLowerCase().includes(q)));

  /**
   * One flat, keyed list of rows (groups, notes, labels, placeholders). A single {#each} lets
   * animate:flip carry a row smoothly to its new place even when it changes group or nesting.
   */
  type Row =
    | { kind: 'group'; key: string; g: string; depth: number }
    | { kind: 'note'; key: string; n: Note; depth: number; kids?: boolean }
    | { kind: 'label'; key: string; text: string; g: string }
    | { kind: 'empty'; key: string; text: string; g: string; depth: number };
  const rows = $derived.by((): Row[] => {
    if (q) return hits.length ? hits.map((n) => ({ kind: 'note', key: n.id, n, depth: 0 })) : [{ kind: 'empty', key: 'empty:search', text: 'No matches', g: '', depth: 0 }];
    const out: Row[] = [];
    const walk = (parent: string, depth: number) => {
      for (const g of groups.children(parent)) {
        out.push({ kind: 'group', key: 'g:' + groups.id(g), g, depth });
        if (groups.isCollapsed(g)) continue;
        const own = nested(groups.notesIn(g), (id) => groups.isFolded(id));
        walk(g, depth + 1);
        for (const { n, depth: d, kids } of own) out.push({ kind: 'note', key: n.id, n, depth: depth + 1 + d, kids });
      }
    };
    walk('', 0);
    const root = nested(groups.notesIn(''), (id) => groups.isFolded(id));
    if (groups.names.length) out.push({ kind: 'label', key: 'label:root', text: 'Notes', g: '' });
    for (const { n, depth, kids } of root) out.push({ kind: 'note', key: n.id, n, depth, kids });
    if (!root.length) out.push({ kind: 'empty', key: 'empty:root', text: 'No notes', g: '', depth: 0 });
    return out;
  });

  // ---- "+" dropdown: new note / new group, relative to the focused row ----
  let plusOpen = $state(false);
  let ctxGroup = $state('');
  let plusFrom: HTMLElement | null = null; // row that had focus when the menu opened
  let plusStyle = $state(''); // anchored under the focused row (⌘N) or under the toolbar + button
  hooks.openPlus = (anchor?: HTMLElement) => {
    if (plusOpen) { plusOpen = false; return; }
    const el = document.activeElement as HTMLElement | null;
    const row = el?.closest<HTMLElement>('[data-row]');
    plusFrom = row ?? null;
    const r = (anchor ?? row ?? searchEl)?.getBoundingClientRect();
    plusStyle = r ? `left: ${r.left + (row && !anchor ? 8 : 0)}px; top: ${r.bottom + 4}px;` : 'left: 12px; top: 40px;';
    ctxGroup = row?.dataset.group ?? notes.all.find((n) => n.id === row?.dataset.note)?.group ?? '';
    plusOpen = true;
  };
  function closePlus() {
    plusOpen = false;
    (plusFrom?.isConnected ? plusFrom : document.querySelector<HTMLElement>('aside [data-row]'))?.focus();
    ui.focusOwner = 'sidebar';
  }
  /** Import / export. A failed export says so instead of doing nothing at all. */
  async function transfer(run: () => Promise<unknown>) {
    try { await run(); } catch (err) { await ui.ask(String(err), false); }
  }
  const opened = (first: Note | null) => { if (first) { ui.focusOwner = 'editor'; notes.currentId = first.id; } };
  const importFiles = () => transfer(async () => opened(await importFromFinder()));
  const importFolder = () => transfer(async () => opened(await importFromFolder()));
  const exportAs = (as: ExportAs) => () => transfer(async () => {
    const n = notes.current;
    if (n) await exportNote(n, as, hooks.noteHtml ?? (() => ''));
  });

  const plusItems = $derived.by(() => {
    // a new note goes straight into the editor (deleting keeps focus in the list)
    const newNote = (g: string) => async () => { ui.focusOwner = 'editor'; notes.create('', g); await tick(); document.querySelector<HTMLElement>('.tiptap')?.focus(); };
    const items: { label: string; run: () => void; sep?: boolean }[] = [
      { label: ctxGroup ? `New note in “${leafOf(ctxGroup)}”` : 'New note', run: newNote(ctxGroup) },
      { label: ctxGroup && depthOf(ctxGroup) < MAX_DEPTH ? `New group in “${leafOf(ctxGroup)}”` : 'New group', run: () => groups.create(ctxGroup) },
    ];
    if (ctxGroup) items.push({ label: 'New note at top level', run: newNote('') }, { label: 'New group at top level', run: () => groups.create('') });
    items.push(
      { label: 'Import files…', run: importFiles, sep: true },
      { label: 'Import folder…', run: importFolder },
      { label: 'Export as Markdown…', run: exportAs('md') },
      { label: 'Export as PDF…', run: exportAs('pdf') },
      { label: 'Export as image…', run: exportAs('png') },
    );
    return items;
  });
  function plusPick(i: number) { plusOpen = false; plusItems[i].run(); }
  function plusKey(e: KeyboardEvent) {
    const items = [...document.querySelectorAll<HTMLElement>('.plus-menu button')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === 'Escape') closePlus();
    else return;
    e.preventDefault(); e.stopPropagation();
  }
  const autofocus = (el: HTMLElement) => el.focus();
  /** keep the keyboard where it is: a press that moves focus out of the menu closes it mid-click */
  function hold(e: MouseEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
  }

  // ---- drag & drop (native HTML5): notes and whole groups ----
  let drag = $state<{ note?: string; group?: string } | null>(null);
  /** where it would land: into a group ('' = root), or before a note / a group */
  let dropAt = $state<{ into?: string; beforeNote?: string; beforeGroup?: string } | null>(null);

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
  /** over a note row: before / after it (same group) */
  function overNote(e: DragEvent, n: Note) {
    if (!drag || drag.note === n.id) return;
    const list = groups.notesIn(n.group);
    if (drag.group !== undefined) { overSection(e, n.group); return; } // groups can't sit between notes
    allow(e);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    const i = list.findIndex((x) => x.id === n.id);
    const target = before ? n : list[i + 1];
    dropAt = target ? { beforeNote: target.id, into: n.group } : { into: n.group };
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
    if (d.note) { groups.remember(into); notes.move(d.note, into, at.beforeNote ?? null); }
    else if (d.group !== undefined) groups.move(d.group, into, at.beforeGroup ?? null);
  }
  function dragEnd() { drag = null; dropAt = null; }

  // ---- keyboard ----
  async function removeGroup(g: string) {
    const n = groups.notesIn(g, true).length, sub = groups.subtree(g).length - 1;
    const extra = [sub ? `${sub} subgroup${sub > 1 ? 's' : ''}` : '', n ? `${n} note${n > 1 ? 's' : ''} (moved to Notes)` : ''].filter(Boolean).join(', ');
    if (await ui.ask(`Delete group “${leafOf(g)}”?${extra ? ` Contains ${extra}.` : ''}`)) groups.remove(g);
  }
  async function removeNote(n: Note) {
    if (await ui.ask(`Delete “${titleOf(n)}”?`)) notes.remove(n.id);
  }
  const rowsNow = () => [...document.querySelectorAll<HTMLElement>('aside [data-row]')];
  async function focusRow(sel: string) {
    await tick();
    (document.querySelector<HTMLElement>(`aside ${sel}`) ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus();
  }
  const groupSel = (g: string) => `[data-group="${CSS.escape(g)}"]`;

  /**
   * Every spot the moving note could take, in the order the sidebar stacks them: before each page,
   * inside an unfolded page as a sub-page, at the end of each list, and on through the groups. ⌥↑ / ⌥↓
   * step through this list, so a page slides *into* the one above instead of hopping over it.
   */
  type NoteSlot = { group: string; parent: string; before: string | null };
  function noteSlots(me: Note): NoteSlot[] {
    const out: NoteSlot[] = [];
    const pages = (group: string, parent: string) => {
      for (const p of notes.visible) {
        if (p.group !== group || (p.parent ?? '') !== parent) continue;
        if (p.id === me.id || notes.isAncestor(me.id, p.id)) continue; // itself and its own sub-pages
        out.push({ group, parent, before: p.id });
        if (!groups.isFolded(p.id)) pages(group, p.id); // an open page can take it in
      }
      out.push({ group, parent, before: null });
    };
    const walk = (g: string) => {
      for (const c of groups.children(g)) if (!groups.isCollapsed(c)) walk(c); // subgroups first, as the tree shows them
      pages(g, '');
    };
    walk('');
    return out;
  }

  /** ⌥↑ / ⌥↓ on a note: one slot up/down — past a page, into it, or on into the next group. */
  function nudgeNote(id: string, dir: 1 | -1) {
    const me = notes.all.find((n) => n.id === id);
    if (!me) return;
    const list = noteSlots(me);
    const sibs = notes.visible.filter((n) => n.group === me.group && (n.parent ?? '') === (me.parent ?? ''));
    const i = sibs.findIndex((n) => n.id === id);
    const at = list.findIndex((s) => s.group === me.group && s.parent === (me.parent ?? '') && s.before === (sibs[i + 1]?.id ?? null));
    const t = list[at + dir];
    if (at < 0 || !t) return;
    if (t.parent) groups.unfold(t.parent); // show where it landed
    notes.place(id, t.group, t.parent, t.before);
    focusRow(`[data-note="${id}"]`);
  }

  /** ⌥→ tucks a note under the one above it (a sub-page); ⌥← lifts it back out to its parent's level. */
  function nestNote(id: string, dir: 'in' | 'out') {
    const me = notes.all.find((n) => n.id === id);
    if (!me) return;
    if (dir === 'out') {
      const parent = me.parent ? notes.all.find((n) => n.id === me.parent) : null;
      if (!parent) return;
      notes.setParent(id, parent.parent ?? null);
    } else {
      const rows = rowsNow();
      const above = rows[rows.findIndex((r) => r.dataset.note === id) - 1]?.dataset.note;
      // only a page of the same group can take it in, and never one of its own sub-pages
      const host = above && notes.all.find((n) => n.id === above);
      if (!host || host.group !== me.group || host.id === me.parent || notes.isAncestor(id, host.id)) return;
      groups.unfold(host.id);
      notes.setParent(id, host.id);
    }
    focusRow(`[data-note="${id}"]`);
  }

  /**
   * ⌥↑ / ⌥↓ walk a group through every visible slot in outline order — past siblings, out of its
   * parent, into (expanded) groups above — like dragging it one row at a time. Collapsed groups are
   * skipped as targets and the moved group keeps its own fold state. ⌥← / ⌥→ un-nest / nest directly.
   */
  type Slot = { parent: string; before: string | null };
  function slots(g: string, parent: string): Slot[] {
    const out: Slot[] = [];
    for (const c of groups.children(parent)) {
      if (c === g) continue;
      out.push({ parent, before: c });
      if (!groups.isCollapsed(c) && groups.canPlace(g, c)) out.push(...slots(g, c));
    }
    out.push({ parent, before: null });
    return out.filter((s) => groups.canPlace(g, s.parent));
  }
  function nudgeGroup(g: string, key: string) {
    let np: string | null = null;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const list = slots(g, '');
      const cur: Slot = { parent: parentOf(g), before: groups.nextSibling(g) };
      const i = list.findIndex((s) => s.parent === cur.parent && s.before === cur.before);
      const t = list[i + (key === 'ArrowDown' ? 1 : -1)];
      if (t) np = groups.move(g, t.parent, t.before);
    }
    if (key === 'ArrowLeft' && parentOf(g)) { const par = parentOf(g); np = groups.move(g, parentOf(par), groups.nextSibling(par)); }
    if (key === 'ArrowRight') { const prev = groups.prevSibling(g); if (prev) np = groups.move(g, prev, null); }
    if (np) focusRow(groupSel(np));
  }
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
      case 'ArrowRight': if (group && groups.isCollapsed(group)) groups.toggle(group); else return; break;
      case 'Backspace': case 'Delete': {
        const nb = rows[i + 1] ?? rows[i - 1];
        const sel = nb?.dataset.note ? `[data-note="${nb.dataset.note}"]` : nb?.dataset.group ? groupSel(nb.dataset.group) : '[data-row]';
        const done = noteId ? removeNote(notes.all.find((n) => n.id === noteId)!) : group ? removeGroup(group) : Promise.resolve();
        done.then(() => focusRow(sel));
        break;
      }
      case 'Enter': if (group) { groups.editing = group; break; } return;
      case 'i': if (group) pickIcon({ group }); else pickIcon({ note: notes.all.find((n) => n.id === noteId) }); break;
      case 'Escape': document.querySelector<HTMLElement>('.tiptap')?.focus(); break;
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
   * Right-click on a row: what the row can do, in one place. Everything here is a command the keyboard
   * already has (⌥↑↓ moves, ⌥←→ nests, ⌫ deletes, `i` picks an icon) — the menu just makes them findable.
   */
  function rowMenu(e: MouseEvent) {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!row) return; // empty space below the list: nothing of its own to offer
    e.preventDefault();
    e.stopPropagation();
    row.focus();
    ui.focusOwner = 'sidebar';
    const g = row.dataset.group;
    const n = row.dataset.note ? notes.all.find((x) => x.id === row.dataset.note) : undefined;
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
            { label: 'Export as Markdown…', sep: true, run: () => transfer(() => exportNote(n, 'md', hooks.noteHtml ?? (() => ''))) },
            { label: 'Move up', sep: true, run: () => nudgeNote(n.id, -1) },
            { label: 'Move down', run: () => nudgeNote(n.id, 1) },
            { label: 'Nest under previous', run: () => nestNote(n.id, 'in') },
            { label: 'Move out', run: () => nestNote(n.id, 'out'), hide: !n.parent },
            { label: 'Delete note', sep: true, danger: true, run: () => removeNote(n) },
          ]
        : [];
    if (items.length) ui.openMenu(e, items);
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
  /** click or Enter on a note: open it and move into the editor */
  async function openNote(n: Note) {
    ui.focusOwner = 'editor';
    notes.currentId = n.id;
    await tick();
    document.querySelector<HTMLElement>('.tiptap')?.focus();
  }
</script>

{#if open}
  <aside transition:slide={{ axis: 'x', duration: 220, easing: cubicOut }}>
    <div class="top" data-tauri-drag-region>
      <input bind:this={searchEl} bind:value={query} onkeydown={onSearchKey}
        placeholder="Search  {prettyKeys(shortcuts.keysFor('search'))}" spellcheck="false" />
      <div class="plus-wrap">
        {#if plusOpen}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul class="plus-menu" role="menu" style={plusStyle} transition:scale={{ start: 0.92, duration: 140 }}
            onkeydown={plusKey} onfocusout={(e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest('.plus-wrap')) plusOpen = false; }}>
            {#each plusItems as it, i}
              <li role="none" class:sep={it.sep}>
                <!-- one highlight only: the mouse moves focus instead of adding a hover state.
                     mousedown is swallowed because WebKit does not focus a button that is clicked —
                     it blurs the menu instead, which closed it before the click could ever land. -->
                {#if i === 0}
                  <button role="menuitem" use:autofocus onmousedown={hold} onmouseenter={(e) => e.currentTarget.focus()} onclick={() => plusPick(i)}>{it.label}</button>
                {:else}
                  <button role="menuitem" onmousedown={hold} onmouseenter={(e) => e.currentTarget.focus()} onclick={() => plusPick(i)}>{it.label}</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul class="tree" role="tree" tabindex="-1" onkeydown={treeKey} oncontextmenu={rowMenu}
      ondragover={(e) => overSection(e, '')} ondrop={drop}>
      {#each rows as r (r.key)}
        <li animate:flip={{ duration: 220, easing: cubicOut }} in:fade={{ duration: 140 }} out:slide={{ duration: 180, easing: cubicOut }}
          class="row {r.kind}" style="--d: {'depth' in r ? r.depth : 0}"
          class:over={r.kind !== 'note' && dropAt?.into === r.g && !dropAt.beforeNote && !dropAt.beforeGroup}
          class:drop-before={(r.kind === 'note' && dropAt?.beforeNote === r.n.id) || (r.kind === 'group' && dropAt?.beforeGroup === r.g)}
          class:dragging={(r.kind === 'note' && drag?.note === r.n.id) || (r.kind === 'group' && drag?.group === r.g)}>

          {#if r.kind === 'note'}
            {@const n = r.n}
            <div class="note-row" class:collapsed={groups.isFolded(n.id)} draggable="true" ondragstart={(e) => dragStartNote(e, n)} ondragend={dragEnd}
              ondragover={(e) => overNote(e, n)} ondrop={drop} role="presentation">
              <button data-row data-note={n.id} class:active={n.id === notes.currentId} onclick={() => openNote(n)}>
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
              <span class="tools">
                <button class="icon mini tip-right" data-tip="Delete note" onclick={() => removeNote(n)}>×</button>
              </span>
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
                <button class="gname" data-row data-group={g} draggable="true"
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
                  <button class="icon mini tip-right" data-tip="New note here" onclick={async () => { ui.focusOwner = 'editor'; notes.create('', g); await tick(); document.querySelector<HTMLElement>('.tiptap')?.focus(); }}>+</button>
                  <button class="icon mini tip-right" data-tip="Delete group" onclick={() => removeGroup(g)}>×</button>
                </span>
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <button class="icon mini fold tip-right" aria-label={groups.isCollapsed(g) ? 'Expand' : 'Collapse'} data-tip={groups.isCollapsed(g) ? 'Expand' : 'Collapse'} onclick={() => groups.toggle(g)}><svg class="chev" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg></button>
              {/if}
            </div>

          {:else if r.kind === 'label'}
            <div class="ghead static" role="presentation" ondragover={(e) => r.g === '' && overSection(e, '')} ondrop={drop}><span class="gname static">{r.text}</span></div>

          {:else}
            <div class="empty" role="presentation" ondragover={(e) => overSection(e, r.g)} ondrop={drop}>{r.text}</div>
          {/if}
        </li>
      {/each}
    </ul>

    <footer>
      <span class="sync {sync.status}" title={sync.error || (sync.enabled ? 'Synced' : 'Sync off')}>
        {sync.enabled ? (sync.status === 'error' ? 'sync error' : sync.status === 'syncing' ? 'syncing…' : 'synced') : 'local only'}
      </span>
      <button class="icon tip-up gear" aria-label="Settings" data-tip="Settings" data-keys={shortcuts.keysFor('settings')} onclick={onSettings}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="7"/></svg>
      </button>
    </footer>
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
  .plus-menu {
    position: fixed; z-index: 10; min-width: 190px; list-style: none; margin: 0; padding: 4px;
    background: var(--bg-pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    transform-origin: top left;
  }
  .plus-menu button {
    width: 100%; display: flex; flex-direction: row; justify-content: space-between; align-items: center; gap: 12px;
    border: 0; background: none; color: inherit; font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 5px; text-align: left; white-space: nowrap;
  }
  .plus-menu button:focus { background: var(--accent-soft); outline: none; }
  /* files in and out, kept apart from what the menu creates */
  .plus-menu li.sep { margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--line); }

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
  .ghead.static { padding-top: 8px; }
  .gname {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px;
    border: 0; background: none; color: var(--fg); font: inherit; font-size: 13px; font-weight: 600;
    padding: 4px 6px; border-radius: 6px; text-align: left; white-space: nowrap; overflow: hidden;
  }
  .gname.static { color: var(--fg-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; cursor: default; }
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
  .row.drop-before::before {
    content: ''; position: absolute; left: calc(var(--d) * 18px); right: 8px; top: -1px; height: 2px; border-radius: 1px;
    background: var(--accent); box-shadow: var(--glow); pointer-events: none; z-index: 1;
  }
  .note-row { display: flex; align-items: center; }
  .note-row > button:first-child {
    flex: 1; min-width: 0; text-align: left; border: 0; background: none; color: inherit; font: inherit;
    padding: 5px 6px; border-radius: 6px; display: flex; flex-direction: column;
    cursor: default; transition: background 0.12s, transform 0.12s;
  }
  .note-row > button:first-child:hover { background: var(--bg-hover); }
  .note-row > button:first-child:active { transform: scale(0.985); }
  .note-row > button.active { background: var(--bg-active); }
  /* keyboard cursor: a soft accent tint; the open note stays neutral grey */
  .note-row > [data-row]:focus { outline: none; background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .gname:focus { outline: none; }
  .note-row > button.active:focus { background: color-mix(in srgb, var(--accent) 16%, var(--bg-active)); }
  .title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; min-width: 0; width: 100%; }
  .title .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .gear { width: 28px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
  .gear svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
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
</style>
