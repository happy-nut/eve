<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { ui } from './lib/ui.svelte';

  /**
   * A diagram full screen, for one too big to read in its note: it opens fitted to the screen, then zooms (the wheel,
   * a trackpad's pinch, two fingers, + and −) about the point under the pointer and pans by dragging. Esc, ✕ or the
   * phone's back closes it.
   */
  const html = ui.diagramView ?? '';
  let stage: HTMLDivElement, content: HTMLDivElement, viewer: HTMLDivElement;
  let scale = $state(1), x = $state(0), y = $state(0);
  let w = 0, h = 0;

  function fit() {
    const r = stage.getBoundingClientRect();
    scale = Math.min((r.width - 48) / w, (r.height - 48) / h, 2);
    x = (r.width - w * scale) / 2;
    y = (r.height - h * scale) / 2;
  }
  /** zoomed by `f` about the point (px, py) of the stage, which stays where it is */
  function zoom(f: number, px?: number, py?: number) {
    const r = stage.getBoundingClientRect();
    px ??= r.width / 2; py ??= r.height / 2;
    const next = Math.min(8, Math.max(0.1, scale * f));
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
  }

  onMount(() => {
    // the drawing at its own size: an SVG as wide as its viewBox, a chart Eve draws at a comfortable page width
    const svg = content.querySelector('svg');
    if (svg) {
      const vb = svg.viewBox.baseVal;
      svg.removeAttribute('style');
      svg.setAttribute('width', String(vb.width));
      svg.setAttribute('height', String(vb.height));
    } else content.style.width = `${Math.min(720, window.innerWidth - 32)}px`; // a phone: its own width, not a page shrunk to half
    content.style.padding = '12px 20px'; // room for a label at its edge (fit to the screen cut the last date off)
    w = content.offsetWidth; h = content.offsetHeight;
    fit();
    // the keyboard is the viewer's while it is up: keys typed went into the note under it (where a click leaves the
    // focus, as in WebKit), and a card under it took the Esc and closed itself instead
    viewer.focus({ preventScroll: true });
  });

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    // a trackpad's pinch arrives as a wheel with ctrlKey and small steps; a wheel's notches are larger
    zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  };

  // dragging pans; two fingers pinch
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  }
  function move(e: PointerEvent) {
    const was = pointers.get(e.pointerId);
    if (!was) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) { x += now.x - was.x; y += now.y - was.y; return; }
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), r = stage.getBoundingClientRect();
    if (pinch) zoom(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    pinch = d;
  }
  function up(e: PointerEvent) { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ui.closeDiagramView(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.25); }
    else if (e.key === '-') { e.preventDefault(); zoom(0.8); }
    else if (e.key === '0') { e.preventDefault(); fit(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="viewer" bind:this={viewer} tabindex="-1" transition:fade|global={{ duration: 140 }} role="dialog" aria-modal="true" aria-label="Diagram">
  <div class="stage" bind:this={stage} onwheel={onWheel} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="presentation">
    <div class="diagram-canvas content" bind:this={content} style:transform={`translate(${x}px, ${y}px) scale(${scale})`}>{@html html}</div>
  </div>
  <button class="icon close" aria-label="Close" onclick={() => ui.closeDiagramView()}>
    <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
  </button>
  <div class="bar">
    <button aria-label="Zoom out" onclick={() => zoom(0.8)}><svg viewBox="0 0 16 16"><path d="M4 8h8" /></svg></button>
    <button class="pct" aria-label="Fit to screen" onclick={fit}>{Math.round(scale * 100)}%</button>
    <button aria-label="Zoom in" onclick={() => zoom(1.25)}><svg viewBox="0 0 16 16"><path d="M8 4v8M4 8h8" /></svg></button>
  </div>
</div>

<style>
  .viewer { position: fixed; inset: 0; z-index: 40; background: light-dark(#f9fafb, #17181d); outline: none; }
  .stage { position: absolute; inset: 0; overflow: hidden; cursor: grab; touch-action: none; }
  .stage:active { cursor: grabbing; }
  .content { position: absolute; left: 0; top: 0; transform-origin: 0 0; padding: 0; border-radius: 0; background: none; overflow: visible; display: block; }
  .content :global(svg) { max-width: none !important; min-width: 0 !important; }
  .close {
    position: absolute; top: calc(12px + env(safe-area-inset-top)); right: 12px; width: 36px; height: 36px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center; background: var(--bg-pop); box-shadow: var(--pop-shadow);
  }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  .bar {
    position: absolute; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; gap: 2px; padding: 4px;
    border-radius: 14px; background: var(--bg-pop); box-shadow: var(--pop-shadow);
  }
  .bar button {
    min-width: 36px; height: 32px; border: 0; border-radius: 10px; background: none; color: var(--fg); font: inherit; font-size: 13px; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums;
  }
  .bar .pct { min-width: 60px; }
  @media (hover: hover) { .bar button:hover { background: var(--bg-hover); } }
  .bar button:active { background: var(--bg-active); }
</style>
