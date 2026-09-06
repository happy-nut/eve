<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { shortcuts, eventToKeys, prettyKeys, type Scope } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { storage, autostart, isTauri } from './lib/platform';
  import { ui } from './lib/ui.svelte';
  import { appearance, FONTS } from './lib/appearance.svelte';

  let { onClose, hotkeyError }: { onClose: () => void; hotkeyError: string | null } = $props();

  let recording = $state<string | null>(null);
  let conflict = $state<{ id: string; keys: string; with: string } | null>(null);
  let tab = $state<'shortcuts' | 'font' | 'sync'>('shortcuts');
  let notesPath = $state('');
  let launchAtLogin = $state(false);
  onMount(() => { storage.path().then((p) => (notesPath = p)); autostart.get().then((v) => (launchAtLogin = v)); });

  const groups: { scope: Scope; label: string }[] = [
    { scope: 'global', label: 'System-wide' },
    { scope: 'app', label: 'App' },
    { scope: 'editor', label: 'Editor' },
  ];

  function onKey(e: KeyboardEvent) {
    if (ui.pending) return;
    if (recording) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { recording = null; conflict = null; return; }
      const keys = eventToKeys(e);
      if (!keys) return; // modifier only, keep waiting
      const clash = shortcuts.set(recording, keys);
      if (clash) { conflict = { id: recording, keys, with: clash.label }; return; } // keep recording
      conflict = null;
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
      <button class:on={tab === 'font'} onclick={() => (tab = 'font')}>Font</button>
      <button class:on={tab === 'sync'} onclick={() => (tab = 'sync')}>Sync & app</button>
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
            <button class="chip" class:rec={recording === a.id} class:bad={conflict?.id === a.id} onclick={() => { recording = a.id; conflict = null; }}>
              {recording === a.id ? 'press keys…' : a.keys ? prettyKeys(a.keys) : 'unbound'}
            </button>
          </div>
          {#if conflict?.id === a.id}
            <p class="err conflict">{prettyKeys(conflict.keys)} is already used by “{conflict.with}”. Try another combination, or Esc to cancel.</p>
          {/if}
        {/each}
      {/each}
      <button class="link" onclick={() => shortcuts.reset()}>Reset all to defaults</button>
    </section>
  {:else if tab === 'font'}
    <section>
      <label>Editor font
        <select value={appearance.s.font} onchange={(e) => appearance.set({ font: e.currentTarget.value })}>
          {#each FONTS as f}<option value={f.id}>{f.label}</option>{/each}
        </select>
      </label>
      {#if appearance.s.font === 'custom'}
        <label>Font family (CSS) <input value={appearance.s.custom} oninput={(e) => appearance.set({ custom: e.currentTarget.value })} placeholder="'Pretendard', 'Noto Sans KR', sans-serif" spellcheck="false" /></label>
      {/if}
      <label class="row check"><span>Size <span class="hint">{appearance.s.size}px</span></span>
        <input type="range" min="12" max="24" step="1" value={appearance.s.size} oninput={(e) => appearance.set({ size: Number(e.currentTarget.value) })} /></label>
      <label class="row check"><span>Line height <span class="hint">{appearance.s.lineHeight}</span></span>
        <input type="range" min="1.2" max="2.2" step="0.05" value={appearance.s.lineHeight} oninput={(e) => appearance.set({ lineHeight: Number(e.currentTarget.value) })} /></label>
      <label class="row check"><span>Text width <span class="hint">{appearance.s.width}px</span></span>
        <input type="range" min="520" max="1400" step="20" value={appearance.s.width} oninput={(e) => appearance.set({ width: Number(e.currentTarget.value) })} /></label>
      <p class="sample" style="font-family: {appearance.stack}; font-size: {appearance.s.size}px; line-height: {appearance.s.lineHeight}">
        The quick brown fox jumps over the lazy dog. 다람쥐 헌 쳇바퀴에 타고파. 0123456789
      </p>
      <button class="link" onclick={() => appearance.reset()}>Reset to defaults</button>
    </section>
  {:else}
    <section>
      <p class="hint">
        Point Eve at your own sync server (see <code>server/</code> in the repo). Leave URL empty to stay local-only.
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
      <h3>App</h3>
      <label class="row check">
        <span>Launch at login <span class="hint">keeps {prettyKeys(shortcuts.keysFor('toggleWindow'))} available after a quit</span></span>
        <input type="checkbox" checked={launchAtLogin} disabled={!isTauri}
          onchange={(e) => { launchAtLogin = e.currentTarget.checked; autostart.set(launchAtLogin); }} />
      </label>
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
  .chip.rec { box-shadow: 0 0 0 2px var(--accent), var(--glow); animation: blink 1s infinite; }
  .chip.bad { box-shadow: 0 0 0 2px #ff453a; animation: shake 0.3s; }
  @keyframes shake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
  .conflict { margin: 0 0 6px; font-size: 12px; }
  @keyframes blink { 50% { box-shadow: 0 0 0 2px transparent; } }
  .hint { color: var(--fg-dim); margin: 4px 0 8px; }
  .err { color: #ff453a; }
  .mono { font-family: ui-monospace, monospace; font-size: 11.5px; word-break: break-all; }
  .link { border: 0; background: none; color: var(--accent); font: inherit; font-size: 12px; margin-top: 12px; padding: 0; }
  label { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; color: var(--fg-dim); }
  label.check { flex-direction: row; justify-content: space-between; align-items: center; color: var(--fg); }
  label.check .hint { display: block; margin: 0; font-size: 11.5px; }
  label.check input[type='checkbox'] { accent-color: var(--accent); width: 16px; height: 16px; }
  label.check input[type='range'] { accent-color: var(--accent); width: 180px; }
  select { font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg-input); color: var(--fg); }
  .sample { margin: 14px 0 6px; padding: 12px 14px; border-radius: 8px; background: var(--bg-input); color: var(--fg); }
  label input { font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--bg-input); color: var(--fg); outline: none; }
  label input:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .primary { font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 6px; border: 0; background: var(--accent); color: #0b0c10; font-weight: 600; box-shadow: var(--glow); }
  .primary:disabled { opacity: 0.4; }
</style>
