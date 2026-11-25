<script lang="ts">
  import { flushSync, onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { popIn, scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { isMobile } from './lib/platform';
  import { randomIcon } from './lib/icons';
  import { floatAt, lastShown, screenInsets, viewSize } from './lib/popup';
  import { claimKeys, composing } from './lib/keys';
  import { loadEmoji, loadedEmoji, newestEmoji, type EmojiEntry } from './lib/emoji';
  import {
    TABS, TONES, TONE_FACES, arrow, findCells, recentCells, remember, saveTone, savedTone, tabCells,
    type Arrow, type Cell, type Place, type Spot,
  } from './lib/iconPicker';

  const req = $derived.by(lastShown(() => ui.emoji));
  const W = 352, H = 400;
  function placePicker(from: typeof req.at) {
    const below = floatAt(from, { w: W, h: H }, { gap: 6 });
    if (below.maxHeight >= H) return { x: below.left, y: below.top };
    const side = floatAt(from, { w: W, h: H }, { gap: 6, prefer: 'side' });
    if (side.side === 'left' || side.side === 'right') return { x: side.left, y: side.top };
    return { x: below.left, y: Math.max(screenInsets().top, viewSize().h - screenInsets().bottom - H) };
  }
  const { x, y } = $derived(placePicker(req.at));

  let data = $state<readonly EmojiEntry[] | null>(loadedEmoji());
  let failed = $state(false);
  if (!loadedEmoji()) loadEmoji().then((d) => (data = d), () => (failed = true));
  const newest = newestEmoji();

  let tone = $state(savedTone());
  let query = $state('');
  let tab = $state(0);
  let spot = $state<Spot>('search');
  let downWaiting = $state(false);
  let preview = $state<Cell | null>(null);

  const tabs = $derived(tabCells(data, tone, newest));
  const tabLens = $derived(tabs.map((c) => c.length));
  const searching = $derived(query.trim() !== '');
  const cells = $derived(searching ? findCells(data, query, tone, newest) : tabs[tab]);
  const recent = $derived(recentCells(data));

  let input: HTMLInputElement;
  let scroller: HTMLElement;
  const cellEls: HTMLButtonElement[] = [];

  onMount(() => input.focus());

  function focusSpot() {
    if (spot === 'search') { input.focus(); return; }
    const b = cellEls[spot];
    b?.focus();
    b?.scrollIntoView?.({ block: 'nearest' });
    preview = cells[spot] ?? null;
  }
  function go(to: Place) {
    if (to.tab !== tab) { tab = to.tab; flushSync(); scroller.scrollTop = 0; }
    spot = to.spot;
    flushSync();
    focusSpot();
  }
  $effect(() => {
    if (!downWaiting || !cells.length) return;
    downWaiting = false;
    if (spot === 'search' && document.activeElement === input) { spot = 0; focusSpot(); }
  });

  function pick(c: Cell) {
    remember(c.pick);
    ui.emojiDone(c.pick);
  }
  function openTab(t: number) {
    query = '';
    if (spot === 'search') { tab = t; flushSync(); scroller.scrollTop = 0; }
    else go({ tab: t, spot: 0 });
  }
  function chooseTone(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    ui.openMenu({ clientX: r.left, clientY: r.bottom, from: r },
      TONES.map((name, t) => ({ label: `${TONE_FACES[t]}  ${name}`, checked: t === tone, run: () => { tone = t; saveTone(t); } })));
  }

  const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const at = e.target === input ? 'search' : cellEls.indexOf(e.target as HTMLButtonElement);
    if (at === -1) return;
    if (at === 'search') {
      if (composing(e)) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (cells.length) go(arrow('ArrowDown', { tab, spot: 'search' }, cells.length));
        else downWaiting = !data;
      } else if (e.key === 'Enter' && searching && cells.length) {
        e.preventDefault();
        pick(cells[0]);
      }
      return;
    }
    if (ARROWS.has(e.key)) {
      e.preventDefault();
      go(arrow(e.key as Arrow, { tab, spot: at }, cells.length, searching ? undefined : tabLens));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(cells[at]);
    } else if (e.key === 'Backspace' || e.key.length === 1 || e.key === 'Process' || composing(e)) {
      spot = 'search';
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  $effect(() => claimKeys('global', { Escape: (e) => { e.stopPropagation(); ui.emojiDone(null); return true; } }, { whileTop: 'emoji' }));
</script>

{#snippet face(c: Cell)}
  {#if c.url}<img src={c.url} alt="" />{:else}{c.face}{/if}
{/snippet}

<div class="backdrop" transition:fade|global={scrimFade} onmousedown={() => ui.emojiDone(null)} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_interactive_supports_focus -->
<div class="panel" style="left: {x}px; top: {y}px; width: {W}px; --picker-h: {H}px" transition:scale|global={popIn} role="dialog" aria-label="Choose an icon" onkeydown={onKey}>
  <header>
    {#if isMobile}
      <button class="act back" aria-label="Close" onclick={() => ui.emojiDone(null)}>
        <svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg>
      </button>
    {/if}
    <span class="tab">Icon</span>
    <span class="acts">
      <button class="act" aria-label="Random icon" title="Random icon" onclick={() => ui.emojiDone(randomIcon(req.current))}>
        <svg viewBox="0 0 16 16"><path d="M2 4.5h2.2c1.3 0 2.4.7 3 1.8l1.6 3.4c.6 1.1 1.7 1.8 3 1.8H14M2 11.5h2.2c.9 0 1.8-.4 2.4-1.1M9.4 5.6c.6-.7 1.5-1.1 2.4-1.1H14M12.3 2.8 14 4.5l-1.7 1.7M12.3 9.8 14 11.5l-1.7 1.7"/></svg>
      </button>
      {#if req.current}
        <button class="act" aria-label="Remove icon" title="Remove icon" onclick={() => ui.emojiDone('')}>
          <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9"/></svg>
        </button>
      {/if}
    </span>
  </header>
  <div class="find">
    <input bind:this={input} bind:value={query} type="search" class="search" placeholder="Search" aria-label="Search"
      autocomplete="off" spellcheck="false" onfocus={() => (spot = 'search')} oninput={() => { downWaiting = false; preview = null; }} />
    <button class="tone" aria-label="Skin tone: {TONES[tone]}" title="Skin tone" onclick={chooseTone}>{TONE_FACES[tone]}</button>
  </div>
  <div class="tabs" role="tablist" aria-label="Categories">
    {#each TABS as t, i (t.name)}
      <button role="tab" aria-selected={!searching && i === tab} aria-label={t.name} title={t.name} tabindex="-1"
        onmousedown={(e) => e.preventDefault()} onclick={() => openTab(i)}>{t.face}</button>
    {/each}
  </div>
  <div class="grid" bind:this={scroller} role="group" aria-label={searching ? 'Search results' : TABS[tab].name}>
    {#each cells as c, i (c.pick)}
      <button class="cell" bind:this={cellEls[i]} aria-label={c.name} tabindex={spot === i || (spot === 'search' && i === 0) ? 0 : -1}
        onclick={() => pick(c)} onfocus={() => { spot = i; preview = c; }} onmouseenter={() => (preview = c)}>{@render face(c)}</button>
    {:else}
      <p class="none">{failed ? 'Could not load emoji.' : data ? 'No icon found' : 'Loading…'}</p>
    {/each}
  </div>
  <div class="recent" role="group" aria-label="Recently used">
    {#each recent as c (c.pick)}
      <button class="cell" aria-label={c.name} onclick={() => pick(c)} onmouseenter={() => (preview = c)}>{@render face(c)}</button>
    {/each}
  </div>
  <footer class="preview" aria-live="polite">
    {#if preview?.code}
      {#if preview.url}<img src={preview.url} alt="" />{:else}<span class="face">{preview.face}</span>{/if}
      <span class="code">:{preview.code}:</span>
    {/if}
  </footer>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: var(--z-popover-scrim); }
  .panel {
    position: fixed; z-index: var(--z-popover); overflow: hidden; display: flex; flex-direction: column;
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
    transform-origin: top left;
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 6px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .tab { font-weight: 600; }
  .acts { display: flex; gap: 2px; margin-right: -6px; }
  .act {
    width: 28px; height: 28px; border: 0; border-radius: 7px; background: none; color: var(--fg-dim); padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .act:hover { color: var(--fg); background: var(--bg-hover); }
  .act:active { background: var(--bg-active); }
  .act svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  :global(html.mobile) .act { width: 44px; height: 44px; border-radius: 12px; }
  :global(html.mobile) .act svg { width: 22px; height: 22px; }
  :global(html.mobile) .act.back { margin: 0 2px 0 -10px; }
  :global(html.mobile) .tab { flex: 1; }
  :global(html:not(.mobile)) .panel { height: var(--picker-h); }
  :global(html.mobile) .preview { display: none; }

  .find { display: flex; align-items: center; gap: 4px; padding: 6px 6px 4px; }
  .search {
    flex: 1; min-width: 0; box-sizing: border-box; padding: 7px 10px; font: inherit; font-size: 13px; color: var(--fg);
    background: none; border: 1px solid transparent; border-radius: 8px; outline: none;
  }
  .search::placeholder { color: var(--fg-dim); }
  .search:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  :global(html.mobile) .search { font-size: 16px; padding: 9px 11px; }
  .tone { flex: none; width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; padding: 0; font-size: 1.2rem; line-height: 1; }
  .tone:hover { background: var(--bg-hover); }

  .tabs { display: grid; grid-template-columns: repeat(10, 1fr); padding: 0 2px; }
  .tabs button {
    height: 34px; border: 0; border-radius: 6px; background: none; padding: 0; font-size: 1.2rem; line-height: 1;
    display: flex; align-items: center; justify-content: center;
  }
  .tabs button:hover { background: var(--bg-hover); }
  .tabs button[aria-selected='true'] { background: var(--bg-active); }

  .grid, .recent { display: grid; grid-template-columns: repeat(9, 1fr); justify-items: center; padding: 0 4px; --cell: calc(1.35rem + 0.8rem); }
  .grid { flex: 1; min-height: 0; overflow-y: auto; align-content: start; padding-bottom: 4px; scrollbar-width: thin; }
  .recent { border-top: 1px solid var(--line); padding-top: 2px; padding-bottom: 2px; }
  .cell {
    width: var(--cell); height: var(--cell); border: 0; border-radius: 50%; background: none; padding: 0;
    font-size: 1.35rem; line-height: 1; display: flex; align-items: center; justify-content: center; cursor: default;
  }
  @media (hover: hover) { .cell:hover { background: var(--bg-hover); } }
  .cell:focus-visible, .grid .cell:focus { background: var(--bg-active); outline: 2px solid var(--accent); outline-offset: -2px; }
  .cell img { width: 1.35rem; height: 1.35rem; }
  .none { grid-column: 1 / -1; margin: 0; padding: 16px 8px; text-align: center; font-size: 12px; color: var(--fg-dim); }
  :global(html.mobile) :is(.grid, .recent) { --cell: 2.6rem; }
  :global(html.mobile) .cell { font-size: 1.6rem; }
  :global(html.mobile) .cell img { width: 1.6rem; height: 1.6rem; }
  :global(html.mobile) .recent { padding-bottom: calc(2px + var(--bottom, 0px)); }

  .preview {
    display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-top: 1px solid var(--line);
    font-size: 12px; color: var(--fg-dim); flex: none;
  }
  .preview .face { font-size: 16px; line-height: 1; }
  .preview img { width: 16px; height: 16px; }
  .preview .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
