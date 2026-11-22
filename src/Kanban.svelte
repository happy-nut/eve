<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { crossfade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { moveCard, moveColumn, patchCard, uid, type Card, type Column, type CardMore, type CardTemplate } from './lib/board';
  import { plain } from './lib/notes.svelte';
  import { ui } from './lib/ui.svelte';
  import { dayKey, fillTemplate } from './lib/daily';
  import { scrollHint } from './lib/scrollHint';

  let { columns: initial, commit, template, saveTemplate, exit, remove, undo, redo }: {
    columns: Column[]; commit: (c: Column[], group?: string) => void;
    template: () => CardTemplate | null; saveTemplate: (t: CardTemplate) => void;
    exit: (where: 'before' | 'after') => void; remove: () => void; undo: () => void; redo: () => void;
  } = $props();
  let columns = $state.raw(untrack(() => initial));
  export async function set(c: Column[]) {
    const a = document.activeElement as HTMLElement | null;
    columns = c;
    if (!a || !root?.contains(a)) return;
    await tick();
    refocusById(a);
  }
  function refocusById(a: HTMLElement) {
    const now = document.activeElement as HTMLElement | null;
    const id = a.dataset.id ?? '', colId = a.closest<HTMLElement>('.kb-col')?.dataset.id ?? '';
    const leaving = (el: HTMLElement) => el.dataset.kb === 'card' && !columns.some((c) => c.cards.some((k) => k.id === el.dataset.id));
    if (!root || (now && now !== document.body && root.contains(now) && !leaving(now))) return;
    const col = a.dataset.kb === 'card' ? columns.find((x) => x.cards.some((k) => k.id === id)) : columns.find((x) => x.id === colId);
    const gone = !col && a.dataset.kb === 'card' ? columns.find((x) => x.id === colId) : null;
    if (gone) { const i = [...(a.parentElement?.querySelectorAll<HTMLElement>('.kb-card') ?? [])].indexOf(a); gone.cards.length ? focusCard(gone.id, gone.cards[Math.min(Math.max(i, 0), gone.cards.length - 1)].id) : focusAdd(gone.id); }
    else if (col && a.dataset.kb === 'card') focusCard(col.id, id);
    else if (col && a.dataset.kb === 'add') focusAdd(col.id);
    else if (col) focusHead(col.id);
    else enter();
  }
  export function enter(fresh = false) {
    if (last?.isConnected) { last.focus({ preventScroll: true }); last.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    else if (fresh && columns[0]) columns[0].cards.length ? focusCard(columns[0].id, columns[0].cards[0].id) : focusAdd(columns[0].id);
    else q('.kb-head');
  }

  let root: HTMLDivElement;
  let last: HTMLElement | null = null;
  let focused = $state<string | null>(null);
  let editing = $state<string | null>(null);
  const q = (sel: string) => {
    const el = root.querySelector<HTMLElement>(sel);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    return el;
  };
  const focusCard = (colId: string, id: string) => q(`.kb-col[data-id="${colId}"] .kb-card[data-id="${id}"]`);
  const focusHead = (colId?: string) => q(`.kb-col[data-id="${colId}"] .kb-head`);
  const focusAdd = (colId: string) => q(`.kb-col[data-id="${colId}"] .kb-add`);
  // WebKit gives a clicked button no focus; the card that opened must hold it so closing the card comes back to it
  const holdFocus = (e: MouseEvent) => (e.currentTarget as HTMLElement).focus({ preventScroll: true });
  const firstLine = (body: string) => body.split('\n').map(plain).find(Boolean) ?? '';

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
  async function drop(e: DragEvent) {
    if (!dragging) return;
    e.preventDefault();
    const id = dragging.id;
    if (over) commit(view);
    dragEnd();
    await tick();
    root?.querySelector<HTMLElement>(`[data-kb="card"][data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }
  function dragEnd() { dragging = null; over = null; }
  const [send, receive] = crossfade({
    duration: (d) => (dragging ? 0 : Math.min(360, 140 + d * 0.25)),
    easing: cubicOut,
    fallback: (node) => ({ duration: 160, css: (t) => `opacity:${t}; transform: scale(${0.92 + 0.08 * t})` }),
  });

  async function open(card: Card, group?: string, caret?: 'title') {
    const colOf = () => columns.find((c) => c.cards.some((k) => k.id === card.id));
    const from = colOf()?.id;
    const more: Card & CardMore = {
      ...card, caret, column: from, columns: columns.map((c) => ({ id: c.id, title: c.title })),
      move: (to) => { if (colOf()?.id !== to) commit(moveCard(columns, card.id, to, Infinity)); },
    };
    await ui.openCard(more, (patch) => commit(patchCard(columns, card.id, patch), group), () => {
      const col = colOf();
      if (col) removeCard(col, col.cards.findIndex((k) => k.id === card.id));
    });
    const now = colOf();
    if (now && now.id !== from) { await tick(); focusCard(now.id, card.id); }
  }
  let naming: { id: string; title: string; group: string } | null = null;
  async function addCard(col: Column, typed = '') {
    const t = template(), today = dayKey(new Date());
    const card = { id: uid(), title: (t ? fillTemplate(t.title, today) : '') + typed, body: t ? fillTemplate(t.body, today) : '' };
    const group = `card-${card.id}`;
    commit(columns.map((c) => (c.id === col.id ? { ...c, cards: [...c.cards, card] } : c)), group);
    if (typed) naming = { id: card.id, title: card.title, group };
    await tick();
    focusCard(col.id, card.id);
    await open(card, group, typed ? 'title' : undefined);
    if (naming?.id === card.id) naming = null;
  }
  async function editTemplate() {
    let t = template() ?? { title: '', body: '' };
    await ui.openCard({ ...t, note: 'Card template — every new card on this board starts like this. {{date}} and {{weekday}} are filled in.' },
      (patch) => { t = { ...t, ...patch }; saveTemplate(t); });
    if (document.activeElement?.classList.contains('kb-tpl')) q('.kb-addcol');
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
  async function rename(col: Column, title: string | null, back = true) {
    editing = null;
    if (title !== null && title.trim() !== col.title) commit(columns.map((c) => (c.id === col.id ? { ...c, title: title.trim() } : c)));
    await tick();
    if (back) focusHead(col.id);
  }
  function renameKey(e: KeyboardEvent, col: Column) {
    e.stopPropagation();
    const v = (e.currentTarget as HTMLInputElement).value;
    if (e.key === 'Enter') { e.preventDefault(); rename(col, v); }
    else if (e.key === 'Escape') { e.preventDefault(); rename(col, null); }
  }
  const focusInput = (el: HTMLInputElement) => { el.focus(); el.select(); };

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
    if (naming && kind === 'card' && cardId === naming.id && k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      naming.title += k;
      if (ui.card) ui.card.title = naming.title;
      commit(patchCard(columns, cardId, { title: naming.title }), naming.group);
      return;
    }
    if (k === 'Escape') { e.preventDefault(); exit('after'); return; }
    if (k === 'Enter' && kind === 'card') { e.preventDefault(); open(col.cards[i]); return; }
    if (k === 'Enter' && kind === 'head') { e.preventDefault(); editing = colId; return; }
    if (k === 'Enter' && kind === 'add') { e.preventDefault(); addCard(col); return; }
    if (k === 'Enter' && kind === 'addcol') { e.preventDefault(); addColumn(); return; }
    if (k === 'Enter' && kind === 'x') { e.preventDefault(); remove(); return; }
    if ((k === 'Backspace' || k === 'Delete') && kind === 'card') { e.preventDefault(); removeCard(col, i); return; }
    if ((k === 'Backspace' || k === 'Delete') && kind === 'head') { e.preventDefault(); removeColumn(col); return; }
    if (k === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (kind === 'card') open(col.cards[i]); else if (kind === 'head') editing = colId; else if (kind === 'add') addCard(col);
      else if (kind === 'addcol') addColumn(); else if (kind === 'x') remove();
      return;
    }
    if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && (kind === 'head' || kind === 'add') && col) {
      e.preventDefault(); addCard(col, k); return;
    }
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
    if (kind === 'x' || kind === 'addcol') {
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

<div class="kb-wrap" bind:this={root} onfocusin={(e) => { last = e.target as HTMLElement; focused = last.dataset.kb ?? null; }} onfocusout={() => (focused = null)}>
<div class="kb" {@attach scrollHint}>
  {#each view as col (col.id)}
    <div class="kb-col" data-id={col.id} role="group" aria-label={col.title || 'Untitled'} animate:flip={{ duration: 220 }} ondragover={(e) => dragOver(e, col)} ondrop={drop}>
      {#if editing === col.id}
        <input class="kb-rename" value={col.title} use:focusInput onkeydown={(e) => renameKey(e, col)} onblur={(e) => editing === col.id && rename(col, e.currentTarget.value, false)} spellcheck="false" />
      {:else}
        <div class="kb-headrow">
          <button class="kb-head" data-kb="head" onclick={(e) => { holdFocus(e); editing = col.id; }} onkeydown={onKey}>
            <span class="kb-title" class:dim={!col.title}>{col.title || 'Untitled'}</span>
            <span class="kb-count">{col.cards.length}</span>
          </button>
          <button class="icon kb-del" tabindex="-1" aria-label="Delete column" data-tip="Delete column" onclick={() => { focusHead(col.id); removeColumn(col); }}>×</button>
        </div>
      {/if}
      {#each col.cards as card (card.id)}
        <button class="kb-card" class:ghost={dragging?.id === card.id} data-kb="card" data-id={card.id} draggable="true"
          animate:flip={{ duration: 220 }} in:receive={{ key: card.id }} out:send={{ key: card.id }}
          ondragstart={(e) => dragStart(e, card, col)} ondragend={dragEnd} onclick={(e) => { holdFocus(e); open(card); }} onkeydown={onKey}>
          <span class="kb-ctitle" class:dim={!card.title}>{card.title || 'Untitled'}</span>
          {#if card.body}<span class="kb-cbody">{firstLine(card.body)}</span>{/if}
        </button>
      {/each}
      <button class="kb-add" data-kb="add" onclick={() => addCard(col)} onkeydown={onKey}>+ New</button>
    </div>
  {/each}
  <div class="kb-end">
    <button class="icon kb-addcol" class:on={focused === 'addcol'} data-kb="addcol" aria-label="Add column" data-tip="Add column" onclick={addColumn} onkeydown={onKey}>+</button>
  </div>
</div>
  <div class="kb-foot">
    <button class="icon kb-tpl" tabindex="-1" aria-label="Card template" data-tip="Card template" onclick={editTemplate} onkeydown={onKey}>
      <svg viewBox="0 0 16 16"><path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5M5.5 8.5h5M5.5 11h3"/></svg>
    </button>
    <button class="icon kb-x" class:on={focused === 'x'} data-kb="x" tabindex="-1" aria-label="Delete board" data-tip="Delete board" onclick={remove} onkeydown={onKey}>×</button>
  </div>
</div>

<style>
  .kb-end { flex: none; display: flex; flex-direction: column; gap: 4px; }
  .kb-foot { display: flex; justify-content: flex-end; gap: 2px; margin: -0.5em 0 0.4em; }
  .kb-x { width: 28px; height: 28px; font-size: 16px; opacity: 0; transition: opacity 0.12s, background 0.12s; }
  .kb-wrap:hover .kb-x, .kb-x.on { opacity: 1; }
  .kb-tpl { width: 28px; height: 28px; opacity: 0; transition: opacity 0.12s, background 0.12s; }
  .kb-tpl svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .kb-wrap:hover .kb-tpl, :global(html.mobile) .kb-tpl { opacity: 1; }
  /* keyboard highlight from the tracked `focused` control, not :focus: WebKit's :focus-visible skips programmatic
     focus, and WebKit left :focus styling on the × after the focus had moved on to a header */
  .kb-end .icon:focus-visible { background: none; color: var(--fg-dim); }
  :global(html[data-input='keyboard']) :is(.kb-addcol, .kb-x).on { background: var(--accent-soft); color: var(--fg); }
  .kb { display: flex; align-items: stretch; gap: 14px; overflow-x: auto; padding: 6px 4px 14px; margin: 0.6em -4px; user-select: none; -webkit-user-select: none; scrollbar-width: thin; }
  .kb-col { flex: 0 1 236px; min-width: 170px; display: flex; flex-direction: column; gap: 7px; min-height: 60px; }
  .kb-head, .kb-rename {
    display: flex; align-items: center; gap: 7px; min-height: 1.87em; padding: 0 8px; border-radius: 6px; font-size: 0.87em; font-weight: 500;
    outline: none; border: 0; background: none; color: var(--fg); font-family: inherit; width: 100%;
  }
  .kb-headrow { display: flex; align-items: center; border-radius: 6px; }
  .kb-headrow:hover { background: var(--bg-hover); }
  .kb-head { flex: 1; min-width: 0; }
  .kb-del { margin-right: 8px; width: 20px; height: 20px; font-size: 14px; flex: none; opacity: 0; transition: opacity 0.12s, background 0.12s; }
  .kb-headrow:hover .kb-del { opacity: 1; }
  :global(html.mobile) .kb-del { opacity: 1; width: 40px; height: 40px; margin: -6px 0; font-size: 17px; color: var(--fg-dim); }
  :global(html.mobile) .kb-x { opacity: 1; }
  /* keyboard focus ring: decided by the app's own input tracking (App.svelte sets data-input), not by the browser's
     :focus-visible guess, which drops the ring after stepping between the editor and the board */
  :global(html[data-input='keyboard']) :is(.kb-head, .kb-card, .kb-add):focus { box-shadow: 0 0 0 2px var(--accent), var(--glow); }
  .kb-rename { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); background: var(--bg-input); }
  .kb-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .kb-count { color: var(--fg-dim); font-weight: 400; font-size: 0.92em; }
  .dim { color: var(--fg-dim); }
  .kb-card {
    display: flex; flex-direction: column; gap: 3px; padding: 8px 11px; border-radius: 8px; font: inherit; font-size: 0.9em; line-height: 1.4; outline: none;
    border: 0; color: var(--fg); text-align: left; width: 100%;
    background: var(--bg-pop); box-shadow: 0 0 0 1px var(--line), 0 1px 3px rgba(0, 0, 0, 0.06);
    transition: background 0.12s, box-shadow 0.15s, transform 0.15s, opacity 0.15s;
  }
  .kb-card:hover { background: var(--bg-hover); }
  .kb-card:active { transform: scale(0.985); }
  .kb-card.ghost { opacity: 0.35; }
  .kb-ctitle { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; word-break: break-word; }
  .kb-cbody { color: var(--fg-dim); font-size: 0.89em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kb-add {
    text-align: left; border: 0; background: none; color: var(--fg-dim); font: inherit; font-size: 0.87em; padding: 5px 8px; border-radius: 6px; outline: none;
    transition: background 0.12s, color 0.12s;
  }
  .kb-add:hover { background: var(--bg-hover); color: var(--fg); }
  .kb-addcol { flex: none; width: 28px; height: 28px; font-size: 17px; }
  :global(html.mobile) :is(.kb-addcol, .kb-tpl, .kb-x) { width: 40px; height: 40px; }
  :global(html.mobile) .kb-foot { gap: 12px; }
</style>
