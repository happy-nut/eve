<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { SuggestItem, SuggestionUI } from './lib/editor';
  import Icon from './Icon.svelte';

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
      <li class:sel={i === sel}>
        <button onmousedown={(e) => { e.preventDefault(); pick(t); }}>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {#if t.noteIcon}<span class="s-emoji"><Icon icon={t.noteIcon} size={14} /></span>
          {:else if t.icon}<svg class="s-ico" viewBox="0 0 16 16">{@html t.icon}</svg>{/if}
          <span class="s-label">{t.label}</span>
          {#if t.hint}<span class="hint">{t.hint}</span>{/if}
        </button>
      </li>
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
  .suggest button { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: 5px 8px; border-radius: 5px; white-space: nowrap; }
  .suggest li.sel button { background: var(--accent-soft); }
  .s-label { overflow: hidden; text-overflow: ellipsis; }
  .s-emoji { width: 15px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .s-ico { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; opacity: 0.7; }
  .suggest .hint { margin-left: auto; padding-left: 12px; color: var(--fg-dim); font-size: 11.5px; }
</style>
