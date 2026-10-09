<script lang="ts" module>
  // the page's full height for each width it has had (upright, turned on its side), taken when the app starts
  // (keyboard down; the bar can mount with it up). The keyboard only ever shortens the page, never narrows it:
  // one height for both, a phone turned on its side read as a keyboard up, and the bar stayed over the note.
  const tallest = new Map<number, number>();
  if (typeof window !== 'undefined') tallest.set(window.innerWidth, window.innerHeight);
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { hooks } from './lib/ui.svelte';

  /**
   * A phone has no shortcuts: while the note (or a sheet over it) holds the caret and the keyboard is up, a row of
   * formatting buttons sits on top of the keyboard. MainActivity shrinks the page by the keyboard's
   * height, so "on top of the keyboard" is simply the bottom of the page; the keyboard being up shows
   * as the page being noticeably shorter than it has ever been.
   */
  let editing = $state(false);
  let keyboard = $state(false);

  onMount(() => {
    const measure = () => {
      const w = window.innerWidth, full = Math.max(tallest.get(w) ?? 0, window.innerHeight);
      tallest.set(w, full);
      keyboard = window.innerHeight < full - 120;
    };
    // the note's own text only: a box's name, a form's row or a formula being typed in a diagram or an equation inside
    // the note is not it, and the bar's buttons wrote into the note (bold, a to-do) from there
    const check = () => {
      const a = document.activeElement;
      editing = !!a?.closest('.page .tiptap, .card-page .tiptap') && !a.closest('.dblock, .math-edit, .mermaid-host, .math-inline, .math-block');
      measure();
    };
    const out = () => setTimeout(check, 0); // focus lands on the next element a tick later
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', out);
    window.addEventListener('resize', check);
    check(); // the note may already hold the caret (a widget tap focuses it before this mounts)
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', out);
      window.removeEventListener('resize', check);
    };
  });

  // the sheet's editor when the caret is in it (a card, a day, a template), else the note's
  const run = (id: string) => (document.activeElement?.closest('.card-page') ? hooks.cardCommand : hooks.command)?.(id);
  const done = () => (document.activeElement as HTMLElement | null)?.blur(); // puts the keyboard away

  const buttons: { id: string; label: string; icon: string }[] = [
    { id: 'taskList', label: 'To-do', icon: '<rect x="3" y="3.5" width="9" height="9" rx="2"/><path d="M5.3 8l1.7 1.7L10 6.5"/>' },
    { id: 'bold', label: 'Bold', icon: '<path d="M4.5 3h4a2.5 2.5 0 010 5h-4zM4.5 8h4.8a2.5 2.5 0 010 5H4.5z"/>' },
    { id: 'outdent', label: 'Outdent', icon: '<path d="M13.5 4h-6M13.5 8h-6M13.5 12h-6M5 6L2.5 8 5 10"/>' },
    { id: 'indent', label: 'Indent', icon: '<path d="M13.5 4h-6M13.5 8h-6M13.5 12h-6M2.5 6L5 8l-2.5 2"/>' },
    { id: 'slash', label: 'Insert block', icon: '<path d="M10.5 2.5l-5 11"/>' },
  ];
  // ⌘Z / ⇧⌘Z on the Mac: kept at the bar's left edge, where a thumb finds them without scrolling the row
  const history: { id: string; label: string; icon: string }[] = [
    { id: 'undo', label: 'Undo', icon: '<path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.5 6.5h7a4 4 0 010 8H7"/>' },
    { id: 'redo', label: 'Redo', icon: '<path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5h-7a4 4 0 000 8H9"/>' },
  ];
</script>

{#if editing && keyboard}
  <!-- mousedown is swallowed so a tap never takes the caret out of the note -->
  <div class="mbar" role="toolbar" aria-label="Formatting" tabindex="-1"
    onmousedown={(e) => e.preventDefault()}>
    {#each history as b (b.id)}
      <button tabindex="-1" aria-label={b.label} onclick={() => run(b.id)}>
        <svg viewBox="0 0 16 16">{@html b.icon}</svg>
      </button>
    {/each}
    <span class="sep"></span>
    <!-- the formatting buttons scroll sideways when the phone is too narrow for them all. No bullets or
         headings: "- " and "## " already make them while typing -->
    <div class="tools">
      {#each buttons as b (b.id)}
        <button tabindex="-1" aria-label={b.label} onclick={() => run(b.id)}>
          <svg viewBox="0 0 16 16">{@html b.icon}</svg>
        </button>
      {/each}
    </div>
    <button tabindex="-1" aria-label="Done" class="done" onclick={done}>
      <svg viewBox="0 0 16 16"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>
    </button>
  </div>
{/if}

<style>
  .mbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 33; /* over a sheet (31) too */ display: flex; align-items: center; gap: 2px;
    padding: 4px 6px; background: var(--bg-pop); border-top: 1px solid var(--line);
  }
  button {
    flex: none; width: 44px; height: 40px; border: 0; border-radius: 8px; background: none; color: var(--fg);
    display: inline-flex; align-items: center; justify-content: center;
  }
  button:active { background: var(--bg-active); }
  svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .sep { flex: none; width: 1px; height: 22px; margin: 0 2px; background: var(--line); }
  .tools { flex: 1; min-width: 0; display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; }
  .tools::-webkit-scrollbar { display: none; }
  .done { color: var(--accent); }
</style>
