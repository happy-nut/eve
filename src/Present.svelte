<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { slides, alone, path, endHint } from './lib/slides';
  import { stepper } from './lib/diagramMotion';
  import { wholeScreen, ownWholeScreen, isMobile } from './lib/platform';
  import { appearance } from './lib/appearance.svelte';
  import { followPointer } from './lib/followPointer';

  const page = ui.present!, from = ui.presentFrom;
  const unsizeDiagram = (c: HTMLElement) => { for (const svg of c.querySelectorAll<SVGSVGElement>('.mermaid-view svg')) Object.assign(svg.style, { width: '', minWidth: '', maxWidth: '' }); };
  const unholdTable = (c: HTMLElement) => {
    for (const t of [c, ...c.querySelectorAll('.tableWrapper')]) t.classList.remove('held');
    for (const cell of c.querySelectorAll<HTMLElement>('table, col, th, td')) Object.assign(cell.style, { width: '', minWidth: '' });
  };
  function slideCopy(b: Element) {
    const c = b.cloneNode(true) as HTMLElement;
    if (b === from) c.dataset.from = '';
    for (const e of [c, ...c.querySelectorAll('[contenteditable]')]) e.removeAttribute('contenteditable');
    unsizeDiagram(c);
    unholdTable(c);
    return c;
  }
  const sections = slides([...page.children]).map((blocks) => blocks.map(slideCopy));
  let at = $state(0);
  let pinned = $state<{ heads: string[]; at: string }>({ heads: [], at: '' });
  function pin() {
    const r = body.getBoundingClientRect(), rb = box.getBoundingClientRect();
    const cs = getComputedStyle(body), pad = parseFloat(cs.paddingTop);
    const top = r.top + pad;
    const gone = body.scrollTop > 4 ? [...body.children].filter((b) => b.getBoundingClientRect().bottom <= top + 4) : [];
    const heads = path(gone).slice(0, 2).map((h) => h.textContent?.trim() ?? '');
    pinned = { heads, at: `top: ${r.top - rb.top}px; padding-top: ${Math.max(0, pad - 0.6 * parseFloat(cs.fontSize))}px; left: ${r.left - rb.left}px; width: ${r.width}px` };
  }
  let ended = $state(false);
  let box: HTMLDivElement, body: HTMLDivElement;
  let tall = false;
  let walks: { svg: SVGSVGElement; walk: ReturnType<typeof stepper>; k: number }[] = [];

  const chart = (b: Element) => !!b.querySelector('.mermaid-view');
  const again = (h: Element) => { const c = h.cloneNode(true) as Element; c.classList.add('again'); return c; };
  const hr = (b?: Element) => b?.tagName === 'HR' || (b?.childElementCount === 1 && b.firstElementChild!.tagName === 'HR' && !b.textContent?.trim());
  const trim = (s: Element[]) => { s = [...s]; while (hr(s[0])) s.shift(); while (hr(s.at(-1))) s.pop(); return s; };
  const deck = alone(sections, chart, again).map(trim).filter((s) => s.length);
  at = Math.max(0, deck.findIndex((s) => s.some((b) => b.hasAttribute('data-from') && !b.classList.contains('again'))));

  const EASE = 'cubic-bezier(.2, .7, .2, 1)';
  type Shown = { el: HTMLElement; at: DOMRect; top: number };
  function leaveCopy(old: Shown, [leave, enter]: [Keyframe[], Keyframe[]]) {
    const rb = box.getBoundingClientRect(), { el } = old;
    Object.assign(el.style, { position: 'absolute', left: `${old.at.left - rb.left}px`, top: `${old.at.top - rb.top}px`, width: `${old.at.width}px`, height: `${old.at.height}px`, margin: '0' });
    el.classList.remove('first');
    el.classList.add('leaving');
    box.append(el);
    el.scrollTop = old.top;
    el.animate(leave, { duration: 260, easing: EASE, fill: 'forwards' }).finished.finally(() => el.remove());
    body.animate(enter, { duration: 420, easing: EASE });
  }
  function buildLines(delay: number) {
    [...body.children].filter((b) => !b.classList.contains('again')).slice(0, 14).forEach((b, n) =>
      b.animate([{ opacity: 0, transform: 'translateY(.6em)' }, {}], { duration: 380, delay: delay + n * 55, easing: EASE, fill: 'backwards' }));
  }
  function turn(old: Shown | null, back: boolean) {
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
    if (old && f) leaveCopy(old, f);
    if (appearance.s.slideBuild) buildLines(f && !same ? 120 : 0);
  }

  let zoomed: { svg: SVGSVGElement; s: number; x: number; y: number } | null = null;
  let dragged = false;
  function zoomTo(svg: SVGSVGElement, s: number, cx: number, cy: number, ease = true) {
    const r = svg.getBoundingClientRect(), z = zoomed ?? { s: 1, x: 0, y: 0 };
    const px = cx - (r.left - z.x), py = cy - (r.top - z.y);
    s = Math.min(8, Math.max(1, s));
    zoomed = { svg, s, x: px - ((px - z.x) / z.s) * s, y: py - ((py - z.y) / z.s) * s };
    draw(ease);
  }
  function draw(ease: boolean) {
    const z = zoomed;
    if (!z) return;
    Object.assign(z.svg.style, { transformOrigin: '0 0', transition: ease ? `transform 0.25s ${EASE}` : 'none', transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` });
    z.svg.parentElement!.classList.add('zoomed');
  }
  function unzoom() {
    if (!zoomed) return false;
    const { svg } = zoomed;
    zoomed = null;
    Object.assign(svg.style, { transform: '', transition: `transform 0.25s ${EASE}` });
    svg.parentElement!.classList.remove('zoomed');
    return true;
  }
  function onDown(e: PointerEvent) {
    const z = zoomed;
    if (!z || e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, zx = z.x, zy = z.y;
    dragged = false;
    const move = (m: PointerEvent) => {
      if (!dragged && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      dragged = true;
      z.x = zx + m.clientX - x0; z.y = zy + m.clientY - y0;
      draw(false);
    };
    followPointer({ move, up: () => {} });
  }
  function onWheel(e: WheelEvent) {
    const z = zoomed;
    if (!z) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomTo(z.svg, z.s * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY, false); if (zoomed!.s <= 1) unzoom(); return; }
    z.x -= e.deltaX; z.y -= e.deltaY;
    draw(false);
  }

  async function go(i: number, back = false, animate = true) {
    unzoom();
    const old = animate && body?.childElementCount ? { el: body.cloneNode(true) as HTMLElement, at: body.getBoundingClientRect(), top: body.scrollTop } : null;
    at = i;
    ended = false;
    await tick();
    body.replaceChildren(...deck[i]);
    body.classList.toggle('chart', deck[i].some(chart));
    const crumbs = [...body.children].filter((b) => b.classList.contains('again'));
    if (crumbs.length && body.classList.contains('chart')) { const row = document.createElement('div'); row.className = 'crumbs'; body.prepend(row); row.append(...crumbs); }
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
    if (unzoom()) return;
    const w = walks.find((w) => w.k < w.walk.count - 1);
    if (w) { w.walk.show(++w.k); w.svg.scrollIntoView?.({ block: 'nearest' }); return; }
    if (tall && body.scrollTop + body.clientHeight < body.scrollHeight - 2) return body.scrollBy({ top: body.clientHeight * 0.85, behavior: 'smooth' });
    if (at < deck.length - 1) void go(at + 1);
    else ended = true;
  }
  function prev() {
    if (ended) { ended = false; return; }
    if (unzoom()) return;
    const w = walks.findLast((w) => w.k > 0);
    if (w) { w.walk.show(--w.k); return; }
    if (body.scrollTop > 2) return body.scrollBy({ top: -body.clientHeight * 0.85, behavior: 'smooth' });
    if (at > 0) void go(at - 1, true);
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    const k = e.key;
    if (k === 'Escape') { if (!unzoom()) ui.closePresent(); }
    else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(k)) next();
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) prev();
    else if (k === 'f' || k === 'F') void whole(!full);
    else if (k === 'Home') void go(0);
    else if (k === 'End') void go(deck.length - 1, true);
    else if (k !== 'Tab') return;
    e.preventDefault();
  }
  function onClick(e: MouseEvent) {
    const t = e.target as Element;
    if (t.closest('a, button')) return;
    if (dragged) { dragged = false; return; }
    if (unzoom()) return;
    const svg = t.closest('svg') !== t ? t.closest<SVGSVGElement>('.slide.chart .mermaid-view > svg') : null;
    if (svg) return zoomTo(svg, 2.5, e.clientX, e.clientY);
    (e.clientX < box.clientWidth / 3 ? prev : next)();
  }

  const own = ownWholeScreen();
  const canWhole = own || !!document.fullscreenEnabled;
  let full = $state(false);
  async function turnWhole(on: boolean): Promise<boolean> {
    if (own) { const changed = await wholeScreen(on); full = on; return changed; }
    if (on && !document.fullscreenElement) { await box.requestFullscreen(); return true; }
    if (!on && document.fullscreenElement) { await document.exitFullscreen(); return true; }
    return false;
  }
  const refused = () => false;
  const whole = (on: boolean): Promise<boolean> => turnWhole(on).catch(refused);
  const onFull = () => { if (!own) full = !!document.fullscreenElement; };

  onMount(() => {
    box.focus();
    void go(at, false, false);
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { tall = body.scrollHeight > body.clientHeight + 2; });
    watch?.observe(box);
    const screen = own ? whole(true) : Promise.resolve(false);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      watch?.disconnect(); document.removeEventListener('fullscreenchange', onFull);
      void screen.then((changed) => { if (own ? changed || full : true) void whole(false); });
    };
  });
</script>

<div class="present" bind:this={box} role="dialog" aria-label="Presentation" tabindex="-1"
  transition:fade|global={scrimFade} onkeydown={onKey} onclick={onClick} onpointerdown={onDown} onwheel={onWheel}>
  <div class="tiptap slide" class:first={at === 0} class:hidden={ended} bind:this={body} onscroll={pin}></div>
  {#if pinned.heads.length && !ended}
    <div class="pinned" style={pinned.at} transition:fade={{ duration: 120 }}>
      {#each pinned.heads as h, i (i)}{#if i}<span class="sep">›</span>{/if}<span>{h}</span>{/each}
    </div>
  {/if}
  {#if ended}
    <div class="end" in:fade={{ duration: 200 }}>
      <p class="end-title">End of presentation</p>
      <p class="end-hint">{endHint(isMobile)}</p>
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
    --font-size: clamp(17px, min(2vw, 3.4vh), 48px);
    position: fixed; inset: 0; z-index: var(--z-photo); display: flex; align-items: center; justify-content: center;
    padding: calc(max(40px, 9vh) + var(--top, 0px)) 0 calc(40px + var(--bottom, 0px)); box-sizing: border-box;
    background: var(--bg); outline: none; cursor: default;
  }
  .slide {
    font-size: var(--font-size);
    width: calc(100% - 2 * max(24px, 5vw)); max-height: 100%; overflow-y: auto; scrollbar-width: none;
    margin: 0; align-self: flex-start; pointer-events: none; user-select: none;
  }
  .slide.first { align-self: center; }
  .slide.first > :global(h1:first-child) { font-size: 2.6em; font-weight: 700; line-height: 1.12; letter-spacing: -0.025em; margin-bottom: 0.35em; }
  .slide.hidden { visibility: hidden; }
  .slide:not(.first) { padding-top: 1em; margin-top: -1em; }
  .slide > :global(:is(.again, .crumbs)) { position: relative; top: calc(var(--font-size) * -0.6); }
  .slide:global(.chart) :global(.mermaid-view > svg) { pointer-events: auto; cursor: zoom-in; }
  .slide:global(.chart) :global(.mermaid-view.zoomed) { overflow: hidden; touch-action: none; }
  .slide:global(.chart) :global(.mermaid-view.zoomed > svg) { cursor: grab; }
  .slide:global(.chart) { display: flex; flex-direction: column; height: 100%; }
  .slide:global(.chart) > :global(.code-block) { flex: 1; min-height: 0; margin: 0; }
  .slide:global(.chart) :global(:is(.mermaid-host, .dblock, .pic, .mermaid-view)) { height: 100%; min-height: 0; margin: 0; box-shadow: none; }
  .slide:global(.chart) :global(.mermaid-view) { display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .slide:global(.chart) :global(.mermaid-view > svg) { width: 100% !important; height: 100% !important; max-width: none !important; max-height: none; }
  .present > :global(.leaving) { pointer-events: none; overflow: hidden; }
  .slide :global(:is(.mermaid-expand, .mermaid-play, .dock)) { display: none; }
  .slide::-webkit-scrollbar { display: none; }
  .slide > :global(:first-child) { margin-top: 0; }
  .slide :global(.again) {
    display: inline-block; margin: 0 0 1em; font-size: 0.55em; line-height: 1.3; font-weight: 600; color: var(--fg-dim);
  }
  .slide :global(.again + .again)::before { content: '›'; margin: 0 0.5em; font-weight: 400; }
  .slide { line-height: 1.75; }
  .slide :global(:not(pre) > code) { box-shadow: 0 0 0 0.1em var(--code-bg); padding-block: 0.05em; }
  .slide :global(.tableWrapper) { overflow: visible; }
  .slide :global(table) { width: 100%; }
  .slide > :global(p + p) { margin-top: 0.6em; }
  .slide :global(:is(.tools, .codebar, .foldchips, .drag-handle, .block-handle)) { display: none !important; }
  .pinned {
    position: absolute; z-index: var(--z-raised); display: flex; gap: 0.5em; padding: 0 0 0.7em;
    font-size: calc(var(--font-size) * 0.55); line-height: 1.3; font-weight: 600; color: var(--fg-dim);
    background: linear-gradient(var(--bg) 75%, transparent); pointer-events: none;
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
