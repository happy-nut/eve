<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { EmojiUI } from './lib/slash';
  import type { EmojiEntry } from './lib/emoji';
  import { placeAt } from './lib/popup';

  // `:smile` in a note: the best few emoji in one row under the caret; ←→ choose, ↩ or ⇥ puts it in
  let items = $state<EmojiEntry[]>([]);
  let sel = $state(0);
  let place = $state('');
  let pick: (e: EmojiEntry) => void = () => {};

  export const ui: EmojiUI = {
    show(list, rect, cb) {
      items = list; sel = 0; pick = cb;
      if (rect) place = placeAt(rect, 64, 260);
    },
    move: (d) => { if (items.length) sel = (sel + d + items.length) % items.length; },
    select: () => { if (!items.length) return false; pick(items[sel]); return true; },
    hide: () => { items = []; },
    visible: () => items.length > 0,
  };
</script>

{#if items.length}
  <div class="emoji-row" style={place} transition:fly={{ y: 4, duration: 120 }} role="listbox" aria-label="Emoji">
    <div class="cells">
      {#each items as e, i (e.emoji)}
        <!-- mousedown, not click: the editor keeps the caret, so the pick lands where the colon was -->
        <button class="cell" class:sel={i === sel} role="option" aria-selected={i === sel} title={`:${e.code}:`}
          onmousedown={(ev) => { ev.preventDefault(); pick(e); }} onmouseenter={() => (sel = i)}>{e.emoji}</button>
      {/each}
    </div>
    <div class="name">:{items[sel]?.code}:</div>
  </div>
{/if}

<style>
  .emoji-row {
    position: fixed; z-index: 40; padding: 4px; max-height: none !important;
    background: var(--bg-pop); border: 1px solid var(--line); border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .cells { display: flex; gap: 2px; }
  .cell {
    width: 38px; height: 36px; border: 0; border-radius: 7px; background: none; padding: 0;
    font-size: 22px; line-height: 1; display: flex; align-items: center; justify-content: center; cursor: default;
  }
  .cell.sel { background: var(--accent-soft); }
  .name {
    padding: 3px 6px 1px; font-size: 11.5px; color: var(--fg-dim); max-width: 196px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
