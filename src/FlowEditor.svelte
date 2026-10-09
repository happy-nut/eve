<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { freshId, type Flowchart, type Line, type Shape } from './lib/diagram';
  import { ui } from './lib/ui.svelte';
  import { isMobile } from './lib/platform';

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
  let sel = $state<{ node: string } | { edge: number; x: number; y: number } | { lane: string } | null>(null);
  /** where each swimlane's name is drawn (lanes.ts), to be clicked, renamed and moved */
  let laneHeads = $state<Box[]>([]);
  let laneEditing = $state<string | null>(null), laneText = $state('');
  let hover = $state<string | null>(null);
  let editing = $state<string | null>(null), editText = $state('');
  let drag = $state<{ from: string; x0: number; y0: number; x: number; y: number; moved: boolean } | null>(null);
  /** "Connect" pressed on this box: the next box tapped gets a line from it (a phone's way to join two boxes, where
   *  dragging the + is fiddly and the + of a box being typed in was not there at all) */
  let linking = $state<string | null>(null);
  /** a phone's bar showing the shapes in place of its other buttons */
  let shapesOpen = $state(false);
  $effect(() => { void selId; shapesOpen = false; }); // another box picked: its bar starts over

  const nodeIdOf = (g: Element) => /-flowchart-(.+)-\d+$/.exec(g.id)?.[1] ?? null;
  const boxOf = (id: string | null) => boxes.find((b) => b.id === id) ?? null;
  /** the lines as written: those whose ends both exist, in order (toCode skips the rest) */
  const drawnEdges = () => flow.edges.map((e, i) => ({ e, i })).filter(({ e }) => flow.nodes.some((n) => n.id === e.from) && flow.nodes.some((n) => n.id === e.to));

  function measure() {
    if (!layer) return;
    const o = layer.getBoundingClientRect();
    laneHeads = [...host.querySelectorAll<SVGGElement>('g.lane-head')].flatMap((g) => {
      const id = g.dataset.lane, r = g.getBoundingClientRect();
      return id ? [{ id, x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }] : [];
    });
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
    // a picture wider than the card scrolls in it: the layer's boxes follow it
    host.addEventListener('scroll', measure, { passive: true });
    const key = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', key, true);
    return () => { ro.disconnect(); host.removeEventListener('scroll', measure); window.removeEventListener('keydown', key, true); };
  });

  // ---- what the chart becomes ----
  function addAfter(from: string | null, inLane?: string) {
    const id = freshId('n', flow.nodes);
    // in the lane of the step it follows, or the lane asked for (picked, or double-clicked in), or the first
    const lanes = flow.lanes ?? [];
    const lane = lanes.length ? (flow.nodes.find((n) => n.id === from)?.lane ?? inLane ?? (sel && 'lane' in sel ? sel.lane : lanes[0].id)) : undefined;
    flow.nodes.push(lane ? { id, label: 'New step', shape: 'round', lane } : { id, label: 'New step', shape: 'round' });
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

  // ---- swimlanes ----
  /** a lane more (the note's "+ Lane"); the first one turns the chart into lanes, its steps all in the first */
  export function addLane() {
    if (editing) commitEdit();
    const lanes = flow.lanes ?? [];
    if (!lanes.length) {
      flow.lanes = [{ id: 'L1', label: 'Lane 1' }, { id: 'L2', label: 'Lane 2' }];
      for (const n of flow.nodes) n.lane = 'L1';
      startLaneEdit('L1');
      return;
    }
    const id = freshId('L', lanes);
    flow.lanes = [...lanes, { id, label: `Lane ${lanes.length + 1}` }];
    startLaneEdit(id);
  }
  function startLaneEdit(id: string) {
    sel = { lane: id };
    laneEditing = id;
    laneText = flow.lanes?.find((l) => l.id === id)?.label ?? '';
  }
  function commitLane() {
    const l = flow.lanes?.find((x) => x.id === laneEditing);
    if (l && laneText.trim()) l.label = laneText.trim();
    laneEditing = null;
  }
  function moveLane(id: string, by: -1 | 1) {
    const lanes = [...(flow.lanes ?? [])];
    const i = lanes.findIndex((l) => l.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= lanes.length) return;
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    flow.lanes = lanes;
  }
  /** a lane gone: its steps go to the lane beside it; the last lane gone, the chart is a plain flowchart again */
  function dropLane(id: string) {
    const lanes = flow.lanes ?? [];
    const i = lanes.findIndex((l) => l.id === id);
    if (i < 0) return;
    const rest = lanes.filter((l) => l.id !== id);
    const to = rest[Math.max(0, i - 1)]?.id;
    for (const n of flow.nodes) if (n.lane === id) { if (to) n.lane = to; else delete n.lane; }
    if (rest.length) flow.lanes = rest;
    else { delete flow.lanes; for (const n of flow.nodes) delete n.lane; }
    sel = null;
    laneEditing = null;
  }
  /** the picked box into another lane, from a menu of them */
  function pickLane(e: MouseEvent, nodeId: string) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const n = flow.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    ui.openMenu({ clientX: r.left, clientY: r.bottom + 4 }, (flow.lanes ?? []).map((l) => ({ label: l.label, checked: n.lane === l.id, run: () => { n.lane = l.id; } })));
  }

  // ---- the picture's own clicks ----
  function onHostClick(e: MouseEvent) {
    if (drag) return;
    const t = e.target as Element;
    const g = t.closest('g.node');
    const head = t.closest('g.lane-head') as SVGGElement | null;
    if (head && !linking && !g) {
      const id = head.dataset.lane;
      if (!id) return;
      if (editing) commitEdit();
      if (sel && 'lane' in sel && sel.lane === id) startLaneEdit(id); else { sel = { lane: id }; (document.activeElement as HTMLElement | null)?.blur?.(); }
      return;
    }
    if (linking) {
      const from = linking, id = g ? nodeIdOf(g) : null;
      linking = null;
      // joined, and nothing left selected: the line's bar would sit over the boxes above it (a tap on the line opens it)
      if (id && id !== from) { join(from, id); sel = null; }
      return; // a tap on anything else lets go of it
    }
    // a box tapped is picked (its +, its bar, its ✎); tapped again, or its ✎, it is typed in. Typed in at once, a phone's
    // keyboard came up at every tap meant only to pick the box
    if (g) {
      const id = nodeIdOf(g);
      if (!id) return;
      if (editing && editing !== id) commitEdit();
      if (sel && 'node' in sel && sel.node === id) startEdit(id);
      else {
        sel = { node: id };
        // the keyboard off the note's text: its keys (⌫, Enter, Tab) are the box's now, and a phone's keyboard goes down
        if (!editing) (document.activeElement as HTMLElement | null)?.blur?.();
      }
      return;
    }
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
    else if ((e.target as Element).closest('g.lane-head')) return;
    else if (!(e.target as Element).closest('path.hit, g.edgeLabel')) addAfter(null, ((e.target as Element).closest('g.lane') as SVGGElement | null)?.dataset.lane || undefined);
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
  /** a finger on the + is the + being dragged: the page under it does not scroll (not passive, so the touch's default
   *  can be refused; its pointer events still come) */
  const holdTouch = (el: HTMLElement) => {
    const stop = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => { el.removeEventListener('touchstart', stop); el.removeEventListener('touchmove', stop); };
  };
  function handleDown(e: PointerEvent, from: string) {
    e.preventDefault();
    e.stopPropagation();
    if (editing) commitEdit(); // the box being typed in has its + too: its text is kept as it is
    const o = layer.getBoundingClientRect();
    drag = { from, x0: e.clientX - o.left, y0: e.clientY - o.top, x: e.clientX - o.left, y: e.clientY - o.top, moved: false };
    const boxAt = (cx: number, cy: number) => {
      const under = document.elementsFromPoint(cx, cy).find((el) => host.contains(el) && el.closest('g.node'));
      return under ? nodeIdOf(under.closest('g.node')!) : null;
    };
    const move = (cx: number, cy: number) => {
      if (!drag) return;
      const x = cx - o.left, y = cy - o.top;
      drag = { ...drag, x, y, moved: drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > 6 };
      hover = boxAt(cx, cy);
    };
    const end = (cx: number, cy: number, cancelled = false) => {
      off();
      const d = drag;
      drag = null;
      if (!d || cancelled) return;
      const to = boxAt(cx, cy);
      if (!d.moved || !to) addAfter(d.from); // a click, or let go on empty space: a new step after it
      else join(d.from, to);
    };
    const pMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const pUp = (ev: PointerEvent) => end(ev.clientX, ev.clientY);
    const pCancel = () => end(0, 0, true); // the gesture taken away: nothing is made of it, and the drag does not stick
    const off = () => {
      window.removeEventListener('pointermove', pMove);
      window.removeEventListener('pointerup', pUp);
      window.removeEventListener('pointercancel', pCancel);
    };
    window.addEventListener('pointermove', pMove);
    window.addEventListener('pointerup', pUp);
    window.addEventListener('pointercancel', pCancel);
  }

  function onKey(e: KeyboardEvent) {
    if (linking && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); linking = null; return; }
    if (editing || laneEditing || !sel) return;
    // only keys meant for this diagram: the keyboard on it, or on nothing (after a box's typing is done) — not keys
    // typed in the list, another note's page or the full-screen view, which deleted the box behind them
    if (ui.diagramView !== null) return;
    const t = e.target as Element;
    if (t !== document.body && !layer.closest('.dblock')?.contains(t)) return;
    const typing = (e.target as HTMLElement).matches?.('input, textarea, [contenteditable="true"]');
    // in a line's label: Esc or Enter is done with it (Esc closed the whole builder), the rest is typing
    if (typing && layer.contains(e.target as Node)) {
      if (!e.isComposing && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); sel = null; }
      return;
    }
    if (typing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sel = null; }
    else if ('lane' in sel) { if (e.key === 'Enter') { e.preventDefault(); startLaneEdit(sel.lane); } }
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
  const plusAt = (b: Box) => {
    // clear of the text box while the box is typed in (at least 140 wide, centred on it)
    const w = b.id === editing ? Math.max(b.w, 140) : b.w;
    return flow.dir === 'LR' ? { x: b.x + b.w / 2 + w / 2 + 14, y: b.y + b.h / 2 } : { x: b.x + b.w / 2, y: b.y + b.h + (b.id === editing ? 22 : 14) };
  };
  /** a bar over (or, near the top, under) what it is for, kept inside the picture */
  function barAt(x: number, top: number, bottom: number, width: number) {
    const W = layer?.clientWidth ?? 600;
    return { left: Math.max(4, Math.min(W - width - 4, x - width / 2)), top: top > 52 ? top - 46 : bottom + 8 };
  }
  const handles = $derived([...new Set([hover, selNode?.id ?? null, drag?.from ?? null].filter((x): x is string => !!x))].map(boxOf).filter((b): b is Box => !!b));
</script>

<div class="layer" bind:this={layer}>
  {#if sel && 'node' in sel && selBox}
    <div class="ring" style:left={`${selBox.x - 4}px`} style:top={`${selBox.y - 4}px`} style:width={`${selBox.w + 8}px`} style:height={`${selBox.h + 8}px`}></div>
  {/if}
  {#if hover && boxOf(hover) && drag && hover !== drag.from}
    {@const b = boxOf(hover)!}
    <div class="ring target" style:left={`${b.x - 4}px`} style:top={`${b.y - 4}px`} style:width={`${b.w + 8}px`} style:height={`${b.h + 8}px`}></div>
  {/if}

  {#if sel && 'lane' in sel}
    {@const lid = sel.lane}
    {@const hb = laneHeads.find((h) => h.id === lid)}
    {@const i = (flow.lanes ?? []).findIndex((l) => l.id === lid)}
    {#if hb && i >= 0}
      <div class="ring" style:left={`${hb.x - 2}px`} style:top={`${hb.y - 2}px`} style:width={`${hb.w + 4}px`} style:height={`${hb.h + 4}px`}></div>
      {#if laneEditing === lid}
        <!-- the keyboard in it as it appears: it comes only once the new lane is drawn and measured, after "+ Lane" was
             pressed, and the keys typed went to that button (Enter made another lane) -->
        <input class="lane-name" bind:value={laneText} aria-label="Lane name" placeholder="Lane" {@attach (el: HTMLInputElement) => { el.focus(); el.select(); }}
          style:left={`${hb.x + hb.w / 2 - 70}px`} style:top={`${hb.y + hb.h / 2 - 16}px`}
          onkeydown={(e) => { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); commitLane(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); laneEditing = null; } }}
          onblur={commitLane} />
      {:else}
        {@const at = barAt(hb.x + hb.w / 2, hb.y, hb.y + hb.h, 240)}
        {@const across = flow.dir === 'LR'}
        <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
          <button type="button" class="text" aria-label="Rename the lane" title="Rename (or click its name again)" onmousedown={(e) => e.preventDefault()} onclick={() => startLaneEdit(lid)}><svg viewBox="0 0 16 16"><path d="M10.5 3.5l2 2L6 12l-2.6.6L4 10z" /></svg>Name</button>
          <span class="sep"></span>
          <button type="button" aria-label={across ? 'Move up' : 'Move left'} title={across ? 'Move up' : 'Move left'} disabled={i === 0} onclick={() => moveLane(lid, -1)}><svg viewBox="0 0 16 16"><path d={across ? 'M8 12.5v-9M4.5 7 8 3.5 11.5 7' : 'M12.5 8h-9M7 4.5 3.5 8 7 11.5'} /></svg></button>
          <button type="button" aria-label={across ? 'Move down' : 'Move right'} title={across ? 'Move down' : 'Move right'} disabled={i === (flow.lanes?.length ?? 0) - 1} onclick={() => moveLane(lid, 1)}><svg viewBox="0 0 16 16"><path d={across ? 'M8 3.5v9M4.5 9 8 12.5 11.5 9' : 'M3.5 8h9M9 4.5 12.5 8 9 11.5'} /></svg></button>
          <button type="button" aria-label="Add a step in this lane" title="Add a step in this lane" onclick={() => addAfter(null, lid)}><svg viewBox="0 0 16 16"><rect x="2.5" y="4.5" width="11" height="7" rx="2.2" /><path d="M8 6.5v3M6.5 8h3" /></svg></button>
          <button type="button" class="danger" aria-label="Delete the lane" title="Delete the lane (its steps go to the one beside it)" onclick={() => dropLane(lid)}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
        </div>
      {/if}
    {/if}
  {/if}

  {#if linking}
    {#each boxes.filter((b) => b.id !== linking) as b (b.id)}
      <div class="ring target pick" style:left={`${b.x - 4}px`} style:top={`${b.y - 4}px`} style:width={`${b.w + 8}px`} style:height={`${b.h + 8}px`}></div>
    {/each}
    <div class="pickhint">Tap the box to connect to · tap elsewhere to cancel</div>
  {/if}

  {#each handles as b (b.id)}
    {@const p = plusAt(b)}
    <button class="plus" type="button" aria-label="Add a step after this, or drag onto another box to connect" title="Click: next step · Drag: connect"
      style:left={`${p.x - 11}px`} style:top={`${p.y - 11}px`} onpointerdown={(e) => handleDown(e, b.id)} {@attach holdTouch}
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

  {#if selNode && selBox && !drag && !linking}
    <!-- under the box (one near the top) it goes below the + too: it sat over the + there, and a press on the + changed
         the box's shape instead. On a phone the shapes fold into one button: all six in a row ran off its narrow picture -->
    {@const compact = isMobile && !shapesOpen}
    {@const at = barAt(selBox.x + selBox.w / 2, selBox.y, selBox.y + selBox.h + (flow.dir === 'LR' ? 0 : isMobile ? 34 : 26), compact ? 290 : isMobile ? 290 : 480)}
    {@const current = SHAPES.find(([sh]) => sh === selNode.shape) ?? SHAPES[0]}
    <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
      {#if isMobile && shapesOpen}
        <button type="button" aria-label="Back" title="Back" onclick={() => (shapesOpen = false)}><svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg></button>
        <span class="sep"></span>
        {#each SHAPES as [shape, label, icon] (shape)}
          <button type="button" class:on={selNode.shape === shape} aria-label={label} title={label} onmousedown={(e) => e.preventDefault()} onclick={() => { selNode.shape = shape; shapesOpen = false; }}><svg viewBox="0 0 16 16">{@html icon}</svg></button>
        {/each}
      {:else}
        <button type="button" class="text" class:on={editing === selNode.id} aria-label="Edit the text" title="Edit the text (or click the box again)"
          onmousedown={(e) => e.preventDefault()} onclick={() => startEdit(selNode.id)}><svg viewBox="0 0 16 16"><path d="M10.5 3.5l2 2L6 12l-2.6.6L4 10z" /></svg>Text</button>
        <span class="sep"></span>
        {#if isMobile}
          <button type="button" aria-label="Shape" title="Shape" onmousedown={(e) => e.preventDefault()} onclick={() => { if (editing) commitEdit(); shapesOpen = true; }}><svg viewBox="0 0 16 16">{@html current[2]}</svg></button>
        {:else}
          {#each SHAPES as [shape, label, icon] (shape)}
            <button type="button" class:on={selNode.shape === shape} aria-label={label} title={label} onmousedown={(e) => e.preventDefault()} onclick={() => (selNode.shape = shape)}><svg viewBox="0 0 16 16">{@html icon}</svg></button>
          {/each}
          <span class="sep"></span>
        {/if}
        {#if flow.lanes?.length}
          <button type="button" aria-label="Lane" title="Move to another lane" onmousedown={(e) => e.preventDefault()} onclick={(e) => { if (editing) commitEdit(); pickLane(e, selNode.id); }}><svg viewBox="0 0 16 16"><path d="M2 4.5h12M2 8h12M2 11.5h12" /></svg>{#if !isMobile}<span class="lbl">{flow.lanes.find((l) => l.id === selNode.lane)?.label ?? 'Lane'}</span>{/if}</button>
        {/if}
        <button type="button" class:on={linking === selNode.id} aria-label="Connect to another box" title="Connect: then tap the box to connect to" onmousedown={(e) => e.preventDefault()}
          onclick={() => { if (editing) commitEdit(); linking = selNode.id; }}><svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r="2" /><path d="M5.5 8h7M10.5 5.5 13 8l-2.5 2.5" /></svg>{#if isMobile}<span class="lbl">Connect</span>{/if}</button>
        <button type="button" class="danger" aria-label="Delete" title="Delete" onmousedown={(e) => e.preventDefault()} onclick={() => { editing = null; dropNode(selNode.id); }}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
      {/if}
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
  .ring.pick { box-shadow: 0 0 0 2px var(--accent-soft); }
  .pickhint {
    position: absolute; left: 50%; bottom: 8px; translate: -50% 0; padding: 6px 12px; border-radius: 999px; white-space: nowrap; pointer-events: none;
    font-size: 12.5px; font-weight: 500; background: var(--accent); color: #fff; box-shadow: 0 2px 8px rgba(0, 40, 100, 0.2);
  }
  .plus {
    position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 0; padding: 0; cursor: crosshair;
    display: inline-flex; align-items: center; justify-content: center; background: var(--accent); color: #fff;
    box-shadow: 0 2px 6px rgba(0, 40, 100, 0.25); touch-action: none; transition: transform 0.12s;
  }
  .plus:hover { transform: scale(1.15); }
  /* a finger's size on a phone: a larger dot, and a larger place to press around it */
  :global(html.mobile) .plus { width: 30px; height: 30px; margin: -4px 0 0 -4px; }
  :global(html.mobile) .plus::before { content: ''; position: absolute; inset: -8px; border-radius: 50%; }
  :global(html.mobile) .plus svg { width: 15px; height: 15px; }
  .plus svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
  .wire { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .wire line { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 5 4; }
  .wire circle { fill: var(--accent); }
  .lane-name {
    position: absolute; width: 140px; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 13px; font-weight: 600; color: var(--fg); background: var(--bg-pop); box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0, 0, 0, 0.15); outline: none;
  }
  .bar button:disabled { opacity: 0.35; }
  .bar button .lbl { max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
  .rename {
    position: absolute; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 14px; color: var(--fg); background: var(--bg-pop); box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0, 0, 0, 0.15); outline: none;
  }
  .bar {
    position: absolute; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: var(--pop-shadow), 0 0 0 0.5px var(--line); white-space: nowrap;
    max-width: calc(100% - 8px); flex-wrap: wrap; box-sizing: border-box; /* a phone's narrow picture: two rows, not off its edge */
  }
  .bar button {
    width: 30px; height: 30px; border: 0; border-radius: 8px; padding: 0; background: none; color: var(--fg-dim);
    display: inline-flex; align-items: center; justify-content: center;
  }
  @media (hover: hover) { .bar button:hover { background: var(--bg-hover); color: var(--fg); } }
  .bar button.on { background: var(--accent-soft); color: var(--accent); }
  .bar button .lbl { margin-left: 4px; font-size: 12.5px; font-weight: 500; }
  .bar button:has(.lbl) { width: auto; padding: 0 9px 0 7px; }
  .bar button.text { width: auto; gap: 4px; padding: 0 9px 0 7px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent); }
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
