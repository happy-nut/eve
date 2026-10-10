<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
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
   *   keys: Tab adds the next step, Enter is done typing (and types again), ⌫ deletes a box not being typed in, Esc lets go,
   *         the arrows go from box to box
   *   in swimlanes: a box dragged onto another lane goes into it (a finger drags the box picked)
   */
  let { flow, host, version, k, pick = null }: {
    flow: Flowchart; host: HTMLElement; version: string; k: number;
    /** the box the click that opened the diagram landed on: picked at once (that click only opened it, and the keys
     *  typed next went into the note) */
    pick?: string | null;
  } = $props();

  type Box = { id: string; x: number; y: number; w: number; h: number };
  let layer = $state<HTMLDivElement>(null!);
  let boxes = $state<Box[]>([]);
  let sel = $state<{ node: string } | { edge: number; x: number; y: number } | { lane: string } | null>(untrack(() => (pick ? { node: pick } : null)));
  /** where each swimlane's name is drawn (lanes.ts), to be clicked, renamed and moved */
  let laneHeads = $state<Box[]>([]);
  /** each lane's whole area, where a box dragged onto it goes */
  let laneAreas = $state<Box[]>([]);
  /** a box being dragged to another lane: where it is, the lane under it */
  let moving = $state<{ id: string; x: number; y: number; lane: string | null } | null>(null);
  /** the click that ends a box's drag is not a click on what it ended over */
  let swallowClick = false;
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

  /** the keyboard off the note's text, onto nothing: the keys typed next (⌫, Enter, Tab) are the picture's. A line or a
   *  lane picked left it in the note, and ⌫ deleted the note's last letter instead of the line */
  const releaseKeys = () => { const a = document.activeElement as HTMLElement | null; if (a && a !== document.body && !layer?.contains(a)) a.blur?.(); };
  $effect(() => { if (sel && !editing && !laneEditing) untrack(releaseKeys); });

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
    laneAreas = [...host.querySelectorAll<SVGGElement>('g.lane[data-lane]')].flatMap((g) => {
      const id = g.dataset.lane, r = g.querySelector('rect.lane-bg')?.getBoundingClientRect();
      return id && r ? [{ id, x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }] : [];
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
  // the drawing's own size too: zoomed on the whole screen (DiagramBlock.svelte), it grows or shrinks inside a canvas
  // that stays the same size, and each redraw comes in at its natural size before the zoom is put back — the boxes'
  // rings and + stayed where the boxes had been
  let watched: Element | null = null;
  const ro = new ResizeObserver(() => measure());
  $effect(() => {
    void version;
    tick().then(() => {
      const pic = host.firstElementChild;
      if (pic === watched) return;
      if (watched) ro.unobserve(watched);
      watched = pic;
      if (pic) ro.observe(pic);
    });
  });
  onMount(() => {
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
    if (from) reveal(from);
    editing = null;
    startEdit(id);
  }
  let pendingAt = $state({ x: 0, y: 0 });
  function join(from: string, to: string) {
    if (from === to || flow.edges.some((e) => e.from === from && e.to === to)) return;
    flow.edges.push({ from, to, label: '', line: 'solid' });
    const b = boxOf(to);
    sel = { edge: flow.edges.length - 1, x: b ? b.x + b.w / 2 : 0, y: b ? b.y : 0 };
    midPending = true; // its bar moves to the line's middle once it is drawn (at the box it sat far from the line)
  }
  let midPending = false;
  /** the middle of a drawn line, in the layer */
  function edgeMid(i: number) {
    const at = drawnEdges().findIndex((d) => d.i === i);
    const p = host.querySelectorAll<SVGPathElement>('path.flowchart-link')[at];
    const c = p?.getScreenCTM();
    if (!p || !c || !layer) return null;
    const m = p.getPointAtLength(p.getTotalLength() / 2), o = layer.getBoundingClientRect();
    return { x: m.x * c.a + m.y * c.c + c.e - o.left, y: m.x * c.b + m.y * c.d + c.f - o.top };
  }
  $effect(() => {
    void version;
    if (!midPending) return;
    tick().then(() => {
      if (!sel || !('edge' in sel)) { midPending = false; return; }
      const m = edgeMid(sel.edge);
      if (m) { midPending = false; sel = { ...sel, ...m }; }
    });
  });
  /** a box gone: one with a single line in and a single line out keeps the chain whole (A → x → B becomes A → B) */
  function dropNode(id: string) {
    const ins = flow.edges.filter((e) => e.to === id && e.from !== id), outs = flow.edges.filter((e) => e.from === id && e.to !== id);
    flow.nodes = flow.nodes.filter((n) => n.id !== id);
    flow.edges = flow.edges.filter((e) => e.from !== id && e.to !== id);
    if (ins.length === 1 && outs.length === 1 && ins[0].from !== outs[0].to && !flow.edges.some((e) => e.from === ins[0].from && e.to === outs[0].to)) {
      flow.edges.push({ from: ins[0].from, to: outs[0].to, label: outs[0].label || ins[0].label, line: ins[0].line });
    }
    sel = null;
  }
  /** a step put in the middle of a line: A → B becomes A → new → B, typed in at once */
  function splitEdge(i: number) {
    const e = flow.edges[i];
    if (!e) return;
    const id = freshId('n', flow.nodes);
    const lane = flow.lanes?.length ? (flow.nodes.find((n) => n.id === e.to)?.lane ?? flow.nodes.find((n) => n.id === e.from)?.lane) : undefined;
    flow.nodes.push(lane ? { id, label: 'New step', shape: 'round', lane } : { id, label: 'New step', shape: 'round' });
    flow.edges.splice(i, 1, { from: e.from, to: id, label: e.label, line: e.line }, { from: id, to: e.to, label: '', line: e.line });
    sel = { node: id };
    const a = boxOf(e.from), b = boxOf(e.to);
    pendingAt = a && b ? { x: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 } : pendingAt;
    editing = null;
    startEdit(id);
  }
  const dropEdge = (i: number) => { flow.edges.splice(i, 1); sel = null; };
  function reverse(i: number) { const e = flow.edges[i]; [e.from, e.to] = [e.to, e.from]; }

  // ---- renaming in place ----
  // the box's text changes as it is typed (the picture follows it); Esc puts back what it was
  let before = '';
  function startEdit(id: string) {
    if (editing === id) return;
    reveal(id);
    editing = id;
    editText = before = flow.nodes.find((n) => n.id === id)?.label ?? '';
    // focused without the page scrolling to it: a box past the card's edge scrolled the whole note sideways, under the list
    tick().then(() => { const el = layer.querySelector<HTMLInputElement>('input.rename'); el?.focus({ preventScroll: true }); el?.select(); });
  }
  /** a box scrolled out of the card brought back into it (the picture scrolls sideways inside its card) */
  function reveal(id: string) {
    const b = boxOf(id);
    if (!b || !layer) return;
    const W = layer.clientWidth, pad = 24;
    const by = b.x < pad ? b.x - pad : b.x + b.w + 80 > W ? b.x + b.w + 80 - W : 0;
    if (by) { host.scrollLeft += by; measure(); }
  }
  /** Esc from the note: what is picked let go first; true when there was something (else the whole diagram closes) */
  export function escape(): boolean {
    if (editing) { cancelEdit(); return true; }
    if (laneEditing) { laneEditing = null; return true; }
    if (linking || sel) { linking = null; sel = null; return true; }
    return false;
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
  async function dropLane(id: string) {
    const lanes = flow.lanes ?? [];
    const steps = flow.nodes.filter((n) => n.lane === id).length;
    const name = lanes.find((l) => l.id === id)?.label ?? '';
    // asked first when it holds steps: a slip onto its 🗑 (its bar sits by other lanes' names) cost a lane
    if (steps && !(await ui.ask(`Delete the lane “${name}”? Its ${steps} step${steps > 1 ? 's' : ''} move to the lane beside it.`))) return;
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
    ui.openMenu({ clientX: r.left, clientY: r.bottom + 4 }, [
      { label: 'Move to lane', disabled: true }, // a phone's sheet said nothing of what its names were for
      ...(flow.lanes ?? []).map((l) => ({ label: l.label, checked: n.lane === l.id, run: () => { n.lane = l.id; } })),
    ]);
  }

  // ---- the picture's own clicks ----
  function onHostClick(e: MouseEvent) {
    if (drag || swallowClick) return;
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
    else if (isMobile) return; // a quick double tap on a phone made a stray "New step"; + and + Box make them there
    else if ((e.target as Element).closest('g.lane-head')) return;
    else if (!(e.target as Element).closest('path.hit, g.edgeLabel')) addAfter(null, ((e.target as Element).closest('g.lane') as SVGGElement | null)?.dataset.lane || undefined);
  }
  function onHostMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return; // a finger has no hover: it left a + on a box nothing was picked on
    const g = (e.target as Element).closest?.('g.node');
    hover = g ? nodeIdOf(g) : null;
  }
  /** a box dragged onto another lane goes into it (a mouse: any box; a finger: the box picked, as a finger on any
   *  other scrolls the picture) */
  function onBoxDown(e: PointerEvent) {
    if (!flow.lanes?.length || e.button !== 0 || linking || drag || moving) return;
    const g = (e.target as Element).closest('g.node');
    const id = g ? nodeIdOf(g) : null;
    if (!id || editing === id) return;
    const finger = e.pointerType !== 'mouse';
    if (finger && !(sel && 'node' in sel && sel.node === id)) return;
    const o = layer.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    let started = false;
    const laneAt = (x: number, y: number) => laneAreas.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ?? null;
    const move = (cx: number, cy: number) => {
      if (!started && Math.hypot(cx - x0, cy - y0) < 8) return;
      if (!started) { started = true; if (editing) commitEdit(); hover = null; }
      const x = cx - o.left, y = cy - o.top;
      moving = { id, x, y, lane: laneAt(x, y) };
    };
    const end = (cancelled: boolean) => {
      off();
      const m = moving;
      moving = null;
      if (!started) return;
      swallowClick = true;
      setTimeout(() => (swallowClick = false));
      const n = flow.nodes.find((x) => x.id === id);
      if (!cancelled && m?.lane && n && n.lane !== m.lane) n.lane = m.lane;
      sel = { node: id };
    };
    const pMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const pUp = () => end(false);
    const pCancel = () => end(true);
    // a finger's move is the drag's, not the page's scroll
    const tMove = (ev: TouchEvent) => { if (ev.cancelable) ev.preventDefault(); };
    const off = () => {
      window.removeEventListener('pointermove', pMove);
      window.removeEventListener('pointerup', pUp);
      window.removeEventListener('pointercancel', pCancel);
      window.removeEventListener('touchmove', tMove);
    };
    window.addEventListener('pointermove', pMove);
    window.addEventListener('pointerup', pUp);
    window.addEventListener('pointercancel', pCancel);
    if (finger) window.addEventListener('touchmove', tMove, { passive: false });
  }
  $effect(() => {
    host.addEventListener('pointerdown', onBoxDown);
    return () => host.removeEventListener('pointerdown', onBoxDown);
  });
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
    const card = () => host.getBoundingClientRect();
    let lastX = e.clientX;
    // near the card's side the picture scrolls on under the drag, to a box past its edge
    const spin = setInterval(() => {
      if (!drag) return;
      const r = card();
      const by = lastX < r.left + 28 ? -14 : lastX > r.right - 28 ? 14 : 0;
      if (by) { host.scrollLeft += by; measure(); }
    }, 30);
    const move = (cx: number, cy: number) => {
      if (!drag) return;
      lastX = cx;
      const x = cx - o.left, y = cy - o.top;
      drag = { ...drag, x, y, moved: drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > 6 };
      hover = boxAt(cx, cy);
    };
    const end = (cx: number, cy: number, cancelled = false) => {
      off();
      clearInterval(spin);
      const d = drag;
      drag = null;
      if (!d || cancelled) return;
      const to = boxAt(cx, cy);
      const r = card();
      const outside = cx < r.left + 6 || cx > r.right - 6 || cy < r.top || cy > r.bottom;
      if (d.moved && !to && outside) return; // let go past the picture: nothing (it made a stray step there)
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
    // typed in the list or another note's page, which deleted the box behind them
    const t = e.target as Element;
    if (t !== document.body && !layer.closest('.dblock')?.contains(t) && t !== layer.closest('.tiptap')) return;
    const typing = (e.target as HTMLElement).matches?.('input, textarea, [contenteditable="true"]');
    // in a line's label: Esc or Enter is done with it (Esc closed the whole builder), the rest is typing
    if (typing && layer.contains(e.target as Node)) {
      if (!e.isComposing && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); sel = null; }
      return;
    }
    if (typing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sel = null; }
    else if ('lane' in sel && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); e.stopPropagation(); void dropLane(sel.lane); }
    else if ('lane' in sel) { if (e.key === 'Enter') { e.preventDefault(); startLaneEdit(sel.lane); } }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); if ('node' in sel) dropNode(sel.node); else dropEdge(sel.edge); }
    else if ('node' in sel && e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); startEdit(sel.node); }
    else if ('node' in sel && e.key === 'Tab') { e.preventDefault(); addAfter(sel.node); }
    else if ('node' in sel && e.key.startsWith('Arrow') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // the arrows go from box to box: the nearest one that way
      e.preventDefault();
      const to = nearest(sel.node, e.key);
      if (to) { sel = { node: to }; reveal(to); }
    }
  }
  function nearest(id: string, key: string) {
    const a = boxOf(id);
    if (!a) return null;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    let best: string | null = null, score = Infinity;
    for (const b of boxes) {
      if (b.id === id) continue;
      const dx = b.x + b.w / 2 - ax, dy = b.y + b.h / 2 - ay;
      const [along, aside] = key === 'ArrowRight' ? [dx, dy] : key === 'ArrowLeft' ? [-dx, dy] : key === 'ArrowDown' ? [dy, dx] : [-dy, dx];
      if (along <= 4) continue;
      const s = along + 2 * Math.abs(aside);
      if (s < score) { score = s; best = b.id; }
    }
    return best;
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
  /** a text box `w` wide centred on x, kept inside the picture (at its edge it was cut off, past a phone's screen) */
  const clampX = (x: number, w: number) => Math.max(4, Math.min((layer?.clientWidth ?? 600) - w - 4, x - w / 2));
  /** a bar over (or, near the top, under) what it is for, kept inside the picture */
  function barAt(x: number, top: number, bottom: number, width: number, own: string | null = null) {
    const W = layer?.clientWidth ?? 600, H = layer?.clientHeight ?? 400;
    const left = Math.max(4, Math.min(W - width - 4, x - width / 2));
    const tall = isMobile ? 48 : 38;
    // above or under, whichever covers less of the other boxes (it sat over the box one wanted to tap next)
    const cost = (t: number) => (t < 4 || t + tall > H - 4 ? 1e7 : 0) + boxes.reduce((sum, b) => {
      if (b.id === own) return sum;
      const w = Math.min(left + width, b.x + b.w) - Math.max(left, b.x), h = Math.min(t + tall, b.y + b.h) - Math.max(t, b.y);
      return sum + (w > 0 && h > 0 ? w * h : 0);
    }, 0);
    const above = top - (tall + 8), below = bottom + 8;
    return { left, top: cost(above) <= cost(below) ? above : below };
  }
  // the picked line drawn in the accent colour: a picked line looked like every other one
  $effect(() => {
    void version;
    const at = sel && 'edge' in sel ? drawnEdges().findIndex(({ i }) => i === (sel as { edge: number }).edge) : -1;
    const paths = [...host.querySelectorAll('path.flowchart-link')];
    paths.forEach((p, j) => p.classList.toggle('picked', j === at));
  });
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
          style:left={`${clampX(hb.x + hb.w / 2, 140)}px`} style:top={`${hb.y + hb.h / 2 - 16}px`}
          onkeydown={(e) => { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); commitLane(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); laneEditing = null; } }}
          onblur={commitLane} />
      {:else}
        <!-- over the lane's own name (picked, it is ringed): above or under it, the bar covered the next lane's name and
             boxes, and a click meant for them deleted the lane -->
        {@const at = { left: clampX(hb.x + hb.w / 2, 240), top: Math.max(4, hb.y + hb.h / 2 - 21) }}
        {@const across = flow.dir === 'LR'}
        <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
          <button type="button" class="text" aria-label="Rename the lane" title="Rename (or click its name again)" onmousedown={(e) => e.preventDefault()} onclick={() => startLaneEdit(lid)}><svg viewBox="0 0 16 16"><path d="M10.5 3.5l2 2L6 12l-2.6.6L4 10z" /></svg>Name</button>
          <span class="sep"></span>
          <button type="button" aria-label={across ? 'Move up' : 'Move left'} title={across ? 'Move up' : 'Move left'} disabled={i === 0} onclick={() => moveLane(lid, -1)}><svg viewBox="0 0 16 16"><path d={across ? 'M8 12.5v-9M4.5 7 8 3.5 11.5 7' : 'M12.5 8h-9M7 4.5 3.5 8 7 11.5'} /></svg></button>
          <button type="button" aria-label={across ? 'Move down' : 'Move right'} title={across ? 'Move down' : 'Move right'} disabled={i === (flow.lanes?.length ?? 0) - 1} onclick={() => moveLane(lid, 1)}><svg viewBox="0 0 16 16"><path d={across ? 'M8 3.5v9M4.5 9 8 12.5 11.5 9' : 'M3.5 8h9M9 4.5 12.5 8 9 11.5'} /></svg></button>
          <button type="button" aria-label="Add a step in this lane" title="Add a step in this lane" onclick={() => addAfter(null, lid)}><svg viewBox="0 0 16 16"><rect x="2.5" y="4.5" width="11" height="7" rx="2.2" /><path d="M8 6.5v3M6.5 8h3" /></svg>{#if isMobile}<span class="lbl">Step</span>{/if}</button>
          <button type="button" class="danger" aria-label="Delete the lane" title="Delete the lane (its steps go to the one beside it)" onclick={() => dropLane(lid)}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
        </div>
      {/if}
    {/if}
  {/if}

  {#if linking}
    {#each boxes.filter((b) => b.id !== linking) as b (b.id)}
      <div class="ring target pick" style:left={`${b.x - 4}px`} style:top={`${b.y - 4}px`} style:width={`${b.w + 8}px`} style:height={`${b.h + 8}px`}></div>
    {/each}
    <div class="pickhint">{isMobile ? 'Tap the box to connect to · tap elsewhere to cancel' : 'Click the box to connect to · Esc or a click elsewhere cancels'}</div>
  {/if}

  {#each moving ? [] : handles as b (b.id)}
    {@const p = plusAt(b)}
    <button class="plus" type="button" aria-label="Add a step after this, or drag onto another box to connect" title="Click: next step · Drag: connect"
      style:left={`${p.x - 11}px`} style:top={`${p.y - 11}px`} onpointerdown={(e) => handleDown(e, b.id)} {@attach holdTouch}
      onpointerenter={(e) => { if (e.pointerType === 'mouse') hover = b.id; }}>
      <svg viewBox="0 0 16 16"><path d="M8 4v8M4 8h8" /></svg>
    </button>
  {/each}

  {#if drag && drag.moved}
    <svg class="wire" aria-hidden="true"><line x1={drag.x0} y1={drag.y0} x2={drag.x} y2={drag.y} /><circle cx={drag.x} cy={drag.y} r="4" /></svg>
  {/if}

  {#if editing}
    {@const b = boxOf(editing) ?? { id: editing, x: pendingAt.x - 70, y: pendingAt.y - 16, w: 140, h: 32 }}
    <input class="rename" bind:value={editText} aria-label="Step name" oninput={typed}
      style:left={`${clampX(b.x + b.w / 2, Math.min(Math.max(b.w, 140), (layer?.clientWidth ?? 600) - 8))}px`} style:top={`${b.y + b.h / 2 - 16}px`} style:width={`${Math.min(Math.max(b.w, 140), (layer?.clientWidth ?? 600) - 8)}px`}
      onkeydown={(e) => { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); } else if (e.key === 'Tab') { e.preventDefault(); const from = editing; commitEdit(); if (from) addAfter(from); } }}
      onblur={commitEdit} />
  {/if}

  {#if moving}
    {@const area = laneAreas.find((r) => r.id === moving?.lane)}
    {#if area}<div class="lane-drop" style:left={`${area.x}px`} style:top={`${area.y}px`} style:width={`${area.w}px`} style:height={`${area.h}px`}></div>{/if}
    <div class="ghost" style:left={`${moving.x}px`} style:top={`${moving.y}px`}>{flow.nodes.find((n) => n.id === moving?.id)?.label ?? ''}</div>
  {/if}

  {#if selNode && selBox && !drag && !linking && !moving}
    <!-- under the box (one near the top) it goes below the + too: it sat over the + there, and a press on the + changed
         the box's shape instead. On a phone the shapes fold into one button: all six in a row ran off its narrow picture -->
    {@const compact = isMobile && !shapesOpen}
    {@const at = barAt(selBox.x + selBox.w / 2, selBox.y, selBox.y + selBox.h + (flow.dir === 'LR' ? 0 : isMobile ? 34 : 26), compact ? 290 : isMobile ? 290 : 480, selNode.id)}
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
          <button type="button" aria-label="Lane" title="Move to another lane" onmousedown={(e) => e.preventDefault()} onclick={(e) => { if (editing) commitEdit(); pickLane(e, selNode.id); }}><svg viewBox="0 0 16 16"><path d="M2 4.5h12M2 8h12M2 11.5h12" /></svg><span class="lbl">{isMobile ? 'Lane' : flow.lanes.find((l) => l.id === selNode.lane)?.label ?? 'Lane'}</span></button>
        {/if}
        <button type="button" class:on={linking === selNode.id} aria-label="Connect to another box" title="Connect: then tap the box to connect to" onmousedown={(e) => e.preventDefault()}
          onclick={() => { if (editing) commitEdit(); linking = selNode.id; }}><svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r="2" /><path d="M5.5 8h7M10.5 5.5 13 8l-2.5 2.5" /></svg>{#if isMobile}<span class="lbl">Connect</span>{/if}</button>
        <button type="button" class="danger" aria-label="Delete" title="Delete" onmousedown={(e) => e.preventDefault()} onclick={() => { editing = null; dropNode(selNode.id); }}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
      {/if}
    </div>
  {/if}

  {#if selEdge && sel && 'edge' in sel && !drag}
    {@const at = barAt(sel.x, sel.y - 6, sel.y + 6, isMobile ? 360 : 366)}
    {@const i = sel.edge}
    <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
      {#each LINES as [line, label, icon] (line)}
        <button type="button" class:on={selEdge.line === line} aria-label={label} title={label} onclick={() => (selEdge.line = line)}><svg viewBox="0 0 16 16">{@html icon}</svg></button>
      {/each}
      <span class="sep"></span>
      <input class="edge-label" bind:value={selEdge.label} placeholder="Label" aria-label="Line label" />
      <button type="button" aria-label="Put a step in this line" title="Put a step in the middle of this line" onclick={() => splitEdge(i)}><svg viewBox="0 0 16 16"><path d="M1.5 8h3M11.5 8h3" /><rect x="4.5" y="5" width="7" height="6" rx="1.6" /></svg></button>
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
  /* a finger's width along a line: 14 was a hair to hit */
  :global(html.mobile .diagram-canvas path.hit) { stroke-width: 30px !important; }
  :global(.diagram-canvas path.flowchart-link.picked) { stroke: var(--accent) !important; stroke-width: 2.5px !important; }
  /* a phone's finger: every button in a bar a finger's size */
  :global(html.mobile) .bar button { width: 40px; height: 40px; }
  :global(html.mobile) .bar button.text, :global(html.mobile) .bar button:has(.lbl) { width: auto; }
  /* the boxes, the +, the bars and the rings stay inside the card: drawn past its edge they sat over the page, where a
     click closed the diagram */
  .layer { overflow: hidden; }
  .lane-drop { position: absolute; border-radius: 6px; box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-soft); opacity: 0.6; pointer-events: none; }
  .ghost {
    position: absolute; translate: -50% -50%; padding: 6px 12px; border-radius: 10px; pointer-events: none; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis;
    font-size: 13px; background: var(--bg-pop); color: var(--fg); box-shadow: 0 0 0 2px var(--accent), 0 6px 18px rgba(0, 0, 0, 0.2); opacity: 0.92;
  }
  /* a box dragged to another lane: its text is not selected on the way */
  :global(.dblock.active svg.lanes g.node) { user-select: none; -webkit-user-select: none; cursor: grab; }
  :global(.builder .preview g.node) { cursor: pointer; }
</style>
