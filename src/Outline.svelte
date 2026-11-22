<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Editor as TipTap } from '@tiptap/core';
  import { Selection } from '@tiptap/pm/state';

  let { scrollEl, editor }: { scrollEl: HTMLElement | null | undefined; editor?: TipTap } = $props();

  let marks = $state<{ top: number; text: string; preview: string; on: boolean; el: HTMLElement }[]>([]);
  let overflow = $state(false);
  let stretched = $state<number | null>(null);
  let peeked = $state<number | null>(null);
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  const PEEK_WAIT = 500;
  const tickWidth = (i: number) => (stretched === null ? 5 : ([28, 21, 15][Math.abs(i - stretched)] ?? 5));
  let raf = 0;

  function enter(i: number) {
    stretched = i;
    clearTimeout(peekTimer);
    if (peeked !== null) { peeked = i; return; }
    peekTimer = setTimeout(() => (peeked = i), PEEK_WAIT);
  }
  function leave() {
    clearTimeout(peekTimer);
    stretched = null;
    peeked = null;
  }

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
      const span = Math.max(320, sc.clientHeight * 0.8, sc.scrollHeight / 24);
      const blocks = [...root.children] as HTMLElement[];
      const level = Math.min(...blocks.slice(1).filter((el) => /^H[1-6]$/.test(el.tagName)).map((el) => +el.tagName[1]));
      const cuts: { el: HTMLElement; top: number }[] = [];
      let prev = -Infinity;
      for (const el of blocks) {
        const at = el.getBoundingClientRect().top - base;
        if (!(prev === -Infinity || el.tagName === `H${level}` || at - prev >= span)) continue;
        cuts.push({ el, top: at });
        prev = at;
      }
      marks = cuts.map((cut, i) => {
        let preview = '', e = cut.el.nextElementSibling;
        while (e && e !== cuts[i + 1]?.el && preview.length < 240) { preview += textOf(e) + ' '; e = e.nextElementSibling; }
        return {
          top: cut.top,
          text: textOf(cut.el),
          preview: preview.trim(),
          on: cut.top < bottom && (cuts[i + 1]?.top ?? sc.scrollHeight) > top,
          el: cut.el,
        };
      }).filter((m) => m.text || m.preview);
    });
  }
  function go(top: number, el: HTMLElement) {
    if (editor && !editor.isDestroyed && editor.view.dom.contains(el)) {
      const { doc } = editor.state, inside = doc.resolve(editor.view.posAtDOM(el, 0));
      if (inside.depth > 0) {
        editor.view.dispatch(editor.state.tr.setSelection(Selection.near(doc.resolve(inside.end(1)), -1)));
        editor.view.focus();
      }
    }
    scrollEl?.scrollTo({ top: Math.max(0, top - 44), behavior: 'smooth' });
  }

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
  <nav class="outline" class:peeking={stretched !== null} aria-label="Sections" onmouseleave={leave}>
    {#each marks as h, i (i)}
      <button class="tick" tabindex="-1" class:on={h.on} class:hov={stretched === i} style="--w: {tickWidth(i)}px" onmouseenter={() => enter(i)}
        onmousedown={(e) => e.preventDefault()} onclick={() => go(h.top, h.el)}>
        <i></i>
        {#if peeked === i}
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
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%); z-index: var(--z-rail);
    display: flex; flex-direction: column; gap: 2px; max-height: 72%;
  }
  .tick { position: relative; display: flex; align-items: center; height: 8px; width: 44px; padding: 0; border: 0; background: none; }
  .tick i { display: block; width: var(--w); height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--fg) 12%, transparent); transition: background 0.2s, width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), height 0.2s; }
  .outline:not(.peeking) .tick.on i, .tick.hov i { background: var(--fg); }
  .tick.hov i { height: 3px; }
  .peek { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); z-index: var(--z-raised); pointer-events: none; }
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
