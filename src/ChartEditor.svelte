<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Diagram } from './lib/diagram';
  import { spotOf, type Act, type Icon } from './lib/spots';
  import { letGo } from './lib/focusWatch';
  import { composing } from './lib/keys';
  import { isMobile } from './lib/platform';
  import { floatAt, screenInsets, viewSize } from './lib/popup';
  import { textW } from './lib/lanes';
  import { held } from './lib/chartHues';
  import Select from './Select.svelte';

  /**
   * Any chart but a flowchart edited on its own picture: a click on a part of it (a slice, a task, an idea, a message,
   * a class, a column) types in it right where it is drawn, and a bar beside it holds the rest of that part (its value,
   * dates, arrow, shape) and what can be done from it (the next one, moving it, deleting it). What each part is and
   * does is spots.ts's; the drawing marks its parts with their keys (`data-spot`). The chart draws again as it is
   * typed in, and the field follows its part.
   *   keys while typing: Enter is done, Tab adds the next one (the bar's first +) and types in it (a line, with none to
   *   add: Tab tries its next kind), Esc puts it back
   */
  let { d, host, version, pick = null }: { d: Diagram; host: HTMLElement; version: string; pick?: string | null } = $props();

  type Rect = { x: number; y: number; w: number; h: number };
  let layer = $state<HTMLDivElement>(null!);
  let sel = $state<string | null>(null), text = $state(''), before = '';
  let rect = $state<Rect | null>(null), hover = $state<Rect | null>(null);
  let bar = $state<HTMLDivElement | null>(null), barAt = $state({ left: 0, top: 0 });
  const spot = $derived(sel ? spotOf(d, sel) : null);

  /** a part's drawing: where it is drawn twice (a slice and its row, a task's name and its bar), the one with its words */
  const find = (key: string) => {
    const all = [...host.querySelectorAll(`[data-spot="${CSS.escape(key)}"]`)], el = all.find((x) => x.textContent?.trim()) ?? all[0] ?? null;
    // a class's or a table's name line, not the whole box: centred on the box, the field sat over its first member
    // (a person drawn as a figure: the name under it)
    return el?.querySelector(':scope > g.label-group, :scope > g.label.name, :scope > text.actor-man') ?? el;
  };
  function box(el: Element): Rect {
    // a part drawn as a page's box (a timeline's year, a task's name): its words, not the row it stretches over
    let r = el.getBoundingClientRect();
    if (el instanceof HTMLElement && el.textContent?.trim()) { const g = document.createRange(); g.selectNodeContents(el); const t = g.getBoundingClientRect(); if (t.width) r = t; }
    const o = layer.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  }
  // a part just added or renamed is drawn a moment later (the chart draws again after a pause): looked for again
  // until it is, the field kept out of sight till then, not in the card's corner over other parts
  let retry: ReturnType<typeof setTimeout> | undefined, tries = 0, unseen = false;
  /** the part just added (Tab, a +): Esc on it takes the adding back, not only what was typed */
  let fresh: string | null = null, addedIn: string | null = null;
  let field = $state<HTMLInputElement | null>(null);
  /** the chart as it was when the part was picked: Esc puts back all of it (its value, dates, shape), not its words only */
  let was: Record<string, unknown> | null = null;
  /** the field takes the keyboard as its part is picked; not again when a rename gives it a new key, as a box of the
   *  bar was clicked into (the field taken back the keyboard, and the words for that box renamed the part) */
  let grab = false, renamed = false, deciding = false;
  /** the bar under the picture, over its toolbar, where wherever it went in the picture it covered other parts (they
   *  could not be clicked; folded into a ⋯ instead, the ⋯ covered them, and opened, the bar did) */
  let docked = $state(false), barMax = $state(0);
  let tallest = 0, wide = 0, measured: string | null = null;
  function measure() {
    if (!layer) return;
    clearTimeout(retry);
    const el = sel ? find(sel) : null;
    // renamed, its new key is drawn a moment later; or drawn again as it is typed in (a member's line, a column): where
    // it was meanwhile. Hidden, the bar lost the box typed in (WebKit lets go of a field it cannot see), and the next
    // words went into the note
    rect = el ? box(el) : renamed || (rect && sel === measured) ? rect : null;
    measured = sel;
    if (el) renamed = false;
    if (sel && !el && tries++ < 40) retry = setTimeout(measure, 50);
    else tries = 0;
    // one drawn only now (an idea added past the card's edge) brought into the card as it appears: one just added is
    // looked for in the drawing after this one (its key was another part's until the chart drew again)
    if (el && (unseen || (addedIn !== null && addedIn !== version))) { unseen = false; addedIn = null; el.scrollIntoView?.({ block: 'center', inline: 'center' }); }
    tick().then(placeBar);
  }
  $effect(() => { void version; void sel; tick().then(measure); });
  /** a mind map's first-step ideas, each on the side it is drawn on now: kept there while it is edited (chartHues.ts) */
  function keepSides() {
    if (d.kind !== 'mindmap') return;
    const root = host.querySelector('[data-spot="root"]')?.getBoundingClientRect();
    if (!root) return;
    for (const g of host.querySelectorAll('g.mm-l1')) {
      const r = g.getBoundingClientRect(), t = g.textContent?.trim();
      if (t && !held.sides.has(t)) held.sides.set(t, r.left + r.width / 2 > root.left + root.width / 2);
    }
  }
  $effect(() => { void version; tick().then(keepSides); });
  $effect(() => { if (!sel) held.hues.clear(); }); // (let go however it was: Enter, Esc, a click away)
  /** what a held part said a letter ago: renamed, it keeps its side under its new name */
  let said = '';

  /** a part to type in: what was being typed is kept first */
  function select(key: string | null) {
    if (key === sel) return;
    commit();
    sel = key;
    const s = key ? spotOf(d, key) : null;
    if (key && !s) sel = null;
    text = before = said = s?.text ?? '';
    was = sel ? $state.snapshot(d) as Record<string, unknown> : null;
    // its colour held while it is typed in (by its name it would change at each letter), let go as another is picked
    held.hues.clear();
    const tone = sel && /^(slice|branch):/.test(sel) ? / c(\d+)\b/.exec(` ${find(sel)?.getAttribute('class') ?? ''} ${find(sel)?.querySelector('.dot')?.getAttribute('class') ?? ''}`) : null;
    if (sel && tone) held.hues.set(sel, +tone[1]);
    grab = !!sel;
    deciding = true;
    hover = null;
    if (sel) {
      // its part brought into the card (the picture scrolls sideways in it)
      const el = find(sel);
      if (el) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      unseen = !el;
    } else letField();
    fresh = null; // set again by what added it, just after (picked again later, it is an ordinary part)
  }
  /** what was typed, kept: a name that renames what it is comes in only now (its key with it) */
  function commit() {
    const s = spot;
    if (!s || !sel) return;
    if (s.onDone && text.trim() && text !== before) {
      const k = s.set(text.trim());
      if (k) { renamed = k !== sel; sel = k; }
      before = text;
    }
  }
  function typed() {
    const s = spot;
    if (held.sides.has(said.trim())) { const side = held.sides.get(said.trim())!; held.sides.delete(said.trim()); held.sides.set(text.trim(), side); }
    said = text;
    if (s && !s.onDone) s.set(text);
  }
  /** the field lets go of the keyboard on purpose as it goes (left to vanish, the keyboard was on <body> as if lost) */
  function letField() {
    const a = document.activeElement;
    if (a instanceof HTMLElement && layer?.contains(a)) letGo(a);
  }
  async function run(a: Act) {
    commit();
    const k = await a.run();
    letField();
    sel = null;
    const drawn = version;
    if (k) { await tick(); select(k); if (ADDS.has(a.icon)) { fresh = k; addedIn = drawn; } }
  }
  /** Esc from the note: what is being typed in let go first; true when there was something */
  export function escape(): boolean {
    if (!sel) return false;
    // from one of the bar's own boxes: back to the part's field first, a second Esc for the rest
    if (bar?.contains(document.activeElement) && field) { field.focus({ preventScroll: true }); return true; }
    const s = spot;
    if (s && fresh === sel) s.acts.find((x) => x.icon === 'trash' && !x.off)?.run();
    else if (was && JSON.stringify($state.snapshot(d)) !== JSON.stringify(was)) {
      const live = d as unknown as Record<string, unknown>;
      for (const k of Object.keys(live)) if (!(k in was)) delete live[k];
      Object.assign(live, structuredClone(was));
    }
    text = before; // a rename waits for the field to go (onDone): Esc is not that
    fresh = null;
    letField();
    sel = null;
    return true;
  }
  /** a setting of the whole chart turned while a part is picked (Values, Skip weekends): its own, not the part's, so
   *  Esc leaves it as set */
  export function kept(turn: () => void) {
    const before = $state.snapshot(d) as Record<string, unknown>;
    turn();
    if (!was) return;
    // what the turn changed only (a title typed meanwhile is the part's, Esc's to put back)
    const live = $state.snapshot(d) as Record<string, unknown>;
    for (const k of new Set([...Object.keys(live), ...Object.keys(before)])) if (JSON.stringify(live[k]) !== JSON.stringify(before[k])) was[k] = structuredClone(live[k]);
  }
  /** a part typed in at once (the chart's own "+ Part") */
  export function open(key: string | null) { if (key) { const drawn = version; sel = null; tick().then(() => { select(key); fresh = key; addedIn = drawn; }); } }

  const ADDS = new Set<Icon>(['plus', 'child', 'note', 'section']);
  function onBarKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && !composing(e) && e.target !== field) { e.preventDefault(); e.stopPropagation(); escape(); }
    // Tab walks its boxes and buttons itself (WebKit's own Tab passes buttons by, as a Mac does unless told), and
    // past its last or before its first comes back to the field (it went on to Full screen, and stayed there)
    if (e.key === 'Tab' && bar) {
      const all = [...bar.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea')], i = all.indexOf(e.target as HTMLElement);
      if (i < 0) return;
      e.preventDefault();
      const next = all[i + (e.shiftKey ? -1 : 1)];
      if (next) { next.focus({ preventScroll: true }); if (next instanceof HTMLInputElement) next.select(); } else field?.focus({ preventScroll: true });
    }
  }
  /** a choice made in the bar: the keyboard back in the part's field, for Enter and Tab to go on from */
  const chose = () => tick().then(() => { if (!field) return; field.focus({ preventScroll: true }); field.setSelectionRange(field.value.length, field.value.length); });
  function onKey(e: KeyboardEvent) {
    if (composing(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // emptied: what it said (a period drawn as "…", saved so)
      if (!text.trim() && before.trim()) { text = before; spot?.set(before); }
      fresh = null;
      commit(); letField(); sel = null;
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); escape(); }
    // ⇧Tab: into the bar, its first box or button (it could be reached by the mouse only)
    else if (e.key === 'Tab' && e.shiftKey) {
      const first = bar?.querySelector<HTMLElement>('button:not(:disabled), input, textarea');
      if (first) { e.preventDefault(); first.focus(); if (first instanceof HTMLInputElement) first.select(); }
    }
    else if (e.key === 'Tab' && !e.shiftKey) {
      const a = spot?.acts.find((x) => x.tab && !x.off);
      // a part with nothing to add after it (a line between two classes, tables, states): Tab tries its next kind, as a
      // flowchart's line does (the bar's list was a click, a look and a click away)
      const kind = !a ? spot?.fields.find((f) => f.kind === 'select') : null;
      if (kind && kind.kind === 'select' && kind.options.length > 1) {
        e.preventDefault();
        const i = kind.options.findIndex(([v]) => v === kind.value);
        kind.set(kind.options[(i + 1) % kind.options.length][0]);
        return;
      }
      // one just added and not yet typed in stays the one: Tab, Tab, Tab left a row of "Idea"s that one Esc did not take
      if (a && fresh === sel && text === before) e.preventDefault();
      else if (a) { e.preventDefault(); void run(a); }
    }
  }

  function onHostClick(e: MouseEvent) {
    const t = e.target as Element;
    if (layer.contains(t)) return;
    // a click just beside a part, or between a figure's thin lines, picks it (a phone's small words were missed by a
    // finger and nothing was picked): the nearest within a finger's reach, not a line by its box
    const reach = isMobile ? 18 : 8;
    const near = () => {
      let best: Element | undefined, gap = reach + 1;
      for (const p of host.querySelectorAll('[data-spot]')) {
        if (p instanceof SVGPathElement) continue;
        const r = p.getBoundingClientRect();
        if (!r.width) continue;
        const g = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
        if (g < gap) { gap = g; best = p; }
      }
      return best;
    };
    const el = t.closest?.('[data-spot]') ?? near();
    const key = el && host.contains(el) ? el.getAttribute('data-spot') : null;
    // the part already picked clicked again (the click that opened the chart picked it): its field keeps the keyboard
    if (key && key === sel) field?.focus({ preventScroll: true });
    else select(key);
  }
  function onHostMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest?.('[data-spot]');
    hover = el && host.contains(el) && el.getAttribute('data-spot') !== sel && !layer.contains(e.target as Node) ? box(el) : null;
  }

  /** the bar where it covers the fewest other parts: under the field it covered the next one (a legend's next row,
   *  the next event, column or task), which could then not be clicked. Beside the field, on its line, then under it,
   *  then over it, on a tie; inside the picture */
  function placeBar() {
    if (!layer || !bar) return;
    const o = layer.getBoundingClientRect(), W = layer.clientWidth, H = layer.clientHeight;
    const r = rect ?? { x: 8, y: 8, w: 140, h: 32 };
    const within = { left: o.left + 4, top: o.top + 4, right: o.left + W - 4, bottom: o.top + H - 4 };
    const half = isMobile ? 20 : 17, fieldTop = r.y + r.h / 2 - half;
    const size = { w: bar.offsetWidth, h: bar.offsetHeight };
    const beside = { left: o.left + fieldLeft, right: o.left + fieldLeft + fieldW, top: o.top + fieldTop - (size.h - half * 2) / 2, bottom: o.top + fieldTop + half * 2 };
    // over or under the field, which may be lower than the part's middle (a part shorter than the field)
    const around = { left: o.left + r.x, right: o.left + r.x + r.w, top: o.top + Math.min(r.y, fieldTop), bottom: o.top + Math.max(r.y + r.h, fieldTop + half * 2) };
    const tries = [
      floatAt(beside, size, { prefer: 'side', within, gap: 6 }),
      floatAt(around, size, { prefer: 'below', within, gap: 8, align: 'start' }),
      floatAt(around, size, { prefer: 'above', within, gap: 8, align: 'start' }),
    ].filter((f, i) => (i === 0 ? f.side === 'right' || f.side === 'left' : f.side !== 'inside'));
    // (and the picture's own full-screen button)
    const others = [...host.querySelectorAll('[data-spot]'), ...(host.parentElement?.querySelectorAll('.mermaid-expand, .mermaid-play') ?? [])]
      .filter((el) => el.getAttribute('data-spot') !== sel).map((el) => el.getBoundingClientRect());
    const covers = (f: { left: number; top: number }) => others.filter((q) => q.width && q.left < f.left + size.w && q.right > f.left && q.top < f.top + size.h && q.bottom > f.top).length;
    const best = tries.reduce<(typeof tries)[number] | null>((a, f) => (!a || covers(f) < covers(a) ? f : a), null);
    // a phone's keyboard up: on it, the width of the card, as a phone's own bars are (anywhere in the little room left
    // above it, it covered the parts around the field); the field scrolled up clear of it
    // (Android shortens the page for its keyboard instead of laying it over: the window shorter than it has been, at
    // the same width)
    const win = viewSize();
    if (win.w !== wide) { wide = win.w; tallest = 0; }
    tallest = Math.max(tallest, win.h);
    const kb = isMobile ? Math.max(screenInsets().bottom - 64, tallest - win.h) : 0;
    if (kb > 120) {
      docked = true;
      barMax = W - 8;
      const top = viewSize().h - screenInsets().bottom - o.top - size.h - 4;
      barAt = { left: 4, top };
      const under = fieldTop + half * 2 + 8 - top;
      if (under > 0) {
        let sc: HTMLElement | null = layer.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        if (sc) sc.scrollTop += under;
      }
      return;
    }
    // docked or not once, as the part is picked and drawn: not again as it is edited (a rename drew it anew, its old
    // drawing counted as a part it covered, and the bar moved away from under the click into one of its boxes)
    if (deciding && rect) { deciding = false; docked = !best || covers(best) > 0; }
    // in the room kept under the drawing (the picture's foot, beside its full-screen button), over the toolbar under
    // it if it needs more
    if (docked) {
      // short of the full-screen button and of Done, under the field's left; and in sight: a tall chart's foot was
      // far below the window (or under a phone's keyboard)
      // the picture's foot, or under or over the field: of those in sight and off the field, the one covering fewest
      const seen = viewSize().h - screenInsets().bottom - o.top - size.h - 8, top0 = screenInsets().top - o.top + 4;
      const offField = (t: number) => t >= fieldTop + half * 2 + 6 || t + size.h <= fieldTop - 6;
      // (and just under the picture, over its toolbar, which covers no part; on a tie, the one nearest the field: a tall
      // chart's bar sat at the window's foot, far from it)
      const tops = [Math.min(H - (parseFloat(getComputedStyle(host).paddingBottom) || 0) + 6, seen), fieldTop + half * 2 + 8, fieldTop - size.h - 8, Math.min(H + 4, seen)]
        .filter((t) => t >= top0 && t <= seen && offField(t));
      const cost = (t: number) => covers({ left: o.left + fieldLeft, top: o.top + t }) * 1e5 + Math.abs(t - fieldTop);
      const top = tops.length ? tops.reduce((a, t) => (cost(t) < cost(a) ? t : a)) : fieldTop - size.h - 8;
      // (those on its rows and to the right only: a phone's Done, on a row of its own at the left, left it no room)
      const stop = [...(layer.parentElement?.parentElement?.querySelectorAll('.mermaid-expand, .mermaid-play, .tools .done') ?? [])].map((b) => b.getBoundingClientRect())
        .filter((q) => q.top < o.top + top + size.h && q.bottom > o.top + top && q.left - o.left > 200).map((q) => q.left - o.left - 8);
      barMax = Math.max(160, Math.min(W - 8, ...stop) - 4);
      const w = Math.min(size.w, barMax);
      barAt = { left: Math.max(4, Math.min(fieldLeft, 4 + barMax - w)), top };
      return;
    }
    const f = best ?? floatAt(around, size, { prefer: 'below', within, gap: 8, align: 'start' });
    const at = f.side === 'inside' ? { left: r.x, top: r.y + r.h + 8 } : { left: f.left - o.left, top: f.top - o.top };
    barAt = { left: Math.max(4, Math.min(W - size.w - 4, at.left)), top: at.top }; // never past the picture's edge
  }
  $effect(() => { void spot; void rect; tick().then(placeBar); });

  /** the window shorter (a phone's keyboard up, on the whole screen too): the part brought into sight, its bar placed
   *  anew for the room now left (the field stayed under the keyboard) */
  function resized() {
    const el = sel ? find(sel) : null;
    if (el) {
      const r = el.getBoundingClientRect(), bottom = viewSize().h - screenInsets().bottom;
      if (r.bottom + 24 > bottom || r.top < screenInsets().top) el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      deciding = true;
    }
    measure();
  }
  // its own size changed (a choice's longer words, a new part's boxes): placed again for it
  const barRo = new ResizeObserver(() => requestAnimationFrame(placeBar)); // (in the next frame: in this one, a loop)
  $effect(() => { if (bar) { barRo.observe(bar); return () => bar && barRo.unobserve(bar); } });
  onMount(() => {
    host.addEventListener('click', onHostClick);
    host.addEventListener('pointermove', onHostMove);
    const out = () => (hover = null);
    host.addEventListener('pointerleave', out);
    host.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    // the keyboard coming up (the window shorter) or the page scrolled: the bar kept in sight
    const vv = window.visualViewport;
    vv?.addEventListener('resize', resized);
    window.addEventListener('resize', resized);
    document.addEventListener('scroll', measure, { passive: true, capture: true });
    // the part the click that opened the chart landed on
    untrack(() => { if (pick) tick().then(() => select(pick)); });
    return () => {
      held.hues.clear();
      held.sides.clear(); // done: the map split anew, tidily
      clearTimeout(retry);
      host.removeEventListener('click', onHostClick);
      host.removeEventListener('pointermove', onHostMove);
      host.removeEventListener('pointerleave', out);
      host.removeEventListener('scroll', measure);
      vv?.removeEventListener('resize', resized);
      window.removeEventListener('resize', resized);
      document.removeEventListener('scroll', measure, { capture: true });
      ro.disconnect();
      barRo.disconnect();
    };
  });

  const ICONS: Record<Icon, string> = {
    plus: '<path d="M8 3.5v9M3.5 8h9" />',
    child: '<path d="M3.5 3v5.5a2 2 0 0 0 2 2H12M9.5 8l2.5 2.5L9.5 13" />',
    up: '<path d="M4.5 9.5 8 6l3.5 3.5" />',
    down: '<path d="M4.5 6.5 8 10l3.5-3.5" />',
    left: '<path d="M9.5 4.5 6 8l3.5 3.5" />',
    right: '<path d="M6.5 4.5 10 8l-3.5 3.5" />',
    trash: '<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9" />',
    note: '<path d="M3.5 2.5h9v7l-3 3h-6z M9.5 12.5v-3h3" />',
    section: '<path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h7" />',
  };
  // the field as wide as its part or its words, a little room to type, inside the picture: 150 at the least, a short
  // word's field covered the idea, label or event beside it, which could then not be clicked
  // (its words measured as they are set in it: counted, Korean and wide letters ran out of it; a long name at most a
  // little wider than its part, scrolled in it rather than over the parts around)
  const fieldW = $derived(Math.min(Math.max((rect?.w ?? 0) + 12, 72, Math.min(textW(text, isMobile ? 16 : 14) + 32, Math.max(320, (rect?.w ?? 0) + 12))), (layer?.clientWidth ?? 600) - 8));
  /** a part wider than its field's least (a timeline's event, a task's name) has its field from its own left edge, the
   *  words where they were; a small one (a word on a line, an idea) has it centred on it */
  // (a page's words set from their left, a title or a section's name, stay where they were drawn too)
  let leftSet = $state(false);
  // (a drawn picture's words, centred, stay centred: a state's name jumped to its box's left)
  const wideSpot = $derived(!!rect && leftSet);
  $effect(() => { void rect; const el = sel && find(sel); leftSet = el instanceof HTMLElement && (/^(left|start)$/.test(getComputedStyle(el).textAlign) || el.getBoundingClientRect().width + 12 >= 120); rightSet = el instanceof HTMLElement && /^(right|end)$/.test(getComputedStyle(el).textAlign) && !leftSet; });
  const fieldLeft0 = $derived(Math.max(4, Math.min((layer?.clientWidth ?? 600) - fieldW - 4, rect ? (wideSpot ? rect.x - 6 : rect.x + rect.w / 2 - fieldW / 2) : 8)));
  // a page's words set from their right (a timeline's year): the field from that edge, the words staying there
  let rightSet = $state(false);
  const fieldLeft = $derived(rightSet && rect ? Math.max(4, rect.x + rect.w + 6 - fieldW) : fieldLeft0);
</script>

<div class="layer" bind:this={layer}>
  {#if hover}
    <div class="ring soft" style:left={`${hover.x - 3}px`} style:top={`${hover.y - 3}px`} style:width={`${hover.w + 6}px`} style:height={`${hover.h + 6}px`}></div>
  {/if}
  {#if sel && spot}
    {#key sel}<!-- a field of its own for each part: one kept from the last would not take the keyboard -->
    <input class="field" bind:this={field} style:opacity={rect ? null : 0} class:wide={wideSpot} class:right={rightSet} bind:value={text} aria-label={spot.label} placeholder={spot.label} oninput={typed} onkeydown={onKey} onblur={commit}
      style:left={`${fieldLeft}px`} style:top={`${rect ? rect.y + rect.h / 2 - (isMobile ? 20 : 17) : 8}px`} style:width={`${fieldW}px`}
      {@attach (el: HTMLInputElement) => { if (grab) { grab = false; el.focus({ preventScroll: true }); el.select(); } }} />
    {/key}
    {#if spot.fields.length || spot.acts.length}
    <div class="bar" role="toolbar" tabindex="-1" bind:this={bar} onkeydown={onBarKey} class:docked style:max-width={docked && barMax ? `${barMax}px` : null} style:visibility={rect ? null : 'hidden'} style:left={`${barAt.left}px`} style:top={`${barAt.top}px`}>
      {#if spot.fields.length}<span class="grp">
      {#each spot.fields as f (f.label)}
        <label class="f" class:top={f.kind === 'lines'}>
          <span>{f.label}</span>
          {#if f.kind === 'select'}
            <Select label={f.label} value={f.value} options={f.options} onchange={(v) => f.set(v)} onpicked={chose} />
          {:else if f.kind === 'lines'}
            <!-- its value written in only while it is not typed in: what the chart keeps of it (a line's end space and an
                 empty line dropped) written back at each key took the words typed after them -->
            <textarea aria-label={f.label} {@attach (el: HTMLTextAreaElement) => { const v = f.value; if (document.activeElement !== el) el.value = v; }} rows={Math.min(6, Math.max(2, f.value.split('\n').length + 1))} placeholder="One per line" spellcheck="false"
              oninput={(e) => f.set(e.currentTarget.value)}></textarea>
          {:else}
            <input type={f.kind} aria-label={f.label} value={f.value} size={f.kind === 'number' ? 5 : undefined}
              onchange={(e) => { f.set(e.currentTarget.value); const now = sel && spotOf(d, sel)?.fields.find((x) => x.label === f.label); if (now) e.currentTarget.value = now.value; }}
              oninput={(e) => { if (f.kind === 'number') f.set(e.currentTarget.value); }}
              onkeydown={(e) => { if (!composing(e) && e.key === 'Enter') { e.preventDefault(); commit(); letField(); sel = null; } }} />
          {/if}
        </label>
      {/each}
      </span>{/if}
      <span class="grp acts">
      {#each spot.acts as a (a.label)}
        <button type="button" class:danger={a.icon === 'trash'} aria-label={a.label} title={a.tab ? `${a.label} (Tab)` : a.label} disabled={a.off}
          onmousedown={(e) => e.preventDefault()} onclick={() => run(a)}>
          <svg viewBox="0 0 16 16">{@html ICONS[a.icon]}</svg>{#if a.tab}<span class="lbl">{a.label.replace(/^Add (an? )?/, '').replace(/ (after|under|beside|in|from) (it|them)$/, '').replace(/^./, (c) => c.toUpperCase())}</span>{/if}
        </button>
      {/each}
      </span>
    </div>
    {/if}
  {/if}
</div>

<style>
  .layer { position: absolute; inset: 0; pointer-events: none; z-index: var(--z-block-ui); }
  .layer > * { pointer-events: auto; }
  .ring { position: absolute; border-radius: 10px; box-shadow: 0 0 0 2px var(--accent); pointer-events: none; }
  .ring.soft { box-shadow: 0 0 0 1.5px var(--accent-soft); }
  .field {
    position: absolute; height: 34px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 14px; color: var(--fg); background: var(--bg-pop); box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0, 0, 0, 0.15); outline: none;
  }
  .field.wide { text-align: left; }
  .field.right { text-align: right; }
  :global(html.mobile) .field { font-size: 16px; height: 40px; } /* under 16px a phone zooms the page in on focus */
  .bar {
    position: absolute; display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: var(--pop-shadow), 0 0 0 0.5px var(--line); white-space: nowrap;
    width: max-content; max-width: calc(100% - 8px); box-sizing: border-box; flex-wrap: wrap; row-gap: 2px;
  }
  /* what it sets, then what it does: a row each when they don't fit one (wrapped anywhere, its last button stood
     alone on a second row) */
  .grp { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; } /* a phone's Gantt: its settings over rows of their own */
  .grp.acts { flex-wrap: nowrap; }
  .bar { column-gap: 12px; } /* between what it sets and what it does */
  .bar button {
    min-width: 30px; height: 30px; border: 0; border-radius: 8px; padding: 0 6px; background: none; color: var(--fg-dim);
    display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: 12.5px; font-weight: 500;
  }
  .bar button:disabled { opacity: 0.35; }
  .bar button:focus, .f :global(button:focus) { outline: none; box-shadow: 0 0 0 2px var(--accent); } /* (the mouse gives them none) */
  @media (hover: hover) { .bar button:not(:disabled):hover { background: var(--bg-hover); color: var(--fg); } .bar button.danger:hover { color: #ff453a; } }
  .bar button .lbl { margin-left: 4px; }
  .bar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .f { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--fg-dim); }
  .f input {
    height: 28px; box-sizing: border-box; border: 0; border-radius: 7px; padding: 0 7px; font: inherit; font-size: 13px;
    background: var(--bg-input); color: var(--fg); outline: none; max-width: 120px;
  }
  .f.top { align-items: flex-start; }
  .f textarea {
    width: 220px; box-sizing: border-box; border: 0; border-radius: 7px; padding: 5px 7px; font: inherit; font-size: 12.5px; line-height: 17px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--bg-input); color: var(--fg); outline: none; resize: none;
  }
  .f textarea:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .f input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .f :global(button) { height: 28px; }
  :global(html.mobile) .bar { gap: 2px; padding: 3px; }
  :global(html.mobile) .grp { gap: 2px; }
  :global(html.mobile) .f :global(button) { height: 36px; }
  .bar.docked { max-width: calc(100% - 8px); }
  :global(html.mobile) .bar button { min-width: 36px; height: 40px; padding: 0 4px; }
  :global(html.mobile) .f input { height: 36px; font-size: 16px; }
  :global(html.mobile) .f input[type='number'] { width: 64px; }
  :global(.dblock.active .mermaid-view [data-spot]) { cursor: text; }
</style>
