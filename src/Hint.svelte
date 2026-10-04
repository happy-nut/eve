<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { hints } from './lib/hints.svelte';
  import Keys from './Keys.svelte';
</script>

{#if hints.current}
  {@const h = hints.current}
  <div class="hint" role="status" transition:fly|global={{ y: 16, duration: 220, easing: cubicOut }}>
    <span class="bulb">💡</span>
    <span class="text">{h.text}</span>
    <span class="keys">{#each h.keys as k, i}{#if i}<span class="or">/</span>{/if}<Keys keys={k} dark />{/each}</span>
    <button aria-label="Dismiss" onclick={() => hints.dismiss()}>×</button>
  </div>
{/if}

<style>
  .hint {
    position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: 9px;
    max-width: min(560px, calc(100vw - 32px)); padding: 8px 8px 8px 12px; border-radius: 12px;
    background: light-dark(#1d1f24, #2a2d33); color: #f2f3f5; font-size: 13px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }
  .bulb { font-size: 14px; }
  .text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .keys { display: inline-flex; align-items: center; gap: 4px; flex: none; }
  .or { opacity: 0.5; }
  button { border: 0; background: none; color: inherit; opacity: 0.55; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
  button:hover { opacity: 1; background: rgba(255, 255, 255, 0.1); }
</style>
