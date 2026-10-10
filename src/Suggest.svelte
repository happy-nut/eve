<script lang="ts">
  import { fly } from 'svelte/transition';
  import { caretIn } from './lib/motion';
  import type { SuggestItem, SuggestionUI } from './lib/slash';
  import { rows, expand, collapse } from './lib/suggest';
  import Icon from './Icon.svelte';
  import { placeAt } from './lib/popup';

  // popup for the [[ and / menus; the editor drives it through `ui` (bind:this to reach it)
  let items = $state<SuggestItem[]>([]);
  let open = $state<ReadonlySet<number>>(new Set()); // pages showing their sections ([[ only)
  let sel = $state(0);
  let place = $state(''); // its left/top-or-bottom/max-height (lib/popup.ts)
  let anchor: DOMRect | null = null; // the caret it was placed at, to place it again once its width is known
  let pick: (t: SuggestItem) => void = () => {};

  // what is actually on screen: the items, with the sections of an opened page folded in after it
  const shown = $derived(rows(items, open));

  export const ui: SuggestionUI = {
    show(next, rect, cb) {
      // a keystroke rebuilds the list, so nothing stays open across one: the page under row 3 is not
      // the page that was there before the letter was typed
      items = next; open = new Set(); sel = 0; pick = cb;
      if (rect) { anchor = rect; place = placeAt(rect, 300, list?.offsetWidth ?? 340); }
    },
    move: (d) => { sel = (sel + d + shown.length) % shown.length; },
    select: () => { if (!shown.length) return false; pick(shown[sel].item); return true; },
    expand: () => {
      const next = expand(items, open, sel);
      if (next) ({ open, sel } = next);
      return !!next;
    },
    collapse: () => {
      const next = collapse(items, open, sel);
      if (next) ({ open, sel } = next);
      return !!next;
    },
    hide: () => { items = []; open = new Set(); },
    visible: () => items.length > 0,
  };

  let list = $state<HTMLUListElement | null>(null);
  // placed by its real width, once drawn: it was placed as if 200 px wide, and a menu of long titles (up to 340)
  // near the right edge of the window ran off it
  $effect(() => { shown; if (list && anchor) place = placeAt(anchor, 300, list.offsetWidth); });
  // keep the highlighted suggestion visible while arrowing through a long list
  $effect(() => { sel; list?.querySelector('li.sel')?.scrollIntoView({ block: 'nearest' }); });
</script>

{#if items.length}
  <ul class="suggest" bind:this={list} style={place} transition:fly|global={caretIn}>
    <!-- keyed by place: a page with two headings of the same name ("TODO" twice) gave two rows the same key, and
         Svelte stopped with an error as soon as the page was opened into its sections -->
    {#each shown as row, i (i)}
      {@const t = row.item}
      <li class:sel={i === sel} class:child={row.child}>
        <button onmousedown={(e) => { e.preventDefault(); pick(t); }}>
          <!-- the twisty marks a page that has sections; → opens it, ← folds it away again -->
          {#if !row.child && t.sections?.length}
            <svg class="chev" class:down={open.has(row.top)} viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></svg>
          {:else}<span class="chev"></span>{/if}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {#if t.noteIcon}<span class="s-emoji"><Icon icon={t.noteIcon} size={14} /></span>
          {:else if t.icon}<svg class="s-ico" viewBox="0 0 16 16">{@html t.icon}</svg>{/if}
          <span class="s-label">{t.label}</span>
          <!-- a section under its own page needs no reminder of which page that is -->
          {#if t.hint && !row.child}<span class="hint">{t.hint}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .suggest {
    position: fixed;
    z-index: 40;
    list-style: none;
    margin: 0;
    padding: 4px;
    width: max-content; /* its own width, not what is left of the window right of the caret: placed by it */
    min-width: 200px;
    max-width: 340px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-pop);
    border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
    font-size: 13px;
  }
  .suggest button { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: 5px 8px; border-radius: 5px; white-space: nowrap; }
  /* the twisty column is held open on every row, so labels line up whether or not a row has one */
  .chev { width: 9px; height: 9px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0.4; transition: transform 120ms; }
  .chev.down { transform: rotate(90deg); }
  .suggest li.child button { padding-left: 25px; }
  .suggest li.sel button { background: var(--accent-soft); }
  /* the title keeps its width and the hint gives way first: shrunk side by side, "Swimlanes" came out "Swimlan…" next to
     a whole hint. Only a title longer than the row itself is cut (the twisty and the icon keep their 40px) */
  .s-label { flex: none; max-width: calc(100% - 40px); overflow: hidden; text-overflow: ellipsis; }
  .s-emoji { width: 15px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .s-ico { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; opacity: 0.7; }
  .suggest .hint { margin-left: auto; padding-left: 12px; color: var(--fg-dim); font-size: 11.5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
</style>
