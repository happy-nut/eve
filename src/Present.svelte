<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { slides } from './lib/slides';
  import { stepper } from './lib/diagramMotion';
  import { wholeScreen } from './lib/platform';

  /**
   * The open note a slide at a time, over everything (⋯ → Present): a slide at each divider and each of its biggest
   * headings (slides.ts). → (Space, ↓, a click on the right) goes on, ← (↑, a click on the left) back, Esc or a phone's
   * back leaves. A diagram that draws itself in is walked a step at a time first, and a slide taller than the screen
   * scrolled through, before → turns the page.
   */
  // read once: the slides are the page as it was when the presentation began
  const page = ui.present!;
  // copies of the note's blocks as they are drawn now: diagrams, formulas and pictures the same, nothing to edit
  const deck = slides([...page.children]).map((blocks) => blocks.map((b) => {
    const c = b.cloneNode(true) as HTMLElement;
    for (const e of [c, ...c.querySelectorAll('[contenteditable]')]) e.removeAttribute('contenteditable');
    return c;
  }));
  let at = $state(0);
  let box: HTMLDivElement, body: HTMLDivElement;
  /** the diagrams on the slide shown, each with the step it is at */
  let walks: { svg: SVGSVGElement; walk: ReturnType<typeof stepper>; k: number }[] = [];

  /** slide `i` put up, its diagrams at their first step (come to going forward) or whole (going back) */
  async function go(i: number, back = false) {
    at = i;
    await tick();
    body.replaceChildren(...deck[i]);
    body.scrollTop = back ? body.scrollHeight : 0;
    // a diagram larger than in the note, up to twice its size, as much as the slide holds (the note sets it a width)
    for (const svg of body.querySelectorAll<SVGSVGElement>('.mermaid-view svg')) {
      const w = parseFloat(svg.style.width);
      if (w) Object.assign(svg.style, { width: `min(100%, ${w * 2}px)`, maxWidth: 'none' });
    }
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
    void go(0);
    // the Mac's window over the whole screen while it is up, as a slideshow is (and back as it was after)
    const screen = wholeScreen(true).catch(() => false);
    return () => void screen.then((changed) => changed && wholeScreen(false));
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
  .slide :global(.mermaid-view svg) { height: auto; max-height: 62vh; }
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
