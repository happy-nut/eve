<script lang="ts">
  import { fly } from 'svelte/transition';
  import { caretIn } from './lib/motion';
  import type { SuggestItem, SuggestionUI } from './lib/slash';
  import { rows, expand, collapse } from './lib/suggest';
  import Icon from './Icon.svelte';
  import { placeAt } from './lib/popup';

  let items = $state<SuggestItem[]>([]);
  let open = $state<ReadonlySet<number>>(new Set());
  let sel = $state(0);
  let place = $state('');
  let anchor: DOMRect | null = null;
  let pick: (t: SuggestItem) => void = () => {};
  let pointed = false;

  const shown = $derived(rows(items, open));

  export const ui: SuggestionUI = {
    show(next, rect, cb) {
      items = next; open = new Set(); sel = 0; pick = cb; pointed = false;
      if (rect) { anchor = rect; place = placeAt(rect, want(), list?.offsetWidth ?? 340); }
    },
    move: (d) => { sel = (sel + d + shown.length) % shown.length; },
    select: () => {
      if (!shown.length) return false;
      if (shown[sel].item.folder) { toggle(sel); return true; }
      pick(shown[sel].item);
      return true;
    },
    expand: () => {
      const next = expand(items, open, sel);
      if (next) ({ open, sel } = next);
      return !!next;
    },
    collapse: () => {
      const next = collapse(items, open, sel);
      if (next) ({ open, sel } = next);
      return !!next;
    },
    hide: () => { items = []; open = new Set(); },
    visible: () => items.length > 0,
    place: (rect) => { anchor = rect; place = placeAt(rect, want(), list?.offsetWidth ?? 340); },
    chosen: () => pointed,
  };

  function toggle(i: number) {
    sel = i;
    const next = expand(items, open, sel) ?? collapse(items, open, sel);
    if (next) ({ open, sel } = next);
  }

  let list = $state<HTMLUListElement | null>(null);
  const want = () => Math.min(300, list?.scrollHeight || 300);
  $effect(() => { shown; if (list && anchor) place = placeAt(anchor, want(), list.offsetWidth); });
  $effect(() => {
    sel;
    const row = list?.querySelector('li.sel'), head = row?.previousElementSibling;
    if (head?.classList.contains('group')) head.scrollIntoView({ block: 'nearest' });
    row?.scrollIntoView({ block: 'nearest' });
  });
</script>

{#if items.length}
  <ul class="suggest" bind:this={list} style={place} transition:fly|global={caretIn}>
    {#each shown as row, i (i)}
      {@const t = row.item}
      {#if !row.child && t.group && t.group !== shown[i - 1]?.item.group && t.group !== items[shown[i - 1]?.top]?.group}
        <li class="group" role="presentation">{t.group}</li>
      {/if}
      <li class:sel={i === sel} class:child={row.child}>
        <!-- a move, not mouseenter: the list drawn under a pointer resting there has not been pointed at -->
        <button onmousedown={(e) => { e.preventDefault(); if (t.folder) toggle(i); else pick(t); }} onmousemove={() => { if (sel !== i || !pointed) { sel = i; pointed = true; } }}>
          {#if !row.child && t.sections?.length}
            <svg class="chev" class:down={open.has(row.top)} viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></svg>
          {:else}<span class="chev"></span>{/if}
          {#if t.noteIcon}<span class="s-emoji"><Icon icon={t.noteIcon} size={14} /></span>
          {:else if t.swatch}<span class="s-swatch" style:background={t.swatch}></span>
          {:else if t.icon}<svg class="s-ico" viewBox="0 0 16 16">{@html t.icon}</svg>{/if}
          <span class="s-label">{t.label}</span>
          {#if t.hint && (!row.child || items[row.top]?.folder)}<span class="hint">{t.hint}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .suggest {
    position: fixed;
    z-index: var(--z-caret-popup);
    list-style: none;
    margin: 0;
    padding: 4px;
    width: max-content;
    min-width: 200px;
    max-width: min(340px, calc(100vw - 16px));
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-pop);
    border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
    font-size: 13px;
  }
  .suggest button { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: var(--row-pad); border-radius: var(--row-radius); white-space: nowrap; }
  .suggest .group { padding: 8px 8px 3px; font-size: 11.5px; font-weight: 600; color: var(--fg-dim); }
  .suggest .group:first-child { padding-top: 3px; }
  .s-swatch { width: 14px; height: 14px; flex: none; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12); }
  .chev { width: 9px; height: 9px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0.4; transition: transform 120ms; }
  .chev.down { transform: rotate(90deg); }
  .suggest li.child button { padding-left: 25px; }
  .suggest li.sel button { background: var(--accent-soft); }
  .s-label { flex: none; max-width: calc(100% - 40px); overflow: hidden; text-overflow: ellipsis; }
  .s-emoji { width: 15px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .s-ico { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; opacity: 0.7; }
  .suggest .hint { margin-left: auto; padding-left: 12px; color: var(--fg-dim); font-size: 11.5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
