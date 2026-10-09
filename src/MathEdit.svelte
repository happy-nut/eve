<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { isMobile } from './lib/platform';
  import { loadMath, mathMarkup } from './lib/mathRender';
  import { SHELVES, tidyTex, type MathPart } from './lib/mathParts';
  import type { MathDone } from './lib/mathEdit.svelte';

  /**
   * A formula being edited, right where it is in the note: MathLive's box, showing the formula as it will look and
   * typed into as such (x^2 puts the 2 up, / makes a fraction, ⇥ moves through the empty slots), and under it a row of
   * the parts a formula is made of, put in by a click, no TeX to know. Its TeX is a click away for whoever knows it.
   * Every change is written into the note as it is made (onInput); an undo or a sync comes back as `latex`.
   */
  let { latex, display, onInput, onDone, onHistory }: {
    latex: string;
    display: boolean;
    onInput: (latex: string) => void;
    onDone: (how: MathDone) => void;
    onHistory: (redo: boolean) => void;
  } = $props();

  let root: HTMLElement, slot: HTMLElement, tools = $state<HTMLElement | null>(null);
  let mf: (HTMLElement & { value: string; mode: string; insert(s: string, o?: object): boolean; executeCommand(c: unknown): boolean }) | null = null;
  let shelf = $state(SHELVES[0].id);
  let tex = $state(false);
  let texValue = $state(untrack(() => latex));
  let faces = $state<Record<string, string>>({}); // each part's button, drawn
  let finished = false;
  let shift = $state(0); // an inline formula's row, moved left to stay on the screen

  const done = (how: MathDone) => { if (finished) return; finished = true; onDone(how); };
  const clean = tidyTex;

  // what the note changed (an undo, a sync): shown, unless it is what was just typed
  $effect(() => {
    const l = latex;
    untrack(() => {
      if (mf && clean(mf.value) !== l) mf.value = l;
      if (clean(texValue) !== l) texValue = l;
    });
  });

  onMount(() => {
    let gone = false;
    loadMath().then((m) => {
      if (gone) return;
      const f = new m.MathfieldElement() as unknown as NonNullable<typeof mf>;
      const el = f as unknown as InstanceType<typeof m.MathfieldElement>;
      el.defaultMode = display ? 'math' : 'inline-math';
      el.mathVirtualKeyboardPolicy = isMobile ? 'auto' : 'manual';
      slot.append(f);
      // these only once it is on the page (MathLive throws before it has drawn itself there)
      try {
        el.smartFence = true;
        el.popoverPolicy = 'off';
        el.menuItems = [];
        f.value = latex;
      } catch { return; }
      mf = f;
      f.addEventListener('input', () => { texValue = clean(f.value); onInput(clean(f.value)); });
      // the ↵ of MathLive's own keyboard (a phone's)
      f.addEventListener('change', () => done('after'));
      f.addEventListener('move-out', (e: Event) => {
        e.preventDefault();
        const dir = (e as CustomEvent<{ direction: string }>).detail.direction;
        done(dir === 'backward' || dir === 'upward' ? 'before' : 'after');
      });
      f.addEventListener('keydown', (e: KeyboardEvent) => {
        if (f.mode === 'latex') return; // typing a \command: Esc and Enter are MathLive's
        if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
          e.preventDefault(); e.stopPropagation(); done('after');
        } else if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // through the empty slots (⇧⇥ back); with none left, out of the part the caret is in (a fraction's
          // denominator filled: on after the fraction). MathLive's own selected the whole part, and the next key
          // typed over it
          e.preventDefault(); e.stopPropagation();
          const back = e.shiftKey;
          if (f.value.includes('\\placeholder')) f.executeCommand(back ? 'moveToPreviousPlaceholder' : 'moveToNextPlaceholder');
          else f.executeCommand(back ? 'moveBeforeParent' : 'moveAfterParent');
        } else if (e.key === 'Backspace' && !f.value) {
          e.preventDefault(); e.stopPropagation(); done('remove');
        }
      }, { capture: true });
      requestAnimationFrame(() => { if (!gone) f.focus(); });
      const out: Record<string, string> = {};
      for (const s of SHELVES) for (const p of s.parts) out[p.tex] = mathMarkup(m, p.show ?? p.tex, false);
      faces = out;
    }, () => {});
    // a click anywhere else in the app is done with it (not one on its own row or box)
    const away = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && !root.contains(t) && !(t instanceof Element && t.closest('.ML__keyboard'))) done('away');
    };
    document.addEventListener('mousedown', away, true);
    // ⌘Z with the keyboard elsewhere than the box (the TeX line, a part's button): the note's own undo
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || !root.contains(e.target as Node) || e.target === mf) return;
      if ((e.target as Element).matches?.('input, textarea')) return;
      e.preventDefault(); onHistory(e.shiftKey);
    };
    window.addEventListener('keydown', keys, true);
    return () => {
      gone = true;
      document.removeEventListener('mousedown', away, true);
      window.removeEventListener('keydown', keys, true);
      mf?.remove();
      (window as any).mathVirtualKeyboard?.hide?.();
    };
  });

  // an inline formula's row hangs under it: kept on the screen
  $effect(() => {
    if (display || !tools) return;
    const r = tools.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 12);
    if (over > 0) shift = -Math.min(over, Math.max(0, r.left - 12));
  });

  function put(p: MathPart) {
    if (!mf) return;
    if (tex) tex = false;
    mf.insert(p.tex, { selectionMode: 'placeholder', format: 'latex' });
    mf.focus();
    texValue = clean(mf.value);
    onInput(clean(mf.value));
  }
  function typedTex(v: string) {
    texValue = v;
    if (mf) mf.value = v;
    onInput(v);
  }
  const keep = (e: Event) => e.preventDefault(); // a press on the row leaves the keyboard in the box
</script>

<svelte:element this={display ? 'div' : 'span'} class="math-edit" class:display bind:this={root}>
  <svelte:element this={display ? 'div' : 'span'} class="slot" class:hidden={tex} bind:this={slot}></svelte:element>
  <svelte:element this={display ? 'div' : 'span'} class="tools" class:pop={!display} bind:this={tools} style:translate={shift ? `${shift}px 0` : null}>
    <span class="tabs">
      <span class="shelves" role="tablist">
        {#each SHELVES as s (s.id)}
          <button type="button" role="tab" aria-selected={shelf === s.id} class:on={shelf === s.id && !tex} onmousedown={keep} onclick={() => { shelf = s.id; tex = false; mf?.focus(); }}>{s.label}</button>
        {/each}
      </span>
      <button type="button" class="texb" class:on={tex} aria-pressed={tex} onmousedown={keep} onclick={() => { tex = !tex; if (!tex) mf?.focus(); }}>TeX</button>
      <button type="button" class="done" onmousedown={keep} onclick={() => done('after')}>Done</button>
    </span>
    {#if tex}
      <!-- svelte-ignore a11y_autofocus -->
      <textarea class="texin" rows={display ? 3 : 1} spellcheck="false" autofocus value={texValue}
        oninput={(e) => typedTex((e.currentTarget as HTMLTextAreaElement).value)}
        onkeydown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !display)) { e.preventDefault(); e.stopPropagation(); done('after'); } }}></textarea>
    {:else}
      <span class="parts" role="tabpanel">
        {#each SHELVES.find((s) => s.id === shelf)!.parts as p (p.tex)}
          <button type="button" class="part" title={p.name} aria-label={p.name} onmousedown={keep} onclick={() => put(p)}>
            {#if faces[p.tex]}{@html faces[p.tex]}{:else}{p.show ?? p.tex}{/if}
          </button>
        {/each}
      </span>
    {/if}
  </svelte:element>
</svelte:element>

<style>
  .math-edit { display: inline-block; position: relative; vertical-align: baseline; }
  .math-edit.display { display: block; }
  .slot { display: inline-block; min-width: 2em; }
  .display .slot { display: block; }
  .slot.hidden { visibility: hidden; height: 0; overflow: hidden; }
  /* the box draws the formula as the note does (the same size, a display formula centred), on a soft wash */
  .slot :global(math-field) {
    display: inline-block; min-width: 2em; padding: 0 4px; margin: 0 -4px; border-radius: 6px; font-size: 1em;
    background: var(--bg-input); outline: none; border: 0; color: var(--fg);
    --caret-color: var(--accent); --selection-background-color: var(--accent-soft); --contains-highlight-background-color: transparent;
    --placeholder-color: var(--fg-dim); --smart-fence-color: var(--fg-dim);
  }
  .display .slot :global(math-field) { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 10px 12px; font-size: 1.15em; border-radius: 12px; }
  .display .slot :global(math-field::part(content)) { justify-content: center; }
  /* in a line, no taller than the formula drawn there: the line does not jump as it opens */
  .math-edit:not(.display) .slot :global(math-field::part(container)) { padding: 0; }
  .slot :global(math-field::part(menu-toggle)) { display: none; }
  :global(html:not(.mobile)) .slot :global(math-field::part(virtual-keyboard-toggle)) { display: none; }

  .tools { display: block; margin-top: 8px; user-select: none; -webkit-user-select: none; font-size: 13px; line-height: 1.2; }
  .tools.pop {
    position: absolute; left: -8px; top: calc(100% + 8px); z-index: 20; width: min(440px, calc(100vw - 24px)); margin: 0; padding: 8px;
    border-radius: 12px; background: var(--bg-pop); box-shadow: var(--pop-shadow);
  }
  .tabs { display: flex; align-items: center; gap: 2px; }
  .shelves { display: flex; gap: 2px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .pop .tabs button { padding: 5px 7px; }
  .pop .part { min-width: 32px; min-height: 32px; padding: 3px 6px; }
  .tabs button {
    border: 0; border-radius: 8px; padding: 5px 9px; font: inherit; font-size: 12.5px; font-weight: 500; background: none; color: var(--fg-dim); white-space: nowrap;
  }
  .tabs button.on { background: var(--bg-input); color: var(--fg); }
  @media (hover: hover) { .tabs button:hover { background: var(--bg-hover); color: var(--fg); } }
  .tabs .done { background: var(--accent); color: #fff; margin-left: 2px; }
  @media (hover: hover) { .tabs .done:hover { background: color-mix(in srgb, var(--accent) 88%, #000); color: #fff; } }
  .parts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .part {
    min-width: 36px; min-height: 36px; padding: 3px 8px; border: 0; border-radius: 8px; background: var(--bg-input); color: var(--fg);
    display: inline-flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer;
  }
  .part :global(.ML__latex) { font-size: 0.95em; }
  @media (hover: hover) { .part:hover { background: var(--accent-soft); } }
  .part:active { background: var(--accent-soft); }
  .texin {
    display: block; width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px 10px; border: 0; border-radius: 8px; resize: vertical;
    background: var(--bg-input); color: var(--fg); font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; outline: none;
  }
  /* a phone: MathLive's own keyboard is up under it, so the row takes one line each, swiped sideways */
  :global(html.mobile) .parts { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  :global(html.mobile) .part { flex: none; min-width: 44px; min-height: 44px; }
</style>
