<script lang="ts">
  import { customIcon, emojiImage, EMOJI_PAD } from './lib/icons';
  let { icon, size = 13 }: { icon: string; size?: number } = $props();
  const custom = $derived(customIcon(icon));
  const painted = $derived(custom || size < 40 ? '' : emojiImage(icon, size));
</script>

{#if custom}
  <span class="cico" style="width: {size + 2}px; height: {size + 2}px">{@html custom.svg}</span>
{:else}
  <span class="emoji" style="font-size: {size}px">{icon}</span>
  {#if painted}
    {@const box = Math.round(size * EMOJI_PAD)}
    <img class="painted" src={painted} alt="" style="width: {box}px; height: {box}px; margin: {(size - box) / 2}px" />
  {/if}
{/if}

<style>
  .cico { display: inline-flex; align-items: center; justify-content: center; }
  .cico :global(svg) { width: 100%; height: 100%; }
  .emoji { line-height: 1; }
  .painted { display: none; }
  @media print {
    .emoji { display: none; }
    .painted { display: block; }
  }
</style>
