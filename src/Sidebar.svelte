<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, slide, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { notes, titleOf, type Note } from './lib/notes.svelte';
  import { groups, parentOf, leafOf, depthOf, MAX_DEPTH } from './lib/groups.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { ui, hooks } from './lib/ui.svelte';
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
  const openFiles = $derived(notes.visible.filter((n) => n.path));

  /**
   * One flat, keyed list of rows (groups, notes, labels, placeholders). A single {#each} lets
   * animate:flip carry a row smoothly to its new place even when it changes group or nesting.
   */
  type Row =
    | { kind: 'group'; key: string; g: string; depth: number }
    | { kind: 'note'; key: string; n: Note; depth: number }
    | { kind: 'label'; key: string; text: string; g: string }
    | { kind: 'empty'; key: string; text: string; g: string; depth: number };
  const rows = $derived.by((): Row[] => {
    if (q) return hits.length ? hits.map((n) => ({ kind: 'note', key: n.id, n, depth: 0 })) : [{ kind: 'empty', key: 'empty:search', text: 'No matches', g: '', depth: 0 }];
    const out: Row[] = [];
    if (openFiles.length) {
      out.push({ kind: 'label', key: 'label:files', text: 'Open files', g: '\0files' });
      for (const n of openFiles) out.push({ kind: 'note', key: n.id, n, depth: 0 });
    }
    const walk = (parent: string, depth: number) => {
      for (const g of groups.children(parent)) {
        out.push({ kind: 'group', key: 'g:' + groups.id(g), g, depth });
        if (groups.isCollapsed(g)) continue;
        const kids = groups.children(g), own = groups.notesIn(g);
        walk(g, depth + 1);
        for (const n of own) out.push({ kind: 'note', key: n.id, n, depth: depth + 1 });
      }
    };
    walk('', 0);
    const root = groups.notesIn('');
    if (groups.names.length) out.push({ kind: 'label', key: 'label:root', text: 'Notes', g: '' });
    for (const n of root) out.push({ kind: 'note', key: n.id, n, depth: 0 });
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
  const plusItems = $derived.by(() => {
    // a new note goes straight into the editor (deleting keeps focus in the list)
    const newNote = (g: string) => async () => { ui.focusOwner = 'editor'; notes.create('', g); await tick(); document.querySelector<HTMLElement>('.tiptap')?.focus(); };
    const items = [
      { label: ctxGroup ? `New note in “${leafOf(ctxGroup)}”` : 'New note', run: newNote(ctxGroup) },
      { label: ctxGroup && depthOf(ctxGroup) < MAX_DEPTH ? `New group in “${leafOf(ctxGroup)}”` : 'New group', run: () => groups.create(ctxGroup) },
    ];
    if (ctxGroup) items.push({ label: 'New note at top level', run: newNote('') }, { label: 'New group at top level', run: () => groups.create('') });
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
    if (!drag || drag.note === n.id || n.path) return;
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
    if (n.path) { notes.remove(n.id); return; } // just closes the file
    if (await ui.ask(`Delete “${titleOf(n)}”?`)) notes.remove(n.id);
  }
  const rowsNow = () => [...document.querySelectorAll<HTMLElement>('aside [data-row]')];
  async function focusRow(sel: string) {
    await tick();
    (document.querySelector<HTMLElement>(`aside ${sel}`) ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus();
  }
  const groupSel = (g: string) => `[data-group="${CSS.escape(g)}"]`;

  /** ⌥↑ / ⌥↓ on a note: one visible row up/down, crossing group boundaries. */
  function nudgeNote(id: string, dir: 1 | -1) {
    const rows = rowsNow();
    const i = rows.findIndex((r) => r.dataset.note === id);
    const me = notes.all.find((n) => n.id === id);
    let nb = rows[i + dir];
    if (!me) return;
    const byId = (x?: string) => notes.all.find((n) => n.id === x);
    if (nb && dir < 0 && nb.dataset.group === me.group) nb = rows[i - 2]; // skip my own header
    if (!nb) {
      // bottom of the list: leave the group for its parent (root when top-level)
      if (dir > 0 && me.group) { notes.move(id, parentOf(me.group), null); focusRow(`[data-note="${id}"]`); }
      return;
    }
    if (nb.dataset.note) {
      const n2 = byId(nb.dataset.note)!;
      if (n2.group !== me.group) notes.move(id, n2.group, dir < 0 ? null : n2.id);
      else if (dir < 0) notes.move(id, me.group, n2.id);
      else {
        const after = byId(rows[i + 2]?.dataset.note);
        notes.move(id, me.group, after && after.group === me.group ? after.id : null);
      }
    } else {
      const g = nb.dataset.group!;
      groups.expand(g);
      notes.move(id, g, dir < 0 ? null : groups.notesIn(g)[0]?.id ?? null);
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
      else if (group) nudgeGroup(group, e.key);
      return;
    }
    switch (e.key) {
      case ' ': if (group) groups.toggle(group); else return; break;
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
              <li role="none">
                <!-- one highlight only: the mouse moves focus instead of adding a hover state -->
                {#if i === 0}
                  <button role="menuitem" use:autofocus onmouseenter={(e) => e.currentTarget.focus()} onclick={() => plusPick(i)}>{it.label}</button>
                {:else}
                  <button role="menuitem" onmouseenter={(e) => e.currentTarget.focus()} onclick={() => plusPick(i)}>{it.label}</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul class="tree" role="tree" tabindex="-1" onkeydown={treeKey}
      ondragover={(e) => overSection(e, '')} ondrop={drop}>
      {#each rows as r (r.key)}
        <li animate:flip={{ duration: 220, easing: cubicOut }} in:fade={{ duration: 140 }} out:slide={{ duration: 180, easing: cubicOut }}
          class="row {r.kind}" style="--d: {'depth' in r ? r.depth : 0}"
          class:over={r.kind !== 'note' && dropAt?.into === r.g && !dropAt.beforeNote && !dropAt.beforeGroup}
          class:drop-before={(r.kind === 'note' && dropAt?.beforeNote === r.n.id) || (r.kind === 'group' && dropAt?.beforeGroup === r.g)}
          class:dragging={(r.kind === 'note' && drag?.note === r.n.id) || (r.kind === 'group' && drag?.group === r.g)}>

          {#if r.kind === 'note'}
            {@const n = r.n}
            <div class="note-row" draggable={!n.path} ondragstart={(e) => !n.path && dragStartNote(e, n)} ondragend={dragEnd}
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
                  <span class="chev">›</span>
                </span>
                <!-- on hover the tools unfold at the right edge, nudging the chevron left -->
                <span class="tools">
                  <button class="icon mini" data-tip="New note here" onclick={async () => { ui.focusOwner = 'editor'; notes.create('', g); await tick(); document.querySelector<HTMLElement>('.tiptap')?.focus(); }}>+</button>
                  <button class="icon mini" data-tip="Delete group" onclick={() => removeGroup(g)}>×</button>
                </span>
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
      <button class="icon tip-up" data-tip="Settings  {prettyKeys(shortcuts.keysFor('settings'))}" onclick={onSettings}>⚙︎</button>
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

  .tree { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 16px 8px; margin: 0; list-style: none; }
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
    animation: num-in 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes num-in { from { transform: scale(0.6); opacity: 0; } }

  .ghead { position: relative; display: flex; align-items: center; padding: 3px 0 1px; }
  .ghead .icon.mini { position: absolute; top: 50%; transform: translateY(-50%); opacity: 0; width: 20px; height: 20px; font-size: 13px; background: var(--bg-side); }
  .ghead .icon.mini { right: 24px; }
  .ghead .icon.mini + .icon.mini { right: 4px; }
  .ghead:hover .icon.mini { opacity: 1; }
  .ghead:hover .count, .ghead:hover .chev { opacity: 0; }
  .ghead.static { padding-top: 8px; }
  .gname {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px;
    border: 0; background: none; color: var(--fg); font: inherit; font-size: 13px; font-weight: 600;
    padding: 4px 6px 4px 0; border-radius: 6px; text-align: left; white-space: nowrap; overflow: hidden;
  }
  .gname.static { color: var(--fg-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; cursor: default; padding-left: 0; }
  .gname .t { overflow: hidden; text-overflow: ellipsis; }
  /* disclosure chevron lives on the right, so group icons sit flush left and notes indent just one column */
  .chev { display: inline-block; width: 12px; text-align: center; color: var(--fg-dim); font-size: 14px; line-height: 1; margin-left: 4px; transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.12s; transform: rotate(90deg); }
  .collapsed .chev { transform: rotate(0deg); }
  .count { font-weight: 500; font-size: 11px; color: var(--fg-dim); padding-left: 6px; }
  .rename {
    flex: 1; min-width: 0; font: inherit; font-size: 12.5px; padding: 3px 6px; border-radius: 4px;
    border: 1px solid var(--accent); background: var(--bg-input); color: var(--fg); outline: none; box-shadow: var(--glow);
  }

  .empty { padding: 5px 10px; font-size: 11.5px; color: var(--fg-dim); opacity: 0.7; }
  .row.drop-before::before {
    content: ''; position: absolute; left: calc(var(--d) * 18px); right: 8px; top: -1px; height: 2px; border-radius: 1px;
    background: var(--accent); box-shadow: var(--glow); pointer-events: none; z-index: 1;
  }
  .note-row > button {
    width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit;
    padding: 5px 6px; border-radius: 6px; display: flex; flex-direction: column;
    cursor: default; transition: background 0.12s, transform 0.12s;
  }
  .note-row > button:hover { background: var(--bg-hover); }
  .note-row > button:active { transform: scale(0.985); }
  .note-row > button.active { background: var(--bg-active); }
  /* keyboard cursor: a soft accent tint; the open note stays neutral grey */
  [data-row]:focus { outline: none; background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .note-row > button.active:focus { background: color-mix(in srgb, var(--accent) 16%, var(--bg-active)); }
  .title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; min-width: 0; width: 100%; }
  .title .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 12px 8px 18px; font-size: 11.5px; color: var(--fg-dim); border-top: 1px solid var(--line);
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
