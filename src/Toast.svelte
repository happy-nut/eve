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
    /* dark, as the hints that come up in the same place are (it was a white card there, a stranger to them) */
    padding: 6px 6px 6px 14px; font-size: 13px; color: #f2f3f5;
    background: light-dark(#1d1f24, #2a2d33); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }
  /* a phone's formatting bar (and the list's + button) sit along the bottom: clear of them */
  .toast.mobile { bottom: calc(84px + env(safe-area-inset-bottom)); }
  .msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    flex: none; border: 0; border-radius: 6px; padding: 4px 9px; background: none;
    font: inherit; font-size: 13px; font-weight: 600; color: light-dark(#7cb4ff, #8ab8ff); transition: background 0.12s;
  }
  button:hover { background: rgba(255, 255, 255, 0.1); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
