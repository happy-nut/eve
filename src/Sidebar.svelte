<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, slide, scale } from 'svelte/transition';
  import { tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { notes, titleOf, plain, type Note } from './lib/notes.svelte';
  import { groups } from './lib/groups.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { ui } from './lib/ui.svelte';

  let { open = $bindable(true), searchEl = $bindable<HTMLInputElement | null>(null), onSettings }:
    { open: boolean; searchEl: HTMLInputElement | null; onSettings: () => void } = $props();

  let query = $state('');
  let plusOpen = $state(false); // "+" dropdown: new note / new group
  const plusItems = [
    { label: 'New note', keys: () => shortcuts.keysFor('newNote'), run: () => notes.create() },
    { label: 'New group', keys: () => shortcuts.keysFor('newGroup'), run: () => groups.create() },
  ];
  function plusPick(i: number) { plusOpen = false; plusItems[i].run(); }
  function plusKey(e: KeyboardEvent) {
    const items = [...document.querySelectorAll<HTMLElement>('.plus-menu button')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === 'Escape') { plusOpen = false; document.querySelector<HTMLElement>('.plus')?.focus(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  }
  const autofocus = (el: HTMLElement) => el.focus();
  /** mouse: open and jump into the editor; keyboard (Enter/Space): open but stay in the list */
  async function openNote(n: Note, e: MouseEvent) {
    notes.currentId = n.id;
    if (e.detail > 0) { await tick(); document.querySelector<HTMLElement>('.tiptap')?.focus(); }
    else (e.currentTarget as HTMLElement).focus();
  }
  const q = $derived(query.trim().toLowerCase());
  const filtered = $derived(q ? notes.visible.filter((n) => n.body.toLowerCase().includes(q)) : notes.visible);
  const inGroup = (g: string) => filtered.filter((n) => n.group === g && !n.path);
  const FILES = '\0files'; // external files opened via macOS
  // sections: open files, every group, then root. While searching: one flat list.
  const sections = $derived(
    q ? [{ name: '', notes: filtered }]
      : [
          ...(filtered.some((n) => n.path) ? [{ name: FILES, notes: filtered.filter((n) => n.path) }] : []),
          ...groups.names.map((g) => ({ name: g, notes: inGroup(g) })),
          { name: '', notes: inGroup('') },
        ],
  );

  // ---- drag & drop (native HTML5) ----
  let dragId = $state<string | null>(null);
  let over = $state<string | null>(null); // group name being hovered, '' = root
  let dropAt = $state<{ id: string; before: boolean } | null>(null); // insertion marker
  function dragStart(e: DragEvent, n: Note) {
    dragId = n.id;
    e.dataTransfer?.setData('text/plain', n.id);
    e.dataTransfer!.effectAllowed = 'move';
  }
  function dragOver(e: DragEvent, g: string) {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    over = g;
  }
  function drop(e: DragEvent, g: string) {
    e.preventDefault();
    const id = dragId ?? e.dataTransfer?.getData('text/plain');
    if (id) { groups.remember(g); notes.move(id, g, null); }
    dragEnd();
  }
  /** hovering a note row: insert before/after depending on cursor half */
  function rowOver(e: DragEvent, n: Note) {
    if (dragId === null || dragId === n.id) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAt = { id: n.id, before: e.clientY < r.top + r.height / 2 };
    over = n.group;
  }
  function rowDrop(e: DragEvent, n: Note, list: Note[]) {
    e.preventDefault();
    e.stopPropagation();
    const id = dragId ?? e.dataTransfer?.getData('text/plain');
    if (id && dropAt) {
      const i = list.findIndex((x) => x.id === n.id);
      const before = dropAt.before ? n : list[i + 1];
      groups.remember(n.group);
      notes.move(id, n.group, before?.id ?? null);
    }
    dragEnd();
  }
  function dragEnd() { dragId = null; over = null; dropAt = null; }

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
    if (e.key === 'Enter' && filtered[0]) { notes.currentId = filtered[0].id; searchEl?.blur(); e.preventDefault(); }
  }
  function renameKey(e: KeyboardEvent, g: string) {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
    if (e.key === 'Escape') { groups.editing = null; focusGroup(g); }
    e.stopPropagation(); // keep app shortcuts out of the input
  }
  /** rename input closes -> keep keyboard focus on that group's row */
  async function finishRename(from: string, value: string) {
    if (groups.editing !== from) return; // Esc already handled
    focusGroup(groups.rename(from, value));
  }
  async function focusGroup(name: string) {
    await tick();
    document.querySelector<HTMLElement>(`aside [data-group="${CSS.escape(name)}"]`)?.focus();
  }
  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };

  // ---- keyboard: ↑↓ move, ⌫/Delete delete (with confirm), ←→ collapse/expand, Esc back to editor ----
  async function removeGroup(g: string) {
    const n = inGroup(g).length;
    if (await ui.ask(`Delete group “${g}”?${n ? ` Its ${n} note${n > 1 ? 's' : ''} move to Notes.` : ''}`)) groups.remove(g);
  }
  async function removeNote(n: Note) {
    if (n.path) { notes.remove(n.id); return; } // just closes the file
    if (await ui.ask(`Delete “${titleOf(n)}”?`)) notes.remove(n.id);
  }
  /** ⌥↑ / ⌥↓: move the focused note one visible row up or down, crossing group boundaries. */
  async function nudge(id: string, dir: 1 | -1) {
    const rows = [...document.querySelectorAll<HTMLElement>('aside [data-row]')];
    const i = rows.findIndex((r) => r.dataset.note === id);
    const nb = rows[i + dir];
    const me = notes.all.find((n) => n.id === id);
    if (!nb || !me) return;
    const byId = (x?: string) => notes.all.find((n) => n.id === x);
    if (nb.dataset.note) {
      const n2 = byId(nb.dataset.note)!;
      if (n2.group !== me.group) notes.move(id, n2.group, dir < 0 ? null : n2.id); // enter neighbour group at its end / start
      else if (dir < 0) notes.move(id, me.group, n2.id);
      else {
        const after = byId(rows[i + 2]?.dataset.note);
        notes.move(id, me.group, after && after.group === me.group ? after.id : null);
      }
    } else {
      const g = nb.dataset.group!;
      if (g !== me.group) notes.move(id, g, dir < 0 ? null : inGroup(g)[0]?.id ?? null);
      else if (dir < 0) { const gi = groups.names.indexOf(g); if (gi > 0) notes.move(id, groups.names[gi - 1], null); }
    }
    await tick();
    (document.querySelector<HTMLElement>(`aside [data-note="${id}"]`) ?? document.querySelector<HTMLElement>(`aside [data-group="${me.group}"]`))?.focus();
  }
  function treeKey(e: KeyboardEvent) {
    if (ui.pending) return;
    const rows = [...document.querySelectorAll<HTMLElement>('aside [data-row]')];
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    if (!el || (e.target as HTMLElement).tagName === 'INPUT') return;
    const i = rows.indexOf(el);
    const noteId = el.dataset.note, group = el.dataset.group;
    if (e.altKey && noteId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault(); e.stopPropagation();
      nudge(noteId, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    switch (e.key) {
      case ' ': if (group) groups.toggle(group); else return; break;
      case 'ArrowDown': rows[i + 1]?.focus(); break;
      case 'ArrowUp': rows[i - 1]?.focus(); break;
      case 'ArrowLeft': if (group && !groups.isCollapsed(group)) groups.toggle(group); else return; break;
      case 'ArrowRight': if (group && groups.isCollapsed(group)) groups.toggle(group); else return; break;
      case 'Backspace': case 'Delete': {
        // remember the neighbour by id: the DOM rows are rebuilt after the delete
        const nb = rows[i + 1] ?? rows[i - 1];
        const sel = nb?.dataset.note ? `[data-note="${nb.dataset.note}"]` : nb?.dataset.group ? `[data-group="${CSS.escape(nb.dataset.group)}"]` : '[data-row]';
        const done = noteId ? removeNote(notes.all.find((n) => n.id === noteId)!) : group ? removeGroup(group) : Promise.resolve();
        done.then(async () => {
          await tick();
          (document.querySelector<HTMLElement>(`aside ${sel}`) ?? document.querySelector<HTMLElement>('aside [data-row]'))?.focus();
        });
        break;
      }
      case 'Enter': if (group) { groups.editing = group; break; } return;
      case 'Escape': document.querySelector<HTMLElement>('.tiptap')?.focus(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  }
</script>

{#if open}
  <aside transition:slide={{ axis: 'x', duration: 220, easing: cubicOut }}>
    <div class="top" data-tauri-drag-region>
      <input bind:this={searchEl} bind:value={query} onkeydown={onSearchKey}
        placeholder="Search  {prettyKeys(shortcuts.keysFor('search'))}" spellcheck="false" />
      <div class="plus-wrap">
        <button class="icon plus" class:on={plusOpen} title="New…" aria-haspopup="menu" aria-expanded={plusOpen}
          onclick={() => (plusOpen = !plusOpen)}>+</button>
        {#if plusOpen}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul class="plus-menu" role="menu" transition:scale={{ start: 0.92, duration: 140 }}
            onkeydown={plusKey} onfocusout={(e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest('.plus-wrap')) plusOpen = false; }}>
            {#each plusItems as it, i}
              <li role="none">
                {#if i === 0}
                  <button role="menuitem" use:autofocus onclick={() => plusPick(i)}>{it.label}<kbd>{prettyKeys(it.keys())}</kbd></button>
                {:else}
                  <button role="menuitem" onclick={() => plusPick(i)}>{it.label}<kbd>{prettyKeys(it.keys())}</kbd></button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="tree" role="tree" tabindex="-1" onkeydown={treeKey}>
      {#each sections as s (s.name)}
        {@const collapsed = !q && s.name && groups.isCollapsed(s.name)}
        <section class:over={over === s.name && dragId !== null && s.name !== FILES} class:root={!s.name}
          role="group" aria-label={s.name === FILES ? 'Files' : s.name || 'Notes'}
          ondragover={(e) => s.name !== FILES && dragOver(e, s.name)} ondragleave={() => (over = null)} ondrop={(e) => s.name !== FILES && drop(e, s.name)}>
          {#if s.name === FILES}
            <div class="ghead root"><span class="gname static">Open files</span></div>
          {:else if s.name}
            <div class="ghead" class:collapsed>
              {#if groups.editing === s.name}
                <input class="rename" value={s.name} use:focus onkeydown={(e) => renameKey(e, s.name)}
                  onblur={(e) => finishRename(s.name, e.currentTarget.value)} spellcheck="false" />
              {:else}
                <button class="gname" data-row data-group={s.name} onclick={() => groups.toggle(s.name)} ondblclick={() => (groups.editing = s.name)}>
                  <span class="chev">›</span>{s.name}<span class="count">{s.notes.length}</span>
                </button>
                <button class="icon mini" title="New note here" onclick={() => notes.create('', s.name)}>+</button>
                <button class="icon mini" title="Delete group (notes move to Notes)" onclick={() => removeGroup(s.name)}>×</button>
              {/if}
            </div>
          {:else if !q && sections.length > 1}
            <div class="ghead root"><span class="gname static">Notes</span></div>
          {/if}
          {#if !collapsed}
            <ul transition:slide={{ duration: 160 }}>
              {#each s.notes as n (n.id)}
                <li animate:flip={{ duration: 200 }} transition:fade={{ duration: 120 }}
                  draggable={!n.path} ondragstart={(e) => !n.path && dragStart(e, n)} ondragend={dragEnd}
                  ondragover={(e) => rowOver(e, n)} ondrop={(e) => rowDrop(e, n, s.notes)}
                  class:dragging={dragId === n.id}
                  class:drop-before={dropAt?.id === n.id && dropAt.before} class:drop-after={dropAt?.id === n.id && !dropAt.before}>
                  <button data-row data-note={n.id} class:active={n.id === notes.currentId}
                    onclick={(e) => openNote(n, e)}>
                    <span class="title">{titleOf(n)}</span>
                    <span class="meta"><span class="preview">{n.path ? n.path.replace(/^\/Users\/[^/]+/, '~') : preview(n.body)}</span><time>{ago(n.updatedAt)}</time></span>
                  </button>
                </li>
              {/each}
              {#if !s.notes.length}<li class="empty">{s.name ? 'Drop notes here' : q ? 'No matches' : 'No notes'}</li>{/if}
            </ul>
          {/if}
        </section>
      {/each}
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
    width: 250px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--bg-side);
    border-right: 1px solid var(--line);
    overflow: hidden;
  }
  .top { display: flex; gap: 4px; padding: 40px 10px 8px; }
  .top input {
    flex: 1; min-width: 0; border: 0; border-radius: 6px; padding: 6px 8px;
    background: var(--bg-input); color: inherit; font: inherit; font-size: 13px; outline: none;
    transition: box-shadow 0.15s;
  }
  .top input:focus { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); }
  .plus-wrap { position: relative; }
  .plus { font-size: 18px; transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.12s, color 0.12s; }
  .plus.on { transform: rotate(45deg); background: var(--bg-active); color: var(--fg); }
  .plus-menu {
    position: absolute; right: 0; top: 30px; z-index: 10; min-width: 170px; list-style: none; margin: 0; padding: 4px;
    background: var(--bg-pop); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    transform-origin: top right;
  }
  .plus-menu button {
    width: 100%; display: flex; flex-direction: row; justify-content: space-between; align-items: center; gap: 12px;
    border: 0; background: none; color: inherit; font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 5px; text-align: left;
  }
  .plus-menu button:hover, .plus-menu button:focus-visible { background: var(--accent-soft); outline: none; }
  .plus-menu kbd { font: inherit; font-size: 11.5px; color: var(--fg-dim); }

  .tree { flex: 1; overflow-y: auto; padding: 2px 6px 8px; }
  section { border-radius: 8px; padding: 2px; transition: background 0.15s, box-shadow 0.15s; }
  section.over { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent); }
  section.root { min-height: 48px; }

  .ghead { display: flex; align-items: center; gap: 2px; padding: 6px 4px 2px 6px; }
  .ghead .icon.mini { opacity: 0; width: 20px; height: 20px; font-size: 13px; }
  .ghead:hover .icon.mini { opacity: 1; }
  .gname {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px;
    border: 0; background: none; color: var(--fg-dim); font: inherit; font-size: 11.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 0; text-align: left;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .gname:hover { color: var(--fg); }
  .gname.static { cursor: default; }
  .chev { display: inline-block; font-size: 14px; line-height: 1; transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1); transform: rotate(90deg); }
  .collapsed .chev { transform: rotate(0deg); }
  .count { margin-left: auto; font-weight: 500; opacity: 0.7; letter-spacing: 0; }
  .rename {
    flex: 1; min-width: 0; font: inherit; font-size: 12px; padding: 2px 6px; border-radius: 4px;
    border: 1px solid var(--accent); background: var(--bg-input); color: var(--fg); outline: none; box-shadow: var(--glow);
  }

  ul { list-style: none; margin: 0; padding: 0; }
  li { border-radius: 6px; transition: opacity 0.15s; }
  li.dragging { opacity: 0.4; }
  li { position: relative; }
  li.drop-before::before, li.drop-after::after {
    content: ''; position: absolute; left: 8px; right: 8px; height: 2px; border-radius: 1px;
    background: var(--accent); box-shadow: var(--glow); pointer-events: none;
  }
  li.drop-before::before { top: -1px; }
  li.drop-after::after { bottom: -1px; }
  li.empty { padding: 6px 10px; font-size: 11.5px; color: var(--fg-dim); opacity: 0.7; }
  li > button {
    width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit;
    padding: 6px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 2px;
    cursor: default; transition: background 0.12s, transform 0.12s;
  }
  li > button:hover { background: var(--bg-hover); }
  li > button:active { transform: scale(0.985); }
  li > button.active { background: var(--bg-active); }
  [data-row]:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; box-shadow: var(--glow); }
  .title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: 8px; font-size: 11.5px; color: var(--fg-dim); }
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
