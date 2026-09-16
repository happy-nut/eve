<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';

  /**
   * Section outline in place of a scrollbar: a tick per heading, dark while that stretch is on screen;
   * hovering a tick shows its first lines. A note written without headings still gets a usable rail —
   * any stretch taller than about a screenful is cut into ticks of its own, so the marks always track
   * the scroll. Only when the page does not fit its scroller. Positioned against the nearest positioned
   * ancestor, so put it next to the scroller, not inside it.
   */
  let { scrollEl, editor }: { scrollEl: HTMLElement | null | undefined; editor?: TipTap } = $props();

  let marks = $state<{ top: number; text: string; preview: string; on: boolean }[]>([]);
  let overflow = $state(false);
  let hover = $state<number | null>(null); // the tick under the pointer: stretches at once
  let peek = $state<number | null>(null); // the one showing its lines: only after a pause
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  const PEEK_WAIT = 500;
  // tick length: all equal at rest; the hovered one stretches and its neighbours follow in a wave
  const tickWidth = (i: number) => (hover === null ? 5 : ([28, 21, 15][Math.abs(i - hover)] ?? 5));
  let raf = 0;

  /** Pointing at a tick stretches it now; the balloon waits — unless one is already open, then it follows. */
  function enter(i: number) {
    hover = i;
    clearTimeout(peekTimer);
    if (peek !== null) { peek = i; return; }
    peekTimer = setTimeout(() => (peek = i), PEEK_WAIT);
  }
  /** off the rail: everything goes at once (the balloon takes no pointer, so crossing it counts as off) */
  function leave() {
    clearTimeout(peekTimer);
    hover = null;
    peek = null;
  }

  /** what a block reads as: the checkbox's screen-reader label is not part of the line */
  function textOf(el: Element): string {
    const copy = el.cloneNode(true) as HTMLElement;
    for (const hidden of copy.querySelectorAll('label, [aria-hidden="true"]')) hidden.remove();
    return copy.textContent?.trim() ?? '';
  }

  function measure() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const sc = scrollEl;
      const root = sc?.querySelector('.tiptap');
      if (!sc || !root) return;
      const top = sc.scrollTop, bottom = top + sc.clientHeight;
      const base = sc.getBoundingClientRect().top - top;
      const end = root.lastElementChild;
      overflow = !!end && end.getBoundingClientRect().bottom - base > sc.clientHeight;
      // a tick starts at every heading, and again wherever a stretch has run longer than a screenful
      // …and never more ticks than the rail can hold: a very long note stretches its stride instead
      const span = Math.max(320, sc.clientHeight * 0.8, sc.scrollHeight / 24);
      const blocks = [...root.children] as HTMLElement[];
      const cuts: { el: HTMLElement; top: number }[] = [];
      let prev = -Infinity;
      for (const el of blocks) {
        const at = el.getBoundingClientRect().top - base;
        if (!(prev === -Infinity || /^H[1-5]$/.test(el.tagName) || at - prev >= span)) continue;
        cuts.push({ el, top: at });
        prev = at;
      }
      marks = cuts.map((cut, i) => {
        // (a tick with nothing to show — the empty line at the very bottom — is dropped below)
        // the title line, then whatever follows it until the next tick
        let preview = '', e = cut.el.nextElementSibling;
        while (e && e !== cuts[i + 1]?.el && preview.length < 240) { preview += textOf(e) + ' '; e = e.nextElementSibling; }
        return {
          top: cut.top,
          text: textOf(cut.el),
          preview: preview.trim(),
          on: cut.top < bottom && (cuts[i + 1]?.top ?? sc.scrollHeight) > top,
        };
      }).filter((m) => m.text || m.preview); // the trailing empty line is not a place to scroll to
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
      clearTimeout(peekTimer);
    };
  });
</script>

{#if overflow && marks.length > 1}
  <nav class="outline" class:peeking={hover !== null} aria-label="Sections" onmouseleave={leave}>
    {#each marks as h, i (i)}
      <!-- tabindex -1: a mouse-only jump strip, Tab from the editor should not land in it -->
      <button class="tick" tabindex="-1" class:on={h.on} class:hov={hover === i} style="--w: {tickWidth(i)}px" onmouseenter={() => enter(i)} onclick={() => go(h.top)}>
        <i></i>
        {#if peek === i}
          <span class="peek"><span class="peek-in" in:fade={{ duration: 180 }}>
            <b>{h.text || '…'}</b>{#if h.preview}<span class="pv">{h.preview}</span>{/if}
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
  /* takes no pointer: moving onto it counts as leaving the rail, so it closes right away */
  .peek { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); z-index: 5; pointer-events: none; }
  .peek-in {
    display: flex; flex-direction: column; gap: 5px; width: min(230px, 34vw); padding: 10px 13px; border-radius: 10px;
    background: var(--bg-pop); box-shadow: 0 0 0 0.5px var(--line), 0 12px 36px rgba(0, 0, 0, 0.16);
    text-align: left; font-size: 13px; line-height: 1.45; color: var(--fg);
  }
  .peek b { display: block; font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pv {
    color: var(--fg-dim); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical;
    mask-image: linear-gradient(#000 50%, transparent); -webkit-mask-image: linear-gradient(#000 50%, transparent);
  }
</style>
