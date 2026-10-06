<script lang="ts">
  import { tick } from 'svelte';
  import { focusNote } from './lib/popup';
  import { notes } from './lib/notes.svelte';
  import { plain } from './lib/markdown';
  import { ui } from './lib/ui.svelte';
  import { dailyId, dayKey, keyOfDaily, monthGrid } from './lib/daily';
  import Icon from './Icon.svelte';

  /**
   * The daily notes as a month, in the editor's place and as wide as it, under a head like a note's (its
   * icon and name, both editable; the name is the sidebar's too). Each day shows the first line written
   * under its title; a day opens its note. Keys: arrows move a day / a week, ⌘← ⌘→ a month, Enter opens,
   * ⌫ deletes the day's note (asked first); a right-click (a long press on a phone) offers the same.
   */
  let { onpick, ontemplate }: { onpick: (key: string) => void; ontemplate: () => void } = $props();

  const today = dayKey(new Date());
  let cursor = $state(today); // the day under the keyboard
  const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const year = $derived(parse(cursor).getFullYear());
  const month = $derived(parse(cursor).getMonth());
  const cells = $derived(monthGrid(year, month));
  const title = $derived(new Date(year, month, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 27 + i).toLocaleDateString(undefined, { weekday: 'short' }));

  /** what a day says, under its title: the first line that has any text */
  const lines = $derived.by(() => {
    const m = new Map<string, string>();
    for (const n of notes.daily) {
      const first = n.body.split('\n').slice(1).map((l) => plain(l).trim()).find((l) => l && l !== '\u00a0');
      m.set(keyOfDaily(n.id), first ?? '');
    }
    return m;
  });

  let grid: HTMLDivElement;
  async function moveTo(key: string, focus = true) {
    cursor = key;
    await tick();
    if (focus) grid?.querySelector<HTMLElement>('.day.cursor')?.focus();
  }
  const shift = (days: number) => { const d = parse(cursor); d.setDate(d.getDate() + days); return dayKey(d); };
  /** the same day in another month, or its last day when it has fewer */
  const shiftMonth = (by: number) => {
    const d = parse(cursor), last = new Date(d.getFullYear(), d.getMonth() + by + 1, 0).getDate();
    return dayKey(new Date(d.getFullYear(), d.getMonth() + by, Math.min(d.getDate(), last)));
  };
  /** Delete a day's note, once asked; the keyboard goes back where it was. A day with no note has nothing to delete. */
  async function remove(key: string) {
    const n = notes.daily.find((x) => x.id === dailyId(key));
    if (!n) return;
    const when = parse(key).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    if (await ui.ask(`Delete the note for ${when}?`)) notes.remove(n.id);
    void moveTo(cursor);
  }
  /** A day's own menu: only a day with a note has one. It leaves the cursor alone, so a day of the month
   *  before or after does not turn the page under the menu. */
  function dayMenu(e: MouseEvent, key: string) {
    e.preventDefault();
    if (lines.has(key)) ui.openMenu(e, [{ label: 'Delete', danger: true, run: () => void remove(key) }]);
  }
  function onKey(e: KeyboardEvent) {
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      void remove(cursor);
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const to =
      e.key === 'ArrowLeft' ? (mod ? shiftMonth(-1) : shift(-1)) :
      e.key === 'ArrowRight' ? (mod ? shiftMonth(1) : shift(1)) :
      e.key === 'ArrowUp' && !mod ? shift(-7) :
      e.key === 'ArrowDown' && !mod ? shift(7) : null;
    if (!to) return;
    e.preventDefault();
    e.stopPropagation(); // ⌘← / ⌘→ are the app's back / forward everywhere else
    void moveTo(to);
  }

  // the head: name and icon, like a note's
  let renaming = $state(notes.calendar.name);
  $effect(() => { renaming = notes.calendar.name; });
  function rename() { if (renaming.trim() !== notes.calendar.name) notes.setCalendar({ name: renaming }); }
  async function changeIcon(anchor: HTMLElement) {
    const v = await ui.pickEmoji(anchor, notes.calendar.icon);
    if (v !== null) notes.setCalendar({ icon: v || '🗓️' });
    await tick();
    focusNote(); // back to the calendar's day
  }
</script>

<div class="calendar">
  <div class="head">
    <button class="big-icon" title="아이콘 변경" onclick={(e) => changeIcon(e.currentTarget)}><Icon icon={notes.calendar.icon} size={44} /></button>
    <input class="name" bind:value={renaming} onblur={rename} spellcheck="false" aria-label="Name"
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') renaming = notes.calendar.name; else rename(); void moveTo(cursor); } }} />
  </div>
  <div class="bar">
    <span class="month">{title}</span>
    <span class="gap"></span>
    <button class="tpl" onclick={ontemplate} data-tip="What a new day starts as">
      <svg viewBox="0 0 16 16"><path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5M5.5 8.5h5M5.5 11h3"/></svg>
      Template
    </button>
    <button class="nav" aria-label="Previous month" data-tip="Previous month" data-keys="Mod-ArrowLeft" onclick={() => moveTo(shiftMonth(-1), false)}><svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg></button>
    <button class="today-btn" onclick={() => moveTo(today)}>Today</button>
    <button class="nav" aria-label="Next month" data-tip="Next month" data-keys="Mod-ArrowRight" onclick={() => moveTo(shiftMonth(1), false)}><svg viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="grid" bind:this={grid} onkeydown={onKey}>
    {#each weekdays as w, i (i)}<span class="wd">{w}</span>{/each}
    {#each cells as c (c.key)}
      <button class="day" class:out={!c.inMonth} class:today={c.key === today} class:has={lines.has(c.key)} class:cursor={c.key === cursor}
        tabindex={c.key === cursor ? 0 : -1} onclick={() => { cursor = c.key; onpick(c.key); }} oncontextmenu={(e) => dayMenu(e, c.key)}>
        <span class="num">{Number(c.key.slice(8))}</span>
        {#if lines.get(c.key)}<span class="line">{lines.get(c.key)}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* the same top as a note's page, below the toolbar's fade */
  .calendar { height: 100%; box-sizing: border-box; display: flex; flex-direction: column; padding: 60px clamp(16px, 4vw, 48px) 24px; }
  /* a head like a note's: the icon, then the name as the page's title */
  .head { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-bottom: 18px; }
  .big-icon {
    border: 0; background: none; line-height: 1; padding: 4px; margin-left: -4px; border-radius: 10px; transition: background 0.12s, transform 0.12s;
  }
  .big-icon:hover { background: var(--bg-hover); }
  .big-icon:active { transform: scale(0.95); }
  .name {
    width: 100%; border: 0; outline: none; background: none; padding: 0; color: var(--fg);
    font: inherit; font-size: 1.9em; font-weight: 700; letter-spacing: -0.02em;
  }
  .bar { display: flex; align-items: center; gap: 2px; margin-bottom: 10px; }
  .month { font-size: 15px; font-weight: 600; color: var(--fg); }
  .gap { flex: 1; }
  .nav, .today-btn {
    height: 30px; border: 0; border-radius: 8px; background: none; color: var(--fg-dim); font: inherit; font-size: 13px;
    display: inline-flex; align-items: center; justify-content: center; transition: background 0.12s, color 0.12s;
  }
  .nav { width: 30px; }
  .tpl {
    height: 30px; padding: 0 10px 0 8px; margin-right: 8px; border: 0; border-radius: 8px; background: none; color: var(--fg-dim);
    font: inherit; font-size: 13px; display: inline-flex; align-items: center; gap: 5px;
  }
  .tpl:hover { background: var(--bg-hover); color: var(--fg); }
  :global(html.mobile) .tpl { height: 36px; font-size: 14px; margin-right: 2px; }
  .today-btn { padding: 0 12px; background: var(--bg-input); color: var(--fg); font-weight: 500; margin: 0 4px; }
  .nav:hover, .today-btn:hover { background: var(--bg-active); color: var(--fg); }
  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  /* no ruled lines: rounded days with air between them */
  .grid {
    flex: 1; min-height: 0; display: grid; gap: 6px;
    grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: auto repeat(6, minmax(0, 1fr));
  }
  .wd { padding: 0 10px 2px; font-size: 11.5px; font-weight: 500; color: var(--fg-dim); letter-spacing: 0.02em; }
  .day {
    display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-height: 64px; min-width: 0; padding: 8px 10px;
    border: 0; border-radius: 12px; background: none; color: var(--fg); font: inherit; text-align: left; overflow: hidden;
    transition: background 0.14s, transform 0.14s;
  }
  .day:hover { background: var(--bg-hover); }
  .day:focus { outline: none; }
  /* the day under the keyboard, whenever the keyboard is in the month (focus-visible is not dependable in
     WebKit after a focus() from script, which is how the arrows move it) */
  .grid:focus-within .day.cursor { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
  .day:active { transform: scale(0.98); }
  /* a day with its note: a small blue dot beside the number */
  .num { position: relative; }
  .day.has .num::after {
    content: ''; position: absolute; top: 50%; right: -8px; width: 5px; height: 5px; margin-top: -2.5px;
    border-radius: 50%; background: var(--accent);
  }
  .num {
    width: 26px; height: 26px; margin-left: -5px; border-radius: 50%; line-height: 26px; text-align: center;
    font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums;
  }
  .day.out { opacity: 0.35; }
  .day.today .num { background: var(--accent); color: #fff; font-weight: 600; }
  .line {
    font-size: 12px; line-height: 1.4; color: var(--fg-dim); overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; word-break: break-word;
  }
  /* a phone: the month fits the screen, a day shows its number and a line */
  :global(html.mobile) .calendar { padding: 12px 12px 16px; }
  :global(html.mobile) .calendar { padding-top: 14px; }
  :global(html.mobile) .name { font-size: 1.65em; }
  :global(html.mobile) .month { font-size: 16px; }
  :global(html.mobile) .nav { width: 40px; height: 40px; border-radius: 12px; }
  :global(html.mobile) .today-btn { height: 36px; font-size: 14px; border-radius: 10px; }
  :global(html.mobile) .grid { gap: 4px; }
  :global(html.mobile) .day:hover { background: none; } /* a tap leaves no hover behind */
  :global(html.mobile) .day { min-height: 0; padding: 5px 3px; gap: 2px; border-radius: 10px; align-items: center; }
  :global(html.mobile) .wd { padding: 0; font-size: 11px; text-align: center; }
  :global(html.mobile) .num { margin: 0; width: 26px; height: 26px; line-height: 26px; font-size: 13.5px; }
  /* under the number on a phone: the cell is narrow */
  :global(html.mobile) .day.has .num::after { top: auto; bottom: -5px; right: 50%; margin: 0 -2.5px 0 0; width: 4px; height: 4px; }
  :global(html.mobile) .line { font-size: 10px; -webkit-line-clamp: 2; line-clamp: 2; text-align: center; }
</style>
