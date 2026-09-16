<script lang="ts">
  import { scale } from 'svelte/transition';
  import { ui } from './lib/ui.svelte';
  import { pdfSrc } from './lib/pdf';
  import { openAsset } from './lib/platform';

  // A floating panel, not a dialog: no backdrop, nothing behind it blocked — a PDF can sit open beside
  // the text being written. Drag it by its bar, resize it by any edge or the corner.
  const req = ui.pdf!;
  const src = pdfSrc(req.src);
  const BAR = 33; // title bar height
  const EDGE = 7; // frame around the document: the grab handles live here, clear of the PDF view,
                  // which the webview draws itself and which swallows a press meant for the panel

  let w = $state(Math.min(520, window.innerWidth - 24));
  let h = $state(Math.min(780, Math.round(window.innerHeight * 0.74)));
  let x = $state(Math.max(12, window.innerWidth - Math.min(520, window.innerWidth - 24) - 12));
  let y = $state(64);
  let busy = $state(false); // being moved or resized

  /**
   * One pointer gesture. The pointer is captured by the handle, so the drag survives the pointer
   * crossing the document — an iframe would otherwise take the rest of the gesture for itself.
   */
  function gesture(e: PointerEvent, step: (dx: number, dy: number) => void) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    busy = true;
    const x0 = e.clientX, y0 = e.clientY;
    const move = (m: PointerEvent) => step(m.clientX - x0, m.clientY - y0);
    const up = () => {
      busy = false;
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function drag(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const left = x, top = y;
    gesture(e, (dx, dy) => {
      x = Math.min(window.innerWidth - 120, Math.max(120 - w, left + dx)); // a sliver stays grabbable
      y = Math.min(window.innerHeight - 40, Math.max(0, top + dy));
    });
  }

  const MIN_W = 280, MIN_H = 200;
  /** Every edge and corner, by the sides it moves — 'nw' takes the top and the left one together. */
  const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  function resize(e: PointerEvent, sides: string) {
    const w0 = w, h0 = h, x0 = x, y0 = y;
    gesture(e, (dx, dy) => {
      if (sides.includes('e')) w = Math.max(MIN_W, Math.min(window.innerWidth - x - 8, w0 + dx));
      if (sides.includes('s')) h = Math.max(MIN_H, Math.min(window.innerHeight - y - 8, h0 + dy));
      // the far side stays put: the panel grows out of the edge being dragged
      if (sides.includes('w')) {
        const left = Math.min(x0 + w0 - MIN_W, Math.max(8, x0 + dx));
        w = w0 + (x0 - left);
        x = left;
      }
      if (sides.includes('n')) {
        const top = Math.min(y0 + h0 - MIN_H, Math.max(0, y0 + dy));
        h = h0 + (y0 - top);
        y = top;
      }
    });
  }

</script>

<div class="pdf-panel" class:busy style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px"
  transition:scale={{ start: 0.97, duration: 140 }}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="pdf-bar" onpointerdown={drag}>
    <span class="pdf-title">{req.name}</span>
    <!-- tooltips go above the bar: the webview draws the PDF over any HTML that lands on top of it -->
    <button class="icon tip-up" aria-label="Open outside" data-tip="Open outside" onclick={() => openAsset(req.src)}>
      <svg viewBox="0 0 16 16"><path d="M9 3h4v4M13 3 8 8M12 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2.5"/></svg>
    </button>
    <button class="icon tip-up tip-right" aria-label="Close" data-tip="Close" data-keys="Escape" onclick={() => ui.closePdf()}>
      <svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>
    </button>
  </div>
  <div class="pdf-doc">
    <!-- laid out at twice the panel's size and drawn at half scale: the webview's own zoom/share HUD is
         a fixed size inside the document, so this is what keeps it from dwarfing the page. No title
         attribute either — the webview turns one into a tooltip that follows the pointer over the page. -->
    <!-- svelte-ignore a11y_missing_attribute -->
    <iframe {src} style:width="{(w - EDGE * 2) * 2}px" style:height="{(h - BAR - EDGE) * 2}px"></iframe>
  </div>
  {#each HANDLES as sides}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="pdf-edge {sides}" onpointerdown={(e) => resize(e, sides)}>
      {#if sides === 'se'}<svg viewBox="0 0 12 12"><path d="M11 4.5 4.5 11M11 8.5 8.5 11"/></svg>{/if}
    </div>
  {/each}
</div>

<style>
  .pdf-panel {
    position: fixed; z-index: 32; display: flex; flex-direction: column; overflow: hidden; outline: none;
    border-radius: 12px; background: var(--bg-pop); border: 1px solid var(--line);
    box-shadow: 0 20px 64px rgba(0, 0, 0, 0.3);
  }
  .pdf-bar {
    display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 12px; cursor: default;
    border-bottom: 1px solid var(--line); background: var(--bg-side); flex: none; height: 33px; box-sizing: border-box;
  }
  .pdf-title { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* the shared .icon rule only sizes the button; the toolbar centers its own, so this one centers ours */
  .pdf-bar .icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .pdf-bar svg { width: 15px; height: 15px; display: block; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .pdf-doc { flex: 1; overflow: hidden; padding: 0 7px 7px; background: var(--bg-pop); }
  iframe { border: 0; display: block; transform: scale(0.5); transform-origin: 0 0; background: var(--bg); }
  /* a moved or resized panel must not hand the rest of the gesture to the document */
  .busy iframe { pointer-events: none; }
  /* grab frame: 7px edges, 18px corners — all of it panel chrome, never over the PDF view */
  .pdf-edge { position: absolute; }
  .pdf-edge.n { top: 0; left: 18px; right: 18px; height: 6px; cursor: ns-resize; }
  .pdf-edge.s { bottom: 0; left: 18px; right: 18px; height: 7px; cursor: ns-resize; }
  .pdf-edge.w { left: 0; top: 6px; bottom: 18px; width: 7px; cursor: ew-resize; }
  .pdf-edge.e { right: 0; top: 6px; bottom: 18px; width: 7px; cursor: ew-resize; }
  /* the top corners stay a thin band: below them the title bar's own buttons must keep their clicks */
  .pdf-edge.nw, .pdf-edge.ne { top: 0; width: 18px; height: 6px; }
  .pdf-edge.nw { left: 0; cursor: nwse-resize; }
  .pdf-edge.ne { right: 0; cursor: nesw-resize; }
  .pdf-edge.se, .pdf-edge.sw { width: 18px; height: 18px; }
  .pdf-edge.sw { bottom: 0; left: 0; cursor: nesw-resize; }
  .pdf-edge.se {
    bottom: 0; right: 0; cursor: nwse-resize; color: var(--fg-dim);
    display: flex; align-items: flex-end; justify-content: flex-end; padding: 3px; box-sizing: border-box;
  }
  .pdf-edge.se svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; opacity: 0.55; }
</style>
