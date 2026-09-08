<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { shortcuts, eventToKeys, type Scope } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { storage, autostart, isTauri } from './lib/platform';
  import { ui } from './lib/ui.svelte';
  import { appearance, FONTS, THEMES, type Theme } from './lib/appearance.svelte';
  import Keys from './Keys.svelte';

  let { onClose, hotkeyError }: { onClose: () => void; hotkeyError: string | null } = $props();

  let recording = $state<string | null>(null);
  let conflict = $state<{ id: string; keys: string; with: string } | null>(null);
  let tab = $state<'shortcuts' | 'appearance' | 'sync'>('shortcuts');
  let notesPath = $state('');
  let launchAtLogin = $state(false);
  onMount(() => { storage.path().then((p) => (notesPath = p)); autostart.get().then((v) => (launchAtLogin = v)); });

  const groups: { scope: Scope; label: string }[] = [
    { scope: 'global', label: 'System-wide' },
    { scope: 'app', label: 'App' },
    { scope: 'editor', label: 'Editor' },
  ];
  const tabs = [['shortcuts', 'Shortcuts'], ['appearance', 'Appearance'], ['sync', 'Sync & app']] as const;

  const syncText = $derived(
    sync.status === 'syncing' ? 'Syncing…'
    : sync.status === 'error' ? 'Sync failed'
    : sync.settings.lastSynced ? `Synced at ${new Date(sync.settings.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Not synced yet');

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
    <div class="seg" role="tablist">
      {#each tabs as [id, label]}
        <button role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id)}>{label}</button>
      {/each}
    </div>
    <button class="icon" onclick={onClose} title="Close (Esc)">✕</button>
  </header>

  <div class="body">
    {#if tab === 'shortcuts'}
      <p class="lead">Click a key chip, then press the new combination. Esc cancels. Changes apply instantly.</p>
      {#if hotkeyError}<p class="alert">System hotkey failed: {hotkeyError}</p>{/if}
      {#each groups as g}
        <h3>{g.label}</h3>
        <div class="card">
          {#each shortcuts.actions.filter((a) => a.scope === g.scope) as a (a.id)}
            <div class="row">
              <span class="label">{a.label}</span>
              <button class="chip" class:rec={recording === a.id} class:bad={conflict?.id === a.id} onclick={() => { recording = a.id; conflict = null; }}>
                {#if recording === a.id}press keys…{:else if a.keys}<Keys keys={a.keys} />{:else}unbound{/if}
              </button>
            </div>
            {#if conflict?.id === a.id}
              <p class="alert"><Keys keys={conflict.keys} /> is already used by “{conflict.with}”. Try another combination, or Esc to cancel.</p>
            {/if}
          {/each}
        </div>
      {/each}
      <div class="foot"><button class="link" onclick={() => shortcuts.reset()}>Reset all to defaults</button></div>

    {:else if tab === 'appearance'}
      <h3>Theme</h3>
      <div class="card">
        <label class="row">
          <span class="label">Appearance <span class="sub">System follows macOS</span></span>
          <select value={appearance.s.theme} onchange={(e) => appearance.set({ theme: e.currentTarget.value as Theme })}>
            {#each THEMES as [id, label]}<option value={id}>{label}</option>{/each}
          </select>
        </label>
      </div>
      <h3>Typeface</h3>
      <div class="card">
        <label class="row">
          <span class="label">Editor font</span>
          <select value={appearance.s.font} onchange={(e) => appearance.set({ font: e.currentTarget.value })}>
            {#each FONTS as f}<option value={f.id}>{f.label}</option>{/each}
          </select>
        </label>
        {#if appearance.s.font === 'custom'}
          <label class="row">
            <span class="label">Font family <span class="sub">any CSS font-family</span></span>
            <input value={appearance.s.custom} oninput={(e) => appearance.set({ custom: e.currentTarget.value })} placeholder="'Pretendard', 'Noto Sans KR', sans-serif" spellcheck="false" />
          </label>
        {/if}
      </div>
      <h3>Text</h3>
      <div class="card">
        <label class="row"><span class="label">Size <span class="sub">{appearance.s.size}px</span></span>
          <input type="range" min="12" max="24" step="1" value={appearance.s.size} oninput={(e) => appearance.set({ size: Number(e.currentTarget.value) })} /></label>
        <label class="row"><span class="label">Line height <span class="sub">{appearance.s.lineHeight}</span></span>
          <input type="range" min="1.2" max="2.2" step="0.05" value={appearance.s.lineHeight} oninput={(e) => appearance.set({ lineHeight: Number(e.currentTarget.value) })} /></label>
        <label class="row"><span class="label">Width <span class="sub">{appearance.s.width}px</span></span>
          <input type="range" min="520" max="1400" step="20" value={appearance.s.width} oninput={(e) => appearance.set({ width: Number(e.currentTarget.value) })} /></label>
      </div>
      <p class="sample" style="font-family: {appearance.stack}; font-size: {appearance.s.size}px; line-height: {appearance.s.lineHeight}">
        The quick brown fox jumps over the lazy dog. 다람쥐 헌 쳇바퀴에 타고파. 0123456789
      </p>
      <div class="foot"><button class="link" onclick={() => appearance.reset()}>Reset to defaults</button></div>

    {:else}
      <h3>GitHub sync</h3>
      <div class="card">
        {#if sync.settings.token}
          <div class="row">
            <span class="label">@{sync.settings.user}
              <span class="sub">private repository <span class="mono">{sync.settings.repo}</span></span></span>
            <button class="btn" onclick={() => sync.logout()}>Sign out</button>
          </div>
          <div class="row">
            <span class="label"><span class="status {sync.status}">{syncText}</span>
              <span class="sub">after edits, every minute, and on focus</span></span>
            <button class="btn primary" onclick={() => sync.now()} disabled={sync.status === 'syncing'}>Sync now</button>
          </div>
          {#if sync.status === 'error'}<p class="alert">{sync.error}</p>{/if}
        {:else if sync.pending}
          <div class="device">
            <p class="sub">Enter this code on the GitHub page that just opened, then authorize Eve.</p>
            <p class="devicecode">{sync.pending.code}</p>
            <div class="actions">
              <button class="btn" onclick={() => sync.cancelLogin()}>Cancel</button>
              <button class="btn" onclick={() => sync.openLogin()}>Open GitHub again</button>
            </div>
          </div>
        {:else}
          <div class="row">
            <span class="label">Not signed in
              <span class="sub">Notes sync to a private <span class="mono">eve-notes</span> repository in your account.</span></span>
            <button class="btn primary" onclick={() => sync.login()} disabled={!isTauri}>Sign in with GitHub</button>
          </div>
          {#if !isTauri}<p class="alert dim">Sign-in needs the desktop app.</p>
          {:else if sync.status === 'error'}<p class="alert">{sync.error}</p>{/if}
        {/if}
      </div>

      <h3>App</h3>
      <div class="card">
        <label class="row">
          <span class="label">Launch at login <span class="sub">keeps <Keys keys={shortcuts.keysFor('toggleWindow')} /> available after a quit</span></span>
          <input type="checkbox" class="switch" checked={launchAtLogin} disabled={!isTauri}
            onchange={(e) => { launchAtLogin = e.currentTarget.checked; autostart.set(launchAtLogin); }} />
        </label>
      </div>

      <h3>Storage</h3>
      <div class="card"><div class="row"><span class="label mono path">{notesPath}</span></div></div>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.22); z-index: 20; }
  .panel {
    position: fixed; z-index: 21; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(560px, 92vw); max-height: 82vh; display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg-pop); border-radius: 14px;
    box-shadow: 0 0 0 0.5px var(--line), 0 24px 80px rgba(0, 0, 0, 0.28);
  }

  header { display: flex; justify-content: space-between; align-items: center; padding: 12px 12px 10px 14px; }
  .seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 9px; background: var(--bg-input); }
  .seg button {
    border: 0; background: none; color: var(--fg-dim); font: inherit; font-size: 12.5px; font-weight: 500;
    padding: 4px 12px; border-radius: 7px; transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .seg button.on { background: var(--bg-pop); color: var(--fg); box-shadow: 0 0 0 0.5px var(--line), 0 1px 2px rgba(0, 0, 0, 0.1); }

  .body { padding: 0 14px 16px; overflow-y: auto; font-size: 13px; }
  .lead { color: var(--fg-dim); font-size: 12.5px; margin: 6px 4px 2px; }
  h3 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--fg-dim); margin: 16px 8px 6px; }

  /* grouped rows, macOS-settings style: hairlines between rows, label left, control right */
  .card { background: var(--bg-input); border-radius: 10px; padding: 0 12px; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 42px; padding: 7px 0; margin: 0; color: inherit; }
  .row + .row, .row + .alert, .alert + .row { border-top: 1px solid var(--line); }
  .label { display: flex; flex-direction: column; gap: 2px; min-width: 0; line-height: 1.3; }
  .sub { font-size: 11.5px; color: var(--fg-dim); font-weight: 400; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
  .path { word-break: break-all; color: var(--fg-dim); padding: 3px 0; }
  .alert { margin: 0; padding: 8px 0 10px; font-size: 12px; color: #ff453a; line-height: 1.4; }
  .alert.dim { color: var(--fg-dim); }
  .foot { margin: 10px 8px 0; }
  .link { border: 0; background: none; color: var(--accent); font: inherit; font-size: 12.5px; padding: 0; }

  /* key chips */
  .chip {
    font: inherit; font-size: 12px; padding: 4px 6px; border-radius: 7px; min-width: 64px;
    border: 0; background: var(--bg-pop); color: var(--fg-dim); box-shadow: 0 0 0 0.5px var(--line);
    transition: box-shadow 0.15s, background 0.15s;
  }
  .chip:hover { box-shadow: 0 0 0 1px var(--line); }
  .chip.rec { box-shadow: 0 0 0 2px var(--accent), var(--glow); animation: blink 1s infinite; }
  .chip.bad { box-shadow: 0 0 0 2px #ff453a; animation: shake 0.3s; }
  @keyframes shake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
  @keyframes blink { 50% { box-shadow: 0 0 0 2px transparent; } }

  /* controls */
  .btn {
    font: inherit; font-size: 12.5px; font-weight: 500; padding: 5px 12px; border-radius: 7px; border: 0; white-space: nowrap;
    background: var(--bg-pop); color: var(--fg); box-shadow: 0 0 0 0.5px var(--line), 0 1px 2px rgba(0, 0, 0, 0.06);
    transition: filter 0.12s, transform 0.12s;
  }
  .btn:hover { background: color-mix(in srgb, var(--bg-pop), var(--fg) 5%); } /* darker in light, lighter in dark */
  .btn:active { transform: scale(0.97); }
  .btn.primary { background: var(--accent); color: light-dark(#fff, #0b0c10); box-shadow: var(--glow); }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.4; pointer-events: none; }
  select, input:not([type]) {
    font: inherit; font-size: 12.5px; padding: 5px 8px; border-radius: 7px; border: 0; outline: none;
    background: var(--bg-pop); color: var(--fg); box-shadow: 0 0 0 0.5px var(--line); max-width: 240px;
  }
  input:not([type]) { flex: 1; }
  input:not([type]):focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  input[type='range'] { accent-color: var(--accent); width: 200px; }
  .switch {
    appearance: none; width: 34px; height: 20px; border-radius: 10px; margin: 0; position: relative;
    background: var(--bg-active); transition: background 0.2s;
  }
  .switch::after {
    content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: transform 0.2s;
  }
  .switch:checked { background: var(--accent); }
  .switch:checked::after { transform: translateX(14px); }
  .switch:disabled { opacity: 0.4; }

  /* sync status dot, same language as the sidebar footer */
  .status::before {
    content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin: 0 7px 1px 0;
    background: var(--fg-dim); transition: background 0.3s;
  }
  .status.ok::before { background: var(--accent); box-shadow: var(--glow); }
  .status.error::before { background: #ff453a; }
  .status.syncing::before { background: var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }

  .device { text-align: center; padding: 14px 0 12px; }
  .device .sub { display: block; margin: 0; }
  .devicecode { font: 600 30px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.14em; margin: 14px 0 16px; user-select: all; }
  .actions { display: flex; justify-content: center; gap: 8px; }

  .sample { margin: 12px 0 0; padding: 14px 16px; border-radius: 10px; background: var(--bg-input); color: var(--fg); }
</style>
