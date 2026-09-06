<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { shortcuts, eventToKeys, prettyKeys, type Scope } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { storage } from './lib/platform';

  let { onClose, hotkeyError }: { onClose: () => void; hotkeyError: string | null } = $props();

  let recording = $state<string | null>(null);
  let tab = $state<'shortcuts' | 'sync'>('shortcuts');
  let notesPath = $state('');
  onMount(() => { storage.path().then((p) => (notesPath = p)); });

  const groups: { scope: Scope; label: string }[] = [
    { scope: 'global', label: 'System-wide' },
    { scope: 'app', label: 'App' },
    { scope: 'editor', label: 'Editor' },
  ];

  function onKey(e: KeyboardEvent) {
    if (recording) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { recording = null; return; }
      const keys = eventToKeys(e);
      if (!keys) return; // modifier only, keep waiting
      shortcuts.set(recording, keys);
      recording = null;
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" transition:fade={{ duration: 140 }} onmousedown={onClose} role="presentation"></div>
<div class="panel" transition:scale={{ start: 0.96, duration: 180 }} role="dialog">
  <header>
    <nav>
      <button class:on={tab === 'shortcuts'} onclick={() => (tab = 'shortcuts')}>Shortcuts</button>
      <button class:on={tab === 'sync'} onclick={() => (tab = 'sync')}>Sync</button>
    </nav>
    <button class="icon" onclick={onClose} title="Close (Esc)">✕</button>
  </header>

  {#if tab === 'shortcuts'}
    <section>
      <p class="hint">Click a key chip, then press the new combination. Esc cancels. Changes apply instantly.</p>
      {#if hotkeyError}<p class="err">System hotkey failed: {hotkeyError}</p>{/if}
      {#each groups as g}
        <h3>{g.label}</h3>
        {#each shortcuts.actions.filter((a) => a.scope === g.scope) as a (a.id)}
          <div class="row">
            <span>{a.label}</span>
            <button class="chip" class:rec={recording === a.id} onclick={() => (recording = a.id)}>
              {recording === a.id ? 'press keys…' : a.keys ? prettyKeys(a.keys) : 'unbound'}
            </button>
          </div>
        {/each}
      {/each}
      <button class="link" onclick={() => shortcuts.reset()}>Reset all to defaults</button>
    </section>
  {:else}
    <section>
      <p class="hint">
        Point Jot at your own sync server (see <code>server/</code> in the repo). Leave URL empty to stay local-only.
      </p>
      <label>Server URL <input value={sync.settings.url} oninput={(e) => sync.save({ url: e.currentTarget.value.trim() })} placeholder="https://notes.example.com" spellcheck="false" /></label>
      <label>Token <input type="password" value={sync.settings.token} oninput={(e) => sync.save({ token: e.currentTarget.value })} /></label>
      <div class="row">
        <button class="primary" onclick={() => sync.now()} disabled={!sync.enabled || sync.status === 'syncing'}>Sync now</button>
        <span class="hint">
          {#if sync.status === 'error'}<span class="err">{sync.error}</span>
          {:else if sync.settings.lastSynced}last synced {new Date(sync.settings.lastSynced).toLocaleTimeString()}{/if}
        </span>
      </div>
      <h3>Storage</h3>
      <p class="hint mono">{notesPath}</p>
    </section>
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.25); z-index: 20; }
  .panel {
    position: fixed;
    z-index: 21;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-pop);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }
  header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  nav { display: flex; gap: 4px; }
  nav button { border: 0; background: none; color: var(--fg-dim); font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; }
  nav button.on { background: var(--bg-active); color: inherit; }
  section { padding: 12px 16px 16px; overflow-y: auto; font-size: 13px; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-dim); margin: 16px 0 6px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 0; }
  .chip {
    font: inherit; font-size: 12px; font-family: ui-monospace, monospace;
    padding: 3px 8px; border-radius: 6px; min-width: 60px;
    border: 1px solid var(--line); background: var(--bg-input); color: inherit;
    transition: box-shadow 0.15s, background 0.15s;
  }
  .chip:hover { background: var(--bg-hover); }
  .chip.rec { box-shadow: 0 0 0 2px var(--accent); animation: blink 1s infinite; }
  @keyframes blink { 50% { box-shadow: 0 0 0 2px transparent; } }
  .hint { color: var(--fg-dim); margin: 4px 0 8px; }
  .err { color: #ff453a; }
  .mono { font-family: ui-monospace, monospace; font-size: 11.5px; word-break: break-all; }
  .link { border: 0; background: none; color: var(--accent); font: inherit; font-size: 12px; margin-top: 12px; padding: 0; }
  label { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; color: var(--fg-dim); }
  label input { font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg-input); color: var(--fg); outline: none; }
  label input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .primary { font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 6px; border: 0; background: var(--accent); color: white; }
  .primary:disabled { opacity: 0.4; }
</style>
