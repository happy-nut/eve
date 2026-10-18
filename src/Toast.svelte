<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { ui } from './lib/ui.svelte';
  import { isMobile } from './lib/platform';
</script>

<!-- a status, not a dialog: it takes no focus and blocks nothing, so writing goes on under it; its one button is
     there for the mouse (or a tap) while it lasts. Keyed, so a newer one comes in as itself, not as an edit of the last -->
{#if ui.toastMsg}
  {#key ui.toastMsg.id}
    <div class="toast" class:mobile={isMobile} role="status" aria-live="polite" transition:fly|global={{ y: 8, duration: 160, easing: cubicOut }}>
      <span class="msg">{ui.toastMsg.message}</span>
      {#if ui.toastMsg.action}
        <!-- mousedown kept from the button: the caret stays in the note it was in -->
        <button onmousedown={(e) => e.preventDefault()} onclick={() => ui.toastAction()}>{ui.toastMsg.action.label}</button>
      {/if}
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed; left: 50%; bottom: 24px; translate: -50% 0; z-index: var(--z-toast);
    display: flex; align-items: center; gap: 12px; max-width: min(440px, calc(100vw - 32px));
    padding: 6px 6px 6px 14px; font-size: 13px; color: var(--fg);
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
  }
  /* a phone's formatting bar (and the list's + button) sit along the bottom: clear of them */
  .toast.mobile { bottom: calc(84px + env(safe-area-inset-bottom)); }
  .msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    flex: none; border: 0; border-radius: 6px; padding: 4px 9px; background: none;
    font: inherit; font-size: 13px; font-weight: 600; color: var(--accent); transition: background 0.12s;
  }
  button:hover { background: var(--accent-soft); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
