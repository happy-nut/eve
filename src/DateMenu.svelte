<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { CalendarUI } from './lib/editor';
  import { dateLabel, isoDay, monthGrid, monthName, sameMonth, shiftDays, shiftMonths, weekdayNames } from './lib/date';

  // the calendar behind `@`: one month, a cursor on a day. The editor drives it through `ui`
  // (bind:this to reach it), the same way the [[ and / popup is driven.
  let day = $state(''); // the day under the cursor — '' is how this popup is closed
  let today = $state('');
  let pos = $state({ x: 0, y: 0 });
  let pick: (iso: string) => void = () => {};

  const names = weekdayNames();
  const weeks = $derived(day ? monthGrid(day) : []);

  export const ui: CalendarUI = {
    show(iso, rect, cb) {
      day = iso ?? '';
      today = isoDay(new Date()); // read on every open, so an app left running overnight still knows
      pick = cb;
      if (rect) pos = { x: rect.left, y: rect.bottom + 4 };
    },
    move: (n) => { if (day) day = shiftDays(day, n); },
    month: (n) => { if (day) day = shiftMonths(day, n); },
    select: () => { if (!day) return false; pick(day); return true; },
    hide: () => { day = ''; },
    visible: () => !!day,
  };

  // mousedown, not click: a click would take focus out of the editor before the day is picked
  const grab = (run: () => void) => (e: MouseEvent) => { e.preventDefault(); run(); };
</script>

{#if day}
  <div class="cal" style="left:{pos.x}px; top:{pos.y}px" transition:fly={{ y: 4, duration: 120 }}>
    <div class="cal-bar">
      <button class="cal-step" aria-label="Previous month" onmousedown={grab(() => ui.month(-1))}>
        <svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
      </button>
      <span class="cal-month">{monthName(day)}</span>
      <button class="cal-step" aria-label="Next month" onmousedown={grab(() => ui.month(1))}>
        <svg viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
      </button>
    </div>
    <div class="cal-grid">
      {#each names as n, i}<span class="cal-wd" class:sun={i === 0}>{n}</span>{/each}
      {#each weeks as week}
        {#each week as d}
          <button
            class="cal-day"
            class:out={!sameMonth(d, day)}
            class:on={d === day}
            class:now={d === today}
            onmousedown={grab(() => pick(d))}>{+d.slice(-2)}</button>
        {/each}
      {/each}
    </div>
    <!-- what picking would write, in the same words the chip will use -->
    <div class="cal-foot">{dateLabel(day)}</div>
  </div>
{/if}

<style>
  .cal {
    position: fixed;
    z-index: 40;
    padding: 6px;
    background: var(--bg-pop);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: 12.5px;
    user-select: none;
  }
  .cal-bar { display: flex; align-items: center; gap: 4px; padding: 1px 2px 5px; }
  .cal-month { flex: 1; text-align: center; font-weight: 500; }
  .cal-step {
    width: 22px; height: 22px; flex: none; display: flex; align-items: center; justify-content: center;
    border: 0; border-radius: 5px; background: none; color: var(--fg-dim); padding: 0;
  }
  .cal-step:hover { background: var(--accent-soft); color: var(--fg); }
  .cal-step svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 28px); gap: 1px; }
  .cal-wd { height: 20px; display: flex; align-items: center; justify-content: center; color: var(--fg-dim); font-size: 11px; }
  .cal-wd.sun { color: #d6564a; }
  .cal-day {
    height: 26px; display: flex; align-items: center; justify-content: center;
    border: 0; border-radius: 5px; background: none; color: inherit; font: inherit; padding: 0;
    font-variant-numeric: tabular-nums;
  }
  .cal-day.out { color: var(--fg-dim); opacity: 0.5; }
  /* today is marked even when the cursor is elsewhere: it is the one day you navigate from */
  .cal-day.now { font-weight: 600; }
  .cal-day:hover { background: var(--accent-soft); }
  .cal-day.on { background: var(--accent); color: #fff; }
  .cal-foot { padding: 5px 2px 1px; text-align: center; color: var(--fg-dim); font-size: 11.5px; }
</style>
