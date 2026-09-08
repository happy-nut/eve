<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { crossfade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { moveCard, moveColumn, patchCard, uid, type Card, type Column } from './lib/board';
  import { plain } from './lib/notes.svelte';
  import { ui } from './lib/ui.svelte';

  /**
   * Notion-style board, mounted inside the `kanban` node view. Every change goes out through `commit`
   * (a ProseMirror transaction) and comes back through `set`, so undo/redo and sync just work.
   * Keys: ↑↓←→ move between headers / cards / "+ New"; ⌥↑↓←→ move the focused card, ⌥←→ the column;
   * Enter opens a card (renames a header), ⌫ deletes; Esc, ↑ on a header or ↓ on "+ New" go back to the text.
   */
  let { columns: initial, commit, exit, remove, undo, redo }: {
    columns: Column[]; commit: (c: Column[]) => void; exit: (where: 'before' | 'after') => void; remove: () => void; undo: () => void; redo: () => void;
  } = $props();
  // svelte-ignore state_referenced_locally
  let columns = $state.raw(initial);
  /** Update from the editor (undo/redo, sync). Svelte moves DOM nodes to reorder, which blurs them; refocus by id. */
  export async function set(c: Column[]) {
    const a = document.activeElement as HTMLElement | null;
    columns = c;
    if (!a || !root.contains(a)) return;
    await tick();
    if (root.contains(document.activeElement) && document.activeElement !== document.body) return;
    const id = a.dataset.id ?? '', colId = a.closest<HTMLElement>('.kb-col')?.dataset.id ?? '';
    const col = a.dataset.kb === 'card' ? columns.find((x) => x.cards.some((k) => k.id === id)) : columns.find((x) => x.id === colId);
    if (col && a.dataset.kb === 'card') focusCard(col.id, id);
    else if (col && a.dataset.kb === 'add') focusAdd(col.id);
    else if (col) focusHead(col.id);
    else enter();
  }
  export function enter() { if (last?.isConnected) { last.focus({ preventScroll: true }); last.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else q('.kb-head'); }

  let root: HTMLDivElement;
  let last: HTMLElement | null = null;
  let focused = $state<string | null>(null); // data-kb of the focused control (drives the +/× highlight, see the CSS)
  let editing = $state<string | null>(null); // column being renamed
  // focus + keep it in view: the board scrolls sideways and the note scrolls vertically
  const q = (sel: string) => {
    const el = root.querySelector<HTMLElement>(sel);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    return el;
  };
  const focusCard = (colId: string, id: string) => q(`.kb-col[data-id="${colId}"] .kb-card[data-id="${id}"]`);
  const focusHead = (colId?: string) => q(`.kb-col[data-id="${colId}"] .kb-head`);
  const focusAdd = (colId: string) => q(`.kb-col[data-id="${colId}"] .kb-add`);
  // first line that still says something once markdown is stripped (a divider or a bare list marker is skipped)
  const firstLine = (body: string) => body.split('\n').map(plain).find(Boolean) ?? '';

  // ---- mouse drag: the board previews the move while dragging, commits on drop ----
  let dragging = $state<{ id: string; colId: string } | null>(null);
  let over = $state<{ colId: string; index: number } | null>(null);
  const view = $derived(dragging && over ? moveCard(columns, dragging.id, over.colId, over.index) : columns);
  function dragStart(e: DragEvent, card: Card, col: Column) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('application/x-eve-card', card.id); // no text: a drop outside the board must not paste the title
    dragging = { id: card.id, colId: col.id };
  }
  function dragOver(e: DragEvent, col: Column) {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    const cards = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.kb-card')].filter((c) => c.dataset.id !== dragging!.id);
    let index = cards.findIndex((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (index < 0) index = cards.length;
    if (over?.colId !== col.id || over.index !== index) over = { colId: col.id, index };
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    if (dragging && over) commit(view);
    dragEnd();
  }
  function dragEnd() { dragging = null; over = null; }
  // a card moving between columns flies there (keyboard moves); while the mouse drags, it just appears
  const [send, receive] = crossfade({
    duration: (d) => (dragging ? 0 : Math.min(360, 140 + d * 0.25)),
    easing: cubicOut,
    fallback: (node) => ({ duration: 160, css: (t) => `opacity:${t}; transform: scale(${0.92 + 0.08 * t})` }),
  });

  // ---- edits ----
  async function open(card: Card) {
    await ui.openCard(card, (patch) => commit(patchCard(columns, card.id, patch)));
  }
  async function addCard(col: Column) {
    const card = { id: uid(), title: '', body: '' };
    commit(columns.map((c) => (c.id === col.id ? { ...c, cards: [...c.cards, card] } : c)));
    await tick();
    focusCard(col.id, card.id);
    await open(card);
  }
  function addColumn() {
    const col = { id: uid(), title: '', cards: [] };
    commit([...columns, col]);
    editing = col.id;
  }
  async function removeCard(col: Column, i: number) {
    const next = col.cards[i + 1] ?? col.cards[i - 1];
    commit(columns.map((c) => (c.id === col.id ? { ...c, cards: c.cards.filter((_, j) => j !== i) } : c)));
    await tick();
    next ? focusCard(col.id, next.id) : focusHead(col.id);
  }
  async function removeColumn(col: Column) {
    if (col.cards.length && !(await ui.ask(`Delete “${col.title || 'Untitled'}” and its ${col.cards.length} card${col.cards.length > 1 ? 's' : ''}?`))) return;
    const i = columns.findIndex((c) => c.id === col.id);
    const next = columns[i + 1] ?? columns[i - 1];
    commit(columns.filter((c) => c.id !== col.id));
    await tick();
    next ? focusHead(next.id) : q('.kb-addcol');
  }
  async function rename(col: Column, title: string | null) {
    editing = null;
    if (title !== null && title.trim() !== col.title) commit(columns.map((c) => (c.id === col.id ? { ...c, title: title.trim() } : c)));
    await tick();
    focusHead(col.id);
  }
  function renameKey(e: KeyboardEvent, col: Column) {
    e.stopPropagation();
    const v = (e.currentTarget as HTMLInputElement).value;
    if (e.key === 'Enter') { e.preventDefault(); rename(col, v); }
    else if (e.key === 'Escape') { e.preventDefault(); rename(col, null); }
  }
  const focusInput = (el: HTMLInputElement) => { el.focus(); el.select(); };

  // ---- keyboard ----
  async function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
    const item = t.closest<HTMLElement>('[data-kb]');
    if (!item) return;
    const kind = item.dataset.kb!;
    const colId = item.closest<HTMLElement>('.kb-col')?.dataset.id ?? '';
    const ci = view.findIndex((c) => c.id === colId);
    const col = view[ci];
    const cardId = item.dataset.id ?? '';
    const i = col ? col.cards.findIndex((k) => k.id === cardId) : -1;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); exit('after'); return; }
    if (k === 'Enter' && kind === 'card') { e.preventDefault(); open(col.cards[i]); return; }
    if (k === 'Enter' && kind === 'head') { e.preventDefault(); editing = colId; return; }
    if (k === 'Enter' && kind === 'add') { e.preventDefault(); addCard(col); return; }
    if (k === 'Enter' && kind === 'addcol') { e.preventDefault(); addColumn(); return; }
    if (k === 'Enter' && kind === 'x') { e.preventDefault(); remove(); return; }
    if ((k === 'Backspace' || k === 'Delete') && kind === 'card') { e.preventDefault(); removeCard(col, i); return; }
    if ((k === 'Backspace' || k === 'Delete') && kind === 'head') { e.preventDefault(); removeColumn(col); return; }
    if (!k.startsWith('Arrow')) return;
    e.preventDefault();
    if (e.altKey) {
      if (kind === 'card') {
        const [toCol, toIndex] =
          k === 'ArrowUp' ? [colId, i - 1] : k === 'ArrowDown' ? [colId, i + 1] : k === 'ArrowLeft' ? [view[ci - 1]?.id, i] : [view[ci + 1]?.id, i];
        if (!toCol || toIndex < 0 || (toCol === colId && toIndex >= col.cards.length)) return;
        commit(moveCard(columns, cardId, toCol, toIndex));
        await tick();
        focusCard(toCol, cardId);
      } else if (kind === 'head') {
        const to = k === 'ArrowLeft' ? ci - 1 : k === 'ArrowRight' ? ci + 1 : -1;
        if (to < 0 || to >= view.length) return;
        commit(moveColumn(columns, colId, to));
        await tick();
        focusHead(colId);
      }
      return;
    }
    const sideways = (c?: Column) => {
      if (!c) return;
      if (kind === 'card') c.cards.length ? focusCard(c.id, c.cards[Math.min(i, c.cards.length - 1)].id) : focusHead(c.id);
      else if (kind === 'head') focusHead(c.id);
      else focusAdd(c.id);
    };
    if (kind === 'x' || kind === 'addcol') { // the + / × stack past the last column
      if (k === 'ArrowDown' && kind === 'addcol') q('.kb-x');
      else if (k === 'ArrowUp' && kind === 'x') q('.kb-addcol');
      else if (k === 'ArrowLeft') focusHead(view[view.length - 1]?.id);
      return;
    }
    if (k === 'ArrowUp') {
      if (kind === 'card') i > 0 ? focusCard(colId, col.cards[i - 1].id) : focusHead(colId);
      else if (kind === 'add') col.cards.length ? focusCard(colId, col.cards[col.cards.length - 1].id) : focusHead(colId);
      else exit('before');
    } else if (k === 'ArrowDown') {
      if (kind === 'head') col.cards.length ? focusCard(colId, col.cards[0].id) : focusAdd(colId);
      else if (kind === 'card') i < col.cards.length - 1 ? focusCard(colId, col.cards[i + 1].id) : focusAdd(colId);
      else exit('after');
    } else if (k === 'ArrowLeft') {
      sideways(view[ci - 1]);
    } else if (k === 'ArrowRight') {
      kind === 'head' && ci === view.length - 1 ? q('.kb-addcol') : sideways(view[ci + 1]);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="kb-wrap">
<div class="kb" bind:this={root} onkeydown={onKey} onfocusin={(e) => { last = e.target as HTMLElement; focused = last.dataset.kb ?? null; }} onfocusout={() => (focused = null)}>
  {#each view as col (col.id)}
    <div class="kb-col" data-id={col.id} animate:flip={{ duration: 220 }} ondragover={(e) => dragOver(e, col)} ondrop={drop}>
      {#if editing === col.id}
        <input class="kb-rename" value={col.title} use:focusInput onkeydown={(e) => renameKey(e, col)} onblur={(e) => editing === col.id && rename(col, e.currentTarget.value)} spellcheck="false" />
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="kb-head" data-kb="head" tabindex="0" role="button" onclick={() => (editing = col.id)}>
          <span class="kb-title" class:dim={!col.title}>{col.title || 'Untitled'}</span>
          <span class="kb-count">{col.cards.length}</span>
          <button class="icon kb-del" tabindex="-1" aria-label="Delete column" data-tip="Delete column" onclick={(e) => { e.stopPropagation(); removeColumn(col); }}>×</button>
        </div>
      {/if}
      {#each col.cards as card (card.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="kb-card" class:ghost={dragging?.id === card.id} data-kb="card" data-id={card.id} tabindex="0" role="button" draggable="true"
          animate:flip={{ duration: 220 }} in:receive={{ key: card.id }} out:send={{ key: card.id }}
          ondragstart={(e) => dragStart(e, card, col)} ondragend={dragEnd} onclick={() => open(card)}>
          <span class="kb-ctitle" class:dim={!card.title}>{card.title || 'Untitled'}</span>
          {#if card.body}<span class="kb-cbody">{firstLine(card.body)}</span>{/if}
        </div>
      {/each}
      <button class="kb-add" data-kb="add" onclick={() => addCard(col)}>+ New</button>
    </div>
  {/each}
  <!-- past the last column: + adds a column; below it a × (shown while hovering the board) deletes the board -->
  <div class="kb-end">
    <button class="icon kb-addcol" class:on={focused === 'addcol'} data-kb="addcol" aria-label="Add column" data-tip="Add column" onclick={addColumn}>+</button>
    <button class="icon kb-x" class:on={focused === 'x'} data-kb="x" tabindex="-1" aria-label="Delete board" data-tip="Delete board" onclick={remove}>×</button>
  </div>
</div>
</div>

<style>
  .kb-end { flex: none; display: flex; flex-direction: column; gap: 4px; }
  .kb-x { width: 28px; height: 28px; font-size: 16px; opacity: 0; transition: opacity 0.12s, background 0.12s; }
  .kb-wrap:hover .kb-x, .kb-x.on { opacity: 1; }
  /* keyboard highlight from the tracked `focused` control, not :focus: WebKit's :focus-visible skips programmatic
     focus, and WebKit left :focus styling on the × after the focus had moved on to a header */
  .kb-end .icon:focus-visible { background: none; color: var(--fg-dim); }
  :global(html[data-input='keyboard']) :is(.kb-addcol, .kb-x).on { background: var(--accent-soft); color: var(--fg); }
  /* 4px side padding inside the scroller so a focus ring is not clipped at its edge */
  .kb { display: flex; align-items: flex-start; gap: 14px; overflow-x: auto; padding: 6px 4px 14px; margin: 0.6em -4px; user-select: none; -webkit-user-select: none; scrollbar-width: thin; }
  .kb-col { flex: none; width: 236px; display: flex; flex-direction: column; gap: 7px; min-height: 60px; }
  .kb-head, .kb-rename {
    display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 8px; border-radius: 6px; font-size: 13px; font-weight: 500;
    outline: none; border: 0; background: none; color: var(--fg); font-family: inherit; width: 100%;
  }
  .kb-head:hover { background: var(--bg-hover); }
  /* hover: a delete × at the right edge of the header */
  .kb-del { margin-left: auto; width: 20px; height: 20px; font-size: 14px; flex: none; opacity: 0; transition: opacity 0.12s, background 0.12s; }
  .kb-head:hover .kb-del { opacity: 1; }
  /* keyboard focus ring: decided by the app's own input tracking (App.svelte sets data-input), not by the browser's
     :focus-visible guess, which drops the ring after stepping between the editor and the board */
  :global(html[data-input='keyboard']) :is(.kb-head, .kb-card, .kb-add):focus { box-shadow: 0 0 0 2px var(--accent), var(--glow); }
  .kb-rename { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); background: var(--bg-input); }
  .kb-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .kb-count { color: var(--fg-dim); font-weight: 400; font-size: 12px; }
  .dim { color: var(--fg-dim); }
  .kb-card {
    display: flex; flex-direction: column; gap: 3px; padding: 8px 11px; border-radius: 8px; font-size: 13.5px; line-height: 1.4; outline: none;
    background: var(--bg-pop); box-shadow: 0 0 0 1px var(--line), 0 1px 3px rgba(0, 0, 0, 0.06);
    transition: background 0.12s, box-shadow 0.15s, transform 0.15s, opacity 0.15s;
  }
  .kb-card:hover { background: var(--bg-hover); }
  .kb-card:active { transform: scale(0.985); }
  .kb-card.ghost { opacity: 0.35; }
  .kb-ctitle { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; word-break: break-word; }
  .kb-cbody { color: var(--fg-dim); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kb-add {
    text-align: left; border: 0; background: none; color: var(--fg-dim); font: inherit; font-size: 13px; padding: 5px 8px; border-radius: 6px; outline: none;
    transition: background 0.12s, color 0.12s;
  }
  .kb-add:hover { background: var(--bg-hover); color: var(--fg); }
  .kb-addcol { flex: none; width: 28px; height: 28px; font-size: 17px; }
</style>
