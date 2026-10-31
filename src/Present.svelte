<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { slides, paginate } from './lib/slides';
  import { stepper } from './lib/diagramMotion';
  import { wholeScreen } from './lib/platform';
  import { appearance } from './lib/appearance.svelte';

  /**
   * The open note a slide at a time, over everything (⋯ → Present), cut by itself (slides.ts): a slide at each of its
   * biggest headings, and one of those longer than the screen goes on to the next, cut again as the window changes size. → (Space, ↓, a click on the right) goes on, ← (↑, a click on the left) back, Esc or a phone's
   * back leaves. A diagram that draws itself in is walked a step at a time first, and a slide taller than the screen
   * scrolled through, before → turns the page.
   */
  // read once: the slides are the page as it was when the presentation began
  const page = ui.present!;
  // copies of the note's blocks as they are drawn now: diagrams, formulas and pictures the same, nothing to edit
  const sections = slides([...page.children]).map((blocks) => blocks.map((b) => {
    const c = b.cloneNode(true) as HTMLElement;
    for (const e of [c, ...c.querySelectorAll('[contenteditable]')]) e.removeAttribute('contenteditable');
    // a diagram larger than in the note, up to twice its size, as much as the slide holds (the note sets it a width)
    for (const svg of c.querySelectorAll<SVGSVGElement>('.mermaid-view svg')) {
      const w = parseFloat(svg.style.width);
      if (w) Object.assign(svg.style, { width: `min(100%, ${w * 2}px)`, maxWidth: 'none' });
    }
    return c;
  }));
  let deck = $state.raw<Element[][]>([]);
  let at = $state(0);
  let box: HTMLDivElement, body: HTMLDivElement;
  /** the diagrams on the slide shown, each with the step it is at */
  let walks: { svg: SVGSVGElement; walk: ReturnType<typeof stepper>; k: number }[] = [];

  /** the slides cut to the screen as it is now, measured on the slide itself; still on the same words after */
  function cut() {
    const here = deck[at]?.find((b) => !b.classList.contains('again'));
    // the room is the screen's, not the slide's: the slide is only as tall as what is on it
    const pad = getComputedStyle(box), room = box.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
    deck = paginate(sections, (blocks) => {
      body.replaceChildren(...blocks);
      return !(room > 0) || body.scrollHeight <= room + 1; // (no room measured: a page with no layout, one slide a section)
    }, (h) => { const c = h.cloneNode(true) as Element; c.classList.add('again'); return c; });
    const i = here ? deck.findIndex((s) => s.includes(here)) : 0;
    void go(Math.max(0, i), false, false);
  }

  const EASE = 'cubic-bezier(.2, .7, .2, 1)';
  /**
   * The page turned (Settings → Appearance → Presenting): the slide leaving drawn over as a copy that goes, the new one
   * coming in from the side it is turned to; then its lines one after another. A slide going on under the heading the
   * last one had turns no page: its heading stays where it is and only the words under it change.
   */
  function turn(old: { el: HTMLElement; at: DOMRect; top: number } | null, back: boolean) {
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const head = (e: Element | null | undefined) => (e && /^H[1-6]$/.test(e.tagName) ? e.textContent : null);
    const same = !!old && head(old.el.firstElementChild) != null && head(old.el.firstElementChild) === head(body.firstElementChild);
    const kind = same ? 'none' : appearance.s.slideTurn;
    const d = back ? -1 : 1;
    const frames: Record<string, [Keyframe[], Keyframe[]]> = {
      push: [[{ transform: `translateX(${-6 * d}vw)`, opacity: 0 }], [{ transform: `translateX(${6 * d}vw)`, opacity: 0 }, {}]],
      fade: [[{ opacity: 0 }], [{ opacity: 0 }, {}]],
      zoom: [[{ transform: 'scale(1.04)', opacity: 0 }], [{ transform: 'scale(.96)', opacity: 0 }, {}]],
    };
    const f = frames[kind];
    if (old && f) {
      // the copy where the slide was, gone as the new one comes
      const rb = box.getBoundingClientRect(), { el } = old;
      Object.assign(el.style, { position: 'absolute', left: `${old.at.left - rb.left}px`, top: `${old.at.top - rb.top}px`, width: `${old.at.width}px`, height: `${old.at.height}px`, margin: '0' });
      el.classList.remove('first');
      el.classList.add('leaving');
      box.append(el);
      el.scrollTop = old.top;
      el.animate(f[0], { duration: 260, easing: EASE, fill: 'forwards' }).finished.finally(() => el.remove());
      body.animate(f[1], { duration: 420, easing: EASE });
    }
    if (!appearance.s.slideBuild) return;
    // the lines, one after another (the heading it goes on under already there)
    [...body.children].filter((b) => !b.classList.contains('again')).slice(0, 14).forEach((b, n) =>
      b.animate([{ opacity: 0, transform: 'translateY(.6em)' }, {}], { duration: 380, delay: (f && !same ? 120 : 0) + n * 55, easing: EASE, fill: 'backwards' }));
  }

  /** slide `i` put up, its diagrams at their first step (come to going forward) or whole (going back) */
  async function go(i: number, back = false, animate = true) {
    // what was up, kept to be drawn leaving
    const old = animate && body?.childElementCount ? { el: body.cloneNode(true) as HTMLElement, at: body.getBoundingClientRect(), top: body.scrollTop } : null;
    at = i;
    await tick();
    body.replaceChildren(...deck[i]);
    if (animate) turn(old, back);
    body.scrollTop = back ? body.scrollHeight : 0;
    walks = [...body.querySelectorAll<SVGSVGElement>('svg[aria-roledescription]')].map((svg) => {
      const walk = stepper(svg);
      const k = back ? walk.count - 1 : 0;
      walk.show(k);
      return { svg, walk, k };
    }).filter((w) => w.walk.count);
  }
  function next() {
    const w = walks.find((w) => w.k < w.walk.count - 1);
    if (w) { w.walk.show(++w.k); w.svg.scrollIntoView?.({ block: 'nearest' }); return; }
    if (body.scrollTop + body.clientHeight < body.scrollHeight - 2) return body.scrollBy({ top: body.clientHeight * 0.85, behavior: 'smooth' });
    if (at < deck.length - 1) void go(at + 1);
  }
  function prev() {
    const w = walks.findLast((w) => w.k > 0);
    if (w) { w.walk.show(--w.k); return; }
    if (body.scrollTop > 2) return body.scrollBy({ top: -body.clientHeight * 0.85, behavior: 'smooth' });
    if (at > 0) void go(at - 1, true);
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation(); // nothing behind it acts on a key while it is up
    const k = e.key;
    if (k === 'Escape') ui.closePresent();
    else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(k)) next();
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) prev();
    else if (k === 'Home') void go(0);
    else if (k === 'End') void go(deck.length - 1, true);
    else if (k !== 'Tab') return;
    e.preventDefault();
  }
  function onClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('a, button')) return;
    (e.clientX < box.clientWidth / 3 ? prev : next)();
  }

  onMount(() => {
    box.focus();
    cut();
    // cut again as the window changes size (going to the whole screen, as it starts, too)
    let h = box.clientHeight, w = box.clientWidth, wait = 0;
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (box.clientHeight === h && box.clientWidth === w) return;
      h = box.clientHeight; w = box.clientWidth;
      clearTimeout(wait);
      wait = window.setTimeout(cut, 150);
    });
    watch?.observe(box);
    // the Mac's window over the whole screen while it is up, as a slideshow is (and back as it was after)
    const screen = wholeScreen(true).catch(() => false);
    return () => { watch?.disconnect(); clearTimeout(wait); void screen.then((changed) => changed && wholeScreen(false)); };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="present" bind:this={box} role="dialog" aria-label="Presentation" tabindex="-1"
  transition:fade|global={scrimFade} onkeydown={onKey} onclick={onClick}>
  <div class="tiptap slide" class:first={at === 0} bind:this={body}></div>
  <div class="count" aria-live="polite">{at + 1} / {deck.length}</div>
  <button class="done" title="End the presentation (Esc)" onclick={() => ui.closePresent()}>
    <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>
  </button>
</div>

<style>
  .present {
    position: fixed; inset: 0; z-index: var(--z-photo); display: flex; align-items: center; justify-content: center;
    padding: calc(max(40px, 9vh) + var(--top, 0px)) 0 calc(40px + var(--bottom, 0px)); box-sizing: border-box;
    background: var(--bg); outline: none; cursor: default;
  }
  /* the note's own styles (.tiptap), a size up for a room to read it from */
  .slide {
    --font-size: clamp(17px, 2.1vw, 30px); font-size: var(--font-size);
    width: min(100% - 48px, 100% - 12vw, 40em); max-height: 100%; overflow-y: auto; scrollbar-width: none;
    margin: 0; align-self: flex-start; pointer-events: none; user-select: none;
  }
  /* the first slide, the title's, in the middle of the screen; the others from the top, each heading where the last was */
  .slide.first { align-self: center; }
  /* the slide that was up, going as the next comes */
  .present > :global(.leaving) { pointer-events: none; overflow: hidden; }
  .slide :global(.mermaid-view svg) { height: auto; max-height: 50vh; } /* room left for the headings above it */
  .slide::-webkit-scrollbar { display: none; }
  .slide > :global(:first-child) { margin-top: 0; }
  /* a copy to look at: a block's own tools have no place on a slide */
  .slide :global(:is(.tools, .codebar, .foldchips, .drag-handle, .block-handle)) { display: none !important; }
  .count { position: absolute; right: 20px; bottom: calc(14px + var(--bottom, 0px)); color: var(--fg-dim); font-size: 12px; font-variant-numeric: tabular-nums; }
  .done {
    position: absolute; top: calc(12px + var(--top, 0px)); right: 14px; width: 28px; height: 28px; border: 0; border-radius: 6px;
    background: none; color: var(--fg-dim); display: inline-flex; align-items: center; justify-content: center; opacity: 0.5;
  }
  .done:hover, .done:focus-visible { opacity: 1; background: var(--bg-hover); }
  .done svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
</style>
