<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';

  /**
   * Section outline in place of a scrollbar: one tick per heading, dark while that section is on screen;
   * hovering a tick shows the section's title and first lines. Only when the page does not fit its scroller.
   * Positioned against the nearest positioned ancestor, so put it next to the scroller, not inside it.
   */
  let { scrollEl, editor }: { scrollEl: HTMLElement | null | undefined; editor?: TipTap } = $props();

  let heads = $state<{ top: number; text: string; preview: string; level: number; on: boolean }[]>([]);
  let overflow = $state(false);
  let hover = $state<number | null>(null);
  // tick length: all equal at rest; the hovered one stretches and its neighbours follow in a wave
  const tickWidth = (i: number) => (hover === null ? 10 : ([28, 21, 15][Math.abs(i - hover)] ?? 10));
  let raf = 0;

  function measure() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const sc = scrollEl;
      const root = sc?.querySelector('.tiptap');
      if (!sc || !root) return;
      const top = sc.scrollTop, bottom = top + sc.clientHeight;
      const base = sc.getBoundingClientRect().top - top;
      const last = root.lastElementChild;
      overflow = !!last && last.getBoundingClientRect().bottom - base > sc.clientHeight;
      const hs = [...root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5')];
      const tops = hs.map((h) => h.getBoundingClientRect().top - base);
      heads = hs.map((h, i) => {
        let preview = '', e = h.nextElementSibling;
        while (e && !/^H[1-5]$/.test(e.tagName) && preview.length < 240) { preview += (e.textContent?.trim() ?? '') + ' '; e = e.nextElementSibling; }
        return {
          top: tops[i], text: h.textContent?.trim() || '…', preview: preview.trim(), level: Number(h.tagName[1]),
          on: tops[i] < bottom && (tops[i + 1] ?? sc.scrollHeight) > top,
        };
      });
    });
  }
  const go = (top: number) => scrollEl?.scrollTo({ top: Math.max(0, top - 44), behavior: 'smooth' });

  $effect(() => {
    const sc = scrollEl;
    if (!sc) return;
    const ed = editor;
    const ro = new ResizeObserver(measure);
    ro.observe(sc);
    sc.addEventListener('scroll', measure, { passive: true });
    ed?.on('update', measure);
    measure();
    return () => {
      ro.disconnect();
      sc.removeEventListener('scroll', measure);
      ed?.off('update', measure);
      cancelAnimationFrame(raf);
    };
  });
</script>

{#if overflow && heads.length}
  <nav class="outline" class:peeking={hover !== null} aria-label="Sections" onmouseleave={() => (hover = null)}>
    {#each heads as h, i (i)}
      <button class="tick" class:on={h.on} class:hov={hover === i} style="--w: {tickWidth(i)}px" onmouseenter={() => (hover = i)} onclick={() => go(h.top)}>
        <i></i>
        {#if hover === i}
          <span class="peek"><span class="peek-in" in:fly={{ x: -8, duration: 150 }}>
            <b>{h.text}</b>{#if h.preview}<span class="pv">{h.preview}</span>{/if}
          </span></span>
        {/if}
      </button>
    {/each}
  </nav>
{/if}

<style>
  .outline {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%); z-index: 4;
    display: flex; flex-direction: column; gap: 2px; max-height: 72%;
  }
  .tick { position: relative; display: flex; align-items: center; height: 8px; width: 44px; padding: 0; border: 0; background: none; }
  /* equal faint dashes; sections on screen are dark. Hovering one stretches it (and its neighbours, in a wave). */
  .tick i { display: block; width: var(--w); height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--fg) 12%, transparent); transition: background 0.2s, width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.2s; }
  /* while a tick is hovered only that one is dark; the on-screen marks fade back */
  .outline:not(.peeking) .tick.on i, .tick.hov i { background: var(--fg); }
  .tick.hov i { height: 3px; }
  .peek { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); z-index: 5; }
  .peek-in {
    display: flex; flex-direction: column; gap: 5px; width: min(460px, 60vw); padding: 12px 16px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: 0 0 0 0.5px var(--line), 0 12px 36px rgba(0, 0, 0, 0.16);
    text-align: left; font-size: 13px; line-height: 1.45; color: var(--fg);
  }
  .peek b { display: block; font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pv {
    color: var(--fg-dim); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical;
    mask-image: linear-gradient(#000 50%, transparent); -webkit-mask-image: linear-gradient(#000 50%, transparent);
  }
</style>
