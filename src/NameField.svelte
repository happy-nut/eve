<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { composing } from './lib/keys';

  /** A picked box's or lane's name. Until typed into it is armed: unseen, holding the keyboard so the first key typed
   *  starts renaming; then it is the shown field (`shown`, its class), which ↩ keeps, Esc drops and Tab passes on. */
  let { value = $bindable(''), editing, shown, label, placeholder, left, top, width, grab, onstart, ontype, oncommit, oncancel, ontab, onblur }: {
    value: string;
    editing: boolean;
    shown: 'rename' | 'lane-name';
    label: string;
    placeholder?: string;
    left: number;
    top: number;
    width?: number;
    grab?: Attachment<HTMLInputElement>;
    onstart: () => void;
    ontype?: () => void;
    oncommit: () => void;
    oncancel: () => void;
    ontab?: () => void;
    onblur: (el: HTMLInputElement) => void;
  } = $props();

  function onkeydown(e: KeyboardEvent) {
    if (composing(e) || !editing) return;
    if (e.key === 'Enter') { e.preventDefault(); oncommit(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); oncancel(); }
    else if (e.key === 'Tab' && ontab) { e.preventDefault(); ontab(); }
  }
</script>

<input class={editing ? shown : 'armed'} bind:value aria-label={label} {placeholder} {@attach grab}
  style:left={`${left}px`} style:top={`${top}px`} style:width={width === undefined ? undefined : `${width}px`}
  oninput={() => { if (!editing) onstart(); ontype?.(); }} {onkeydown} onblur={(e) => onblur(e.currentTarget)} />

<style>
  .armed { position: absolute; width: 140px; height: 32px; opacity: 0; pointer-events: none; }
  .lane-name {
    position: absolute; width: 140px; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 13px; font-weight: 600; color: var(--fg); background: var(--bg-pop); box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0, 0, 0, 0.15); outline: none;
  }
  .rename {
    position: absolute; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 10px; text-align: center;
    font: inherit; font-size: 14px; color: var(--fg); background: var(--bg-pop); outline: none;
    border-radius: 16px; box-shadow: 0 0 0 1.5px var(--accent), 0 0 0 5px var(--accent-soft);
  }
</style>
