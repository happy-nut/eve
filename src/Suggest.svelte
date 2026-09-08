<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { SuggestItem, SuggestionUI } from './lib/editor';

  // popup for the [[ and / menus; the editor drives it through `ui` (bind:this to reach it)
  let items = $state<SuggestItem[]>([]);
  let sel = $state(0);
  let pos = $state({ x: 0, y: 0 });
  let pick: (t: SuggestItem) => void = () => {};

  export const ui: SuggestionUI = {
    show(list, rect, cb) {
      items = list; sel = 0; pick = cb;
      if (rect) pos = { x: rect.left, y: rect.bottom + 4 };
    },
    move: (d) => { sel = (sel + d + items.length) % items.length; },
    select: () => { if (!items.length) return false; pick(items[sel]); return true; },
    hide: () => { items = []; },
    visible: () => items.length > 0,
  };

  let list = $state<HTMLUListElement | null>(null);
  // keep the highlighted suggestion visible while arrowing through a long list
  $effect(() => { sel; list?.querySelector('li.sel')?.scrollIntoView({ block: 'nearest' }); });
</script>

{#if items.length}
  <ul class="suggest" bind:this={list} style="left:{pos.x}px; top:{pos.y}px" transition:fly={{ y: 4, duration: 120 }}>
    {#each items as t, i}
      <li class:sel={i === sel}><button onmousedown={(e) => { e.preventDefault(); pick(t); }}>{t.label}{#if t.hint}<span class="hint">{t.hint}</span>{/if}</button></li>
    {/each}
  </ul>
{/if}

<style>
  .suggest {
    position: fixed;
    z-index: 40;
    list-style: none;
    margin: 0;
    padding: 4px;
    min-width: 200px;
    max-width: 340px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-pop);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 13px;
  }
  .suggest button { width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: 5px 8px; border-radius: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .suggest li.sel button { background: var(--accent-soft); }
  .suggest .hint { float: right; margin-left: 12px; color: var(--fg-dim); font-size: 11.5px; }
</style>
