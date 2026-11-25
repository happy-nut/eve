<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Diagram } from './lib/diagram';
  import { spotOf, type Act, type Icon } from './lib/spots';
  import { ICONS as LINE } from './lib/lineIcons';
  import { letGo } from './lib/focusWatch';
  import { composing } from './lib/keys';
  import { isMobile } from './lib/platform';
  import { floatAt, screenInsets, viewSize } from './lib/popup';
  import { textW } from './lib/lanes';
  import { held } from './lib/chartHues';
  import Select from './Select.svelte';

  let { d, host, version, pick = null, pickField = null }: { d: Diagram; host: HTMLElement; version: string; pick?: string | null; pickField?: string | null } = $props();

  type Rect = { x: number; y: number; w: number; h: number };
  let layer = $state<HTMLDivElement>(null!);
  let sel = $state<string | null>(null), text = $state(''), before = '';
  let rect = $state<Rect | null>(null), hover = $state<Rect | null>(null);
  let bar = $state<HTMLDivElement | null>(null), barAt = $state({ left: 0, top: 0 });
  const spot = $derived(sel ? spotOf(d, sel) : null);

  const find = (key: string) => {
    const all = [...host.querySelectorAll(`[data-spot="${CSS.escape(key)}"]`)].sort((a, b) => +a.hasAttribute('data-field') - +b.hasAttribute('data-field'));
    const el = all.find((x) => x.textContent?.trim()) ?? all[0] ?? null;
    return el?.querySelector(':scope > g.label-group, :scope > g.label.name, :scope > text.actor-man') ?? el;
  };
  function box(el: Element): Rect {
    let r = el.getBoundingClientRect();
    if (el instanceof HTMLElement && el.textContent?.trim()) { const g = document.createRange(); g.selectNodeContents(el); const t = g.getBoundingClientRect(); if (t.width) r = t; }
    const o = layer.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  }
  let unseen = false;
  let fresh: string | null = null, addedIn: string | null = null;
  let field = $state<HTMLInputElement | null>(null);
  let was: Record<string, unknown> | null = null;
  let grab = false, renamed = false, deciding = false;
  let docked = $state(false), barMax = $state(0);
  let tallest = 0, wide = 0, measured: string | null = null;
  function measureSelection() {
    if (!layer) return;
    const el = sel ? find(sel) : null;
    rect = el ? box(el) : renamed || (rect && sel === measured) ? rect : null;
    measured = sel;
    if (el) renamed = false;
    if (el && (unseen || (addedIn !== null && addedIn !== version))) { unseen = false; addedIn = null; el.scrollIntoView?.({ block: 'center', inline: 'center' }); }
    tick().then(placeBar);
  }
  $effect(() => { void version; void sel; tick().then(measureSelection); });
  function pinMindmapBranchSides() {
    if (d.kind !== 'mindmap') return;
    const root = host.querySelector('[data-spot="root"]')?.getBoundingClientRect();
    if (!root) return;
    for (const g of host.querySelectorAll('g.mm-l1')) {
      const r = g.getBoundingClientRect(), t = g.textContent?.trim();
      if (t && !held.sides.has(t)) held.sides.set(t, r.left + r.width / 2 > root.left + root.width / 2);
    }
  }
  $effect(() => { void version; tick().then(pinMindmapBranchSides); });
  $effect(() => { if (!sel) held.hues.clear(); });
  let said = '';

  function select(key: string | null) {
    if (key === sel) return;
    commit();
    sel = key;
    const s = key ? spotOf(d, key) : null;
    if (key && !s) sel = null;
    text = before = said = s?.text ?? '';
    was = sel ? $state.snapshot(d) as Record<string, unknown> : null;
    held.hues.clear();
    const tone = sel && /^(slice|branch):/.test(sel) ? / c(\d+)\b/.exec(` ${find(sel)?.getAttribute('class') ?? ''} ${find(sel)?.querySelector('.dot')?.getAttribute('class') ?? ''}`) : null;
    if (sel && tone) held.hues.set(sel, +tone[1]);
    grab = !!sel;
    deciding = true;
    hover = null;
    if (sel) {
      const el = find(sel);
      if (el) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      unseen = !el;
    } else letField();
    fresh = null;
  }
  function commit() {
    const s = spot;
    if (!s || !sel) return;
    if (s.commitOnDone && text.trim() && text !== before) {
      const k = s.set(text.trim());
      if (k) { renamed = k !== sel; sel = k; }
      before = text;
    }
  }
  function typed() {
    const s = spot;
    if (held.sides.has(said.trim())) { const side = held.sides.get(said.trim())!; held.sides.delete(said.trim()); held.sides.set(text.trim(), side); }
    said = text;
    if (s && !s.commitOnDone) s.set(text);
  }
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
  export function escape(): boolean {
    if (!sel) return false;
    if (bar?.contains(document.activeElement) && field) { field.focus({ preventScroll: true }); return true; }
    const s = spot;
    if (s && fresh === sel) s.acts.find((x) => x.icon === 'trash' && !x.off)?.run();
    else if (was && JSON.stringify($state.snapshot(d)) !== JSON.stringify(was)) {
      const live = d as unknown as Record<string, unknown>;
      for (const k of Object.keys(live)) if (!(k in was)) delete live[k];
      Object.assign(live, structuredClone(was));
    }
    text = before;
    fresh = null;
    letField();
    sel = null;
    return true;
  }
  export function kept(turn: () => void) {
    const before = $state.snapshot(d) as Record<string, unknown>;
    turn();
    if (!was) return;
    const live = $state.snapshot(d) as Record<string, unknown>;
    for (const k of new Set([...Object.keys(live), ...Object.keys(before)])) if (JSON.stringify(live[k]) !== JSON.stringify(before[k])) was[k] = structuredClone(live[k]);
  }
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
  const chose = () => tick().then(() => { if (!field) return; field.focus({ preventScroll: true }); field.setSelectionRange(field.value.length, field.value.length); });
  function finishTyping(e: KeyboardEvent) {
    e.preventDefault();
    if (!text.trim() && before.trim()) { text = before; spot?.set(before); }
    fresh = null;
    commit(); letField(); sel = null;
  }
  function backIntoBar(e: KeyboardEvent) {
    const first = bar?.querySelector<HTMLElement>('button:not(:disabled), input, textarea');
    if (first) { e.preventDefault(); first.focus(); if (first instanceof HTMLInputElement) first.select(); }
  }
  function runTabActOrCycleKind(e: KeyboardEvent) {
    const a = spot?.acts.find((x) => x.onTab && !x.off);
    const kind = !a ? spot?.fields.find((f) => f.kind === 'select') : null;
    if (kind && kind.kind === 'select' && kind.options.length > 1) {
      e.preventDefault();
      const i = kind.options.findIndex(([v]) => v === kind.value);
      kind.set(kind.options[(i + 1) % kind.options.length][0]);
      return;
    }
    if (a && fresh === sel && text === before) e.preventDefault();
    else if (a) { e.preventDefault(); void run(a); }
  }
  function onKey(e: KeyboardEvent) {
    if (composing(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) finishTyping(e);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); escape(); }
    else if (e.key === 'Tab' && e.shiftKey) backIntoBar(e);
    else if (e.key === 'Tab') runTabActOrCycleKind(e);
  }

  function onHostClick(e: MouseEvent) {
    const t = e.target as Element;
    if (layer.contains(t)) return;
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
    if (key && key === sel) field?.focus({ preventScroll: true });
    else select(key);
    const want = el?.getAttribute('data-field');
    if (key && want) openField(want);
  }
  function openField(want: string) {
    tick().then(() => tick()).then(() => {
      const c = bar?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(want)}"]`);
      if (c instanceof HTMLInputElement) { c.focus({ preventScroll: true }); c.select(); } else c?.click();
    });
  }
  function onHostMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest?.('[data-spot]');
    hover = el && host.contains(el) && el.getAttribute('data-spot') !== sel && !layer.contains(e.target as Node) ? box(el) : null;
  }

  type Placing = {
    o: DOMRect; W: number; H: number; size: { w: number; h: number };
    fieldTop: number; fieldBottom: number; around: Box; within: Box; covers: (f: { left: number; top: number }) => number;
  };
  type Box = { left: number; top: number; right: number; bottom: number };
  const KEYBOARD_UP_PX = 120;
  function phoneKeyboardHeight() {
    const win = viewSize();
    if (win.w !== wide) { wide = win.w; tallest = 0; }
    tallest = Math.max(tallest, win.h);
    return isMobile ? Math.max(screenInsets().bottom - 64, tallest - win.h) : 0;
  }
  function scrollFieldAbove(under: number) {
    if (under <= 0) return;
    let sc: HTMLElement | null = layer.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if (sc) sc.scrollTop += under;
  }
  function dockAboveKeyboard(p: Placing) {
    docked = true;
    barMax = p.W - 8;
    const top = viewSize().h - screenInsets().bottom - p.o.top - p.size.h - 4;
    barAt = { left: 4, top };
    scrollFieldAbove(p.fieldBottom + 8 - top);
  }
  function dockBelowOrAboveField(p: Placing) {
    const { o, W, H, size, fieldTop, fieldBottom, covers } = p;
    const seen = viewSize().h - screenInsets().bottom - o.top - size.h - 8, top0 = screenInsets().top - o.top + 4;
    const offField = (t: number) => t >= fieldBottom + 6 || t + size.h <= fieldTop - 6;
    const underDrawing = Math.min(H - (parseFloat(getComputedStyle(host).paddingBottom) || 0) + 6, seen);
    const tops = [underDrawing, fieldBottom + 8, fieldTop - size.h - 8, Math.min(H + 4, seen)]
      .filter((t) => t >= top0 && t <= seen && offField(t));
    const cost = (t: number) => covers({ left: o.left + fieldLeft, top: o.top + t }) * 1e5 + Math.abs(t - fieldTop);
    const top = tops.length ? tops.reduce((a, t) => (cost(t) < cost(a) ? t : a)) : fieldTop - size.h - 8;
    const stop = [...(layer.parentElement?.parentElement?.querySelectorAll('.mermaid-expand, .mermaid-play, .dock') ?? [])].map((b) => b.getBoundingClientRect())
      .filter((q) => q.top < o.top + top + size.h && q.bottom > o.top + top && q.left - o.left > 200).map((q) => q.left - o.left - 8);
    barMax = Math.max(160, Math.min(W - 8, ...stop) - 4);
    const w = Math.min(size.w, barMax);
    barAt = { left: Math.max(4, Math.min(fieldLeft, 4 + barMax - w)), top };
  }
  function leastCoveringPlace(p: Placing) {
    const { o, size, fieldTop, fieldBottom, around, within, covers } = p;
    const beside = { left: o.left + fieldLeft, right: o.left + fieldLeft + fieldW, top: o.top + fieldTop - (size.h - (fieldBottom - fieldTop)) / 2, bottom: o.top + fieldBottom };
    const tries = [
      floatAt(beside, size, { prefer: 'side', within, gap: 6 }),
      floatAt(around, size, { prefer: 'below', within, gap: 8, align: 'start' }),
      floatAt(around, size, { prefer: 'above', within, gap: 8, align: 'start' }),
    ].filter((f, i) => (i === 0 ? f.side === 'right' || f.side === 'left' : f.side !== 'inside'));
    return tries.reduce<(typeof tries)[number] | null>((a, f) => (!a || covers(f) < covers(a) ? f : a), null);
  }
  function placeBar() {
    if (!layer || !bar) return;
    const o = layer.getBoundingClientRect(), W = layer.clientWidth, H = layer.clientHeight;
    const r = rect ?? { x: 8, y: 8, w: 140, h: 32 };
    const within = { left: o.left + 4, top: o.top + 4, right: o.left + W - 4, bottom: o.top + H - 4 };
    const half = isMobile ? 20 : 17, fieldTop = r.y + r.h / 2 - half, fieldBottom = fieldTop + half * 2;
    const size = { w: bar.offsetWidth, h: bar.offsetHeight };
    const around = { left: o.left + r.x, right: o.left + r.x + r.w, top: o.top + Math.min(r.y, fieldTop), bottom: o.top + Math.max(r.y + r.h, fieldBottom) };
    const others = [...host.querySelectorAll('[data-spot]'), ...(host.parentElement?.querySelectorAll('.mermaid-expand, .mermaid-play, .dock') ?? [])]
      .filter((el) => el.getAttribute('data-spot') !== sel).map((el) => el.getBoundingClientRect());
    const covers = (f: { left: number; top: number }) => others.filter((q) => q.width && q.left < f.left + size.w && q.right > f.left && q.top < f.top + size.h && q.bottom > f.top).length;
    const p: Placing = { o, W, H, size, fieldTop, fieldBottom, around, within, covers };
    const best = leastCoveringPlace(p);
    if (phoneKeyboardHeight() > KEYBOARD_UP_PX) return dockAboveKeyboard(p);
    if (deciding && rect) { deciding = false; docked = !best || covers(best) > 0; }
    if (docked) return dockBelowOrAboveField(p);
    const f = best ?? floatAt(around, size, { prefer: 'below', within, gap: 8, align: 'start' });
    const at = f.side === 'inside' ? { left: r.x, top: r.y + r.h + 8 } : { left: f.left - o.left, top: f.top - o.top };
    barAt = { left: Math.max(4, Math.min(W - size.w - 4, at.left)), top: at.top };
  }
  $effect(() => { void spot; void rect; tick().then(placeBar); });

  function resized() {
    const el = sel ? find(sel) : null;
    if (el) {
      const r = el.getBoundingClientRect(), bottom = viewSize().h - screenInsets().bottom;
      if (r.bottom + 24 > bottom || r.top < screenInsets().top) el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
      deciding = true;
    }
    measureSelection();
  }
  const barRo = new ResizeObserver(() => requestAnimationFrame(placeBar));
  $effect(() => { if (bar) { barRo.observe(bar); return () => bar && barRo.unobserve(bar); } });
  onMount(() => {
    host.addEventListener('click', onHostClick);
    host.addEventListener('pointermove', onHostMove);
    const out = () => (hover = null);
    host.addEventListener('pointerleave', out);
    host.addEventListener('scroll', measureSelection, { passive: true });
    const ro = new ResizeObserver(() => measureSelection());
    ro.observe(host);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', resized);
    window.addEventListener('resize', resized);
    document.addEventListener('scroll', measureSelection, { passive: true, capture: true });
    untrack(() => { if (pick) tick().then(() => { select(pick); if (pickField) openField(pickField); }); });
    return () => {
      held.hues.clear();
      held.sides.clear();
      host.removeEventListener('click', onHostClick);
      host.removeEventListener('pointermove', onHostMove);
      host.removeEventListener('pointerleave', out);
      host.removeEventListener('scroll', measureSelection);
      vv?.removeEventListener('resize', resized);
      window.removeEventListener('resize', resized);
      document.removeEventListener('scroll', measureSelection, { capture: true });
      ro.disconnect();
      barRo.disconnect();
    };
  });

  const ICONS: Record<Icon, string> = {
    plus: LINE.plus,
    child: '<path d="M3.5 3v5.5a2 2 0 0 0 2 2H12M9.5 8l2.5 2.5L9.5 13" />',
    up: '<path d="M4.5 9.5 8 6l3.5 3.5" />',
    down: '<path d="M4.5 6.5 8 10l3.5-3.5" />',
    left: '<path d="M9.5 4.5 6 8l3.5 3.5" />',
    right: '<path d="M6.5 4.5 10 8l-3.5 3.5" />',
    trash: LINE.trash,
    note: '<path d="M3.5 2.5h9v7l-3 3h-6z M9.5 12.5v-3h3" />',
    section: '<path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h7" />',
  };
  const fieldW = $derived(Math.min(Math.max((rect?.w ?? 0) + 12, 72, Math.min(textW(text, isMobile ? 16 : 14) + 32, Math.max(320, (rect?.w ?? 0) + 12))), (layer?.clientWidth ?? 600) - 8));
  type FieldAlign = 'left' | 'right' | 'centre';
  const WIDE_SPOT_PX = 120;
  function fieldAlign(el: Element | null | undefined | ''): FieldAlign {
    if (!(el instanceof HTMLElement)) return 'centre';
    const ta = getComputedStyle(el).textAlign;
    if (/^(left|start)$/.test(ta) || el.getBoundingClientRect().width + 12 >= WIDE_SPOT_PX) return 'left';
    return /^(right|end)$/.test(ta) ? 'right' : 'centre';
  }
  let align = $state<FieldAlign>('centre');
  $effect(() => { void rect; align = fieldAlign(sel && find(sel)); });
  const fieldLeft = $derived.by(() => {
    if (align === 'right' && rect) return Math.max(4, rect.x + rect.w + 6 - fieldW);
    const want = !rect ? 8 : align === 'left' ? rect.x - 6 : rect.x + rect.w / 2 - fieldW / 2;
    return Math.max(4, Math.min((layer?.clientWidth ?? 600) - fieldW - 4, want));
  });
</script>

<div class="layer" bind:this={layer}>
  {#if hover}
    <div class="ring soft" style:left={`${hover.x - 3}px`} style:top={`${hover.y - 3}px`} style:width={`${hover.w + 6}px`} style:height={`${hover.h + 6}px`}></div>
  {/if}
  {#if sel && spot}
    {#key sel}
    <input class="field" bind:this={field} style:opacity={rect ? null : 0} class:wide={!!rect && align === 'left'} class:right={align === 'right'} bind:value={text} aria-label={spot.label} placeholder={spot.label} oninput={typed} onkeydown={onKey} onblur={commit}
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
            <Select label={f.label} value={f.value} options={f.options} onchange={(v) => f.set(v)} onclosed={chose} />
          {:else if f.kind === 'lines'}
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
        <button type="button" class:danger={a.icon === 'trash'} aria-label={a.label} title={a.onTab ? `${a.label} (Tab)` : a.label} disabled={a.off}
          onmousedown={(e) => e.preventDefault()} onclick={() => run(a)}>
          <svg viewBox="0 0 16 16">{@html ICONS[a.icon]}</svg>{#if a.onTab}<span class="lbl">{a.label.replace(/^Add (an? )?/, '').replace(/ (after|under|beside|in|from) (it|them)$/, '').replace(/^./, (c) => c.toUpperCase())}</span>{/if}
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
  :global(html.mobile) .field { font-size: 16px; height: 40px; }
  .bar {
    position: absolute; display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: var(--pop-shadow), 0 0 0 0.5px var(--line); white-space: nowrap;
    width: max-content; max-width: calc(100% - 8px); box-sizing: border-box; flex-wrap: wrap; row-gap: 2px;
  }
  .grp { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .grp.acts { flex-wrap: nowrap; }
  .bar { column-gap: 12px; }
  .bar button {
    min-width: 30px; height: 30px; border: 0; border-radius: 8px; padding: 0 6px; background: none; color: var(--fg-dim);
    display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: 12.5px; font-weight: 500;
  }
  .bar button:disabled { opacity: 0.35; }
  .bar button:focus, .f :global(button:focus) { outline: none; box-shadow: 0 0 0 2px var(--accent); }
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
