<script lang="ts">
  /** Renders a note/group icon: an emoji, or a custom ":name:" SVG icon. */
  import { customIcon, emojiImage, EMOJI_PAD } from './lib/icons';
  let { icon, size = 13 }: { icon: string; size?: number } = $props();
  const custom = $derived(customIcon(icon));
  /** the same emoji as a picture, for print only (a glyph prints in part, a picture whole) */
  const painted = $derived(custom || size < 40 ? '' : emojiImage(icon, size));
</script>

{#if custom}
  <span class="cico" style="width: {size + 2}px; height: {size + 2}px">{@html custom.svg}</span>
{:else}
  <span class="emoji" style="font-size: {size}px">{icon}</span>
  {#if painted}
    <!-- the picture is padded around its glyph; the negative margin makes it take a glyph's room, so it
         prints exactly where — and as big as — the emoji reads on screen -->
    {@const box = Math.round(size * EMOJI_PAD)}
    <img class="painted" src={painted} alt="" style="width: {box}px; height: {box}px; margin: {(size - box) / 2}px" />
  {/if}
{/if}

<style>
  .cico { display: inline-flex; align-items: center; justify-content: center; }
  .cico :global(svg) { width: 100%; height: 100%; }
  .emoji { line-height: 1; }
  /* the picture only exists on paper; the glyph is the one on screen */
  .painted { display: none; }
  @media print {
    .emoji { display: none; }
    .painted { display: block; }
  }
</style>
