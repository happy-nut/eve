<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { across, freshId, type Flowchart, type FlowEdge, type Line, type Shape } from './lib/diagram';
  import { ui, under } from './lib/ui.svelte';
  import { letGo } from './lib/focusWatch';
  import { claimKeys, composing } from './lib/keys';
  import { isMobile } from './lib/platform';
  import { floatAt } from './lib/popup';
  import { mermaidBoxOf } from './lib/lanes';
  import { followPointer } from './lib/followPointer';

  let { flow, host, version, pickOnOpen = null }: {
    flow: Flowchart; host: HTMLElement; version: string;
    pickOnOpen?: string | null;
  } = $props();

  type Box = { id: string; x: number; y: number; w: number; h: number };
  let layer = $state<HTMLDivElement>(null!);
  const LABEL_MAX_HEIGHT = 92;
  const autoGrow = (el: HTMLTextAreaElement) => {
    const fit = () => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, LABEL_MAX_HEIGHT)}px`; };
    fit();
    el.addEventListener('input', fit);
    return () => el.removeEventListener('input', fit);
  };
  let boxes = $state<Box[]>([]);
  let sel = $state<{ node: string } | { nodes: string[] } | { edge: number; x: number; y: number } | { lane: string } | null>(untrack(() => (pickOnOpen ? { node: pickOnOpen } : null)));
  let laneHeads = $state<Box[]>([]);
  let laneAreas = $state<Box[]>([]);
  let moving = $state<{ id: string; x: number; y: number; lane: string | null; onto: string | null } | null>(null);
  let swallowClick = false;
  let laneEditing = $state<string | null>(null), laneText = $state('');
  let hover = $state<string | null>(null);
  let editing = $state<string | null>(null), editText = $state('');
  let drag = $state<{ from: string; x0: number; y0: number; x: number; y: number; moved: boolean } | null>(null);
  let linking = $state<string | null>(null);
  let moveEnd = $state<number | null>(null);
  const picking = $derived(linking ?? (moveEnd !== null ? flow.edges[moveEnd]?.from ?? null : null));
  let shapesOpen = $state(false);
  $effect(() => { void selId; shapesOpen = false; });

  const letGoOfFocusIf = (holds: (a: Element) => boolean) => { const a = document.activeElement; if (a && a !== document.body && holds(a)) letGo(a); };
  const releaseKeys = () => letGoOfFocusIf((a) => !layer?.contains(a));
  const doneTyping = () => letGoOfFocusIf((a) => a instanceof HTMLInputElement && !!layer?.contains(a));
  const isArmedField = (a: Element) => a instanceof HTMLInputElement && a.classList.contains('armed');
  const focusAndSelect = (el: HTMLInputElement | HTMLTextAreaElement | null | undefined) => { el?.focus({ preventScroll: true }); el?.select(); };
  $effect(() => { if (sel && !editing && !laneEditing) untrack(releaseKeys); });
  const armed = $derived(!isMobile && !editing && !laneEditing && !drag && !moving && !linking && moveEnd === null && sel && ('node' in sel || 'lane' in sel) ? sel : null);
  type Armed = NonNullable<typeof armed>;
  let armedFor = '';
  const armedKey = (a: Armed | null) => (!a ? '' : 'node' in a ? `n:${a.node}` : `l:${a.lane}`);
  function fillArmedField(a: Armed) {
    if ('node' in a) editText = before = flow.nodes.find((n) => n.id === a.node)?.label ?? '';
    else laneText = flow.lanes?.find((l) => l.id === a.lane)?.label ?? '';
  }
  function holdArmedField(fresh: boolean) {
    const el = layer?.querySelector<HTMLInputElement>('input.armed');
    if (el && (fresh || document.activeElement !== el)) focusAndSelect(el);
  }
  $effect(() => {
    const a = armed;
    untrack(() => {
      const fresh = armedKey(a) !== armedFor;
      if (fresh && a) fillArmedField(a);
      armedFor = armedKey(a);
      if (a) tick().then(() => holdArmedField(fresh));
    });
  });
  $effect.pre(() => { if (!armed && !editing && !laneEditing) untrack(() => letGoOfFocusIf(isArmedField)); });
  let labelFresh = false;
  const holdLabel = () => { if (isMobile) return; labelFresh = true; tick().then(() => focusAndSelect(layer?.querySelector<HTMLTextAreaElement>('textarea.edge-label'))); };
  const nextLine = (e: FlowEdge) => { e.line = LINES[(LINES.findIndex(([l]) => l === e.line) + 1) % LINES.length][0]; };

  let linePts: { x: number; y: number; from: string; to: string }[] = [];
  const boxOf = (id: string | null) => boxes.find((b) => b.id === id) ?? null;
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
      const id = mermaidBoxOf(g), r = g.getBoundingClientRect();
      return id ? [{ id, x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }] : [];
    });
    const lines = [...host.querySelectorAll<SVGPathElement>('path.flowchart-link')];
    linePts = sampleLines(lines, o);
    addHitPaths(lines);
    if (pendingReveal && boxOf(pendingReveal)) scrollIntoCard(pendingReveal);
  }
  function sampleLines(lines: SVGPathElement[], o: DOMRect) {
    const ends = drawnEdges();
    return lines.flatMap((el, i) => {
      const m = el.getScreenCTM(), L = el.getTotalLength?.() ?? 0;
      if (!m || !L) return [];
      const { from, to } = ends[i]?.e ?? { from: '', to: '' };
      return Array.from({ length: Math.ceil(L / 8) + 1 }, (_, k) => {
        const q = el.getPointAtLength(Math.min(L, k * 8));
        return { x: q.x * m.a + q.y * m.c + m.e - o.left, y: q.x * m.b + q.y * m.d + m.f - o.top, from, to };
      });
    });
  }
  function addHitPaths(lines: SVGPathElement[]) {
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
  $effect(() => { void version; tick().then(measure); });
  let watched: Element | null = null;
  const ro = new ResizeObserver(() => measure());
  function observePicture() {
    const pic = host.firstElementChild;
    if (pic === watched) return;
    if (watched) ro.unobserve(watched);
    watched = pic;
    if (pic) ro.observe(pic);
  }
  $effect(() => { void version; tick().then(observePicture); });
  onMount(() => {
    ro.observe(host);
    host.addEventListener('scroll', measure, { passive: true });
    const unclaim = claimKeys('global', { '*': onKey }, { capture: true });
    return () => { ro.disconnect(); host.removeEventListener('scroll', measure); unclaim(); host.scrollLeft = 0; };
  });

  function addAfter(from: string | null, { inLane, intoLine = false }: { inLane?: string; intoLine?: boolean } = {}) {
    const id = freshId('n', flow.nodes);
    const lanes = flow.lanes ?? [];
    const lane = lanes.length ? (flow.nodes.find((n) => n.id === from)?.lane ?? inLane ?? (sel && 'lane' in sel ? sel.lane : lanes[0].id)) : undefined;
    flow.nodes.push(lane ? { id, label: newStepLabel(), shape: 'round', lane } : { id, label: newStepLabel(), shape: 'round' });
    const out = from ? flow.edges.filter((e) => e.from === from && e.to !== from) : [];
    if (intoLine && out.length === 1) { const next = out[0].to; out[0].to = id; flow.edges.push({ from: id, to: next, label: '', line: 'solid' }); }
    else if (from) flow.edges.push({ from, to: id, label: '', line: 'solid' });
    sel = { node: id };
    const b = boxOf(from);
    pendingAt = b ? plusAt(b) : { x: (layer?.clientWidth ?? 300) / 2, y: (layer?.clientHeight ?? 100) / 2 };
    if (from) scrollIntoCard(from);
    editing = null;
    startEdit(id);
  }
  let pendingAt = $state({ x: 0, y: 0 });
  function join(from: string, to: string) {
    if (from === to || flow.edges.some((e) => e.from === from && e.to === to)) return;
    flow.edges.push({ from, to, label: '', line: 'solid' });
    const b = boxOf(to);
    sel = { edge: flow.edges.length - 1, x: b ? b.x + b.w / 2 : 0, y: b ? b.y : 0 };
    midPending = true;
  }
  let midPending = false;
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
  function dropNode(id: string) {
    const ins = flow.edges.filter((e) => e.to === id && e.from !== id), outs = flow.edges.filter((e) => e.from === id && e.to !== id);
    flow.nodes = flow.nodes.filter((n) => n.id !== id);
    flow.edges = flow.edges.filter((e) => e.from !== id && e.to !== id);
    if (ins.length === 1 && outs.length === 1 && ins[0].from !== outs[0].to && !flow.edges.some((e) => e.from === ins[0].from && e.to === outs[0].to)) {
      flow.edges.push({ from: ins[0].from, to: outs[0].to, label: outs[0].label || ins[0].label, line: ins[0].line });
    }
    sel = null;
  }
  function splitEdge(i: number) {
    const e = flow.edges[i];
    if (!e) return;
    const id = freshId('n', flow.nodes);
    const lane = flow.lanes?.length ? (flow.nodes.find((n) => n.id === e.to)?.lane ?? flow.nodes.find((n) => n.id === e.from)?.lane) : undefined;
    flow.nodes.push(lane ? { id, label: newStepLabel(), shape: 'round', lane } : { id, label: newStepLabel(), shape: 'round' });
    flow.edges.splice(i, 1, { from: e.from, to: id, label: e.label, line: e.line }, { from: id, to: e.to, label: '', line: e.line });
    sel = { node: id };
    const a = boxOf(e.from), b = boxOf(e.to);
    pendingAt = a && b ? { x: (a.x + a.w / 2 + b.x + b.w / 2) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 } : pendingAt;
    editing = null;
    startEdit(id);
  }
  const dropNodes = (ids: string[]) => ids.forEach(dropNode);
  const dropEdge = (i: number) => { flow.edges.splice(i, 1); sel = null; };
  function reverse(i: number) { const e = flow.edges[i]; [e.from, e.to] = [e.to, e.from]; }

  let before = '';
  function startEdit(id: string) {
    if (editing === id) return;
    scrollIntoCard(id);
    editing = id;
    editText = before = flow.nodes.find((n) => n.id === id)?.label ?? '';
    tick().then(() => focusAndSelect(layer.querySelector<HTMLInputElement>('input.rename')));
  }
  let pendingReveal: string | null = null;
  function scrollIntoCard(id: string) {
    const b = boxOf(id);
    pendingReveal = b ? null : id;
    if (!b || !layer) return;
    const W = layer.clientWidth, pad = 24;
    const by = b.x < pad ? b.x - pad : b.x + b.w + 80 > W ? b.x + b.w + 80 - W : 0;
    if (by) { host.scrollLeft += by; measure(); }
  }
  export function backOut(): boolean {
    if (editing) { cancelEdit(); return true; }
    if (laneEditing) { doneTyping(); laneEditing = null; return true; }
    if (linking || moveEnd !== null || sel) { linking = null; moveEnd = null; sel = null; return true; }
    return false;
  }
  function typed() {
    const n = flow?.nodes.find((x) => x.id === editing);
    if (n && editText.trim()) n.label = editText.trim();
  }
  function commitEdit() {
    typed();
    doneTyping();
    editing = null;
  }
  function cancelEdit() {
    const n = flow.nodes.find((x) => x.id === editing);
    if (n) n.label = before;
    doneTyping();
    editing = null;
  }
  export function addBox() { addAfter(null); }

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
    doneTyping();
    laneEditing = null;
  }
  function moveLane(id: string, by: -1 | 1) {
    const lanes = [...(flow.lanes ?? [])];
    const i = lanes.findIndex((l) => l.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= lanes.length) return;
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    flow.lanes = lanes;
  }
  async function dropLane(id: string) {
    const lanes = flow.lanes ?? [];
    const steps = flow.nodes.filter((n) => n.lane === id).length;
    const name = lanes.find((l) => l.id === id)?.label ?? '';
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
  /** where a bar's menu opens, the keyboard first put where it is to come back to as the menu closes: the picked box's
   *  hidden field, or the button. WebKit gives a clicked button none, so it came back to the note, and ⌫ or ⌥2 after
   *  the menu was the note's, not the boxes' */
  function menuAt(e: MouseEvent) {
    const b = e.currentTarget as HTMLElement;
    (layer.querySelector<HTMLElement>('input.armed') ?? b).focus({ preventScroll: true });
    return under(b);
  }
  function pickLane(e: MouseEvent, nodeId: string) {
    const n = flow.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    ui.openMenu(menuAt(e), [
      { label: 'Move to lane', disabled: true },
      ...(flow.lanes ?? []).map((l) => ({ label: l.label, checked: n.lane === l.id, run: () => { n.lane = l.id; } })),
    ]);
  }

  function setStep(ids: string[], k: number) {
    for (const n of flow.nodes) if (ids.includes(n.id)) { if (k) n.presentStep = k; else delete n.presentStep; }
  }
  const stepOf = (ids: string[]): number | 'mixed' => { const s = new Set(flow.nodes.filter((n) => ids.includes(n.id)).map((n) => n.presentStep ?? 0)); return s.size === 1 ? [...s][0] : 'mixed'; };
  const stepChoices = $derived(Array.from({ length: Math.max(flow.nodes.length, ...flow.nodes.map((n) => (n.presentStep ?? 0) + 1)) }, (_, i) => i + 1));
  function pickStep(e: MouseEvent, ids: string[]) {
    const at = stepOf(ids), key = (k: number) => (k < 10 ? `Alt-${k}` : undefined);
    ui.openMenu(menuAt(e), [
      { label: 'Order in a presentation', disabled: true },
      { label: 'Auto (the arrows’ order)', keys: 'Alt-0', checked: at === 0, run: () => setStep(ids, 0) },
      ...stepChoices.map((k) => ({ label: `Order ${k}`, keys: key(k), checked: at === k, run: () => setStep(ids, k) })),
    ]);
  }
  function pickLanes(e: MouseEvent, ids: string[]) {
    const ns = flow.nodes.filter((n) => ids.includes(n.id));
    ui.openMenu(menuAt(e), [
      { label: 'Move to lane', disabled: true },
      ...(flow.lanes ?? []).map((l) => ({ label: l.label, checked: ns.every((n) => n.lane === l.id), run: () => { for (const n of ns) n.lane = l.id; } })),
    ]);
  }

  function onHostClick(e: MouseEvent) {
    if (drag || swallowClick) return;
    const t = e.target as Element;
    const g = t.closest('g.node');
    const head = t.closest('g.lane-head') as SVGGElement | null;
    if (head && !linking && !g) clickLaneHead(head);
    else if (moveEnd !== null) finishMoveEnd(moveEnd, g);
    else if (linking) finishLinking(linking, g);
    else if (g) clickBox(e, g);
    else if (!clickLine(e, t)) sel = null;
  }
  function clickLaneHead(head: SVGGElement) {
    const id = head.dataset.lane;
    if (!id) return;
    if (editing) commitEdit();
    if (sel && 'lane' in sel && sel.lane === id) startLaneEdit(id); else { sel = { lane: id }; letGo(); }
  }
  function finishMoveEnd(i: number, g: Element | null) {
    const e = flow.edges[i], id = g ? mermaidBoxOf(g) : null;
    moveEnd = null;
    if (e && id && id !== e.from && !flow.edges.some((x) => x !== e && x.from === e.from && x.to === id)) e.to = id;
  }
  function finishLinking(from: string, g: Element | null) {
    const id = g ? mermaidBoxOf(g) : null;
    linking = null;
    if (id && id !== from) { join(from, id); sel = null; }
  }
  function clickBox(e: MouseEvent, g: Element) {
    const id = mermaidBoxOf(g);
    if (!id) return;
    if (editing && editing !== id) commitEdit();
    if (e.shiftKey && sel && ('node' in sel || 'nodes' in sel)) {
      const was = 'node' in sel ? [sel.node] : sel.nodes;
      const now = was.includes(id) ? was.filter((x) => x !== id) : [...was, id];
      sel = now.length > 1 ? { nodes: now } : now.length ? { node: now[0] } : null;
      if (!editing) letGo();
      return;
    }
    if (sel && 'node' in sel && sel.node === id) startEdit(id);
    else {
      sel = { node: id };
      scrollIntoCard(id);
      if (!editing) letGo();
    }
  }
  function clickLine(e: MouseEvent, t: Element): boolean {
    const hit = t.closest('path.hit') as SVGPathElement | null;
    const label = t.closest('g.edgeLabel g.label') as HTMLElement | null;
    let at = hit ? Number(hit.dataset.index) : -1;
    if (at < 0 && label?.dataset.id) at = [...host.querySelectorAll('path.flowchart-link')].findIndex((p) => (p as SVGElement).dataset.id === label.dataset.id);
    if (at < 0) return false;
    const i = drawnEdges()[at]?.i;
    const o = layer.getBoundingClientRect();
    if (i !== undefined) { sel = { edge: i, x: e.clientX - o.left, y: e.clientY - o.top }; holdLabel(); }
    return true;
  }
  function onHostDouble(e: MouseEvent) {
    const g = (e.target as Element).closest('g.node');
    if (g) { const id = mermaidBoxOf(g); if (id) startEdit(id); }
    else if (isMobile) return;
    else if ((e.target as Element).closest('g.lane-head')) return;
    else if (!(e.target as Element).closest('path.hit, g.edgeLabel')) addAfter(null, { inLane: ((e.target as Element).closest('g.lane') as SVGGElement | null)?.dataset.lane || undefined });
  }
  function onHostLeave(e: PointerEvent) { if (e.pointerType === 'mouse' && !drag) hover = null; }
  function onHostMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const g = (e.target as Element).closest?.('g.node');
    if (g) { hover = mermaidBoxOf(g); return; }
    const b = boxOf(hover), o = layer?.getBoundingClientRect();
    const x = e.clientX - (o?.left ?? 0), y = e.clientY - (o?.top ?? 0), pad = 30;
    if (!b || x < b.x - pad || x > b.x + b.w + pad || y < b.y - pad || y > b.y + b.h + pad) hover = null;
  }
  function onBoxDown(e: PointerEvent) {
    if (e.button !== 0 || linking || drag || moving) return;
    const g = (e.target as Element).closest('g.node');
    const id = g ? mermaidBoxOf(g) : null;
    if (!id || editing === id) return;
    const finger = e.pointerType !== 'mouse';
    if (finger && !(sel && 'node' in sel && sel.node === id)) return;
    if (!flow.lanes?.length) return wireFrom(e, id, finger);
    const o = layer.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    let started = false;
    const laneAt = (x: number, y: number) => laneAreas.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ?? null;
    const move = (cx: number, cy: number) => {
      if (!started && Math.hypot(cx - x0, cy - y0) < 8) return;
      if (!started) { started = true; if (editing) commitEdit(); hover = null; }
      const x = cx - o.left, y = cy - o.top;
      const over = boxAt(cx, cy), onto = over && over !== id ? over : null;
      moving = { id, x, y, lane: onto ? null : laneAt(x, y), onto };
    };
    const end = (cancelled: boolean) => {
      off();
      const m = moving;
      moving = null;
      if (!started) return;
      swallowClick = true;
      setTimeout(() => (swallowClick = false));
      if (!cancelled && m?.onto) return join(id, m.onto);
      const n = flow.nodes.find((x) => x.id === id);
      if (!cancelled && m?.lane && n && n.lane !== m.lane) n.lane = m.lane;
      sel = { node: id };
    };
    const off = followPointer({ move: (ev) => move(ev.clientX, ev.clientY), up: () => end(false), cancel: () => end(true), holdPageScroll: finger });
  }
  function wireFrom(e: PointerEvent, id: string, finger: boolean) {
    const x0 = e.clientX, y0 = e.clientY;
    const pMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      off();
      if (editing) commitEdit();
      wire(id, x0, y0, finger, null);
      swallowClick = true;
    };
    const off = followPointer({ move: pMove, up: () => {}, holdPageScroll: finger });
  }
  let marquee = $state<{ x0: number; y0: number; x: number; y: number } | null>(null);
  function onSpaceDown(e: PointerEvent) {
    if (e.button !== 0 || e.pointerType !== 'mouse' || linking || moveEnd !== null || drag || moving) return;
    if ((e.target as Element).closest('g.node, path.hit, g.edgeLabel, g.lane-head')) return;
    if (host.closest('.dblock.full') && !e.shiftKey) return;
    const o = layer.getBoundingClientRect(), x0 = e.clientX - o.left, y0 = e.clientY - o.top;
    const pMove = (ev: PointerEvent) => {
      const x = ev.clientX - o.left, y = ev.clientY - o.top;
      if (!marquee && Math.hypot(x - x0, y - y0) < 6) return;
      if (!marquee) { if (editing) commitEdit(); sel = null; }
      marquee = { x0, y0, x, y };
    };
    const pUp = () => {
      off();
      const m = marquee;
      marquee = null;
      if (!m) return;
      swallowClick = true;
      setTimeout(() => (swallowClick = false));
      const [l, r, t, b] = [Math.min(m.x0, m.x), Math.max(m.x0, m.x), Math.min(m.y0, m.y), Math.max(m.y0, m.y)];
      const ids = boxes.filter((x) => x.x < r && x.x + x.w > l && x.y < b && x.y + x.h > t).map((x) => x.id);
      sel = ids.length > 1 ? { nodes: ids } : ids.length ? { node: ids[0] } : null;
      if (sel) letGo();
    };
    const off = followPointer({ move: pMove, up: pUp });
  }
  function boxAt(cx: number, cy: number) {
    const under = document.elementsFromPoint(cx, cy).find((el) => host.contains(el) && el.closest('g.node'));
    return under ? mermaidBoxOf(under.closest('g.node')!) : null;
  }
  $effect(() => {
    host.addEventListener('pointerdown', onBoxDown);
    host.addEventListener('pointerdown', onSpaceDown);
    return () => { host.removeEventListener('pointerdown', onBoxDown); host.removeEventListener('pointerdown', onSpaceDown); };
  });
  $effect(() => {
    host.addEventListener('click', onHostClick);
    host.addEventListener('dblclick', onHostDouble);
    host.addEventListener('pointermove', onHostMove);
    host.addEventListener('pointerleave', onHostLeave);
    return () => { host.removeEventListener('click', onHostClick); host.removeEventListener('dblclick', onHostDouble); host.removeEventListener('pointermove', onHostMove); host.removeEventListener('pointerleave', onHostLeave); };
  });

  const holdTouch = (el: HTMLElement) => {
    const stop = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => { el.removeEventListener('touchstart', stop); el.removeEventListener('touchmove', stop); };
  };
  function handleDown(e: PointerEvent, from: string) {
    e.preventDefault();
    e.stopPropagation();
    if (editing) commitEdit();
    wire(from, e.clientX, e.clientY, false, () => addAfter(from));
  }
  function wire(from: string, cx0: number, cy0: number, finger: boolean, onTap: (() => void) | null) {
    const o = layer.getBoundingClientRect();
    drag = { from, x0: cx0 - o.left, y0: cy0 - o.top, x: cx0 - o.left, y: cy0 - o.top, moved: !onTap };
    const card = () => host.getBoundingClientRect();
    let lastX = cx0;
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
      if (!onTap) setTimeout(() => (swallowClick = false));
      if (d.moved && !to && outside) return;
      if (!d.moved || !to) onTap?.();
      else join(d.from, to);
    };
    const off = followPointer({ move: (ev) => move(ev.clientX, ev.clientY), up: (ev) => end(ev.clientX, ev.clientY), cancel: () => end(0, 0, true), holdPageScroll: finger });
  }

  function onKey(e: KeyboardEvent) {
    if ((linking || moveEnd !== null) && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); linking = null; moveEnd = null; return; }
    if (editing || laneEditing || !sel) return;
    if (!isForThisDiagram(e.target as Element)) return;
    const typing = (e.target as HTMLElement).matches?.('input:not(.armed), textarea, [contenteditable="true"]');
    if (typing && layer.contains(e.target as Node)) {
      const label = (e.target as Element).matches('textarea.edge-label') && 'edge' in sel ? flow.edges[sel.edge] : null;
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); doneTyping(); sel = null; }
      else if (label && e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); nextLine(label); }
      else if (label && labelFresh && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); e.stopPropagation(); doneTyping(); dropEdge((sel as { edge: number }).edge); }
      return;
    }
    if (typing) return;
    // ⌥ and a digit, by the key (⌥1 is "¡" on a Mac): the boxes picked come up at that press, ⌥0 as the arrows go
    const digit = e.altKey && !e.metaKey && !e.ctrlKey && /^Digit(\d)$/.exec(e.code);
    if (digit && ('node' in sel || 'nodes' in sel)) { e.preventDefault(); e.stopPropagation(); setStep('node' in sel ? [sel.node] : sel.nodes, +digit[1]); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sel = null; }
    else if ('nodes' in sel) { if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); dropNodes(sel.nodes); } }
    else if ('lane' in sel && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); e.stopPropagation(); void dropLane(sel.lane); }
    else if ('lane' in sel) { if (e.key === 'Enter') { e.preventDefault(); startLaneEdit(sel.lane); } }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); if ('node' in sel) dropNode(sel.node); else dropEdge(sel.edge); }
    else if ('node' in sel && e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); startEdit(sel.node); }
    else if ('node' in sel && e.key === 'Tab') { e.preventDefault(); addAfter(sel.node, { intoLine: true }); }
    else if ('node' in sel && e.key.startsWith('Arrow') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const to = nearest(sel.node, e.key);
      if (to) { sel = { node: to }; scrollIntoCard(to); }
    }
  }
  const isForThisDiagram = (t: Element) => t === document.body || !!layer.closest('.dblock')?.contains(t) || t === layer.closest('.tiptap');
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
  $effect(() => {
    const drawnIds = new Set(boxes.map((b) => b.id)), edges = flow.edges.length;
    untrack(() => {
      if (hover && !drawnIds.has(hover)) hover = null;
      if (!sel) return;
      const gone = 'node' in sel ? !drawnIds.has(sel.node) : 'nodes' in sel ? !sel.nodes.some((id) => drawnIds.has(id)) : 'edge' in sel ? sel.edge >= edges : false;
      if (gone && !editing) sel = null;
    });
  });
  const selBox = $derived(boxOf(selId));
  const selEdge = $derived(sel && 'edge' in sel ? flow.edges[sel.edge] ?? null : null);
  const PLUS_OVER_BOX = 100, PLUS_OFF_CARD = 50, PLUS_ON_LINE = 1, PLUS_UNDER_BAR = 1000;
  function plusCost(p: { x: number; y: number }, b: Box, r: number) {
    return boxes.reduce((n, o) => n + (o.id !== b.id && p.x + r > o.x && p.x - r < o.x + o.w && p.y + r > o.y && p.y - r < o.y + o.h ? PLUS_OVER_BOX : 0), 0)
      + linePts.reduce((n, q) => n + (q.from !== b.id && q.to !== b.id && Math.hypot(q.x - p.x, q.y - p.y) < r ? PLUS_ON_LINE : 0), 0)
      + (p.x < r || p.x > (layer?.clientWidth ?? 1e4) - r ? PLUS_OFF_CARD : 0);
  }
  const plusAt = (b: Box) => {
    const w = b.id === editing ? Math.max(b.w, 140) : b.w;
    const after = across(flow) ? { x: b.x + b.w / 2 + w / 2 + 14, y: b.y + b.h / 2 } : { x: b.x + b.w / 2, y: b.y + b.h + (b.id === editing ? 22 : 14) };
    if (b.id === editing) return after;
    const r = isMobile ? 22 : 13;
    const cost = (p: { x: number; y: number }) => plusCost(p, b, r);
    const barred = across(flow) && selNode?.id === b.id ? PLUS_UNDER_BAR : 0;
    const sides = across(flow)
      ? [[after, 0], [{ x: b.x + b.w / 2, y: b.y + b.h + 14 }, barred], [{ x: b.x + b.w / 2, y: b.y - 14 }, barred], [{ x: b.x - 14, y: b.y + b.h / 2 }, 0]] as const
      : [[after, 0], [{ x: b.x + b.w + 14, y: b.y + b.h / 2 }, 0], [{ x: b.x - 14, y: b.y + b.h / 2 }, 0], [{ x: b.x + b.w / 2, y: b.y - 14 }, 0]] as const;
    return sides.map(([p, extra]) => ({ p, c: cost(p) + extra })).reduce((best, x) => (x.c < best.c ? x : best)).p;
  };
  const clampX = (x: number, w: number) => Math.max(4, Math.min((layer?.clientWidth ?? 600) - w - 4, x - w / 2));
  function barAt(x: number, top: number, bottom: number, width: number, own: string | null = null) {
    const W = layer?.clientWidth ?? 600, H = layer?.clientHeight ?? 400;
    const tall = isMobile ? 48 : 38;
    const o = layer?.getBoundingClientRect() ?? new DOMRect(0, 0, W, H);
    const within = { left: o.left + 4, top: o.top + 4, right: o.left + W - 4, bottom: o.top + H - 4 };
    const anchor = { left: o.left + x, right: o.left + x, top: o.top + top, bottom: o.top + bottom };
    const at = (prefer: 'above' | 'below') => floatAt(anchor, { w: width, h: tall }, { prefer, within, gap: 8, align: 'center' });
    const up = at('above'), down = at('below');
    const left = (up.side === 'inside' ? Math.max(within.left, Math.min(within.right - width, anchor.left - width / 2)) : up.left) - o.left;
    if (up.side === 'inside') return { left, top: bottom + 8 };
    const cost = (t: number) => barCover({ left, top: t, width, tall }, own, o);
    const a = up.top - o.top, b = down.top - o.top;
    if (cost(a) > 0 && cost(b) > 0) return { left, top: Math.max(bottom, ...boxes.map((x) => x.y + x.h)) + 8 };
    return { left, top: up.side === down.side || cost(a) <= cost(b) ? a : b };
  }
  const DOCK_WEIGHT = 100;
  function dockArea(o: DOMRect) {
    const dk = host.parentElement?.querySelector('.dock')?.getBoundingClientRect();
    return dk && dk.width ? [{ id: '', x: dk.left - o.left, y: dk.top - o.top, w: dk.width, h: dk.height, big: DOCK_WEIGHT }] : [];
  }
  function barCover(bar: { left: number; top: number; width: number; tall: number }, own: string | null, o: DOMRect) {
    return [...boxes.map((b) => ({ ...b, big: 1 })), ...dockArea(o)].reduce((sum, b) => {
      if (b.id && b.id === own) return sum;
      const w = Math.min(bar.left + bar.width, b.x + b.w) - Math.max(bar.left, b.x), h = Math.min(bar.top + bar.tall, b.y + b.h) - Math.max(bar.top, b.y);
      return sum + (w > 0 && h > 0 ? w * h * b.big : 0);
    }, 0);
  }
  let grown = 0, basePad = 0;
  function fitBars() {
    if (!layer) return;
    const low = Math.max(0, ...[...layer.querySelectorAll<HTMLElement>(':scope > .bar')].map((b) => b.offsetTop + b.offsetHeight + 4));
    const need = Math.max(0, Math.ceil(low - (layer.clientHeight - grown)));
    if (need === grown) return;
    if (!grown) basePad = parseFloat(getComputedStyle(host).paddingBottom) || 0;
    grown = need;
    host.style.paddingBottom = need ? `${basePad + need}px` : '';
  }
  $effect(() => { void sel; void editing; void version; void boxes; void shapesOpen; void linking; void drag; tick().then(fitBars); });
  onMount(() => () => { if (grown) host.style.paddingBottom = ''; });
  $effect(() => {
    void version;
    const at = sel && 'edge' in sel ? drawnEdges().findIndex(({ i }) => i === (sel as { edge: number }).edge) : -1;
    const paths = [...host.querySelectorAll('path.flowchart-link')];
    paths.forEach((p, j) => p.classList.toggle('picked', j === at));
  });
  const newStepLabel = () => (flow.nodes.some((n) => /[\uac00-\ud7a3]/.test(n.label)) ? '새 단계' : 'New step');
  function boxesWithPlus() {
    const ids = new Set([(isMobile ? null : hover) ?? selNode?.id ?? null, drag?.from ?? null].filter((x): x is string => !!x));
    return [...ids].map(boxOf).filter((b): b is Box => !!b);
  }
  const handles = $derived.by(boxesWithPlus);
</script>

{#snippet order(ids: string[], at: number | 'mixed')}
  <button type="button" class="order" class:on={at !== 'mixed' && at > 0} class:small={isMobile} aria-label="Order in a presentation" aria-haspopup="menu"
    title="Order: which press of → in a presentation brings it up (⌥1…⌥9)" onclick={(e) => pickStep(e, ids)}>
    <span>{isMobile ? (at !== 'mixed' && at > 0 ? `#${at}` : '#') : at === 'mixed' ? 'Order: mixed' : at ? `Order ${at}` : 'Order: auto'}</span>
    <svg class="chev" viewBox="0 0 16 16"><path d="M4.5 6.5L8 10l3.5-3.5" /></svg>
  </button>
{/snippet}

<div class="layer" bind:this={layer}>
  {#if sel && 'node' in sel && selBox}
    <div class="ring" style:left={`${selBox.x - 4}px`} style:top={`${selBox.y - 4}px`} style:width={`${selBox.w + 8}px`} style:height={`${selBox.h + 8}px`}></div>
  {/if}
  {#if sel && 'nodes' in sel}
    {@const picked = sel.nodes.map(boxOf).filter((b): b is Box => !!b)}
    {#each picked as b (b.id)}
      <div class="ring" style:left={`${b.x - 4}px`} style:top={`${b.y - 4}px`} style:width={`${b.w + 8}px`} style:height={`${b.h + 8}px`}></div>
    {/each}
    {#if picked.length}
      {@const ids = sel.nodes}
      {@const at = barAt((Math.min(...picked.map((b) => b.x)) + Math.max(...picked.map((b) => b.x + b.w))) / 2, Math.min(...picked.map((b) => b.y)), Math.max(...picked.map((b) => b.y + b.h)), flow.lanes?.length ? 350 : 270)}
      <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
        {#if flow.lanes?.length}
          <button type="button" aria-label="Lane" title="Move them to another lane" onclick={(e) => pickLanes(e, ids)}><svg viewBox="0 0 16 16"><path d="M2 4.5h12M2 8h12M2 11.5h12" /></svg><span class="lbl">Lane</span></button>
        {/if}
        {@render order(ids, stepOf(ids))}
        <button type="button" class="danger" aria-label={`Delete the ${ids.length} steps`} title="Delete them (⌫)" onclick={() => dropNodes(ids)}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg><span class="lbl">Delete {ids.length}</span></button>
      </div>
    {/if}
  {/if}
  {#if marquee}
    <div class="marquee" style:left={`${Math.min(marquee.x0, marquee.x)}px`} style:top={`${Math.min(marquee.y0, marquee.y)}px`} style:width={`${Math.abs(marquee.x - marquee.x0)}px`} style:height={`${Math.abs(marquee.y - marquee.y0)}px`}></div>
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
      {#key lid}{#if laneEditing === lid || (armed && 'lane' in armed)}
        <input class={laneEditing === lid ? 'lane-name' : 'armed'} bind:value={laneText} aria-label="Lane name" placeholder="Lane" {@attach focusAndSelect}
          style:left={`${clampX(hb.x + hb.w / 2, 140)}px`} style:top={`${hb.y + hb.h / 2 - 16}px`} oninput={() => { if (!laneEditing) laneEditing = lid; }}
          onkeydown={(e) => { if (composing(e) || !laneEditing) return; if (e.key === 'Enter') { e.preventDefault(); commitLane(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); doneTyping(); laneEditing = null; } }}
          onblur={(e) => { const el = e.currentTarget; queueMicrotask(() => { if (el.isConnected && laneEditing === lid) commitLane(); }); }} />
      {/if}{/key}
      {#if laneEditing !== lid}
        {@const at = { left: clampX(hb.x + hb.w / 2, 240), top: Math.max(4, hb.y + hb.h / 2 - 21) }}
        {@const sideways = across(flow)}
        <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
          <button type="button" class="text" aria-label="Rename the lane" title="Rename (or click its name again)" onmousedown={(e) => e.preventDefault()} onclick={() => startLaneEdit(lid)}><svg viewBox="0 0 16 16"><path d="M10.5 3.5l2 2L6 12l-2.6.6L4 10z" /></svg>Name</button>
          <span class="sep"></span>
          <button type="button" aria-label={sideways ? 'Move up' : 'Move left'} title={sideways ? 'Move up' : 'Move left'} disabled={i === 0} onclick={() => moveLane(lid, -1)}><svg viewBox="0 0 16 16"><path d={sideways ? 'M8 12.5v-9M4.5 7 8 3.5 11.5 7' : 'M12.5 8h-9M7 4.5 3.5 8 7 11.5'} /></svg></button>
          <button type="button" aria-label={sideways ? 'Move down' : 'Move right'} title={sideways ? 'Move down' : 'Move right'} disabled={i === (flow.lanes?.length ?? 0) - 1} onclick={() => moveLane(lid, 1)}><svg viewBox="0 0 16 16"><path d={sideways ? 'M8 3.5v9M4.5 9 8 12.5 11.5 9' : 'M3.5 8h9M9 4.5 12.5 8 9 11.5'} /></svg></button>
          <button type="button" aria-label="Add a step in this lane" title="Add a step in this lane" onclick={() => addAfter(null, { inLane: lid })}><svg viewBox="0 0 16 16"><rect x="2.5" y="4.5" width="11" height="7" rx="2.2" /><path d="M8 6.5v3M6.5 8h3" /></svg>{#if isMobile}<span class="lbl">Step</span>{/if}</button>
          <button type="button" class="danger" aria-label="Delete the lane" title="Delete the lane (its steps go to the one beside it)" onclick={() => dropLane(lid)}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
        </div>
      {/if}
    {/if}
  {/if}

  {#if picking}
    {#each boxes.filter((b) => b.id !== picking) as b (b.id)}
      <div class="ring target pick" style:left={`${b.x - 4}px`} style:top={`${b.y - 4}px`} style:width={`${b.w + 8}px`} style:height={`${b.h + 8}px`}></div>
    {/each}
    <div class="pickhint">{isMobile ? `Tap the box to ${linking ? 'connect' : 'move the end'} to · tap elsewhere to cancel` : `Click the box to ${linking ? 'connect' : 'move the end'} to · Esc or a click elsewhere cancels`}</div>
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

  {#if editing || (armed && 'node' in armed)}
    {@const at = editing ?? (armed as { node: string }).node}
    {@const b = boxOf(at) ?? { id: at, x: pendingAt.x - 70, y: pendingAt.y - 16, w: 140, h: 32 }}
    <input class={editing ? 'rename' : 'armed'} bind:value={editText} aria-label="Step name" oninput={() => { if (!editing) editing = at; typed(); }}
      style:left={`${clampX(b.x + b.w / 2, Math.min(Math.max(b.w, 140), (layer?.clientWidth ?? 600) - 8))}px`} style:top={`${b.y + b.h / 2 - 16}px`} style:width={`${Math.min(Math.max(b.w, 140), (layer?.clientWidth ?? 600) - 8)}px`}
      onkeydown={(e) => { if (composing(e) || !editing) return; if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); } else if (e.key === 'Tab') { e.preventDefault(); const from = editing; commitEdit(); if (from) addAfter(from, { intoLine: true }); } }}
      onblur={() => { if (editing) commitEdit(); }} />
  {/if}

  {#if moving}
    {@const area = laneAreas.find((r) => r.id === moving?.lane)}
    {@const onto = moving.onto ? boxOf(moving.onto) : null}
    {#if onto}<div class="ring target" style:left={`${onto.x - 4}px`} style:top={`${onto.y - 4}px`} style:width={`${onto.w + 8}px`} style:height={`${onto.h + 8}px`}></div>{/if}
    {#if area}<div class="lane-drop" style:left={`${area.x}px`} style:top={`${area.y}px`} style:width={`${area.w}px`} style:height={`${area.h}px`}></div>{/if}
    <div class="ghost" style:left={`${moving.x}px`} style:top={`${moving.y}px`}>{flow.nodes.find((n) => n.id === moving?.id)?.label ?? ''}</div>
  {/if}

  {#if selNode && selBox && !drag && !linking && !moving}
    {@const at = barAt(selBox.x + selBox.w / 2, selBox.y, selBox.y + selBox.h + (across(flow) ? 0 : isMobile ? 34 : 26), isMobile ? 290 : 580, selNode.id)}
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
        {@render order([selNode.id], selNode.presentStep ?? 0)}
        <button type="button" class:on={linking === selNode.id} aria-label="Connect to another box" title="Connect: then tap the box to connect to" onmousedown={(e) => e.preventDefault()}
          onclick={() => { if (editing) commitEdit(); linking = selNode.id; }}><svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r="2" /><path d="M5.5 8h7M10.5 5.5 13 8l-2.5 2.5" /></svg>{#if isMobile}<span class="lbl">Connect</span>{/if}</button>
        <button type="button" class="danger" aria-label="Delete" title="Delete" onmousedown={(e) => e.preventDefault()} onclick={() => { editing = null; dropNode(selNode.id); }}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
      {/if}
    </div>
  {/if}

  {#if selEdge && sel && 'edge' in sel && !drag}
    {@const at = barAt(sel.x, sel.y - 6, sel.y + 6, isMobile ? 360 : 550)}
    {@const i = sel.edge}
    <div class="bar" style:left={`${at.left}px`} style:top={`${at.top}px`}>
      {#each LINES as [line, label, icon] (line)}
        <button type="button" class:on={selEdge.line === line} aria-label={label} title={label} onclick={() => (selEdge.line = line)}><svg viewBox="0 0 16 16">{@html icon}</svg></button>
      {/each}
      <button type="button" class:on={!!selEdge.animate} aria-label="Moving" aria-pressed={!!selEdge.animate} title="Moving: its dashes run the way it goes"
        onclick={() => { if (selEdge.animate) delete selEdge.animate; else selEdge.animate = true; }}><svg viewBox="0 0 16 16"><path d="M2 8h2.5M6.5 8H9M11 8h1" /><path d="M9.5 5.5 12 8l-2.5 2.5" /><path d="M3 4.5h4M3 11.5h4" stroke-opacity=".5" /></svg></button>
      <span class="sep"></span>
      <textarea class="edge-label" rows="1" bind:value={selEdge.label} placeholder="Label" aria-label="Line label" title="⇧↩ a new line · Tab its next look" oninput={() => (labelFresh = false)} {@attach autoGrow}></textarea>
      <button type="button" aria-label="Put a step in this line" title="Put a step in the middle of this line" onclick={() => splitEdge(i)}><svg viewBox="0 0 16 16"><path d="M1.5 8h3M11.5 8h3" /><rect x="4.5" y="5" width="7" height="6" rx="1.6" /></svg></button>
      <button type="button" aria-label="Move its end" title="Move its end to another box" onclick={() => { moveEnd = i; sel = null; }}><svg viewBox="0 0 16 16"><path d="M1.5 8h7M6.5 5.5 9 8l-2.5 2.5" /><rect x="10.5" y="5" width="4" height="6" rx="1.4" stroke-dasharray="2 1.5" /></svg></button>
      <button type="button" aria-label="Reverse" title="Reverse" onclick={() => reverse(i)}><svg viewBox="0 0 16 16"><path d="M3 5.5h9.5M10.5 3l2.5 2.5L10.5 8M13 10.5H3.5M5.5 8 3 10.5 5.5 13" /></svg></button>
      <button type="button" class="danger" aria-label="Delete" title="Delete (⌫)" onclick={() => dropEdge(i)}><svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" /></svg></button>
    </div>
  {/if}
  {#each flow.nodes as n (n.id)}
    {@const b = n.presentStep ? boxOf(n.id) : null}
    {#if b}<div class="stepno" style:left={`${b.x - 7}px`} style:top={`${b.y - 7}px`}>{n.presentStep}</div>{/if}
  {/each}
</div>

<style>
  .layer { position: absolute; inset: 0; pointer-events: none; z-index: var(--z-block-ui); }
  .layer > * { pointer-events: auto; }
  .ring { position: absolute; border-radius: 14px; box-shadow: 0 0 0 2px var(--accent); pointer-events: none; }
.ring.target { box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px var(--accent-soft); }
  .ring.pick { box-shadow: 0 0 0 2px var(--accent-soft); }
  .pickhint {
    position: absolute; left: 50%; bottom: 8px; translate: -50% 0; padding: 6px 12px; border-radius: 999px; white-space: nowrap; pointer-events: none;
    font-size: 12.5px; font-weight: 500; background: var(--accent); color: var(--on-accent); box-shadow: 0 2px 8px rgba(0, 40, 100, 0.2);
  }
  .plus {
    position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 0; padding: 0; cursor: crosshair;
    display: inline-flex; align-items: center; justify-content: center; background: var(--accent); color: var(--on-accent);
    box-shadow: 0 2px 6px rgba(0, 40, 100, 0.25); touch-action: none; transition: transform 0.12s;
  }
  .plus:hover { transform: scale(1.15); }
  :global(html.mobile) .plus { width: 40px; height: 40px; margin: -9px 0 0 -9px; background: none; box-shadow: none; }
  :global(html.mobile) .plus::before {
    content: ''; position: absolute; inset: 5px; border-radius: 50%; background: var(--accent); box-shadow: 0 2px 6px rgba(0, 40, 100, 0.25);
  }
  :global(html.mobile) .plus::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; }
  :global(html.mobile) .plus svg { position: relative; width: 15px; height: 15px; }
  .plus svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
  .wire { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .wire line { stroke: var(--accent-text); stroke-width: 2; stroke-dasharray: 5 4; }
  .wire circle { fill: var(--accent-text); }
  .lane-name {
    position: absolute; width: 140px; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 13px; font-weight: 600; color: var(--fg); background: var(--bg-pop); box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0, 0, 0, 0.15); outline: none;
  }
  .armed { position: absolute; width: 140px; height: 32px; opacity: 0; pointer-events: none; }
  .bar button:disabled { opacity: 0.35; }
  .bar button .lbl { max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
  .rename {
    position: absolute; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 14px; color: var(--fg); background: var(--bg-pop); outline: none;
    border-radius: 16px; box-shadow: 0 0 0 1.5px var(--accent), 0 0 0 5px var(--accent-soft);
  }
  .bar {
    position: absolute; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: var(--pop-shadow), 0 0 0 0.5px var(--line); white-space: nowrap;
    max-width: calc(100% - 8px); flex-wrap: wrap; box-sizing: border-box;
  }
  .bar button {
    width: 30px; height: 30px; border: 0; border-radius: 8px; padding: 0; background: none; color: var(--fg-dim);
    display: inline-flex; align-items: center; justify-content: center;
  }
  @media (hover: hover) { .bar button:hover { background: var(--bg-hover); color: var(--fg); } }
  .bar button.on { background: var(--accent-soft); color: var(--accent-text); }
  .bar button .lbl { margin-left: 4px; font-size: 12.5px; font-weight: 500; }
  .bar button:has(.lbl) { width: auto; padding: 0 9px 0 7px; }
  .bar button.text { width: auto; gap: 4px; padding: 0 9px 0 7px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent-text); }
  .bar button.danger:hover { color: #ff453a; }
  .bar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .bar button.order { width: auto; gap: 2px; padding: 0 5px 0 9px; color: var(--fg-dim); font: inherit; font-size: 12.5px; font-weight: 500; }
  .bar button.order .chev { width: 12px; height: 12px; }
  .bar button.order.small { min-width: 30px; padding: 0 5px 0 7px; font-weight: 600; }
  .bar .order.on { background: var(--accent-soft); color: var(--accent-text); }
  .stepno {
    position: absolute; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px; pointer-events: none;
    font-size: 10.5px; font-weight: 700; line-height: 16px; text-align: center; color: var(--on-accent); background: var(--accent); box-shadow: 0 0 0 2px var(--bg-pop);
  }
  .sep { width: 1px; height: 18px; background: var(--line); margin: 0 3px; }
  .edge-label {
    width: 230px; min-height: 30px; max-height: 92px; box-sizing: border-box; border: 0; border-radius: 8px; padding: 6px 9px; font: inherit;
    font-size: 13px; line-height: 18px; background: var(--bg-input); color: var(--fg); outline: none; resize: none; overflow-y: auto; align-self: center;
  }
  :global(html.mobile) .edge-label { width: 150px; }
  .edge-label:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  :global(.diagram-canvas path.hit) { stroke: transparent !important; stroke-width: 14px !important; fill: none !important; pointer-events: stroke; cursor: pointer; }
  :global(html.mobile .diagram-canvas path.hit) { stroke-width: 30px !important; }
  :global(.diagram-canvas path.flowchart-link.picked) { stroke: var(--accent-text) !important; stroke-width: 2.5px !important; }
  :global(html.mobile) .bar button { width: 40px; height: 40px; }
  :global(html.mobile) .bar button.text, :global(html.mobile) .bar button:has(.lbl), :global(html.mobile) .bar button.order { width: auto; }
  .layer { overflow: hidden; }
  .marquee { position: absolute; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--accent); background: var(--accent-soft); opacity: 0.7; pointer-events: none; }
  .lane-drop { position: absolute; border-radius: 6px; box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-soft); opacity: 0.6; pointer-events: none; }
  .ghost {
    position: absolute; translate: -50% -50%; padding: 6px 12px; border-radius: 10px; pointer-events: none; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis;
    font-size: 13px; background: var(--bg-pop); color: var(--fg); box-shadow: 0 0 0 2px var(--accent), 0 6px 18px rgba(0, 0, 0, 0.2); opacity: 0.92;
  }
  :global(.dblock.active .diagram-canvas g.node) { user-select: none; -webkit-user-select: none; cursor: grab; }
  :global(.builder .preview g.node) { cursor: pointer; }
</style>
