<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { panelIn, scrimFade } from './lib/motion';
  import { sheet } from './lib/popup';
  import { ui } from './lib/ui.svelte';
  import { notes, titleOf } from './lib/notes.svelte';
  import { editedLabel } from './lib/date';
  import { isDailyId } from './lib/daily';
  import { typedIn } from './lib/hangul';
  import Icon from './Icon.svelte';

  // the trash (Notion's): what was deleted, newest first; a row brings its note back, or deletes it for good
  let q = $state('');
  const list = $derived(notes.trash.filter((n) => !q.trim() || typedIn(titleOf(n).toLowerCase(), q.trim().toLowerCase())));
  const appear = (node: Element) => sheet(node, (n) => scale(n, panelIn));
  const focus = (el: HTMLElement) => el.focus();

  function restore(id: string) {
    ui.closeTrash();
    notes.restore(id);
  }
  async function erase(ids: string[], what: string) {
    if (ids.length && (await ui.ask(`Delete ${what} for good? It can't be brought back.`))) notes.erase(ids);
  }
</script>

<div class="backdrop" transition:fade|global={scrimFade} onmousedown={() => ui.closeTrash()} role="presentation"></div>
<div class="rpanel" data-panel="trash" transition:appear|global role="dialog" aria-modal="true" aria-label="Trash">
  <div class="top">
    <input class="search" placeholder="Search the trash" bind:value={q} use:focus spellcheck="false" />
    <button class="close" aria-label="Close" onclick={() => ui.closeTrash()}><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
  </div>
  {#if list.length}
    <ul>
      {#each list as n (n.id)}
        <li>
          <button class="row" title="Bring it back" onclick={() => restore(n.id)}>
            {#if n.icon}<Icon icon={n.icon} size={16} />{/if}
            <span class="name">{isDailyId(n.id) ? n.id.slice(6) : titleOf(n)}</span>
            <span class="when">{editedLabel(n.updatedAt)}</span>
          </button>
          <button class="restore" aria-label="Restore" title="Restore" onclick={() => restore(n.id)}>
            <svg viewBox="0 0 16 16"><path d="M3.5 6.5h6a3.5 3.5 0 0 1 0 7H6"/><path d="M6 3.5l-3 3 3 3"/></svg>
          </button>
          <button class="erase" aria-label="Delete for good" title="Delete for good" onclick={() => erase([n.id], `“${titleOf(n)}”`)}>
            <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9"/></svg>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">{q.trim() ? 'Nothing deleted by that name.' : 'Nothing in the trash. Deleted notes wait here until they are deleted for good.'}</p>
  {/if}
  {#if notes.trash.length && !q.trim()}
    <div class="foot">
      <button class="danger" onclick={() => erase(notes.trash.map((n) => n.id), `all ${notes.trash.length} notes in the trash`)}>Empty trash</button>
    </div>
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: var(--scrim); z-index: var(--z-sheet-scrim); }
  .rpanel {
    position: fixed; z-index: var(--z-sheet); top: 40%; left: 50%; transform: translate(-50%, -50%);
    width: min(440px, 92vw); max-height: min(520px, 80vh); display: flex; flex-direction: column;
    border-radius: var(--panel-radius); background: var(--bg-pop); box-shadow: var(--panel-shadow); font-size: 13px; overflow: hidden;
  }
  /* a phone: a sheet from the bottom, as the menus are */
  :global(html.mobile) .rpanel { top: auto; bottom: 0; left: 0; right: 0; width: auto; transform: none; border-radius: var(--panel-radius) var(--panel-radius) 0 0; max-height: 75vh; padding-bottom: env(safe-area-inset-bottom); }
  .top { display: flex; gap: 6px; padding: 10px 10px 6px; }
  .search { flex: 1; font: inherit; padding: 7px 9px; border-radius: 8px; border: 0; background: var(--bg-input); color: var(--fg); outline: none; }
  .search:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  ul { list-style: none; margin: 0; padding: 0 6px 6px; overflow-y: auto; }
  li { display: flex; align-items: center; gap: 2px; border-radius: 8px; }
  li:hover { background: var(--bg-hover); }
  button { border: 0; background: none; color: var(--fg); font: inherit; border-radius: 6px; }
  .row { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 7px 8px; text-align: left; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { flex: none; color: var(--fg-dim); font-size: 12px; }
  .restore, .erase, .close { flex: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-dim); }
  /* a phone: a finger's size, and Restore well apart from Delete for good (2px apart, a tap a little off erased the note) */
  :global(html.mobile) .restore, :global(html.mobile) .erase, :global(html.mobile) .close { width: 44px; height: 44px; }
  :global(html.mobile) .erase { margin-left: 12px; }
  .restore:hover, .erase:hover, .close:hover { background: var(--bg-input); color: var(--fg); }
  svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .empty { margin: 0; padding: 18px 16px 22px; color: var(--fg-dim); line-height: 1.45; }
  .foot { display: flex; justify-content: flex-end; padding: 8px 10px 10px; border-top: 1px solid var(--line); }
  .danger { padding: 6px 12px; font-weight: 500; background: #ff453a; color: #fff; } /* as the dialog's Delete */
  .danger:hover { background: color-mix(in srgb, #ff453a 88%, #000); }
  .erase:hover { color: #ff453a; }
</style>
