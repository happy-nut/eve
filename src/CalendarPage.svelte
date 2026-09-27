<script lang="ts">
  import { notes } from './lib/notes.svelte';
  import { plain } from './lib/markdown';
  import { dayKey, keyOfDaily, monthGrid } from './lib/daily';

  /**
   * The daily notes as a month, in the editor's place and as wide as it: each day shows the first
   * line written under its title. A day opens its note (started from the template if there is none).
   */
  let { onpick, ontemplate }: { onpick: (key: string) => void; ontemplate: () => void } = $props();

  const today = dayKey(new Date());
  let shown = $state(new Date());
  const year = $derived(shown.getFullYear());
  const month = $derived(shown.getMonth());
  const cells = $derived(monthGrid(year, month));
  const title = $derived(shown.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 27 + i).toLocaleDateString(undefined, { weekday: 'short' }));

  /** what a day says, under its title: the first line that has any text */
  const lines = $derived.by(() => {
    const m = new Map<string, string>();
    for (const n of notes.daily) {
      const first = n.body.split('\n').slice(1).map((l) => plain(l).trim()).find((l) => l && l !== ' ');
      m.set(keyOfDaily(n.id), first ?? '');
    }
    return m;
  });

  const step = (d: number) => (shown = new Date(year, month + d, 1));
</script>

<div class="calendar">
  <header>
    <h1>{title}</h1>
    <span class="gap"></span>
    <button class="tpl" onclick={ontemplate} data-tip="What a new day starts as">
      <svg viewBox="0 0 16 16"><path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"/><path d="M9 1.5V5h3.5M5.5 8.5h5M5.5 11h3"/></svg>
      Template
    </button>
    <button class="nav" aria-label="Previous month" onclick={() => step(-1)}><svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg></button>
    <button class="today-btn" onclick={() => (shown = new Date())}>Today</button>
    <button class="nav" aria-label="Next month" onclick={() => step(1)}><svg viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>
  </header>
  <div class="grid">
    {#each weekdays as w, i (i)}<span class="wd">{w}</span>{/each}
    {#each cells as c (c.key)}
      <button class="day" class:out={!c.inMonth} class:today={c.key === today} class:has={lines.has(c.key)} onclick={() => onpick(c.key)}>
        <span class="num">{Number(c.key.slice(8))}</span>
        {#if lines.get(c.key)}<span class="line">{lines.get(c.key)}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .calendar { height: 100%; box-sizing: border-box; display: flex; flex-direction: column; padding: 44px clamp(16px, 4vw, 48px) 24px; }
  header { display: flex; align-items: center; gap: 2px; margin-bottom: 14px; }
  h1 { margin: 0; font-size: 1.6em; font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
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
  :global(html.mobile) h1 { font-size: 22px; }
  :global(html.mobile) .nav { width: 40px; height: 40px; border-radius: 12px; }
  :global(html.mobile) .today-btn { height: 36px; font-size: 14px; border-radius: 10px; }
  :global(html.mobile) .grid { gap: 4px; }
  :global(html.mobile) .day { min-height: 0; padding: 5px 3px; gap: 2px; border-radius: 10px; align-items: center; }
  :global(html.mobile) .wd { padding: 0; font-size: 11px; text-align: center; }
  :global(html.mobile) .num { margin: 0; width: 26px; height: 26px; line-height: 26px; font-size: 13.5px; }
  /* under the number on a phone: the cell is narrow */
  :global(html.mobile) .day.has .num::after { top: auto; bottom: -5px; right: 50%; margin: 0 -2.5px 0 0; width: 4px; height: 4px; }
  :global(html.mobile) .line { font-size: 10px; -webkit-line-clamp: 2; line-clamp: 2; text-align: center; }
</style>
