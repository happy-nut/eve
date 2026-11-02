<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { slides, alone, path } from './lib/slides';
  import { stepper } from './lib/diagramMotion';
  import { wholeScreen, isTauri, isMobile } from './lib/platform';
  import { appearance } from './lib/appearance.svelte';

  /**
   * The open note a slide at a time, over everything (⋯ → Present), cut by itself (slides.ts): a slide at each of its
   * biggest headings. → (Space, ↓, a click on the right) goes on, ← (↑, a click on the left) back, Esc or a phone's
   * back leaves. A section longer than the screen is one slide, scrolled through a screen a press, not cut onto the
   * next (a long code block went on to a slide of its own, its first lines left behind). A diagram is a slide of its
   * own, as big as the screen holds it, and one that draws itself in is walked a step at a time first, before → turns
   * the page. Past the last slide, a screen says it is the end. F (or its button) puts it on the whole screen and back.
   */
  // read once: the slides are the page as it was when the presentation began
  const page = ui.present!, from = ui.presentFrom;
  // copies of the note's blocks as they are drawn now: diagrams, formulas and pictures the same, nothing to edit
  const sections = slides([...page.children]).map((blocks) => blocks.map((b) => {
    const c = b.cloneNode(true) as HTMLElement;
    if (b === from) c.dataset.from = ''; // the block presented from: its slide comes up first
    for (const e of [c, ...c.querySelectorAll('[contenteditable]')]) e.removeAttribute('contenteditable');
    // a diagram as big as its slide holds it (the note sets it a width, and a least one, to keep it legible there)
    for (const svg of c.querySelectorAll<SVGSVGElement>('.mermaid-view svg')) Object.assign(svg.style, { width: '', minWidth: '', maxWidth: '' });
    // a table laid out afresh for the slide's width: the column widths the note held it to (a narrower page's) left
    // it squeezed into the slide's left side
    for (const t of [c, ...c.querySelectorAll('.tableWrapper')]) t.classList.remove('held');
    for (const cell of c.querySelectorAll<HTMLElement>('table, col, th, td')) Object.assign(cell.style, { width: '', minWidth: '' });
    return c;
  }));
  let at = $state(0);
  /** a long slide scrolled past its headings: the section's two outermost, said in a bar over its top */
  let pinned = $state<{ heads: string[]; at: string }>({ heads: [], at: '' });
  function pin() {
    const r = body.getBoundingClientRect(), rb = box.getBoundingClientRect();
    const gone = body.scrollTop > 4 ? [...body.children].filter((b) => b.getBoundingClientRect().bottom <= r.top + 4) : [];
    const heads = path(gone).slice(0, 2).map((h) => h.textContent?.trim() ?? '');
    pinned = { heads, at: `top: ${r.top - rb.top}px; left: ${r.left - rb.left}px; width: ${r.width}px` };
  }
  /** gone past the last slide: the end says so */
  let ended = $state(false);
  let box: HTMLDivElement, body: HTMLDivElement;
  /** the diagrams on the slide shown, each with the step it is at */
  /** the slide up is taller than the screen, scrolled through before the page turns */
  let tall = false;
  let walks: { svg: SVGSVGElement; walk: ReturnType<typeof stepper>; k: number }[] = [];

  /** a block with a diagram in it */
  const chart = (b: Element) => !!b.querySelector('.mermaid-view');
  const again = (h: Element) => { const c = h.cloneNode(true) as Element; c.classList.add('again'); return c; };
  // a divider at a slide's edge has nothing to divide there
  const hr = (b?: Element) => b?.tagName === 'HR' || (b?.childElementCount === 1 && b.firstElementChild!.tagName === 'HR' && !b.textContent?.trim());
  const trim = (s: Element[]) => { s = [...s]; while (hr(s[0])) s.shift(); while (hr(s.at(-1))) s.pop(); return s; };
  const deck = alone(sections, chart, again).map(trim).filter((s) => s.length);
  at = Math.max(0, deck.findIndex((s) => s.some((b) => b.hasAttribute('data-from') && !b.classList.contains('again'))));

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
    ended = false;
    await tick();
    body.replaceChildren(...deck[i]);
    body.classList.toggle('chart', deck[i].some(chart));
    // a diagram's slide is a column (the diagram takes what is left of it): its headings one row of crumbs at its top
    const crumbs = [...body.children].filter((b) => b.classList.contains('again'));
    if (crumbs.length && body.classList.contains('chart')) { const row = document.createElement('div'); row.className = 'crumbs'; body.prepend(row); row.append(...crumbs); }
    // taller than the screen, measured before its lines come in: while they rise they reach below it for a moment
    tall = body.scrollHeight > body.clientHeight + 2;
    if (animate) turn(old, back);
    body.scrollTop = back ? body.scrollHeight : 0;
    pin();
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
    if (tall && body.scrollTop + body.clientHeight < body.scrollHeight - 2) return body.scrollBy({ top: body.clientHeight * 0.85, behavior: 'smooth' });
    if (at < deck.length - 1) void go(at + 1);
    else ended = true; // past the last: the end, which stays until ← or Esc
  }
  function prev() {
    if (ended) { ended = false; return; }
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
    else if (k === 'f' || k === 'F') void whole(!full);
    else if (k === 'Home') void go(0);
    else if (k === 'End') void go(deck.length - 1, true);
    else if (k !== 'Tab') return;
    e.preventDefault();
  }
  function onClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('a, button')) return;
    (e.clientX < box.clientWidth / 3 ? prev : next)();
  }

  // ---- the whole screen: the Mac's window over it all, or the page's (a browser, a phone) ----
  const desktop = isTauri && !isMobile;
  const canWhole = desktop || (typeof document !== 'undefined' && !!document.fullscreenEnabled);
  let full = $state(false);
  /** put on the whole screen or taken off it; false when nothing changed */
  async function whole(on: boolean): Promise<boolean> {
    try {
      if (desktop) { const changed = await wholeScreen(on); full = on; return changed; }
      if (on && !document.fullscreenElement) { await box.requestFullscreen(); return true; }
      if (!on && document.fullscreenElement) { await document.exitFullscreen(); return true; }
    } catch { /* refused (a page not allowed it): stays as it was */ }
    return false;
  }
  const onFull = () => { if (!desktop) full = !!document.fullscreenElement; };

  onMount(() => {
    box.focus();
    void go(at, false, false);
    // taller than the screen or not, again as the window changes size (going to the whole screen, as it starts, too)
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { tall = body.scrollHeight > body.clientHeight + 2; });
    watch?.observe(box);
    // the Mac's window over the whole screen while it is up, as a slideshow is (and back as it was after)
    const screen = desktop ? whole(true) : Promise.resolve(false);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      watch?.disconnect(); document.removeEventListener('fullscreenchange', onFull);
      void screen.then((changed) => { if (desktop ? changed || full : true) void whole(false); });
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="present" bind:this={box} role="dialog" aria-label="Presentation" tabindex="-1"
  transition:fade|global={scrimFade} onkeydown={onKey} onclick={onClick}>
  <div class="tiptap slide" class:first={at === 0} class:hidden={ended} bind:this={body} onscroll={pin}></div>
  {#if pinned.heads.length && !ended}
    <!-- the section a long slide is in, its headings scrolled away: said over the top of its words, as a page's header -->
    <div class="pinned" style={pinned.at} transition:fade={{ duration: 120 }}>
      {#each pinned.heads as h, i (i)}{#if i}<span class="sep">›</span>{/if}<span>{h}</span>{/each}
    </div>
  {/if}
  {#if ended}
    <!-- past the last slide: it says so, rather than a press that does nothing -->
    <div class="end" in:fade={{ duration: 200 }}>
      <p class="end-title">End of presentation</p>
      <p class="end-hint">Esc to leave · ← back to the last slide</p>
    </div>
  {/if}
  <div class="count" aria-live="polite">{ended ? 'End' : `${at + 1} / ${deck.length}`}</div>
  <div class="corner">
    {#if canWhole}
      <button class="whole" aria-label={full ? 'Exit full screen' : 'Full screen'} title={full ? 'Exit full screen (F)' : 'Full screen (F)'} onclick={() => void whole(!full)}>
        {#if full}<svg viewBox="0 0 16 16"><path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5"/></svg>
        {:else}<svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10"/></svg>{/if}
      </button>
    {/if}
    <button class="done" aria-label="End the presentation" title="End the presentation (Esc)" onclick={() => ui.closePresent()}>
      <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>
    </button>
  </div>
</div>

<style>
  .present {
    position: fixed; inset: 0; z-index: var(--z-photo); display: flex; align-items: center; justify-content: center;
    padding: calc(max(40px, 9vh) + var(--top, 0px)) 0 calc(40px + var(--bottom, 0px)); box-sizing: border-box;
    background: var(--bg); outline: none; cursor: default;
  }
  /* the note's own styles (.tiptap), a size up for a room to read it from */
  .slide {
    /* the whole screen's width, as a slide is, and words sized to the screen both ways, so a slide looks the same on
       any screen of its shape and a big one is not a narrow column of small type */
    --font-size: clamp(17px, min(2vw, 3.4vh), 48px); font-size: var(--font-size);
    width: calc(100% - 2 * max(24px, 5vw)); max-height: 100%; overflow-y: auto; scrollbar-width: none;
    margin: 0; align-self: flex-start; pointer-events: none; user-select: none;
  }
  /* the first slide, the title's, in the middle of the screen; the others from the top, each heading where the last was.
     Its title a cover's: well over the headings of the slides after it */
  .slide.first { align-self: center; }
  .slide.first > :global(h1:first-child) { font-size: 2.2em; font-weight: 700; line-height: 1.12; letter-spacing: -0.025em; margin-bottom: 0.35em; }
  .slide.hidden { visibility: hidden; }
  /* a diagram's slide: the diagram as big as the screen holds it, under its headings */
  .slide:global(.chart) { display: flex; flex-direction: column; height: 100%; }
  .slide:global(.chart) > :global(.code-block) { flex: 1; min-height: 0; margin: 0; }
  .slide:global(.chart) :global(:is(.mermaid-host, .dblock, .pic, .mermaid-view)) { height: 100%; min-height: 0; margin: 0; box-shadow: none; }
  .slide:global(.chart) :global(.mermaid-view) { display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .slide:global(.chart) :global(.mermaid-view > svg) { width: 100% !important; height: 100% !important; max-width: none !important; max-height: none; }
  /* the slide that was up, going as the next comes */
  .present > :global(.leaving) { pointer-events: none; overflow: hidden; }
  .slide :global(.mermaid-expand) { display: none; }
  .slide::-webkit-scrollbar { display: none; }
  .slide > :global(:first-child) { margin-top: 0; }
  /* a heading shown again, the slide going on under it: small, up in the corner, as a breadcrumb, the room for words */
  .slide :global(.again) {
    display: inline-block; margin: 0 0 1em; font-size: 0.55em; line-height: 1.3; font-weight: 600; color: var(--fg-dim);
  }
  .slide :global(.again + .again)::before { content: '›'; margin: 0 0.5em; font-weight: 400; }
  /* lines further apart than in the note, as a slide is read from across a room: an inline code's chip (its tint
     spreads past its text) reached into the line under it */
  .slide { line-height: 1.75; }
  .slide :global(:not(pre) > code) { box-shadow: 0 0 0 0.1em var(--code-bg); padding-block: 0.05em; }
  /* a table the slide's width (its widths from the note are taken off its copy, above) */
  .slide :global(.tableWrapper) { overflow: visible; }
  .slide :global(table) { width: 100%; }
  /* paragraphs apart, as a page of prose reads */
  .slide > :global(p + p) { margin-top: 0.6em; }
  /* a copy to look at: a block's own tools have no place on a slide */
  .slide :global(:is(.tools, .codebar, .foldchips, .drag-handle, .block-handle)) { display: none !important; }
  .pinned {
    position: absolute; z-index: var(--z-raised); display: flex; gap: 0.5em; padding: 0 0 0.7em;
    font-size: calc(clamp(17px, min(2vw, 3.4vh), 48px) * 0.55); line-height: 1.3; font-weight: 600; color: var(--fg-dim); /* the slide's crumbs' size */
    background: linear-gradient(var(--bg) 70%, transparent); pointer-events: none;
  }
  .pinned .sep { font-weight: 400; }
  .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; pointer-events: none; }
  .end-title { margin: 0; font-size: clamp(22px, min(3vw, 5vh), 56px); font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
  .end-hint { margin: 0; font-size: 14px; color: var(--fg-dim); }
  .count { position: absolute; right: 20px; bottom: calc(14px + var(--bottom, 0px)); color: var(--fg-dim); font-size: 12px; font-variant-numeric: tabular-nums; }
  .corner { position: absolute; top: calc(12px + var(--top, 0px)); right: 14px; display: flex; gap: 4px; }
  .corner button {
    width: 28px; height: 28px; border: 0; border-radius: 6px;
    background: none; color: var(--fg-dim); display: inline-flex; align-items: center; justify-content: center; opacity: 0.5;
  }
  .corner button:hover, .corner button:focus-visible { opacity: 1; background: var(--bg-hover); }
  .corner svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
</style>
