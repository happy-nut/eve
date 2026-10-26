<script lang="ts">
  import { notes, titleOf, CALENDAR } from './lib/notes.svelte';
  import { tabs } from './lib/tabs.svelte';
  import { ui } from './lib/ui.svelte';
  import { shortcuts } from './lib/shortcuts.svelte';
  import Icon from './Icon.svelte';
  import { scrollHint } from './lib/scrollHint';

  // the notes open in tabs, over the note (only with two or more): a click brings one to front, the middle button or
  // its × closes it, the right button pins it or closes the others
  const label = (id: string) => {
    if (id === CALENDAR) return { title: notes.calendar.name, icon: notes.calendar.icon };
    const n = notes.all.find((x) => x.id === id);
    return { title: n ? titleOf(n) : '', icon: n?.icon ?? '' };
  };
  function menu(e: MouseEvent, i: number) {
    e.preventDefault();
    const t = tabs.list[i];
    ui.openMenu(e, [
      { label: t.pinned ? 'Unpin tab' : 'Pin tab', run: () => tabs.pin(i, !t.pinned) },
      { label: 'Close tab', keys: shortcuts.keysFor('closeTab'), hide: !!t.pinned, run: () => tabs.close(i) },
      { label: 'Close other tabs', hide: tabs.list.length < 2, run: () => tabs.closeOthers(i) },
    ]);
  }
  // more tabs than fit: the open one is brought into sight (it was left off past the bar's end, with no bar to scroll
  // by), and the bar's edges fade where more of it goes on
  let bar = $state<HTMLDivElement | null>(null);
  $effect(() => {
    void notes.currentId; void tabs.list.length;
    queueMicrotask(() => bar?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  });
</script>

<div class="tabbar" role="tablist" aria-label="Open notes" bind:this={bar} {@attach scrollHint}>
  {#each tabs.list as t, i (t.id)}
    {@const l = label(t.id)}
    <div class="tab" class:on={t.id === notes.currentId} class:pinned={t.pinned} role="presentation"
      onauxclick={(e) => { if (e.button === 1) tabs.close(i); }} oncontextmenu={(e) => menu(e, i)}>
      <button class="pick" role="tab" aria-selected={t.id === notes.currentId} title={l.title} onclick={() => (notes.currentId = t.id)}>
        {#if l.icon}<Icon icon={l.icon} size={14} />{:else if t.pinned}<span class="initial">{[...l.title][0] ?? '·'}</span>{/if}
        {#if !t.pinned}<span class="name">{l.title}</span>{/if}
      </button>
      {#if !t.pinned}
        <button class="x" aria-label="Close tab" onclick={() => tabs.close(i)}><svg viewBox="0 0 16 16"><path d="M5 5l6 6M11 5l-6 6"/></svg></button>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* under the window's top row (the crumbs and ⋯ live there), over the note */
  .tabbar {
    position: absolute; top: 40px; left: 0; right: 0; height: 30px; z-index: var(--z-toolbar);
    display: flex; gap: 2px; padding: 0 12px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line);
    background: var(--bg);
  }
  .tabbar::-webkit-scrollbar { display: none; }
  .tab {
    flex: 0 1 180px; min-width: 104px; display: flex; align-items: center; height: 26px; margin-top: 2px; border-radius: 7px 7px 0 0;
    color: var(--fg-dim);
  }
  .tab.pinned { flex: none; min-width: 0; }
  .tab:hover { background: var(--bg-hover); }
  /* the open tab is the page itself (its colour, the bar's line broken under it), not a grey a hover shares */
  .tab.on { background: var(--bg); color: var(--fg); box-shadow: inset 0 0 0 1px var(--line), 0 1px 0 var(--bg); }
  button { border: 0; background: none; color: inherit; font: inherit; }
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 100%; padding: 0 4px 0 10px; font-size: 12.5px; text-align: left; }
  .pinned .pick { padding: 0 9px; }
  .initial { width: 14px; text-align: center; font-weight: 600; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { flex: none; width: 20px; height: 20px; margin-right: 4px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; opacity: 0; }
  .tab:hover .x, .tab.on .x, .x:focus-visible { opacity: 1; }
  .x:hover { background: var(--bg-hover); }
  .x svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
  @media print { .tabbar { display: none; } }
</style>
