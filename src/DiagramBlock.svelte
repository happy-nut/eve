<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { isMobile } from './lib/platform';
  import { ui } from './lib/ui.svelte';
  import { renderMermaid, themeKey } from './lib/mermaid';
  import { KINDS, fromCode, toCode, whyCode, type Diagram } from './lib/diagram';
  import FlowEditor from './FlowEditor.svelte';
  import { scrollHint } from './lib/scrollHint';
  import DiagramForm from './DiagramForm.svelte';

  /**
   * A ```mermaid block in the note: its drawing, and, clicked, the drawing made editable right there — a flowchart's
   * boxes and lines on the picture itself (FlowEditor.svelte), any other chart's parts as rows under it
   * (DiagramForm.svelte). Every change is written back into the block's code (onCode), which is what the note keeps;
   * an undo, a sync or the code typed by hand comes back as `code` and is read again. A diagram written with more
   * than these can show (styles, subgraphs, notes) is drawn, and edited as its code.
   */
  let { code, start, codeShown, onCode, onCodeEdit, onCodeLeave, onError, onHistory }: {
    code: string;
    /** made just now from the / menu: open for editing at once */
    start: boolean;
    /** the caret is in the block's code, which shows above the drawing */
    codeShown: boolean;
    onCode: (code: string) => void;
    onCodeEdit: () => void;
    /** the caret out of the code, after the block: the drawing clicked while the code shows */
    onCodeLeave: () => void;
    onError: (failed: boolean) => void;
    /** the note's undo (false) or redo (true): ⌘Z with the keyboard on the diagram */
    onHistory: (redo: boolean) => void;
  } = $props();

  let root: HTMLDivElement, canvas = $state<HTMLDivElement | null>(null);
  // what it was given when the block was made; later changes come through the effects below
  const first = untrack(() => ({ code, start }));
  let d = $state<Diagram | null>(fromCode(first.code));
  let active = $state(first.start && !!fromCode(first.code));
  // The note's code is left exactly as it was written until the chart is changed here: read into a chart and written
  // back, `A --> B` would become the chart's own spelling of it, a change no one made. `base` is the chart as the
  // note holds it; only a chart that differs from it is written. `sent` is the code last written, coming back.
  const mine = $derived(d ? toCode(d) : null);
  let base = untrack(() => mine);
  let sent: string | null = null;
  let edited = $state(false);
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const c = mine;
    if (c === null || c === base) return;
    base = c;
    sent = c;
    edited = true;
    clearTimeout(writeTimer);
    // written into the note a moment after the last change, unless the note changed it meanwhile (an undo, a sync)
    const at = untrack(() => code);
    writeTimer = setTimeout(() => { writeTimer = undefined; if (code === at) onCode(c); }, 250);
  });
  /** a change still waiting, written now (before an undo, so the undo undoes it) */
  function flush() {
    if (writeTimer === undefined) return;
    clearTimeout(writeTimer);
    writeTimer = undefined;
    if (mine !== null && mine !== code) onCode(mine);
  }
  // the code changed elsewhere (undo, sync, typed by hand): read again
  $effect(() => {
    const c = code;
    untrack(() => {
      if (c === sent) return;
      // changed elsewhere (a sync, an undo): what this was about to write is older, and would write over it
      clearTimeout(writeTimer);
      writeTimer = undefined;
      sent = null;
      edited = false;
      d = fromCode(c);
      base = d ? toCode(d) : null;
      if (!d) active = false;
    });
  });
  /** what is drawn: the note's own code, or the chart as changed here (written into the note a moment later) */
  const drawn = $derived(edited && mine !== null ? mine : code);

  // ---- the drawing ----
  let svg = $state(''), error = $state(''), seq = 0, drawTimer: ReturnType<typeof setTimeout> | undefined;
  let theme = $state(themeKey());
  $effect(() => {
    const c = drawn;
    void theme;
    clearTimeout(drawTimer);
    const n = ++seq;
    drawTimer = setTimeout(async () => {
      const out = await renderMermaid(c);
      if (n !== seq) return;
      if ('svg' in out) { svg = out.svg; error = ''; } else error = out.error;
      onError(!!error);
    }, untrack(() => svg) ? 120 : 0); // read without depending on it: each drawing is a new string, and would draw again
  });
  onMount(() => {
    // drawn again in the other theme (Settings, or the system's dark mode)
    const again = () => (theme = themeKey());
    const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    scheme?.addEventListener('change', again);
    const watch = new MutationObserver(again);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // a click anywhere else in the app is done with it (not one on a choice's popup or sheet, or its backdrop). On the
    // click, not the press: closed on the press, its tools folded away under the pointer and the click (a checkbox
    // below, another diagram) landed on whatever moved up into their place
    const away = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (active && t && !root.contains(t) && !t.closest('[role="listbox"], [role="menu"], .backdrop, .scrim, .sheet, [role="dialog"]')) active = false;
    };
    document.addEventListener('click', away, true);
    // keys meant for it while it is open: the keyboard on it, on nothing, or still in the note's text (a click on the
    // drawing leaves it there). Esc lets go of it (it fell through and hid the window); ⌘Z undoes into it
    const keys = (e: KeyboardEvent) => {
      // ⌘↵ in its code: its drawing, from the keyboard (it could be opened by a click only)
      if (!active && codeShown && d && (e.metaKey || e.ctrlKey) && e.key === 'Enter' && (e.target as Element).closest?.('.tiptap') === root.closest('.tiptap')) {
        e.preventDefault(); e.stopPropagation(); toDrawing(); return;
      }
      if (e.defaultPrevented) return;
      const t = e.target as Element;
      const typing = t instanceof HTMLElement && t.matches('input, textarea, select');
      // on the whole screen: + − 0 zoom, and Esc with nothing being edited puts it back in the note
      if (full && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'Escape' && !active) { e.preventDefault(); e.stopPropagation(); leaveFull(); return; }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.25); return; }
        if (e.key === '-') { e.preventDefault(); zoomBy(0.8); return; }
        if (e.key === '0') { e.preventDefault(); fit(); return; }
      }
      if (!active) return;
      // ⌘Z in a row of the form: the note's undo, as everywhere else in it (the field's own undo and the note's took
      // turns, and the diagram went with them)
      if (typing && root.contains(t) && !t.closest('.layer') && (e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'z' || (e.ctrlKey && e.key.toLowerCase() === 'y'))) {
        e.preventDefault(); e.stopPropagation(); flush(); onHistory(e.shiftKey || e.key.toLowerCase() === 'y'); return;
      }
      const ours = t === document.body || (root.contains(t) && !typing) || (!typing && t.closest?.('.tiptap') === root.closest('.tiptap'));
      if (!ours) return;
      // Esc lets go of what is picked in the picture first (a box, a line, a lane, Connect), then of the diagram
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!flowEd?.escape()) active = false; }
      else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'z' || (e.ctrlKey && e.key.toLowerCase() === 'y')) && t === document.body) {
        e.preventDefault(); e.stopPropagation(); flush(); onHistory(e.shiftKey || e.key.toLowerCase() === 'y');
      }
    };
    window.addEventListener('keydown', keys, true);
    return () => {
      if (full) ui.closeDiagramView(); // gone while on the whole screen (an undo took it out): the app's keys come back
      clearTimeout(drawTimer);
      flush(); // a change still waiting is not lost (code.ts writes it only into this same block, if it is still there)
      scheme?.removeEventListener('change', again); watch.disconnect();
      document.removeEventListener('click', away, true);
      window.removeEventListener('keydown', keys, true);
    };
  });
  $effect(() => { if (codeShown) active = false; });
  // edited as its code (written by hand, or Code pressed): that is the note's own text, under the whole screen, so the
  // diagram goes back into the note to be edited there
  $effect(() => { if (codeShown && full) untrack(leaveFull); });

  /** the box the opening click landed on, picked as the editor comes up */
  let pick = $state<string | null>(null);
  function open(e: MouseEvent) {
    if (active || error) return;
    if (!d) { onCodeEdit(); return; } // written by hand: its code is how it is edited
    e.preventDefault();
    if (codeShown) onCodeLeave(); // the drawing clicked under its code: the code goes, the drawing opens
    const g = (e.target as Element).closest?.('g.node');
    pick = g ? /-flowchart-(.+)-\d+$/.exec(g.id)?.[1] ?? null : null;
    (document.activeElement as HTMLElement | null)?.blur?.(); // the keys typed next are the diagram's, not the note's
    active = true;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && active && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); active = false; }
  }

  /** the code shown: to its drawing (the caret out of the code, the drawing open) */
  function toDrawing() {
    onCodeLeave();
    pick = null;
    (document.activeElement as HTMLElement | null)?.blur?.();
    active = true;
  }
  /** why a hand-written diagram is edited as code (it opened as code and said nothing of why) */
  const why = $derived(codeShown && !d && !error ? whyCode(code) : null);
  const flow = $derived(active && d?.kind === 'flowchart' ? d : null);
  const kindLabel = $derived(d ? KINDS.find((k) => k.kind === d!.kind)?.label ?? '' : '');
  let flowEd = $state<ReturnType<typeof FlowEditor> | null>(null);

  // ---- the whole screen: this same block over everything, zoomed and panned, and edited there as in the note ----
  // (a copy of its picture was shown before, which could only be looked at). Zooming sizes the drawing itself and
  // panning scrolls it, so the flowchart editor's layer, which follows the picture's scroll, stays on its boxes.
  let full = $state(false), zoom = $state(1);
  const ZOOM_MIN = 0.1, ZOOM_MAX = 8;
  function enterFull() {
    (document.activeElement as HTMLElement | null)?.blur?.(); // keys are the diagram's now, not the note's text
    full = true;
    ui.viewDiagram(() => (full = false));
    tick().then(fit);
  }
  /** back into the note (✕, Esc, the phone's back) */
  const leaveFull = () => ui.closeDiagramView();
  /** the drawing's own size, before any zoom */
  function natural(): { el: HTMLElement | SVGSVGElement; w: number; h: number } | null {
    const el = canvas?.firstElementChild as HTMLElement | SVGSVGElement | null;
    if (!el) return null;
    if (el instanceof SVGSVGElement) {
      const vb = el.viewBox.baseVal;
      return vb && vb.width ? { el, w: vb.width, h: vb.height } : null;
    }
    const z = +(el.style.zoom || 1);
    return { el, w: el.offsetWidth / z || 1, h: el.offsetHeight / z || 1 };
  }
  /** the drawing at the zoom on the whole screen, or as the note draws it */
  function size() {
    const n = natural();
    if (!n) return;
    const { el } = n;
    if (!full) {
      if (el.dataset.style !== undefined) { el.setAttribute('style', el.dataset.style); delete el.dataset.style; }
      return;
    }
    if (el.dataset.style === undefined) el.dataset.style = el.getAttribute('style') ?? '';
    if (el instanceof SVGSVGElement) {
      el.style.maxWidth = 'none'; el.style.minWidth = '0';
      el.style.width = `${n.w * zoom}px`; el.style.height = `${n.h * zoom}px`;
    } else el.style.zoom = String(zoom); // a chart Eve draws itself, as HTML
  }
  $effect(() => { void svg; void zoom; void full; tick().then(size); });
  /** fitted to the screen (0, or the percentage clicked) */
  function fit() {
    const n = natural();
    if (!canvas || !n) return;
    zoom = Math.min(Math.max(Math.min((canvas.clientWidth - 48) / n.w, (canvas.clientHeight - 48) / n.h, 2), ZOOM_MIN), ZOOM_MAX);
  }
  /** zoomed by `f` about a point of the canvas (its middle), which stays where it is */
  function zoomBy(f: number, px?: number, py?: number) {
    if (!canvas) return;
    px ??= canvas.clientWidth / 2; py ??= canvas.clientHeight / 2;
    const next = Math.min(Math.max(zoom * f, ZOOM_MIN), ZOOM_MAX), r = next / zoom;
    if (r === 1) return;
    const x = canvas.scrollLeft + px, y = canvas.scrollTop + py;
    zoom = next;
    size();
    canvas.scrollLeft = x * r - px;
    canvas.scrollTop = y * r - py;
  }
  /** a trackpad's pinch (a wheel with ctrlKey) zooms; scrolling pans, as the canvas scrolls */
  function onWheel(e: WheelEvent) {
    if (!full || !e.ctrlKey || !canvas) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  }
  /** dragging the empty canvas with the mouse pans it; a drag on a box or a line is the editor's */
  function onPanDown(e: PointerEvent) {
    if (!full || !canvas || e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as Element).closest('g.node, .edgeLabel, path, button, input, textarea, select, a')) return;
    const c = canvas, x0 = e.clientX, y0 = e.clientY, sl = c.scrollLeft, st = c.scrollTop;
    let moved = false;
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
      moved = true;
      c.classList.add('panning');
      c.scrollLeft = sl - (m.clientX - x0);
      c.scrollTop = st - (m.clientY - y0);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      c.classList.remove('panning');
      // the click that ends a pan is not a click on the canvas (it opened the editor, or let go of the box picked)
      if (moved) window.addEventListener('click', (k) => { k.stopPropagation(); k.preventDefault(); }, { capture: true, once: true });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  /** two fingers pinch on a phone (one finger scrolls, as the canvas scrolls) */
  function pinchZoom(el: HTMLElement) {
    let d0 = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (e: TouchEvent) => { if (full && e.touches.length === 2) d0 = dist(e.touches); };
    const move = (e: TouchEvent) => {
      if (!full || e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      const d = dist(e.touches), r = el.getBoundingClientRect();
      zoomBy(d / d0, (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top);
      d0 = d;
    };
    const end = (e: TouchEvent) => { if (e.touches.length < 2) d0 = 0; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dblock" class:active class:full bind:this={root} onkeydown={onKey} role={full ? 'dialog' : undefined} aria-modal={full ? 'true' : undefined} aria-label={full ? 'Diagram' : undefined}>
  <div class="pic">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="mermaid-view diagram-canvas" class:error={!!error} bind:this={canvas} onclick={open} onwheel={onWheel} onpointerdown={onPanDown} {@attach scrollHint} {@attach pinchZoom}>
    {#if error}{error}{:else}{@html svg}{/if}
  </div>
  {#if flow && canvas && svg && !error}<FlowEditor bind:this={flowEd} {flow} host={canvas} version={svg} k={1} {pick} />{/if}
  {#if full}
    <button class="full-close" type="button" aria-label="Back to the note" title="Back to the note (Esc)" onclick={leaveFull}>
      <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
    </button>
    <div class="zoombar">
      <button aria-label="Zoom out" title="Zoom out (−)" onclick={() => zoomBy(0.8)}><svg viewBox="0 0 16 16"><path d="M4 8h8" /></svg></button>
      <button class="pct" aria-label="Fit to screen" title="Fit to screen (0)" onclick={fit}>{Math.round(zoom * 100)}%</button>
      <button aria-label="Zoom in" title="Zoom in (+)" onclick={() => zoomBy(1.25)}><svg viewBox="0 0 16 16"><path d="M8 4v8M4 8h8" /></svg></button>
    </div>
  {:else if !error && svg}
    <button class="mermaid-expand" type="button" aria-label="Full screen" data-tip="Full screen: zoom in and edit"
      onclick={(e) => { e.stopPropagation(); if (canvas?.firstElementChild) enterFull(); }}>
      <svg viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>
    </button>
  {/if}
  </div>

  {#if codeShown && !active && !error}
    <!-- its code shown: the way back to the drawing, and, written by hand, why it is edited as code -->
    <div class="tools codebar">
      {#if d}
        <span class="say">Editing the code</span>
        <span class="grow"></span>
        <button class="ghost" onmousedown={(e) => e.preventDefault()} onclick={toDrawing} title="Edit as a drawing (⌘↵)">Edit as drawing</button>
      {:else if why}
        <span class="say">
          {#if 'kind' in why}This kind of diagram ({why.kind}) is edited as its code.
          {:else if 'line' in why}Written by hand with <code>{why.line.length > 48 ? why.line.slice(0, 47) + '…' : why.line}</code>, which the drawing editor can't show, so it is edited as code. It still draws as written.
          {:else}Written by hand with more than the drawing editor shows, so it is edited as code. It still draws as written.{/if}
        </span>
        <span class="grow"></span>
      {/if}
      <button class="done" onmousedown={(e) => e.preventDefault()} onclick={onCodeLeave}>Done</button>
    </div>
  {/if}
  {#if active && d}
    <div class="tools">
      <span class="kind">{kindLabel}</span>
      {#if flow}
        <div class="seg">
          <!-- a phone's row has room for the arrows alone: with their words, Done went onto a line of its own -->
          <button class:on={flow.dir === 'LR'} aria-label="Across" title="Across" onclick={() => (flow.dir = 'LR')}>{isMobile ? '→' : '→ Across'}</button>
          <button class:on={flow.dir === 'TD'} aria-label="Down" title="Down" onclick={() => (flow.dir = 'TD')}>{isMobile ? '↓' : '↓ Down'}</button>
        </div>
        <button class="ghost" onclick={() => flowEd?.addBox()}>+ Box</button>
        <button class="ghost" onclick={() => flowEd?.addLane()}>+ Lane</button>
      {/if}
      <span class="grow"></span>
      <!-- undo where there is no keyboard: a phone's bar with ↶ went with the keyboard as a box was picked -->
      <button class="ghost icon" aria-label="Undo" title="Undo (⌘Z)" onclick={() => { flush(); onHistory(false); }}><svg viewBox="0 0 16 16"><path d="M5.5 4 2.5 7l3 3M2.5 7h7a4 4 0 0 1 0 8H8" /></svg></button>
      <button class="ghost icon" aria-label="Redo" title="Redo (⇧⌘Z)" onclick={() => { flush(); onHistory(true); }}><svg viewBox="0 0 16 16"><path d="M10.5 4l3 3-3 3M13.5 7h-7a4 4 0 0 0 0 8H8" /></svg></button>
      <button class="ghost" onclick={() => { active = false; onCodeEdit(); }}>Code</button>
      <button class="done" onclick={() => (active = false)}>Done</button>
    </div>
    {#if flow}
      <p class="dtip">{isMobile ? 'Tap a box to pick it; ✎ Text in its bar (or a second tap) types in it · its + adds the next step · Connect, then another box, joins them' : 'Click a box to pick it; ✎ Text, a second click or Enter types in it · its + adds the next step; drag it onto another box, or Connect, to join them · Tab adds a step, ⌫ deletes'}</p>
    {:else}
      <DiagramForm {d} />
      <!-- a long form: Done at its foot too, not only out of sight at its top -->
      <div class="foot"><button class="done" onclick={() => (active = false)}>Done</button></div>
    {/if}
  {/if}
</div>

<style>
  .dblock { border-radius: 16px; }
  .pic { position: relative; }
  .dblock.active { box-shadow: 0 0 0 2px var(--accent-soft); padding-bottom: 10px; background: var(--bg); }
  .dblock.active :global(.mermaid-view) { cursor: default; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 10px 4px; font-size: 13px; user-select: none; -webkit-user-select: none; }
  .kind { font-weight: 600; color: var(--fg-dim); font-size: 12px; margin-right: 4px; }
  .grow { flex: 1; }
  .tools button {
    border: 0; border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12.5px; font-weight: 500; background: none; color: var(--fg-dim);
    white-space: nowrap;
  }
  :global(html.mobile) .tools .kind { display: none; } /* a phone's row has room for the buttons only */
  @media (hover: hover) { .tools button:hover { background: var(--bg-hover); color: var(--fg); } }
  .tools .done, .foot .done { background: var(--accent); color: #fff; }
  /* white on the dark theme's light blue read poorly: a deeper blue under it */
  .tools .done, .foot .done { background: light-dark(var(--accent), color-mix(in srgb, var(--accent) 70%, #00264f)); }
  .foot { display: flex; justify-content: flex-end; padding: 6px 10px 0; }
  .foot button { border: 0; border-radius: 8px; padding: 5px 14px; font: inherit; font-size: 12.5px; font-weight: 500; }
  .tools .icon { padding: 5px 6px; display: inline-flex; }
  .tools .icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  /* a finger's size on a phone */
  :global(html.mobile) .tools button, :global(html.mobile) .foot button { min-height: 40px; }
  :global(html.mobile) .tools .icon { min-width: 40px; justify-content: center; }
  @media (hover: hover) { .tools .done:hover { background: color-mix(in srgb, var(--accent) 88%, #000); color: #fff; } }
  .seg { display: inline-flex; padding: 2px; border-radius: 8px; background: var(--bg-input); }
  .seg button { border-radius: 6px; padding: 3px 9px; }
  .seg button.on { background: var(--bg-pop); color: var(--fg); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); }
  .codebar { padding: 8px 10px 6px; }
  .codebar .say { font-size: 12.5px; color: var(--fg-dim); flex: 1 1 220px; }
  .codebar .say code { font-size: 12px; padding: 1px 5px; border-radius: 5px; background: var(--bg-input); }
  .dtip { margin: 2px 12px 0; font-size: 12px; color: var(--fg-dim); user-select: none; -webkit-user-select: none; }
  .dblock :global(.form) { padding: 4px 12px 0; }

  /* the whole screen: the picture fills it and scrolls; the tools along the top; a chart's rows beside it (under it on
     a narrow screen) */
  .dblock.full {
    position: fixed; inset: 0; z-index: 40; border-radius: 0; box-shadow: none; padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    background: light-dark(#f9fafb, #17181d); display: grid; grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto minmax(0, 1fr) auto; outline: none;
  }
  .dblock.full > .tools, .dblock.full > .codebar { grid-column: 1 / -1; grid-row: 1; background: var(--bg); padding-right: 60px; }
  .dblock.full > .dtip { grid-column: 1 / -1; grid-row: 2; margin: 0; padding: 2px 12px 6px; background: var(--bg); }
  .dblock.full > .pic { grid-column: 1; grid-row: 3 / 5; min-height: 0; }
  .dblock.full > :global(.form) { grid-column: 2; grid-row: 3; width: min(380px, 40vw); overflow: auto; padding: 12px; background: var(--bg); border-left: 1px solid var(--border, var(--bg-hover)); }
  .dblock.full > .foot { grid-column: 2; grid-row: 4; padding: 8px 12px; background: var(--bg); border-left: 1px solid var(--border, var(--bg-hover)); }
  @media (max-width: 700px) {
    .dblock.full { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto auto; }
    .dblock.full > .pic { grid-row: 3; }
    .dblock.full > :global(.form) { grid-column: 1; grid-row: 4; width: auto; max-height: 45vh; border-left: 0; border-top: 1px solid var(--border, var(--bg-hover)); }
    .dblock.full > .foot { grid-column: 1; grid-row: 5; border-left: 0; }
  }
  .dblock.full .pic { height: 100%; }
  .dblock.full :global(.diagram-canvas) {
    height: 100%; box-sizing: border-box; border-radius: 0; overflow: auto; overscroll-behavior: contain; align-items: flex-start; padding: 24px;
  }
  /* centred while it fits, from its top-left corner once it is larger (a centred one was cut off where it overflowed) */
  .dblock.full :global(.diagram-canvas > *) { margin: auto; }
  .dblock.full:not(.active) :global(.diagram-canvas) { cursor: grab; }
  .dblock.full :global(.diagram-canvas.panning) { cursor: grabbing; }
  .full-close {
    position: absolute; top: 10px; right: 12px; z-index: 3; width: 36px; height: 36px; border: 0; border-radius: 50%; color: var(--fg);
    display: inline-flex; align-items: center; justify-content: center; background: var(--bg-pop); box-shadow: var(--pop-shadow);
  }
  .dblock.full.active .full-close, .dblock.full:has(> .codebar) .full-close { position: fixed; top: calc(6px + env(safe-area-inset-top)); }
  .zoombar {
    position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 3; display: flex; gap: 2px; padding: 4px;
    border-radius: 14px; background: var(--bg-pop); box-shadow: var(--pop-shadow);
  }
  .zoombar button {
    min-width: 36px; height: 32px; border: 0; border-radius: 10px; background: none; color: var(--fg); font: inherit; font-size: 13px; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums;
  }
  .zoombar .pct { min-width: 60px; }
  @media (hover: hover) { .zoombar button:hover, .full-close:hover { background: var(--bg-hover); } }
  .full-close svg, .zoombar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
</style>
