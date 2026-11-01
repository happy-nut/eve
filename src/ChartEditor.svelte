<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Diagram } from './lib/diagram';
  import { spotOf, type Act, type Icon } from './lib/spots';
  import { letGo } from './lib/focusWatch';
  import { composing } from './lib/keys';
  import { isMobile } from './lib/platform';
  import { floatAt } from './lib/popup';
  import Select from './Select.svelte';

  /**
   * Any chart but a flowchart edited on its own picture: a click on a part of it (a slice, a task, an idea, a message,
   * a class, a column) types in it right where it is drawn, and a bar beside it holds the rest of that part (its value,
   * dates, arrow, shape) and what can be done from it (the next one, moving it, deleting it). What each part is and
   * does is spots.ts's; the drawing marks its parts with their keys (`data-spot`). The chart draws again as it is
   * typed in, and the field follows its part.
   *   keys while typing: Enter is done, Tab adds the next one (the bar's first +) and types in it, Esc puts it back
   */
  let { d, host, version, pick = null }: { d: Diagram; host: HTMLElement; version: string; pick?: string | null } = $props();

  type Rect = { x: number; y: number; w: number; h: number };
  let layer = $state<HTMLDivElement>(null!);
  let sel = $state<string | null>(null), text = $state(''), before = '';
  let rect = $state<Rect | null>(null), hover = $state<Rect | null>(null);
  let bar = $state<HTMLDivElement | null>(null), barAt = $state({ left: 0, top: 0 });
  const spot = $derived(sel ? spotOf(d, sel) : null);

  /** a part's drawing: where it is drawn twice (a slice and its row, a task's name and its bar), the one with its words */
  const find = (key: string) => { const all = [...host.querySelectorAll(`[data-spot="${CSS.escape(key)}"]`)]; return all.find((el) => el.textContent?.trim()) ?? all[0] ?? null; };
  function box(el: Element): Rect {
    const o = layer.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  }
  function measure() {
    if (!layer) return;
    const el = sel ? find(sel) : null;
    rect = el ? box(el) : null;
    tick().then(placeBar);
  }
  $effect(() => { void version; void sel; tick().then(measure); });

  /** a part to type in: what was being typed is kept first */
  function select(key: string | null) {
    if (key === sel) return;
    commit();
    sel = key;
    const s = key ? spotOf(d, key) : null;
    if (key && !s) sel = null;
    text = before = s?.text ?? '';
    if (sel) {
      // its part brought into the card (the picture scrolls sideways in it)
      const el = find(sel);
      if (el) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } else letField();
  }
  /** what was typed, kept: a name that renames what it is comes in only now (its key with it) */
  function commit() {
    const s = spot;
    if (!s || !sel) return;
    if (s.onDone && text.trim() && text !== before) {
      const k = s.set(text.trim());
      if (k) sel = k;
      before = text;
    }
  }
  function typed() {
    const s = spot;
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
    if (k) { await tick(); select(k); }
  }
  /** Esc from the note: what is being typed in let go first; true when there was something */
  export function escape(): boolean {
    if (!sel) return false;
    const s = spot;
    if (s && !s.onDone && text !== before) s.set(before);
    letField();
    sel = null;
    return true;
  }
  /** a part typed in at once (the chart's own "+ Part") */
  export function open(key: string | null) { if (key) { sel = null; tick().then(() => select(key)); } }

  function onKey(e: KeyboardEvent) {
    if (composing(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); letField(); sel = null; }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); escape(); }
    else if (e.key === 'Tab' && !e.shiftKey) {
      const a = spot?.acts.find((x) => x.tab && !x.off);
      if (a) { e.preventDefault(); void run(a); }
    }
  }

  function onHostClick(e: MouseEvent) {
    const t = e.target as Element;
    if (layer.contains(t)) return;
    const el = t.closest?.('[data-spot]');
    select(el && host.contains(el) ? el.getAttribute('data-spot') : null);
  }
  function onHostMove(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest?.('[data-spot]');
    hover = el && host.contains(el) && el.getAttribute('data-spot') !== sel ? box(el) : null;
  }

  /** the bar under the part (over it near the picture's foot), inside the picture */
  function placeBar() {
    if (!layer || !bar) return;
    const o = layer.getBoundingClientRect(), W = layer.clientWidth, H = layer.clientHeight;
    const r = rect ?? { x: 8, y: 8, w: 140, h: 32 };
    const within = { left: o.left + 4, top: o.top + 4, right: o.left + W - 4, bottom: o.top + H - 4 };
    // under the field, which may be lower than the part's middle (a part shorter than the field)
    const half = isMobile ? 20 : 17, fieldTop = r.y + r.h / 2 - half;
    const anchor = { left: o.left + r.x, right: o.left + r.x + r.w, top: o.top + Math.min(r.y, fieldTop), bottom: o.top + Math.max(r.y + r.h, fieldTop + half * 2) };
    const f = floatAt(anchor, { w: bar.offsetWidth, h: bar.offsetHeight }, { prefer: 'below', within, gap: 8, align: 'start' });
    barAt = f.side === 'inside' ? { left: Math.max(4, Math.min(W - bar.offsetWidth - 4, r.x)), top: r.y + r.h + 8 } : { left: f.left - o.left, top: f.top - o.top };
  }
  $effect(() => { void spot; void rect; tick().then(placeBar); });

  onMount(() => {
    host.addEventListener('click', onHostClick);
    host.addEventListener('pointermove', onHostMove);
    const out = () => (hover = null);
    host.addEventListener('pointerleave', out);
    host.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    // the part the click that opened the chart landed on
    untrack(() => { if (pick) tick().then(() => select(pick)); });
    return () => {
      host.removeEventListener('click', onHostClick);
      host.removeEventListener('pointermove', onHostMove);
      host.removeEventListener('pointerleave', out);
      host.removeEventListener('scroll', measure);
      ro.disconnect();
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
  // the field as wide as its part, at least a few words' room, inside the picture
  const fieldW = $derived(Math.min(Math.max((rect?.w ?? 0) + 12, 150), (layer?.clientWidth ?? 600) - 8));
  /** a part wider than a field's least (a timeline's event, a task's name) has its field from its own left edge, the
   *  words where they were; a small one (a word on a line, an idea) has it centred on it */
  const wideSpot = $derived(!!rect && rect.w + 12 >= 150);
  const fieldLeft = $derived(Math.max(4, Math.min((layer?.clientWidth ?? 600) - fieldW - 4, rect ? (wideSpot ? rect.x - 6 : rect.x + rect.w / 2 - fieldW / 2) : 8)));
</script>

<div class="layer" bind:this={layer}>
  {#if hover}
    <div class="ring soft" style:left={`${hover.x - 3}px`} style:top={`${hover.y - 3}px`} style:width={`${hover.w + 6}px`} style:height={`${hover.h + 6}px`}></div>
  {/if}
  {#if sel && spot}
    {#if rect}<div class="ring" style:left={`${rect.x - 3}px`} style:top={`${rect.y - 3}px`} style:width={`${rect.w + 6}px`} style:height={`${rect.h + 6}px`}></div>{/if}
    <input class="field" class:wide={wideSpot} bind:value={text} aria-label={spot.label} placeholder={spot.label} oninput={typed} onkeydown={onKey} onblur={commit}
      style:left={`${fieldLeft}px`} style:top={`${rect ? rect.y + rect.h / 2 - (isMobile ? 20 : 17) : 8}px`} style:width={`${fieldW}px`}
      {@attach (el: HTMLInputElement) => { el.focus({ preventScroll: true }); el.select(); }} />
    {#if spot.fields.length || spot.acts.length}
    <div class="bar" bind:this={bar} style:left={`${barAt.left}px`} style:top={`${barAt.top}px`}>
      {#each spot.fields as f (f.label)}
        <label class="f" class:top={f.kind === 'lines'}>
          <span>{f.label}</span>
          {#if f.kind === 'select'}
            <Select label={f.label} value={f.value} options={f.options} onchange={(v) => f.set(v)} />
          {:else if f.kind === 'lines'}
            <textarea value={f.value} rows={Math.min(6, Math.max(2, f.value.split('\n').length + 1))} placeholder="One per line" spellcheck="false"
              oninput={(e) => f.set(e.currentTarget.value)}></textarea>
          {:else}
            <input type={f.kind} value={f.value} size={f.kind === 'number' ? 5 : undefined} onchange={(e) => f.set(e.currentTarget.value)}
              oninput={(e) => { if (f.kind !== 'date') f.set(e.currentTarget.value); }}
              onkeydown={(e) => { if (!composing(e) && e.key === 'Enter') { e.preventDefault(); commit(); letField(); sel = null; } }} />
          {/if}
        </label>
      {/each}
      {#if spot.fields.length}<span class="sep"></span>{/if}
      {#each spot.acts as a (a.label)}
        <button type="button" class:danger={a.icon === 'trash'} aria-label={a.label} title={a.tab ? `${a.label} (Tab)` : a.label} disabled={a.off}
          onmousedown={(e) => e.preventDefault()} onclick={() => run(a)}>
          <svg viewBox="0 0 16 16">{@html ICONS[a.icon]}</svg>{#if a.tab}<span class="lbl">{a.label.replace(/^Add (an? )?/, '').replace(/ (after|under|beside|in|from) (it|them)$/, '').replace(/^./, (c) => c.toUpperCase())}</span>{/if}
        </button>
      {/each}
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
  :global(html.mobile) .field { font-size: 16px; height: 40px; } /* under 16px a phone zooms the page in on focus */
  .bar {
    position: absolute; display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 12px;
    background: var(--bg-pop); box-shadow: var(--pop-shadow), 0 0 0 0.5px var(--line); white-space: nowrap;
    width: max-content; max-width: calc(100% - 8px); flex-wrap: wrap; box-sizing: border-box;
  }
  .bar button {
    min-width: 30px; height: 30px; border: 0; border-radius: 8px; padding: 0 6px; background: none; color: var(--fg-dim);
    display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: 12.5px; font-weight: 500;
  }
  .bar button:disabled { opacity: 0.35; }
  @media (hover: hover) { .bar button:not(:disabled):hover { background: var(--bg-hover); color: var(--fg); } .bar button.danger:hover { color: #ff453a; } }
  .bar button .lbl { margin-left: 4px; }
  .bar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .sep { width: 1px; height: 18px; background: var(--line); margin: 0 2px; }
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
  :global(html.mobile) .bar button { min-width: 40px; height: 40px; }
  :global(html.mobile) .f input { height: 36px; font-size: 16px; }
  :global(.dblock.active .mermaid-view [data-spot]) { cursor: text; }
</style>
