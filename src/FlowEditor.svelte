<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { freshId, type Flowchart, type Line, type Shape } from './lib/diagram';

  /**
   * A flowchart drawn by hand on its own picture (the builder's preview): boxes are made, joined, renamed and removed
   * right where they are drawn, with no mermaid to write. Mermaid still lays the picture out, so what is drawn here is
   * what the note will show. This is a layer over the preview: it reads where mermaid put each box (its node's id
   * holds the step's id; the lines come in the order they were written) and edits the chart, which draws again.
   *   a box: a click types in it, right there, the picture following the text; a bar over it sets its shape or deletes it
   *   its +: a click adds the next step joined to it; dragged onto another box, it joins the two
   *   a line: click selects it (its look, its label, the other way round, deleting)
   *   empty space: a double-click adds a box on its own
   *   keys: Tab adds the next step, Enter is done typing (and types again), ⌫ deletes a box not being typed in, Esc lets go
   */
  let { flow, host, version, k }: { flow: Flowchart; host: HTMLElement; version: string; k: number } = $props();

  type Box = { id: string; x: number; y: number; w: number; h: number };
  let layer: HTMLDivElement;
  let boxes = $state<Box[]>([]);
  let sel = $state<{ node: string } | { edge: number; x: number; y: number } | null>(null);
  let hover = $state<string | null>(null);
  let editing = $state<string | null>(null), editText = $state('');
  let drag = $state<{ from: string; x0: number; y0: number; x: number; y: number; moved: boolean } | null>(null);

  const nodeIdOf = (g: Element) => /-flowchart-(.+)-\d+$/.exec(g.id)?.[1] ?? null;
  const boxOf = (id: string | null) => boxes.find((b) => b.id === id) ?? null;
  /** the lines as written: those whose ends both exist, in order (toCode skips the rest) */
  const drawnEdges = () => flow.edges.map((e, i) => ({ e, i })).filter(({ e }) => flow.nodes.some((n) => n.id === e.from) && flow.nodes.some((n) => n.id === e.to));

  function measure() {
    if (!layer) return;
    const o = layer.getBoundingClientRect();
    boxes = [...host.querySelectorAll('g.node')].flatMap((g) => {
      const id = nodeIdOf(g), r = g.getBoundingClientRect();
      return id ? [{ id, x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }] : [];
    });
    // each line gets a wide clear twin to be clicked by (the drawing stays exactly as mermaid made it)
    const lines = [...host.querySelectorAll('path.flowchart-link')];
    lines.forEach((p, i) => {
      if (p.nextElementSibling?.classList.contains('hit')) return;
      const twin = p.cloneNode() as SVGPathElement;
      twin.removeAttribute('id');
      twin.removeAttribute('marker-end');
      twin.removeAttribute('marker-start');
      twin.setAttribute('class', 'hit');
      twin.setAttribute('style', '');
      twin.dataset.index = String(i);
      p.after(twin);
    });
  }
  $effect(() => { void version; void k; tick().then(measure); });
  onMount(() => {
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    const key = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', key, true);
    return () => { ro.disconnect(); window.removeEventListener('keydown', key, true); };
  });

  // ---- what the chart becomes ----
  function addAfter(from: string | null) {
    const id = freshId('n', flow.nodes);
    flow.nodes.push({ id, label: 'New step', shape: 'round' });
    if (from) flow.edges.push({ from, to: id, label: '', line: 'solid' });
    sel = { node: id };
    // typed in at once: until the new box is drawn its text box sits by the one it grew from, so no key is lost
    const b = boxOf(from);
    pendingAt = b ? plusAt(b) : { x: (layer?.clientWidth ?? 300) / 2, y: (layer?.clientHeight ?? 100) / 2 };
    editing = null;
    startEdit(id);
  }
  let pendingAt = $state({ x: 0, y: 0 });
  function join(from: string, to: string) {
    if (from === to || flow.edges.some((e) => e.from === from && e.to === to)) return;
    flow.edges.push({ from, to, label: '', line: 'solid' });
    sel = { edge: flow.edges.length - 1, x: 0, y: 0 };
    tick().then(() => { const b = boxOf(to); if (b && sel && 'edge' in sel) sel = { ...sel, x: b.x + b.w / 2, y: b.y }; });
  }
  function dropNode(id: string) {
    flow.nodes = flow.nodes.filter((n) => n.id !== id);
    flow.edges = flow.edges.filter((e) => e.from !== id && e.to !== id);
    sel = null;
  }
  const dropEdge = (i: number) => { flow.edges.splice(i, 1); sel = null; };
  function reverse(i: number) { const e = flow.edges[i]; [e.from, e.to] = [e.to, e.from]; }

  // ---- renaming in place ----
  // the box's text changes as it is typed (the picture follows it); Esc puts back what it was
  let before = '';
  function startEdit(id: string) {
    if (editing === id) return;
    editing = id;
    editText = before = flow.nodes.find((n) => n.id === id)?.label ?? '';
    tick().then(() => { const el = layer.querySelector<HTMLInputElement>('input.rename'); el?.focus(); el?.select(); });
  }
  function typed() {
    const n = flow.nodes.find((x) => x.id === editing);
    if (n && editText.trim()) n.label = editText.trim();
  }
  function commitEdit() {
    typed();
    editing = null;
  }
  function cancelEdit() {
    const n = flow.nodes.find((x) => x.id === editing);
    if (n) n.label = before;
    editing = null;
  }
  /** a box on its own (the note's "+ Box"), typed in at once */
  export function addBox() { addAfter(null); }

  // ---- the picture's own clicks ----
  function onHostClick(e: MouseEvent) {
    if (drag) return;
    const t = e.target as Element;
    const g = t.closest('g.node');
    if (g) { const id = nodeIdOf(g); if (id) { sel = { node: id }; startEdit(id); } return; } // a box clicked is typed in at once
    const hit = t.closest('path.hit') as SVGPathElement | null;
    const label = t.closest('g.edgeLabel g.label') as HTMLElement | null;
    let at = hit ? Number(hit.dataset.index) : -1;
    if (at < 0 && label?.dataset.id) at = [...host.querySelectorAll('path.flowchart-link')].findIndex((p) => (p as SVGElement).dataset.id === label.dataset.id);
    if (at >= 0) {
      const i = drawnEdges()[at]?.i;
      const o = layer.getBoundingClientRect();
      if (i !== undefined) sel = { edge: i, x: e.clientX - o.left, y: e.clientY - o.top };
      return;
    }
    sel = null;
  }
  function onHostDouble(e: MouseEvent) {
    const g = (e.target as Element).closest('g.node');
    if (g) { const id = nodeIdOf(g); if (id) startEdit(id); }
    else if (!(e.target as Element).closest('path.hit, g.edgeLabel')) addAfter(null);
  }
  function onHostMove(e: PointerEvent) {
    const g = (e.target as Element).closest?.('g.node');
    hover = g ? nodeIdOf(g) : null;
  }
  $effect(() => {
    host.addEventListener('click', onHostClick);
    host.addEventListener('dblclick', onHostDouble);
    host.addEventListener('pointermove', onHostMove);
    return () => { host.removeEventListener('click', onHostClick); host.removeEventListener('dblclick', onHostDouble); host.removeEventListener('pointermove', onHostMove); };
  });

  // ---- the + handle: click for the next step, drag to join ----
  function handleDown(e: PointerEvent, from: string) {
    e.preventDefault();
    e.stopPropagation();
    const o = layer.getBoundingClientRect();
    drag = { from, x0: e.clientX - o.left, y0: e.clientY - o.top, x: e.clientX - o.left, y: e.clientY - o.top, moved: false };
    const move = (ev: PointerEvent) => {
      if (!drag) return;
      const x = ev.clientX - o.left, y = ev.clientY - o.top;
      drag = { ...drag, x, y, moved: drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > 6 };
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => host.contains(el) && el.closest('g.node'));
      hover = under ? nodeIdOf(under.closest('g.node')!) : null;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = drag;
      drag = null;
      if (!d) return;
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => host.contains(el) && el.closest('g.node'));
      const to = under ? nodeIdOf(under.closest('g.node')!) : null;
      if (!d.moved || !to) addAfter(d.from); // a click, or let go on empty space: a new step after it
      else join(d.from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onKey(e: KeyboardEvent) {
    if (editing || !sel) return;
    const typing = (e.target as HTMLElement).matches?.('input, textarea, [contenteditable="true"]');
    // in a line's label: Esc or Enter is done with it (Esc closed the whole builder), the rest is typing
    if (typing && layer.contains(e.target as Node)) {
      if (!e.isComposing && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); sel = null; }
      return;
    }
    if (typing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sel = null; }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if ('node' in sel) dropNode(sel.node); else dropEdge(sel.edge); }
    else if ('node' in sel && e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); startEdit(sel.node); }
    else if ('node' in sel && e.key === 'Tab') { e.preventDefault(); addAfter(sel.node); }
  }

  const SHAPES: [Shape, string, string][] = [
    ['round', 'Rounded', '<rect x="2.5" y="4.5" width="11" height="7" rx="2.2"/>'],
    ['box', 'Box', '<rect x="2.5" y="4.5" width="11" height="7"/>'],
    ['pill', 'Start / end', '<rect x="1.5" y="4.5" width="13" height="7" rx="3.5"/>'],
    ['diamond', 'Decision', '<path d="M8 2.5 13.5 8 8 13.5 2.5 8z"/>'],
    ['circle', 'Circle', '<circle cx="8" cy="8" r="5.5"/>'],
    ['db', 'Database', '<ellipse cx="8" cy="4.5" rx="5" ry="2"/><path d="M3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7"/>'],
  ];
  const LINES: [Line, string, string][] = [
    ['solid', 'Arrow', '<path d="M2 8h10M9.5 5.5 12 8l-2.5 2.5"/>'],
    ['dotted', 'Dotted', '<path d="M2 8h10" stroke-dasharray="1.6 2"/><path d="M9.5 5.5 12 8l-2.5 2.5"/>'],
    ['thick', 'Bold', '<path d="M2 8h9.5M9 5 12.5 8 9 11" stroke-width="2.6"/>'],
  ];

  const selId = $derived(sel && 'node' in sel ? sel.node : null);
  const selNode = $derived(selId ? flow.nodes.find((n) => n.id === selId) ?? null : null);
  const selBox = $derived(boxOf(selId));
  const selEdge = $derived(sel && 'edge' in sel ? flow.edges[sel.edge] ?? null : null);
  /** where the + sits on a box: after it, the way the chart reads */
  const plusAt = (b: Box) => (flow.dir === 'LR' ? { x: b.x + b.w + 14, y: b.y + b.h / 2 } : { x: b.x + b.w / 2, y: b.y + b.h + 14 });
  /** a bar over (or, near the top, under) what it is for, kept inside the picture */
  function barAt(x: number, top: number, bottom: number, width: number) {
    const W = layer?.clientWidth ?? 600;
    return { left: Math.max(4, Math.min(W - width - 4, x - width / 2)), top: top > 52 ? top - 46 : bottom + 8 };
  }
  const handles = $derived([...new Set([hover, selNode?.id ?? null, drag?.from ?? null].filter((x): x is string => !!x))].map(boxOf).filter((b): b is Box => !!b && b.id !== editing));
</script>

<div class="layer" bind:this={layer}>
  {#if sel && 'node' in sel && selBox}
    <div class="ring" style:left={`${selBox.x - 4}px`} style:top={`${selBox.y - 4}px`} style:width={`${selBox.w + 8}px`} style:height={`${selBox.h + 8}px`}></div>
  {/if}
  {#if hover && boxOf(hover) && drag && hover !== drag.from}
    {@const b = boxOf(hover)!}
    <div class="ring target" style:left={`${b.x - 4}px`} style:top={`${b.y - 4}px`} style:width={`${b.w + 8}px`} style:height={`${b.h + 8}px`}></div>
  {/if}

  {#each handles as b (b.id)}
    {@const p = plusAt(b)}
    <button class="plus" type="button" aria-label="Add a step after this, or drag onto another box to connect" title="Click: next step · Drag: connect"
      style:left={`${p.x - 11}px`} style:top={`${p.y - 11}px`} onpointerdown={(e) => handleDown(e, b.id)}
      onpointerenter={() => (hover = b.id)}>
      <svg viewBox="0 0 16 16"><path d="M8 4v8M4 8h8" /></svg>
    </button>
  {/each}

  {#if drag && drag.moved}
    <svg class="wire" aria-hidden="true"><line x1={drag.x0} y1={drag.y0} x2={drag.x} y2={drag.y} /><circle cx={drag.x} cy={drag.y} r="4" /></svg>
  {/if}

  {#if editing}
    {@const b = boxOf(editing) ?? { id: editing, x: pendingAt.x - 70, y: pendingAt.y - 16, w: 140, h: 32 }}
    <input class="rename" bind:value={editText} aria-label="Step name" oninput={typed}
      style:left={`${b.x + b.w / 2 - Math.max(b.w, 140) / 2}px`} style:top={`${b.y + b.h / 2 - 16}px`} style:width={`${Math.max(b.w, 140)}px`}
      onkeydown={(e) => { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); } else if (e.key === 'Tab') { e.preventDefault(); const from = editing; commitEdit(); if (from) addAfter(from); } }}
      onblur={commitEdit} />
  {/if}

  {#if selNode && selBox && !drag}
    {@const at = barAt(selBox.x + selBox.w / 2, selBox.y, selBox.y + selBox.h, 300)}
    <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
      {#each SHAPES as [shape, label, icon] (shape)}
        <button type="button" class:on={selNode.shape === shape} aria-label={label} title={label} onmousedown={(e) => e.preventDefault()} onclick={() => (selNode.shape = shape)}><svg viewBox="0 0 16 16">{@html icon}</svg></button>
      {/each}
      <span class="sep"></span>
      <button type="button" class="danger" aria-label="Delete" title="Delete" onmousedown={(e) => e.preventDefault()} onclick={() => { editing = null; dropNode(selNode.id); }}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
    </div>
  {/if}

  {#if selEdge && sel && 'edge' in sel && !drag}
    {@const at = barAt(sel.x, sel.y - 6, sel.y + 6, 330)}
    {@const i = sel.edge}
    <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
      {#each LINES as [line, label, icon] (line)}
        <button type="button" class:on={selEdge.line === line} aria-label={label} title={label} onclick={() => (selEdge.line = line)}><svg viewBox="0 0 16 16">{@html icon}</svg></button>
      {/each}
      <span class="sep"></span>
      <input class="edge-label" bind:value={selEdge.label} placeholder="Label" aria-label="Line label" />
      <button type="button" aria-label="Reverse" title="Reverse" onclick={() => reverse(i)}><svg viewBox="0 0 16 16"><path d="M3 5.5h9.5M10.5 3l2.5 2.5L10.5 8M13 10.5H3.5M5.5 8 3 10.5 5.5 13" /></svg></button>
      <button type="button" class="danger" aria-label="Delete" title="Delete (⌫)" onclick={() => dropEdge(i)}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
    </div>
  {/if}
</div>

<style>
  .layer { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
  .layer > * { pointer-events: auto; }
  .ring { position: absolute; border-radius: 14px; box-shadow: 0 0 0 2px var(--accent); pointer-events: none; }
  .ring.target { box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px var(--accent-soft); }
  .plus {
    position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 0; padding: 0; cursor: crosshair;
    display: inline-flex; align-items: center; justify-content: center; background: var(--accent); color: #fff;
    box-shadow: 0 2px 6px rgba(0, 40, 100, 0.25); touch-action: none; transition: transform 0.12s;
  }
  .plus:hover { transform: scale(1.15); }
  .plus svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
  .wire { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .wire line { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 5 4; }
  .wire circle { fill: var(--accent); }
  .rename {
    position: absolute; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 14px; color: var(--fg); background: var(--bg-pop); box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0, 0, 0, 0.15); outline: none;
  }
  .bar {
    position: absolute; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: var(--pop-shadow), 0 0 0 0.5px var(--line); white-space: nowrap;
  }
  .bar button {
    width: 30px; height: 30px; border: 0; border-radius: 8px; padding: 0; background: none; color: var(--fg-dim);
    display: inline-flex; align-items: center; justify-content: center;
  }
  @media (hover: hover) { .bar button:hover { background: var(--bg-hover); color: var(--fg); } }
  .bar button.on { background: var(--accent-soft); color: var(--accent); }
  .bar button.danger:hover { color: #ff453a; }
  .bar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .sep { width: 1px; height: 18px; background: var(--line); margin: 0 3px; }
  .edge-label {
    width: 110px; height: 30px; box-sizing: border-box; border: 0; border-radius: 8px; padding: 0 9px; font: inherit; font-size: 13px;
    background: var(--bg-input); color: var(--fg); outline: none;
  }
  .edge-label:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  :global(.diagram-canvas path.hit) { stroke: transparent !important; stroke-width: 14px !important; fill: none !important; pointer-events: stroke; cursor: pointer; }
  :global(.builder .preview g.node) { cursor: pointer; }
</style>
