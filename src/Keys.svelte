<script lang="ts">
  /** A shortcut as one rounded chip per key: ⌘ ⇧ N */
  import { keyParts } from './lib/shortcuts.svelte';
  let { keys, dark = false }: { keys: string; dark?: boolean } = $props();
</script>

<span class="keys" class:dark>
  {#each keyParts(keys) as k}<kbd>{k}</kbd>{/each}
</span>

<style>
  .keys { display: inline-flex; gap: 3px; vertical-align: middle; }
  kbd {
    display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px;
    border-radius: 4px; font: inherit; font-size: 11px; font-weight: 600; line-height: 1;
    background: var(--bg-input); color: var(--fg); box-shadow: inset 0 0 0 1px var(--line), 0 1px 0 var(--line);
  }
  .dark kbd { background: rgba(255, 255, 255, 0.14); color: inherit; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18); }
</style>
