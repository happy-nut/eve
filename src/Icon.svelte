<script lang="ts">
  /** Renders a note/group icon: an emoji, or a custom ":name:" SVG icon. */
  import { customIcon } from './lib/icons';
  let { icon, size = 13 }: { icon: string; size?: number } = $props();
  const custom = $derived(customIcon(icon));
</script>

{#if custom}
  <span class="cico" style="width: {size + 2}px; height: {size + 2}px">{@html custom.svg}</span>
{:else}
  <span class="emoji" style="font-size: {size}px">{icon}</span>
{/if}

<style>
  .cico { display: inline-flex; align-items: center; justify-content: center; }
  .cico :global(svg) { width: 100%; height: 100%; }
  .emoji { line-height: 1; }
</style>
