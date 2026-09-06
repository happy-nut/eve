<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, slide, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { notes, titleOf, plain, type Note } from './lib/notes.svelte';
  import { groups, parentOf, leafOf, depthOf, MAX_DEPTH } from './lib/groups.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { ui } from './lib/ui.svelte';

  let { open = $bindable(true), searchEl = $bindable<HTMLInputElement | null>(null), onSettings }:
    { open: boolean; searchEl: HTMLInputElement | null; onSettings: () => void } = $props();

  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const hits = $derived(notes.visible.filter((n) => n.body.toLowerCase().includes(q)));
  const openFiles = $derived(notes.visible.filter((n) => n.path));

  // ---- "+" dropdown: new note / new group, relative to the focused row ----
  let plusOpen = $state(false);
  let ctxGroup = $state('');
  let plusFrom: HTMLElement | null = null; // row that had focus when the menu opened
  let plusStyle = $state(''); // anchored under that row (⌘N), or under the + button
  function openPlus() {
    const el = document.activeElement as HTMLElement | null;
    const row = el?.closest<HTMLElement>('[data-row]');
    plusFrom = row ?? null;
    if (row) {
      const r = row.getBoundingClientRect();
      plusStyle = `position: fixed; left: ${r.left + 8}px; top: ${r.bottom + 2}px; right: auto; transform-origin: top left;`;
    } else plusStyle = '';
    ctxGroup = row?.dataset.group ?? notes.all.find((n) => n.id === row?.dataset.note)?.group ?? '';
    plusOpen = !plusOpen;
  }
  function closePlus() {
    plusOpen = false;
    (plusFrom?.isConnected ? plusFrom : document.querySelector<HTMLElement>('aside [data-row]'))?.focus();
  }
  const plusItems = $derived([
    { label: ctxGroup ? `New note in “${leafOf(ctxGroup)}”` : 'New note', keys: shortcuts.keysFor('newNote'), run: () => notes.create('', ctxGroup) },
    {
      label: ctxGroup && depthOf(ctxGroup) < MAX_DEPTH ? `New group in “${leafOf(ctxGroup)}”` : 'New group',
      keys: shortcuts.keysFor('newGroup'),
      run: () => groups.create(ctxGroup),
    },
  ]);
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
  function overNote(e: DragEvent, n: Note, list: Note[]) {
    if (!drag || drag.note === n.id) return;
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
    if (!nb || !me) return;
    const byId = (x?: string) => notes.all.find((n) => n.id === x);
    if (dir < 0 && nb.dataset.group === me.group) nb = rows[i - 2]; // skip my own header
    if (!nb) return;
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
  /** ⌥↑↓ swap with a sibling group, ⌥← out to the parent's level, ⌥→ into the previous sibling. */
  function nudgeGroup(g: string, key: string) {
    let np: string | null = null;
    if (key === 'ArrowUp') { const prev = groups.prevSibling(g); if (prev) np = groups.move(g, parentOf(g), prev); }
    if (key === 'ArrowDown') { const next = groups.nextSibling(g); if (next) np = groups.move(g, parentOf(g), groups.nextSibling(next)); }
    if (key === 'ArrowLeft' && parentOf(g)) { const par = parentOf(g); np = groups.move(g, parentOf(par), groups.nextSibling(par)); }
    if (key === 'ArrowRight') { const prev = groups.prevSibling(g); if (prev) { np = groups.move(g, prev, null); if (np) groups.expand(prev); } }
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
      case 'Escape': document.querySelector<HTMLElement>('.tiptap')?.focus(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
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
  function ago(t: number) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
  const preview = (body: string) => body.split('\n').slice(1).map(plain).find((l) => l && !/^```/.test(l)) ?? '';
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

{#snippet noteRows(list: Note[], emptyText: string)}
  <ul>
    {#each list as n (n.id)}
      <li animate:flip={{ duration: 200 }} transition:fade={{ duration: 120 }}
        draggable={!n.path} ondragstart={(e) => !n.path && dragStartNote(e, n)} ondragend={dragEnd}
        ondragover={(e) => overNote(e, n, list)} ondrop={drop}
        class:dragging={drag?.note === n.id} class:drop-before={dropAt?.beforeNote === n.id}>
        <button data-row data-note={n.id} class:active={n.id === notes.currentId} onclick={() => openNote(n)}>
          <span class="title">
            <svg class="ico" viewBox="0 0 16 16"><path d="M4 1.5h5l3.5 3.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5M5.5 8.5h5M5.5 11h5"/></svg>
            <span class="t">{titleOf(n)}</span>
          </span>
          <span class="meta"><span class="preview">{n.path ? n.path.replace(/^\/Users\/[^/]+/, '~') : preview(n.body)}</span><time>{ago(n.updatedAt)}</time></span>
        </button>
      </li>
    {/each}
    {#if !list.length}<li class="empty">{emptyText}</li>{/if}
  </ul>
{/snippet}

{#snippet groupBlock(g: string, depth: number)}
  {@const collapsed = groups.isCollapsed(g)}
  {@const kids = groups.children(g)}
  {@const own = groups.notesIn(g)}
  <section class="grp" class:over={dropAt?.into === g && !dropAt.beforeNote && !dropAt.beforeGroup} class:dragging={drag?.group === g}
    style="--d: {depth}" role="group" aria-label={g}
    ondragover={(e) => overSection(e, g)} ondrop={drop}>
    <div class="ghead" class:collapsed class:drop-before={dropAt?.beforeGroup === g}>
      {#if groups.editing === g}
        <input class="rename" value={leafOf(g)} use:focusInput onkeydown={(e) => renameKey(e, g)}
          onblur={(e) => finishRename(g, e.currentTarget.value)} spellcheck="false" />
      {:else}
        <button class="gname" data-row data-group={g} draggable="true"
          ondragstart={(e) => dragStartGroup(e, g)} ondragend={dragEnd} ondragover={(e) => overGroup(e, g)} ondrop={drop}
          onclick={() => groups.toggle(g)} ondblclick={() => (groups.editing = g)}>
          <span class="chev">›</span>
          <svg class="ico" viewBox="0 0 16 16"><path d="M1.5 4.5v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5H2.5a1 1 0 0 0-1 1z"/></svg>
          <span class="t">{leafOf(g)}</span>
          <span class="count">{groups.notesIn(g, true).length}</span>
        </button>
        <button class="icon mini" title="New note here" onclick={() => notes.create('', g)}>+</button>
        <button class="icon mini" title="Delete group" onclick={() => removeGroup(g)}>×</button>
      {/if}
    </div>
    {#if !collapsed}
      <div class="body" transition:slide={{ duration: 160 }}>
        {#each kids as k (k)}{@render groupBlock(k, depth + 1)}{/each}
        {@render noteRows(own, kids.length ? '' : 'Drop notes here')}
      </div>
    {/if}
  </section>
{/snippet}

{#if open}
  <aside transition:slide={{ axis: 'x', duration: 220, easing: cubicOut }}>
    <div class="top" data-tauri-drag-region>
      <input bind:this={searchEl} bind:value={query} onkeydown={onSearchKey}
        placeholder="Search  {prettyKeys(shortcuts.keysFor('search'))}" spellcheck="false" />
      <div class="plus-wrap">
        <button class="icon plus" class:on={plusOpen} title="New…" aria-haspopup="menu" aria-expanded={plusOpen} onclick={openPlus}>+</button>
        {#if plusOpen}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul class="plus-menu" role="menu" style={plusStyle} transition:scale={{ start: 0.92, duration: 140 }}
            onkeydown={plusKey} onfocusout={(e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest('.plus-wrap')) plusOpen = false; }}>
            {#each plusItems as it, i}
              <li role="none">
                <!-- one highlight only: the mouse moves focus instead of adding a hover state -->
                {#if i === 0}
                  <button role="menuitem" use:autofocus onmouseenter={(e) => e.currentTarget.focus()} onclick={() => plusPick(i)}>{it.label}<kbd>{prettyKeys(it.keys)}</kbd></button>
                {:else}
                  <button role="menuitem" onmouseenter={(e) => e.currentTarget.focus()} onclick={() => plusPick(i)}>{it.label}<kbd>{prettyKeys(it.keys)}</kbd></button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="tree" role="tree" tabindex="-1" onkeydown={treeKey}>
      {#if q}
        {@render noteRows(hits, 'No matches')}
      {:else}
        {#if openFiles.length}
          <section class="grp files" role="group" aria-label="Files">
            <div class="ghead static"><span class="gname static">Open files</span></div>
            {@render noteRows(openFiles, '')}
          </section>
        {/if}
        {#each groups.children('') as g (g)}{@render groupBlock(g, 0)}{/each}
        <section class="grp root" class:over={dropAt?.into === '' && !dropAt.beforeNote && !dropAt.beforeGroup} role="group" aria-label="Notes"
          ondragover={(e) => overSection(e, '')} ondrop={drop}>
          {#if groups.names.length}<div class="ghead static"><span class="gname static">Notes</span></div>{/if}
          {@render noteRows(groups.notesIn(''), 'No notes')}
        </section>
      {/if}
    </div>

    <footer>
      <span class="sync {sync.status}" title={sync.error || (sync.enabled ? 'Synced' : 'Sync off')}>
        {sync.enabled ? (sync.status === 'error' ? 'sync error' : sync.status === 'syncing' ? 'syncing…' : 'synced') : 'local only'}
      </span>
      <button class="icon" title="Settings {prettyKeys(shortcuts.keysFor('settings'))}" onclick={onSettings}>⚙︎</button>
    </footer>
  </aside>
{/if}

<style>
  aside {
    width: 260px; flex: none; display: flex; flex-direction: column;
    background: var(--bg-side); border-right: 1px solid var(--line); overflow: hidden;
  }
  .top { display: flex; gap: 4px; padding: 40px 10px 8px; }
  .top input {
    flex: 1; min-width: 0; border: 0; border-radius: 6px; padding: 6px 8px;
    background: var(--bg-input); color: inherit; font: inherit; font-size: 13px; outline: none; transition: box-shadow 0.15s;
  }
  .top input:focus { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); }
  .plus-wrap { position: relative; }
  .plus { font-size: 18px; transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.12s, color 0.12s; }
  .plus.on { transform: rotate(45deg); background: var(--bg-active); color: var(--fg); }
  .plus-menu {
    position: absolute; right: 0; top: 30px; z-index: 10; min-width: 190px; list-style: none; margin: 0; padding: 4px;
    background: var(--bg-pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    transform-origin: top right;
  }
  .plus-menu button {
    width: 100%; display: flex; flex-direction: row; justify-content: space-between; align-items: center; gap: 12px;
    border: 0; background: none; color: inherit; font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 5px; text-align: left; white-space: nowrap;
  }
  .plus-menu button:focus { background: var(--accent-soft); outline: none; }
  .plus-menu kbd { font: inherit; font-size: 11.5px; color: var(--fg-dim); }

  .tree { flex: 1; overflow-y: auto; padding: 2px 6px 8px; }
  .grp { border-radius: 8px; padding: 1px; transition: background 0.15s, box-shadow 0.15s; }
  .grp.over { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent); }
  .grp.dragging { opacity: 0.4; }
  .grp.root { min-height: 48px; }
  .body { padding-left: 12px; border-left: 1px solid var(--line); margin-left: 13px; }
  .ico { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; opacity: 0.75; }

  .ghead { position: relative; display: flex; align-items: center; gap: 2px; padding: 4px 2px 2px 2px; }
  .ghead .icon.mini { opacity: 0; width: 20px; height: 20px; font-size: 13px; }
  .ghead:hover .icon.mini { opacity: 1; }
  .gname {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px;
    border: 0; background: none; color: var(--fg); font: inherit; font-size: 12.5px; font-weight: 600;
    padding: 3px 4px; border-radius: 6px; text-align: left; white-space: nowrap; overflow: hidden;
  }
  .gname:hover { background: var(--bg-hover); }
  .gname.static { color: var(--fg-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; cursor: default; padding-left: 6px; }
  .gname .t { overflow: hidden; text-overflow: ellipsis; }
  .chev { display: inline-block; width: 10px; color: var(--fg-dim); font-size: 14px; line-height: 1; transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1); transform: rotate(90deg); }
  .collapsed .chev { transform: rotate(0deg); }
  .count { margin-left: auto; font-weight: 500; font-size: 11px; color: var(--fg-dim); padding-left: 6px; }
  .rename {
    flex: 1; min-width: 0; font: inherit; font-size: 12.5px; padding: 3px 6px; border-radius: 4px;
    border: 1px solid var(--accent); background: var(--bg-input); color: var(--fg); outline: none; box-shadow: var(--glow);
  }

  ul { list-style: none; margin: 0; padding: 0; }
  li { position: relative; border-radius: 6px; transition: opacity 0.15s; }
  li.dragging { opacity: 0.4; }
  li.empty { padding: 5px 10px; font-size: 11.5px; color: var(--fg-dim); opacity: 0.7; }
  li.empty:empty { display: none; }
  li.drop-before::before, .ghead.drop-before::before {
    content: ''; position: absolute; left: 8px; right: 8px; top: -1px; height: 2px; border-radius: 1px;
    background: var(--accent); box-shadow: var(--glow); pointer-events: none;
  }
  li > button {
    width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit;
    padding: 5px 8px; border-radius: 6px; display: flex; flex-direction: column; gap: 2px;
    cursor: default; transition: background 0.12s, transform 0.12s;
  }
  li > button:hover { background: var(--bg-hover); }
  li > button:active { transform: scale(0.985); }
  li > button.active { background: var(--bg-active); }
  [data-row]:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; box-shadow: var(--glow); }
  .title { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 500; min-width: 0; width: 100%; }
  .title .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: 8px; font-size: 11.5px; color: var(--fg-dim); padding-left: 19px; width: 100%; }
  .preview { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px 8px 14px; font-size: 11.5px; color: var(--fg-dim); border-top: 1px solid var(--line);
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
