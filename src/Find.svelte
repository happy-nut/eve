<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { Editor } from '@tiptap/core';
  import { findState, setQuery, step, replaceOne, replaceAll, clearFind } from './lib/find';
  import { ui } from './lib/ui.svelte';

  /** ⌘F: a small bar over the note. Enter walks the matches, ⇧Enter walks back, Esc puts it away. */
  let { editor }: { editor: Editor | undefined } = $props();

  let query = $state('');
  let replacement = $state('');
  let replacing = $state(false);
  let count = $state({ index: 0, total: 0 });

  const focus = (el: HTMLInputElement) => { el.focus(); el.select(); };

  function sync() {
    if (!editor) return;
    const s = findState(editor);
    count = { index: s.hits.length ? s.index + 1 : 0, total: s.hits.length };
  }

  $effect(() => {
    const e = editor;
    if (!e) return;
    // the note may be edited (or replaced into) while the bar is open
    const on = () => sync();
    e.on('transaction', on);
    if (query) setQuery(e, query); // the bar was just opened with a query still in it
    sync();
    return () => { e.off('transaction', on); clearFind(e); };
  });

  function type(value: string) {
    query = value;
    if (editor) setQuery(editor, value);
    sync();
  }

  function walk(dir: 1 | -1) {
    if (editor) step(editor, dir);
    sync();
  }

  function close() {
    ui.find = false;
    editor?.commands.focus();
  }

  function replaceNext() {
    if (editor) replaceOne(editor, replacement);
    sync();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key !== 'Enter') return;
    e.preventDefault();
    // with the replace field open, Enter works through the matches one replacement at a time;
    // ⇧Enter still just walks back, so a match can be stepped over
    if (replacing && !e.shiftKey) replaceNext();
    else walk(e.shiftKey ? -1 : 1);
  }
</script>

<!-- the keys come from the fields and buttons inside, which are focusable on their own; the bar only
     catches them once on the way up, so it needs no role of its own beyond the landmark -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="find" transition:fly={{ y: -8, duration: 140 }} onkeydown={onKey} role="search">
  <div class="line">
    <svg class="glass" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>
    <input use:focus placeholder="Find" spellcheck="false" value={query} oninput={(e) => type(e.currentTarget.value)} />
    <span class="count">{count.total ? `${count.index}/${count.total}` : query ? '0/0' : ''}</span>
    <button class="icon" data-tip="Previous (⇧↩)" aria-label="Previous" onclick={() => walk(-1)}>
      <svg viewBox="0 0 16 16"><path d="M4 10l4-4 4 4"/></svg>
    </button>
    <button class="icon" data-tip="Next (↩)" aria-label="Next" onclick={() => walk(1)}>
      <svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>
    </button>
    <button class="icon" class:on={replacing} data-tip="Replace" aria-label="Replace" onclick={() => (replacing = !replacing)}>
      <svg viewBox="0 0 16 16"><path d="M3 5.5h7.5a2 2 0 0 1 0 4H8M5 3.5l-2 2 2 2M11 12.5l2-2-2-2"/></svg>
    </button>
    <button class="icon" data-tip="Close (Esc)" aria-label="Close" onclick={close}>
      <svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg>
    </button>
  </div>
  {#if replacing}
    <div class="line">
      <!-- the same gap the magnifier takes above, so both fields start on one line -->
      <span class="glass" aria-hidden="true"></span>
      <input class="rep" placeholder="Replace with" spellcheck="false" bind:value={replacement} />
      <button class="icon" data-tip="Replace (↩)" aria-label="Replace" onclick={replaceNext}>
        <svg viewBox="0 0 16 16"><rect x="8.2" y="3" width="5.3" height="10" rx="1"/><path d="M2.5 8h4.3M4.7 5.9 6.8 8l-2.1 2.1"/></svg>
      </button>
      <button class="icon" data-tip="Replace all" aria-label="Replace all" onclick={() => { if (editor) replaceAll(editor, replacement); sync(); }}>
        <svg viewBox="0 0 16 16"><rect x="8.2" y="1.8" width="5.3" height="5" rx="1"/><rect x="8.2" y="9.2" width="5.3" height="5" rx="1"/><path d="M2.5 4.3h4.3M4.7 2.2 6.8 4.3 4.7 6.4M2.5 11.7h4.3M4.7 9.6l2.1 2.1-2.1 2.1"/></svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .find {
    position: absolute; top: 10px; right: 16px; z-index: 7; width: min(360px, calc(100% - 32px));
    display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 10px;
    background: var(--bg-pop); border: 1px solid var(--line); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  }
  .line { display: flex; align-items: center; gap: 4px; }
  .glass { width: 14px; height: 14px; margin: 0 2px 0 4px; flex: none; fill: none; stroke: var(--fg-dim); stroke-width: 1.4; stroke-linecap: round; }
  span.glass { stroke: none; } /* the spacer under the magnifier: footprint only */
  input {
    flex: 1; min-width: 0; border: 0; outline: none; background: var(--bg-input); color: inherit;
    font: inherit; font-size: 13px; padding: 5px 8px; border-radius: 6px;
  }
  input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .count { font-size: 11.5px; color: var(--fg-dim); font-variant-numeric: tabular-nums; padding: 0 2px; }
  .find .icon { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .find svg { width: 14px; height: 14px; display: block; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
</style>
