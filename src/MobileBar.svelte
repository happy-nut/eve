<script lang="ts" module>
  const fullHeightByWidth = new Map<number, number>();
  if (typeof window !== 'undefined') fullHeightByWidth.set(window.innerWidth, window.innerHeight);

  function fullHeightAfterTurn(w: number): number {
    for (const [w0, h0] of fullHeightByWidth) if (Math.abs(h0 - w) <= 2) return w0;
    const s = window.screen;
    if (s && Math.abs(s.height - w) <= 2) return s.width;
    if (s && Math.abs(s.width - w) <= 2) return s.height;
    return 0;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { hooks } from './lib/ui.svelte';
  import { scrollHint } from './lib/scrollHint';

  const isNoteText = (el: Element | null) =>
    !!el?.matches('.page .tiptap, .card-page .tiptap') && !el.closest('.dblock, .math-edit, .mermaid-host, .math-inline, .math-block');

  let editing = $state(false);
  let keyboard = $state(false);

  onMount(() => {
    const measure = () => {
      const w = window.innerWidth, full = Math.max(fullHeightByWidth.get(w) ?? fullHeightAfterTurn(w), window.innerHeight);
      fullHeightByWidth.set(w, full);
      keyboard = window.innerHeight < full - 120;
    };
    const check = () => {
      editing = isNoteText(document.activeElement);
      measure();
    };
    const recheckAfterFocusMoves = () => setTimeout(check, 0);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', recheckAfterFocusMoves);
    window.addEventListener('resize', check);
    check();
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', recheckAfterFocusMoves);
      window.removeEventListener('resize', check);
    };
  });

  const run = (id: string) => (document.activeElement?.closest('.card-page') ? hooks.cardCommand : hooks.command)?.(id);
  const hideKeyboard = () => (document.activeElement as HTMLElement | null)?.blur();

  const buttons: { id: string; label: string; icon: string }[] = [
    { id: 'taskList', label: 'To-do', icon: '<rect x="3" y="3.5" width="9" height="9" rx="2"/><path d="M5.3 8l1.7 1.7L10 6.5"/>' },
    { id: 'bold', label: 'Bold', icon: '<path d="M4.5 3h4a2.5 2.5 0 010 5h-4zM4.5 8h4.8a2.5 2.5 0 010 5H4.5z"/>' },
    { id: 'highlight', label: 'Highlight', icon: '<path d="M9.5 2.5l4 4-5.5 5.5H4v-4z"/><path d="M2.5 14h11"/>' },
    { id: 'outdent', label: 'Outdent', icon: '<path d="M13.5 4h-6M13.5 8h-6M13.5 12h-6M5 6L2.5 8 5 10"/>' },
    { id: 'indent', label: 'Indent', icon: '<path d="M13.5 4h-6M13.5 8h-6M13.5 12h-6M2.5 6L5 8l-2.5 2"/>' },
    { id: 'slash', label: 'Insert block', icon: '<path d="M10.5 2.5l-5 11"/>' },
  ];
  const history: { id: string; label: string; icon: string }[] = [
    { id: 'undo', label: 'Undo', icon: '<path d="M5.5 3.5L2.5 6.5l3 3"/><path d="M2.5 6.5h7a4 4 0 010 8H7"/>' },
    { id: 'redo', label: 'Redo', icon: '<path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5h-7a4 4 0 000 8H9"/>' },
  ];
</script>

{#if editing && keyboard}
  <div class="mbar" role="toolbar" aria-label="Formatting" tabindex="-1"
    onmousedown={(e) => e.preventDefault()}>
    {#each history as b (b.id)}
      <button tabindex="-1" aria-label={b.label} onclick={() => run(b.id)}>
        <svg viewBox="0 0 16 16">{@html b.icon}</svg>
      </button>
    {/each}
    <span class="sep"></span>
    <div class="tools" {@attach scrollHint}>
      {#each buttons as b (b.id)}
        <button tabindex="-1" aria-label={b.label} onclick={() => run(b.id)}>
          <svg viewBox="0 0 16 16">{@html b.icon}</svg>
        </button>
      {/each}
    </div>
    <button tabindex="-1" aria-label="Done" class="done" onclick={hideKeyboard}>
      <svg viewBox="0 0 16 16"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>
    </button>
  </div>
{/if}

<style>
  .mbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-phone-bar); display: flex; align-items: center; gap: 2px;
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
  .done { color: var(--accent-text); }
</style>
