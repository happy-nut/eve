<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { isMobile, copyPng, copyText } from './lib/platform';
  import { pictureOf } from './lib/snapshot';
  import { fenced } from './lib/markdown';
  import { ui, hooks, under, type MenuItem } from './lib/ui.svelte';
  import { letGo } from './lib/focusWatch';
  import { claimKeys } from './lib/keys';
  import { renderMermaid, themeKey } from './lib/mermaid';
  import { foldSeq, foldable, markFolds, type SeqBlock } from './lib/seqFold';
  import { spreadLabels } from './lib/edgeLabels';
  import { drawIn, flow as flowLines, focus, play, timeline } from './lib/diagramMotion';
  import { across, fromCode, isEmpty, toCode, whyCode, type Diagram } from './lib/diagram';
  import FlowEditor from './FlowEditor.svelte';
  import { scrollHint } from './lib/scrollHint';
  import DiagramForm from './DiagramForm.svelte';
  import ChartEditor from './ChartEditor.svelte';
  import { tagSpots, adders, toggles } from './lib/spots';
  import { followPointer } from './lib/followPointer';

  let { code, start, codeShown, onCode, onCodeEdit, onCodeLeave, onError, onHistory, onLeave, onDelete }: {
    code: string;
    start: boolean;
    codeShown: boolean;
    onCode: (code: string) => void;
    onCodeEdit: () => void;
    onCodeLeave: () => void;
    onError: (failed: boolean) => void;
    onHistory: (redo: boolean) => void;
    onLeave: () => void;
    onDelete: (focus: boolean) => void;
  } = $props();

  let root: HTMLDivElement, canvas = $state<HTMLDivElement | null>(null);
  const first = untrack(() => ({ code, start }));
  let d = $state<Diagram | null>(fromCode(first.code));
  let active = $state(first.start && !!fromCode(first.code));
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
    const at = untrack(() => code);
    writeTimer = setTimeout(() => { writeTimer = undefined; if (code === at) onCode(c); }, 250);
  });
  function flush() {
    if (writeTimer === undefined) return;
    clearTimeout(writeTimer);
    writeTimer = undefined;
    if (mine !== null && mine !== code) onCode(mine);
  }
  $effect(() => {
    const c = code;
    untrack(() => {
      if (c === sent) return;
      clearTimeout(writeTimer);
      writeTimer = undefined;
      sent = null;
      edited = false;
      d = fromCode(c);
      base = d ? toCode(d) : null;
      if (!d) active = false;
    });
  });
  const drawn = $derived(edited && mine !== null ? mine : code);

  let svg = $state(''), error = $state(''), seq = 0, drawTimer: ReturnType<typeof setTimeout> | undefined;
  let theme = $state(themeKey());
  let folds = $state<ReadonlySet<string>>(new Set());
  let shown = $state<SeqBlock[]>([]), drawnFolds = $state<ReadonlySet<string>>(new Set());
  $effect(() => {
    const c = drawn, f = folds;
    void theme;
    clearTimeout(drawTimer);
    const n = ++seq;
    drawTimer = setTimeout(async () => {
      let view = foldSeq(c, f);
      let out = await renderMermaid(view.code);
      if ('error' in out && view.code !== c) { view = foldSeq(c, new Set()); out = await renderMermaid(c); if (n === seq && 'svg' in out) folds = new Set(); }
      if (n !== seq) return;
      if ('svg' in out) { svg = out.svg; error = ''; shown = view.shown; drawnFolds = f; } else error = out.error;
      onError(!!error);
    }, untrack(() => svg) ? 120 : 0);
  });
  let centred = false;
  function centreRoot() {
    const r = canvas?.querySelector('[data-spot="root"]');
    if (!canvas || !r) return;
    centred = true;
    const a = r.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    canvas.scrollLeft += a.left + a.width / 2 - c.left - canvas.clientWidth / 2;
  }
  let labelled = $state(true);
  $effect(() => {
    void svg;
    const list = shown, f = drawnFolds;
    tick().then(() => {
      const el = canvas?.querySelector(':scope > svg');
      if (el instanceof SVGSVGElement) spreadLabels(el);
      if (isMobile && el instanceof SVGSVGElement && d && /^(sequence|class|state|er)$/.test(d.kind) && el.viewBox.baseVal?.width) el.style.minWidth = `${Math.round(el.viewBox.baseVal.width * 0.8)}px`;
      if (d && canvas) tagSpots(d, canvas);
      if (d?.kind === 'mindmap' && canvas && !centred && canvas.scrollWidth > canvas.clientWidth) centreRoot();
      labelled = !list.some(foldable) || (!!el && markFolds(el, list, f));
    });
  });
  let wasActive = false;
  $effect(() => {
    const now = active;
    if (wasActive && !now && canvas && canvas.scrollWidth > canvas.clientWidth) { canvas.scrollLeft = 0; if (d?.kind === 'mindmap') centreRoot(); }
    wasActive = now;
  });
  let introduced = false;
  let playing = $state<(() => void) | null>(null), playable = $state(false);
  function togglePlay() {
    const el = canvas?.querySelector(':scope > svg');
    if (playing) { playing(); return; }
    if (el instanceof SVGSVGElement) playing = play(el, () => (playing = null));
  }
  $effect(() => {
    void svg;
    playable = false;
    if (active || full) return;
    let stop = () => {};
    tick().then(() => {
      const el = canvas?.querySelector(':scope > svg');
      if (!(el instanceof SVGSVGElement)) return;
      let flowing = introduced ? flowLines(el) : () => {};
      const intro = introduced ? () => {} : drawIn(el, () => { introduced = true; flowing = flowLines(el); });
      const lit = focus(el);
      playable = new Set(timeline(el).map((t) => t.stage)).size > 1;
      stop = () => { intro(); lit(); flowing(); playing?.(); };
    });
    return () => stop();
  });
  function toggleFold(key: string) {
    const next = new Set(folds);
    if (!next.delete(key)) next.add(key);
    folds = next;
  }
  const chips = $derived(labelled || error ? [] : shown.filter(foldable));
  onMount(() => {
    const again = () => (theme = themeKey());
    const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    scheme?.addEventListener('change', again);
    const watch = new MutationObserver(again);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const away = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (active && t && !root.contains(t) && !t.closest('[role="listbox"], [role="menu"], .backdrop, .scrim, .sheet, [role="dialog"]')) {
        active = false;
        if (d && isEmpty(d)) { flush(); onDelete(false); }
      }
    };
    document.addEventListener('click', away, true);
    const keys = (e: KeyboardEvent) => {
      if (!active && codeShown && d && (e.metaKey || e.ctrlKey) && e.key === 'Enter' && (e.target as Element).closest?.('.tiptap') === root.closest('.tiptap')) {
        e.preventDefault(); e.stopPropagation(); toDrawing(); return;
      }
      if (e.defaultPrevented) return;
      const t = e.target as Element;
      if (t.closest?.('[aria-expanded="true"]')) return;
      const typing = t instanceof HTMLElement && t.matches('input:not(.armed), textarea, select');
      if (full && !typing && root.contains(t) || full && t === document.body) {
        if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key.toLowerCase() === 'z' || (e.ctrlKey && e.key.toLowerCase() === 'y'))) {
          e.preventDefault(); e.stopPropagation(); flush(); onHistory(e.shiftKey || e.key.toLowerCase() === 'y'); return;
        }
      }
      if (full && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'Escape' && !active) { e.preventDefault(); e.stopPropagation(); leaveFull(); return; }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.25); return; }
        if (e.key === '-') { e.preventDefault(); zoomBy(0.8); return; }
        if (e.key === '0') { e.preventDefault(); fit(); return; }
      }
      if (!active) return;
      if (typing && root.contains(t) && !t.closest('.layer') && (e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'z' || (e.ctrlKey && e.key.toLowerCase() === 'y'))) {
        e.preventDefault(); e.stopPropagation(); flush(); onHistory(e.shiftKey || e.key.toLowerCase() === 'y'); return;
      }
      const ours = t === document.body || (root.contains(t) && !typing) || (!typing && t.closest?.('.tiptap') === root.closest('.tiptap'));
      if (!ours) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!flowEd?.escape() && !chartEd?.escape()) leave(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && (t === document.body || root.contains(t))) { e.preventDefault(); e.stopPropagation(); }
      else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'z' || (e.ctrlKey && e.key.toLowerCase() === 'y')) && t === document.body) {
        e.preventDefault(); e.stopPropagation(); flush(); onHistory(e.shiftKey || e.key.toLowerCase() === 'y');
      }
      else if (chart && t === document.body && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    const unclaim = claimKeys('global', { '*': keys }, { capture: true });
    return () => {
      if (full) ui.closeDiagramView();
      clearTimeout(drawTimer);
      flush();
      scheme?.removeEventListener('change', again); watch.disconnect();
      document.removeEventListener('click', away, true);
      unclaim();
    };
  });
  $effect(() => { if (codeShown) active = false; });
  $effect(() => {
    if (!active) return;
    const back = () => { if (!flowEd?.escape() && !chartEd?.escape()) leave(); };
    hooks.diagramBack = back;
    return () => { if (hooks.diagramBack === back) hooks.diagramBack = undefined; };
  });
  $effect(() => { if (codeShown && full) untrack(leaveFull); });

  let pick = $state<string | null>(null), pickField = $state<string | null>(null);
  function open(e: MouseEvent) {
    const fold = (e.target as Element).closest?.('[data-fold]');
    if (fold && !active && !error) { e.preventDefault(); toggleFold(fold.getAttribute('data-fold')!); return; }
    if (active || error) return;
    if (!d) { onCodeEdit(); return; }
    e.preventDefault();
    if (codeShown) onCodeLeave();
    const g = (e.target as Element).closest?.('g.node');
    const spot = (e.target as Element).closest?.('[data-spot]');
    pick = d.kind !== 'flowchart' ? spot?.getAttribute('data-spot') ?? null : g ? /-flowchart-(.+)-\d+$/.exec(g.id)?.[1] ?? null : null;
    pickField = d.kind !== 'flowchart' ? spot?.getAttribute('data-field') ?? null : null;
    letGo();
    active = true;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && active && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); leave(); }
  }
  export function edit(): boolean {
    if (active || error) return false;
    if (!d) { onCodeEdit(); return true; }
    pick = null; pickField = null;
    letGo();
    active = true;
    return true;
  }
  function leave() {
    flush();
    active = false;
    if (d && isEmpty(d)) onDelete(true); else if (!full) onLeave();
  }
  function menu(e: MouseEvent) {
    if (full || isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    ui.openMenu(e, [
      { label: 'Edit', hide: active || !!error || !d, run: () => void edit() },
      { label: 'Edit code', hide: codeShown, run: () => { active = false; onCodeEdit(); } },
      { label: 'Full screen', hide: !!error || !svg, run: enterFull },
      { label: 'Copy image', sep: true, hide: !!error || !svg, run: () => void copyPicture() },
      { label: 'Copy Markdown', run: () => void copyText(fenced(code, 'mermaid')) },
      { label: 'Unfold all', hide: !folds.size, run: () => (folds = new Set()) },
      { label: 'Delete diagram', sep: true, danger: true, run: () => { flush(); active = false; onDelete(true); } },
    ]);
  }

  async function copyPicture() {
    const drawn = canvas?.firstElementChild;
    const ok = !!drawn && !!canvas && (await pictureOf(drawn, getComputedStyle(canvas).backgroundColor).then(copyPng, () => false));
    if (!ok) void ui.tell('The diagram could not be copied.');
  }

  function toDrawing() {
    onCodeLeave();
    pick = null; pickField = null;
    letGo();
    active = true;
  }
  const why = $derived(codeShown && !d && !error ? whyCode(code) : null);
  const flow = $derived(active && d?.kind === 'flowchart' ? d : null);
  function addItems(): MenuItem[] {
    if (flow) return [{ label: 'Box', run: () => flowEd?.addBox() }, { label: 'Lane', run: () => flowEd?.addLane() }];
    if (chart) return adders(chart).map((a) => ({ label: a.label.replace(/^\+ /, ''), run: () => chartEd?.open(a.run()) }));
    return [];
  }
  function moreItems(): MenuItem[] {
    const f = flow, c = chart;
    return [
      ...(f ? [{ label: 'Across', checked: across(f), run: () => { f.dir = 'LR'; } }, { label: 'Down', checked: !across(f), run: () => { f.dir = 'TD'; } }] : []),
      ...(c ? toggles(c).map((t) => ({ label: t.label, checked: t.on, run: () => (chartEd ? chartEd.kept(() => t.set(!t.on)) : t.set(!t.on)) })) : []),
      ...(c ? [{ label: 'List', checked: rows, run: () => { rows = !rows; } }] : []),
      { label: 'Edit code', sep: true, run: () => { active = false; onCodeEdit(); } },
    ];
  }
  function stayPut(run: () => void) {
    const sc = root.closest<HTMLElement>('.scroll') ?? (document.scrollingElement as HTMLElement | null);
    const top = sc?.scrollTop ?? 0;
    run();
    if (!sc) return;
    let n = 0;
    const hold = () => { sc.scrollTop = top; if (++n < 12) requestAnimationFrame(hold); };
    requestAnimationFrame(hold);
  }
  function menuFrom(e: MouseEvent, items: MenuItem[]) {
    e.stopPropagation();
    ui.openMenu(under(e.currentTarget as HTMLElement), items.map((it) => ({ ...it, run: it.run && (() => requestAnimationFrame(() => it.run!())) })));
  }
  let flowEd = $state<ReturnType<typeof FlowEditor> | null>(null);
  const chart = $derived(active && d && d.kind !== 'flowchart' ? d : null);
  let chartEd = $state<ReturnType<typeof ChartEditor> | null>(null);
  let rows = $state(false);

  let full = $state(false), zoom = $state(1);
  const ZOOM_MIN = 0.1, ZOOM_MAX = 8;
  function enterFull() {
    if (codeShown) onCodeLeave();
    const was = document.activeElement as HTMLElement | null;
    const kept: [Element, number][] = [];
    for (let s = root.parentElement; s; s = s.parentElement) if (s.scrollHeight > s.clientHeight) kept.push([s, s.scrollTop]);
    const back = () => { for (const [s, top] of kept) s.scrollTop = top; };
    ui.viewDiagram(() => { full = false; tick().then(() => { back(); requestAnimationFrame(back); }); }, was && was !== document.body && !root.contains(was) ? was : root.closest<HTMLElement>('.tiptap'));
    letGo();
    full = true;
    tick().then(fit);
  }
  const leaveFull = () => { ui.closeDiagramView(); if (!active) onLeave(); };
  function natural(): { el: HTMLElement | SVGSVGElement; w: number; h: number } | null {
    const el = canvas?.firstElementChild as HTMLElement | SVGSVGElement | null;
    if (!el) return null;
    if (el instanceof SVGSVGElement) {
      const vb = el.viewBox.baseVal;
      return vb && vb.width ? { el, w: vb.width, h: vb.height } : null;
    }
    if (full && el.dataset.nw === undefined) {
      if (el.dataset.style === undefined) el.dataset.style = el.getAttribute('style') ?? '';
      el.style.zoom = '1';
      el.style.maxWidth = 'none'; el.style.flex = 'none';
      el.style.width = `${Math.min(720, window.innerWidth - 32)}px`;
      el.dataset.nw = String(el.offsetWidth || 1);
      el.dataset.nh = String(el.offsetHeight || 1);
    }
    return { el, w: +(el.dataset.nw ?? el.offsetWidth) || 1, h: +(el.dataset.nh ?? el.offsetHeight) || 1 };
  }
  function size() {
    const n = natural();
    if (!n) return;
    const { el } = n;
    if (!full) {
      if (el.dataset.style !== undefined) { el.setAttribute('style', el.dataset.style); delete el.dataset.style; }
      delete el.dataset.nw; delete el.dataset.nh;
      return;
    }
    if (el.dataset.style === undefined) el.dataset.style = el.getAttribute('style') ?? '';
    if (el instanceof SVGSVGElement) {
      el.style.maxWidth = 'none'; el.style.minWidth = '0';
      el.style.width = `${n.w * zoom}px`; el.style.height = `${n.h * zoom}px`;
    } else el.style.zoom = String(zoom);
  }
  $effect(() => { void svg; void zoom; void full; tick().then(size); });
  function fit() {
    const n = natural();
    if (!canvas || !n) return;
    const bar = canvas.parentElement?.querySelector<HTMLElement>('.zoombar'), foot = bar ? bar.offsetHeight + 24 : 0;
    zoom = Math.min(Math.max(Math.min((canvas.clientWidth - 48) / n.w, (canvas.clientHeight - 48 - foot) / n.h, 2), ZOOM_MIN), ZOOM_MAX);
  }
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
  function onPanDown(e: PointerEvent) {
    if (!full || !canvas || e.pointerType !== 'mouse' || e.button !== 0 || e.shiftKey) return;
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
      c.classList.remove('panning');
      if (moved) window.addEventListener('click', (k) => { k.stopPropagation(); k.preventDefault(); }, { capture: true, once: true });
    };
    followPointer({ move, up });
  }
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
<div class="dblock" class:active class:full bind:this={root} onkeydown={onKey} oncontextmenu={menu} role={full ? 'dialog' : undefined} aria-modal={full ? 'true' : undefined} aria-label={full ? 'Diagram' : undefined}>
  <div class="pic">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="mermaid-view diagram-canvas" class:error={!!error} bind:this={canvas} onclick={open} onwheel={onWheel} onpointerdown={onPanDown} {@attach scrollHint} {@attach pinchZoom}>
    {#if error}{error}{:else}{@html svg}{/if}
  </div>
  {#if chips.length}
    <div class="foldchips">
      {#each chips as b (b.key)}
        <button type="button" class:on={drawnFolds.has(b.key)} aria-pressed={drawnFolds.has(b.key)} onclick={() => toggleFold(b.key)}>
          {drawnFolds.has(b.key) ? '▸' : '▾'} {b.kind}{b.text && b.kind !== 'rect' ? ` ${b.text}` : ''}
        </button>
      {/each}
    </div>
  {/if}
  {#if flow && canvas && svg && !error}<FlowEditor bind:this={flowEd} {flow} host={canvas} version={svg} {pick} />{/if}
  {#if chart && canvas && svg && !error}<ChartEditor bind:this={chartEd} d={chart} host={canvas} version={svg} {pick} {pickField} />{/if}
  {#if !error && svg}
    <div class="dock" class:on={active || codeShown} role="toolbar" aria-label="Diagram tools">
      {#if active && d}
        {#if addItems().length}
          <button type="button" style="--i: 0" aria-label="Add" data-tip="Add" onmousedown={(e) => e.preventDefault()} onclick={(e) => menuFrom(e, addItems())}>
            <svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>
          </button>
        {/if}
        <button type="button" style="--i: 1" aria-label="More" data-tip="Layout, list and code" onmousedown={(e) => e.preventDefault()} onclick={(e) => menuFrom(e, moreItems())}>
          <svg viewBox="0 0 16 16"><circle cx="3.6" cy="8" r="1.1" /><circle cx="8" cy="8" r="1.1" /><circle cx="12.4" cy="8" r="1.1" /></svg>
        </button>
        <i class="sep"></i>
      {:else if codeShown && d}
        <button type="button" style="--i: 1" aria-label="Edit as drawing" data-tip="Edit as a drawing (⌘↵)" onmousedown={(e) => e.preventDefault()} onclick={toDrawing}>
          <svg viewBox="0 0 16 16"><rect x="2.5" y="3" width="5" height="4" rx="1.2" /><rect x="8.5" y="9" width="5" height="4" rx="1.2" /><path d="M5 7v2.5a1.5 1.5 0 0 0 1.5 1.5h2" /></svg>
        </button>
        <i class="sep"></i>
      {/if}
      {#if playable && !active}
        <button type="button" class="mermaid-play" class:on={!!playing} style="--i: 1" aria-label={playing ? 'Stop' : 'Play'} data-tip={playing ? 'Stop' : 'Play it a step at a time'}
          onclick={(e) => { e.stopPropagation(); togglePlay(); }}>
          {#if playing}<svg viewBox="0 0 16 16"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5" /></svg>
          {:else}<svg viewBox="0 0 16 16"><path d="M5.5 3.8v8.4a.6.6 0 0 0 .9.5l6.6-4.2a.6.6 0 0 0 0-1L6.4 3.3a.6.6 0 0 0-.9.5z" /></svg>{/if}
        </button>
      {/if}
      {#if !full}
        <button type="button" class="mermaid-expand" style="--i: 2" aria-label="Full screen" data-tip="Full screen: zoom in and edit"
          onclick={(e) => { e.stopPropagation(); if (canvas?.firstElementChild) enterFull(); }}>
          <svg viewBox="0 0 16 16"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>
        </button>
      {/if}
      <i class="sep edit"></i>
      <button type="button" class="edit" style="--i: 3" aria-label="Undo" data-tip="Undo (⌘Z)" onmousedown={(e) => e.preventDefault()} onclick={(e) => { e.stopPropagation(); flush(); stayPut(() => onHistory(false)); }}>
        <svg viewBox="0 0 16 16"><path d="M5.5 4 2.5 7l3 3M2.5 7h7a4 4 0 0 1 0 8H8" /></svg>
      </button>
      <button type="button" class="edit" style="--i: 4" aria-label="Redo" data-tip="Redo (⇧⌘Z)" onmousedown={(e) => e.preventDefault()} onclick={(e) => { e.stopPropagation(); flush(); stayPut(() => onHistory(true)); }}>
        <svg viewBox="0 0 16 16"><path d="M10.5 4l3 3-3 3M13.5 7h-7a4 4 0 0 0 0 8H8" /></svg>
      </button>
      <button type="button" class="danger edit" style="--i: 5" aria-label="Delete diagram" data-tip="Delete diagram" onmousedown={(e) => e.preventDefault()} onclick={(e) => { e.stopPropagation(); flush(); active = false; onDelete(true); }}>
        <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg>
      </button>
    </div>
  {/if}
  {#if full}
    <button class="full-close" type="button" aria-label="Back to the note" title="Back to the note (Esc)" onclick={leaveFull}>
      <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
    </button>
    <div class="zoombar">
      <button aria-label="Zoom out" title="Zoom out (−)" onclick={() => zoomBy(0.8)}><svg viewBox="0 0 16 16"><path d="M4 8h8" /></svg></button>
      <button class="pct" aria-label="Fit to screen" title="Fit to screen (0)" onclick={fit}>{Math.round(zoom * 100)}%</button>
      <button aria-label="Zoom in" title="Zoom in (+)" onclick={() => zoomBy(1.25)}><svg viewBox="0 0 16 16"><path d="M8 4v8M4 8h8" /></svg></button>
    </div>
  {/if}
  </div>

  {#if !active && why}
    <p class="why">
      {#if 'kind' in why}This kind of diagram ({why.kind}) is edited as its code.
      {:else if 'line' in why}Written by hand with <code>{why.line.length > 48 ? why.line.slice(0, 47) + '…' : why.line}</code>, which the drawing editor can't show, so it is edited as code. It still draws as written.
      {:else}Written by hand with more than the drawing editor shows, so it is edited as code. It still draws as written.{/if}
    </p>
  {/if}
  {#if active && d && !flow && rows}
    <DiagramForm {d} />
  {/if}
</div>

<style>
  .dblock { border-radius: 16px; }
  .pic { position: relative; }
  .dblock.active { box-shadow: 0 0 0 2px var(--accent-soft); background: var(--bg); }
  .dblock.active :global(.mermaid-view) { cursor: default; }
  .pic :global(.mermaid-view [data-fold]) { cursor: pointer; }
  .pic :global(.mermaid-view .eve-fold-mark) {
    font-size: 11px; fill: var(--fg-dim); opacity: 0; transition: opacity 0.12s; user-select: none; -webkit-user-select: none;
  }
  /* (over mermaid's own note colours, which it scopes to the drawing's id) */
  .pic :global(.mermaid-view .eve-folded-note rect) { fill: var(--bg-input) !important; stroke: var(--fg-dim) !important; stroke-opacity: 0.35; stroke-dasharray: 3 3; }
  .pic :global(.mermaid-view .eve-folded-note :is(text, tspan)) { fill: var(--fg-dim) !important; }
  @media (hover: hover) { .pic :global(.mermaid-view .eve-folded-note:hover rect) { stroke-opacity: 0.7; } }
  .pic :global(.mermaid-view .eve-fold-mark.alone) { paint-order: stroke; stroke: light-dark(#f9fafb, #17181d); stroke-width: 3px; }
  @media (hover: hover) {
    .pic :global(.mermaid-view:hover .eve-fold-mark) { opacity: 1; }
    .pic :global(.mermaid-view g.eve-fold:hover .labelBox) { fill: light-dark(#e8f3ff, #1c2c45); }
  }
  :global(html.mobile) .pic :global(.mermaid-view .eve-fold-mark), .pic :global(.mermaid-view .folded > .eve-fold-mark),
  .pic :global(.mermaid-view .eve-fold-mark.folded) { opacity: 1; }
  .foldchips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px 2px; user-select: none; -webkit-user-select: none; }
  .foldchips button {
    border: 0; border-radius: 8px; padding: 3px 9px; font: inherit; font-size: 12px; color: var(--fg-dim); background: var(--bg-input);
    max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .foldchips button.on { color: var(--fg); }
  :global(html.mobile) .foldchips button { min-height: 36px; }
  .dblock.full .foldchips { position: absolute; top: 10px; left: 12px; right: 60px; z-index: var(--z-block-ui-over); }
  .dock {
    position: absolute; top: 10px; right: 10px; z-index: var(--z-block-ui-over); display: flex; align-items: center; gap: 1px; padding: 3px;
    border-radius: 12px; background: color-mix(in srgb, var(--bg-pop) 82%, transparent); box-shadow: var(--pop-shadow);
    backdrop-filter: blur(14px) saturate(1.5); -webkit-backdrop-filter: blur(14px) saturate(1.5);
    opacity: 0; transform: translateY(-4px) scale(0.97); transform-origin: top right; pointer-events: none;
    transition: opacity 0.18s ease, transform 0.26s cubic-bezier(0.2, 0.9, 0.25, 1.15);
  }
  .dock button {
    width: 30px; height: 28px; border: 0; border-radius: 9px; padding: 0; background: none; color: var(--fg-dim);
    display: inline-flex; align-items: center; justify-content: center;
    opacity: 0; transform: translateY(-3px); transition: opacity 0.2s ease calc(var(--i, 0) * 25ms), transform 0.28s cubic-bezier(0.2, 0.9, 0.25, 1.2) calc(var(--i, 0) * 25ms), background 0.12s, color 0.12s;
  }
  .dock svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .dock button[aria-label='More'] svg { fill: currentColor; stroke: none; }
  .dock .sep { width: 1px; height: 16px; margin: 0 3px; background: var(--line, var(--bg-hover)); }
  .dock.on, .dblock:hover .dock, .dock:focus-within, .dock:has(.mermaid-play.on) { opacity: 1; transform: none; pointer-events: auto; }
  :is(.dock.on, .dblock:hover .dock, .dock:focus-within, .dock:has(.mermaid-play.on)) button { opacity: 1; transform: none; }
  .dock .mermaid-play svg :is(path, rect) { fill: currentColor; stroke: none; }
  .dock .mermaid-play.on { color: var(--accent-text); }
  @media (hover: hover) {
    .dock button:hover { background: var(--bg-hover); color: var(--fg); }
    .dock button.danger:hover { color: #ff453a; }
  }
  .dock button:active { transform: scale(0.92); }
  :global(html.mobile) .dock button { width: 40px; height: 38px; }
  :global(html.mobile) .dock { opacity: 1; transform: none; pointer-events: auto; }
  :global(html.mobile) .dock button { opacity: 1; transform: none; }
  :global(html.mobile) .dblock:not(.active) .dock:not(.on) .edit { display: none; }
  .dblock.full .dock { position: fixed; top: calc(10px + env(safe-area-inset-top)); right: 60px; }
  @media (prefers-reduced-motion: reduce) { .dock, .dock button { transition: none; } }
  .why { margin: 6px 4px 0; font-size: 12.5px; color: var(--fg-dim); }
  .why code { font-size: 12px; padding: 1px 5px; border-radius: 5px; background: var(--bg-input); }
  .dblock :global(.form) { padding: 4px 12px 0; }

  .dblock.full {
    position: fixed; inset: 0; z-index: var(--z-fullscreen); border-radius: 0; box-shadow: none; padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    background: light-dark(#f9fafb, #17181d); display: grid; grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto minmax(0, 1fr) auto; outline: none;
  }
  :global(html:not(.mobile)) .dblock.full .foldchips { left: 86px; }
  .dblock.full > .pic { grid-column: 1; grid-row: 3 / 5; min-height: 0; }
  .dblock.full > :global(.form) { grid-column: 2; grid-row: 3; width: min(380px, 40vw); overflow: auto; padding: 12px; background: var(--bg); border-left: 1px solid var(--border, var(--bg-hover)); }
  @media (max-width: 700px) {
    .dblock.full { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto auto; }
    .dblock.full > .pic { grid-row: 3; }
    .dblock.full > :global(.form) { grid-column: 1; grid-row: 4; width: auto; max-height: 45vh; border-left: 0; border-top: 1px solid var(--border, var(--bg-hover)); }
  }
  .dblock.full .pic { height: 100%; }
  .dblock.full :global(.diagram-canvas) {
    height: 100%; box-sizing: border-box; border-radius: 0; overflow: auto; overscroll-behavior: contain; align-items: flex-start; padding: 24px;
    margin: 0; box-shadow: none;
  }
  .dblock.full :global(.diagram-canvas > *) { margin: auto; }
  .dblock.full:not(.active) :global(.diagram-canvas) { cursor: grab; }
  .dblock.full :global(.diagram-canvas.panning) { cursor: grabbing; }
  .full-close {
    position: absolute; top: 10px; right: 12px; z-index: var(--z-block-ui-over); width: 36px; height: 36px; border: 0; border-radius: 50%; color: var(--fg);
    display: inline-flex; align-items: center; justify-content: center; background: var(--bg-pop); box-shadow: var(--pop-shadow);
  }
  .dblock.full .full-close { position: fixed; top: calc(6px + env(safe-area-inset-top)); }
  .zoombar {
    position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: var(--z-block-ui-over); display: flex; gap: 2px; padding: 4px;
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
