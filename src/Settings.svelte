<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { panelIn, scrimFade } from './lib/motion';
  import { shortcuts, eventToKeys, type Scope } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';
  import { storage, autostart, dock, defaultApp, mcp, isTauri, isMobile, copyText, openUrl, type McpClient } from './lib/platform';
  import { normHost, webBase } from './lib/github';
  import { ui } from './lib/ui.svelte';
  import { appearance, FONTS, THEMES, type Theme } from './lib/appearance.svelte';
  import Keys from './Keys.svelte';
  import Select from './Select.svelte';
  import Slider from './Slider.svelte';
  import { hints } from './lib/hints.svelte';
  import { updates } from './lib/updates.svelte';
  import { renderSVG } from 'uqr';
  import { findUpdate } from './lib/update';
  import { askNotify } from './lib/reminder';

  let { onClose, hotkeyError }: { onClose: () => void; hotkeyError: string | null } = $props();

  let recording = $state<string | null>(null);
  let conflict = $state<{ id: string; keys: string; with: string } | null>(null);
  let tab = $state<'general' | 'appearance' | 'sync' | 'shortcuts'>('general');
  let notesPath = $state('');
  let launchAtLogin = $state(false);
  let opensMarkdown = $state(false);
  let defaultAppError = $state<string | null>(null);
  /** the newest phone release, shown beside the QR (a phone on 0.7.2 or later offers it itself once opened) */
  let phoneApp = $state<{ version: string } | null>(null);
  onMount(() => {
    void updates.check(false, 60_000); // the Version row says what is true now, not what was true hours ago
    if (!isMobile) findUpdate('0').then((r) => (phoneApp = r), () => {});
    storage.path().then((p) => (notesPath = p));
    autostart.get().then((v) => (launchAtLogin = v));
    defaultApp.get().then((v) => (opensMarkdown = v));
    if (isTauri && !isMobile) mcp.clients().then((c) => (claude = c), (e) => (claudeError = String(e)));
  });
  /** Claude apps found on this Mac (null while looking), and the one-click register / unregister */
  let claude = $state<McpClient[] | null>(isTauri && !isMobile ? null : []);
  let claudeBusy = $state(false);
  let claudeError = $state<string | null>(null);
  const claudeFound = $derived((claude ?? []).filter((c) => c.installed));
  const claudeOn = $derived(claudeFound.length > 0 && claudeFound.every((c) => c.connected));
  const claudeText = $derived(
    claude === null ? 'Looking for Claude…'
    : !claudeFound.length ? 'Install Claude Desktop or Claude Code first'
    // every app, found or not: one missing must not pass for connected
    : (claude ?? []).map((c) => `${c.name}: ${!c.installed ? 'not found' : c.connected ? '✓ connected' : c.stale ? 'points at another copy of Eve' : 'not connected'}`).join(' · '));
  async function connectClaude(on: boolean) {
    claudeBusy = true;
    claudeError = null;
    try { claude = await mcp.connect(on); } catch (err) { claudeError = String(err); claude = await mcp.clients().catch(() => claude); }
    claudeBusy = false;
  }
  async function claimMarkdown(on: boolean) {
    defaultAppError = null;
    try {
      await defaultApp.set(on);
      opensMarkdown = await defaultApp.get(); // LaunchServices decides; show what it settled on
    } catch (err) {
      defaultAppError = String(err);
      opensMarkdown = await defaultApp.get();
    }
  }

  const groups: { scope: Scope; label: string }[] = [
    { scope: 'global', label: 'System-wide' },
    { scope: 'app', label: 'App' },
    { scope: 'editor', label: 'Editor' },
  ];
  /** the device code a click away from the clipboard, with a moment of "Copied" to say it worked */
  /** sign-in elsewhere: a GitHub Enterprise server, an organization as the notes' owner, a token instead of the browser */
  let elsewhere = $state(false);
  let signingUp = $state(false); // the GitHub sign-up page was opened from here
  let signIn = $state({ host: sync.settings.host, owner: '', token: '', clientId: '' });
  /** the server as typed, if it reads as one ('' = github.com, or not yet a host) */
  const signHost = $derived.by(() => { try { return normHost(signIn.host); } catch { return ''; } });
  /** a token page on that server: a classic token with the repo scope, named for Eve */
  const tokenPage = $derived(`${webBase(signHost)}/settings/tokens/new?scopes=repo&description=Eve%20notes`);
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyCode(code: string) {
    await copyText(code);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1400);
  }

  // what is changed most comes first; a phone has no shortcuts to set
  const tabs = ([['general', 'General'], ['appearance', 'Appearance'], ['sync', 'Sync'], ['shortcuts', 'Shortcuts']] as const).filter(([id]) => !isMobile || id !== 'shortcuts');

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
  /** Esc with the keyboard still behind Settings (the list's row, the note) closes Settings first: left to them,
   *  the list's own Esc took the keyboard to the note. Inside Settings, its popups keep their own Esc. */
  function escBehind(e: KeyboardEvent) {
    if (e.key !== 'Escape' || recording || ui.pending || ui.menu) return;
    if ((e.target as HTMLElement | null)?.closest?.('.panel')) return;
    e.preventDefault(); e.stopPropagation(); onClose();
  }
</script>

<svelte:window onkeydown={onKey} onkeydowncapture={escBehind} />

<!-- preventDefault: the press would otherwise take the keyboard away again after closing gave it back -->
<div class="backdrop" transition:fade|global={scrimFade} onmousedown={(e) => { e.preventDefault(); onClose(); }} role="presentation"></div>
<div class="panel" transition:scale|global={panelIn} role="dialog">
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

    {:else if tab === 'general'}
      <h3>Notes</h3>
      <div class="card">
        <label class="row">
          <span class="label">Give new notes and groups an icon <span class="sub">a random one on every new or imported note and new group; you can always change it</span></span>
          <input type="checkbox" class="switch" checked={appearance.s.autoIcon}
            onchange={(e) => appearance.set({ autoIcon: e.currentTarget.checked })} />
        </label>
        <label class="row">
          <span class="label">Daily notes <span class="sub">a note for each day, written from its calendar in the list</span></span>
          <input type="checkbox" class="switch" checked={appearance.s.dailyNotes}
            onchange={(e) => appearance.set({ dailyNotes: e.currentTarget.checked })} />
        </label>
        <!-- what only applies while daily notes are on hangs under them, indented, inside the same group -->
        {#if appearance.s.dailyNotes}
          {#if isMobile}
            <label class="row child">
              <span class="label">Show in widget <span class="sub">daily notes in the home-screen widget's list too</span></span>
              <input type="checkbox" class="switch" checked={appearance.s.dailyInWidget}
                onchange={(e) => appearance.set({ dailyInWidget: e.currentTarget.checked })} />
            </label>
          {/if}
          <div class="row child">
            <span class="label">Remind me <span class="sub">if today's note is still empty at this time</span></span>
            <span class="controls">
              {#if appearance.s.dailyReminder}
                <input type="time" class="time" aria-label="Reminder time" value={appearance.s.reminderAt}
                  onchange={(e) => e.currentTarget.value && appearance.set({ reminderAt: e.currentTarget.value })} />
              {/if}
              <input type="checkbox" class="switch" aria-label="Remind me" checked={appearance.s.dailyReminder}
                onchange={(e) => { appearance.set({ dailyReminder: e.currentTarget.checked }); if (e.currentTarget.checked) void askNotify(); }} />
            </span>
          </div>
        {/if}
      </div>
{#if !isMobile}
      <h3>Window</h3>
      <div class="card">
        <label class="row">
          <span class="label">Close sidebar when you start writing <span class="sub">typing or arrowing in the editor folds the list away</span></span>
          <input type="checkbox" class="switch" checked={appearance.s.closeSidebarOnWrite}
            onchange={(e) => appearance.set({ closeSidebarOnWrite: e.currentTarget.checked })} />
        </label>
        <label class="row">
          <span class="label">Hide from Dock and ⌘Tab <span class="sub">like Raycast: only the hotkey and Finder open it</span></span>
          <input type="checkbox" class="switch" checked={dock.hidden} disabled={!isTauri} onchange={(e) => dock.set(e.currentTarget.checked)} />
        </label>
        <label class="row"><span class="label">Opening width <span class="sub">{appearance.s.winW}px</span></span>
          <Slider label="Opening width" min={640} max={1800} step={16} value={appearance.s.winW} oninput={(v) => appearance.set({ winW: v })} /></label>
        <label class="row"><span class="label">Opening height <span class="sub">{appearance.s.winH}px</span></span>
          <Slider label="Opening height" min={400} max={1400} step={16} value={appearance.s.winH} oninput={(v) => appearance.set({ winH: v })} /></label>
      </div>
{/if}
{#if !isMobile}
      <h3>App</h3>
      <div class="card">
        <label class="row">
          <span class="label">Launch at login <span class="sub">keeps <Keys keys={shortcuts.keysFor('toggleWindow')} /> available after a quit</span></span>
          <input type="checkbox" class="switch" checked={launchAtLogin} disabled={!isTauri}
            onchange={(e) => { launchAtLogin = e.currentTarget.checked; autostart.set(launchAtLogin); }} />
        </label>
        <label class="row">
          <span class="label">Open .md files <span class="sub">double-clicking a markdown or text file in Finder opens it here</span></span>
          <input type="checkbox" class="switch" checked={opensMarkdown} disabled={!isTauri}
            onchange={(e) => claimMarkdown(e.currentTarget.checked)} />
        </label>
        {#if defaultAppError}<p class="alert">{defaultAppError}</p>{/if}
        <label class="row">
          <span class="label">Show tips <span class="sub">after doing something the long way, a moment's note of the key that does it</span></span>
          <input type="checkbox" class="switch" aria-label="Show tips" checked={hints.on} onchange={(e) => hints.setOn(e.currentTarget.checked)} />
        </label>
      </div>
      {/if}

{#if isTauri}
      <h3>Version</h3>
      <div class="card">
        <div class="row">
          <span class="label">Eve {updates.current}
            <span class="sub">{updates.checking ? 'Checking…'
              : updates.doing ? updates.doing
              : updates.available ? `${updates.available.version} is available`
              : updates.failed ? (updates.reason.startsWith('GitHub') ? `Could not check — ${updates.reason}` : 'Could not check — offline?')
              : updates.checked ? '✓ Up to date' : 'Not checked yet'}</span></span>
          {#if updates.available}
            <button class="btn primary" disabled={updates.busy} onclick={() => updates.install()}>
              {#if updates.busy}<span class="spin light" aria-hidden="true"></span>{/if}Update
            </button>
          {:else}
            <button class="btn" disabled={updates.checking} onclick={() => updates.check(true)}>
              {#if updates.checking}<span class="spin" aria-hidden="true"></span>{/if}Check
            </button>
          {/if}
        </div>
      </div>
{/if}

      <h3>Storage</h3>
      <div class="card"><div class="row"><span class="label mono path">{notesPath}</span></div></div>

    {:else if tab === 'appearance'}
      <h3>Theme and font</h3>
      <div class="card">
        <div class="row">
          <span class="label">Theme <span class="sub">System follows {isMobile ? 'the phone' : 'macOS'}</span></span>
          <Select label="Theme" value={appearance.s.theme} options={THEMES} onchange={(v) => appearance.set({ theme: v as Theme })} />
        </div>
        <div class="row">
          <span class="label">Editor font</span>
          <Select label="Editor font" value={appearance.s.font} options={FONTS.map((f) => [f.id, isMobile ? f.label.replace(/ \(SF [^)]*\)$/, '') : f.label] as const)} onchange={(v) => appearance.set({ font: v })} />
        </div>
        {#if appearance.s.font === 'custom'}
          <label class="row child">
            <span class="label">Font family <span class="sub">any CSS font-family</span></span>
            <input value={appearance.s.custom} oninput={(e) => appearance.set({ custom: e.currentTarget.value })} placeholder="'Pretendard', 'Noto Sans KR', sans-serif" spellcheck="false" />
          </label>
        {/if}
      </div>
      <h3>Text</h3>
      <div class="card">
        <label class="row"><span class="label">Size <span class="sub">{appearance.s.size}px</span></span>
          <Slider label="Size" min={12} max={24} value={appearance.s.size} oninput={(v) => appearance.set({ size: v })} /></label>
        <label class="row"><span class="label">Line height <span class="sub">{appearance.s.lineHeight}</span></span>
          <Slider label="Line height" min={1.2} max={2.2} step={0.05} value={appearance.s.lineHeight} oninput={(v) => appearance.set({ lineHeight: v })} /></label>
{#if !isMobile}
        <label class="row"><span class="label">Width <span class="sub">{appearance.s.width}px</span></span>
          <Slider label="Width" min={520} max={1400} step={20} value={appearance.s.width} oninput={(v) => appearance.set({ width: v })} /></label>
{/if}
      </div>
      <p class="sample" style="font-family: {appearance.stack}; font-size: {appearance.s.size}px; line-height: {appearance.s.lineHeight}">
        The quick brown fox jumps over the lazy dog. 다람쥐 헌 쳇바퀴에 타고파. 0123456789
      </p>
      <div class="foot"><button class="link" onclick={() => appearance.reset()}>Reset to defaults</button></div>

    {:else if tab === 'sync'}
      <h3>GitHub sync</h3>
      <div class="card">
        {#if sync.claiming}
          <div class="device"><p class="sub">Signing in with your Mac…</p></div>
        {:else if sync.settings.token}
          <div class="row">
            <span class="label">@{sync.settings.user}
              <span class="sub">private repository <span class="mono">{sync.settings.repo}</span>{#if sync.settings.host}{' on '}<span class="mono">{sync.settings.host}</span>{/if}</span></span>
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
            {#if sync.pending.renewed}
              <p class="sub">The last code ran out, so here is a new one: {isMobile ? 'tap' : 'click'} it to copy it.</p>
            {:else}
              <p class="sub">{isMobile
                ? 'The code is copied. On GitHub, long-press the first box and choose Paste.'
                : 'Enter this code on the GitHub page that just opened (it is on the clipboard).'}</p>
            {/if}
            <button class="devicecode" data-tip="Copy" onclick={() => copyCode(sync.pending!.code)}>{copied ? 'Copied' : sync.pending.code}</button>
            <ol class="steps">
              <li>Paste the code on GitHub and press <b>Continue</b>.</li>
              <li>Press <b>Authorize Eve</b>. GitHub calls it “full control of private repositories”: that is what lets
                Eve make its own private <span class="mono nowrap">eve-notes</span> repository and keep your notes in it.</li>
              <li>Come back here: Eve sets up the rest.</li>
            </ol>
            <p class="sub later">No GitHub account yet? Make one on that page first (it is free) — take your time: a code
              that runs out is replaced here.</p>
            <div class="actions">
              <button class="btn" onclick={() => sync.cancelLogin()}>Cancel</button>
              <button class="btn" class:primary={isMobile} onclick={() => sync.openLogin()}>{isMobile ? 'Copy code & open GitHub' : 'Open GitHub again'}</button>
            </div>
          </div>
        {:else}
          <div class="row">
            <span class="label">Not signed in
              <span class="sub">Notes sync to a private <span class="mono">eve-notes</span> repository in your GitHub account.</span></span>
            <button class="btn primary" onclick={() => sync.login(elsewhere ? signIn : {})} disabled={!isTauri}>{elsewhere && signIn.token.trim() ? 'Sign in with token' : 'Sign in with GitHub'}</button>
          </div>
          {#if !elsewhere && isTauri}
            <!-- someone with no GitHub yet: the account first, with no sign-in code ticking meanwhile -->
            <div class="row">
              <span class="label">{signingUp ? 'Made your account?' : 'New to GitHub?'}
                <span class="sub">{signingUp
                  ? 'Confirm its email address (GitHub sends a link), then press Sign in with GitHub.'
                  : 'A free account is all Eve needs. Only you can see the notes in it.'}</span></span>
              <button class="btn" onclick={() => { signingUp = true; void openUrl('https://github.com/signup'); }}>{signingUp ? 'Open again' : 'Create account'}</button>
            </div>
          {/if}
          {#if elsewhere}
            <!-- GitHub Enterprise (NAME.ghe.com, or a company's own server), an organization, or a token -->
            <label class="row">
              <span class="label">Server <span class="sub">blank for github.com</span></span>
              <input bind:value={signIn.host} placeholder="github.acme.com · acme.ghe.com" spellcheck="false" autocapitalize="off" />
            </label>
            <label class="row">
              <span class="label">Owner <span class="sub">blank for your account, or an organization</span></span>
              <input bind:value={signIn.owner} placeholder="your account" spellcheck="false" autocapitalize="off" />
            </label>
            <label class="row">
              <span class="label">Token
                <span class="sub">instead of the browser; <button class="link small" onclick={(e) => { e.preventDefault(); void openUrl(tokenPage); }}>create one</button> with the <span class="mono">repo</span> scope</span></span>
              <input type="password" bind:value={signIn.token} placeholder="ghp_…" spellcheck="false" autocomplete="off" />
            </label>
            {#if signHost && !signIn.token.trim()}
              <label class="row">
                <span class="label">OAuth App Client ID <span class="sub">for browser sign-in on this server: an app its admin registered for Eve, with Device Flow on</span></span>
                <input bind:value={signIn.clientId} placeholder="Iv1.…" spellcheck="false" autocapitalize="off" />
              </label>
            {/if}
          {/if}
          {#if !isTauri}<p class="alert dim">Sign-in needs the desktop app.</p>
          {:else if sync.status === 'error'}<p class="alert">{sync.error}</p>{/if}
          {#if isTauri}
            <div class="row"><button class="link" onclick={() => (elsewhere = !elsewhere)}>{elsewhere ? 'Back to github.com' : 'GitHub Enterprise, an organization, or a token…'}</button></div>
          {/if}
        {/if}
      </div>

{#if !isMobile && isTauri && sync.settings.token}
      <h3>Android phone</h3>
      <div class="card">
        {#if sync.phone}
          <div class="phone">
            <!-- the newest phone version sits in the middle; ecc H keeps the code readable under it -->
            <div class="qr" class:done={sync.phone.done}>
              {@html renderSVG(sync.phone.link, { ecc: 'H', border: 2, whiteColor: '#fff', blackColor: '#111318' })}
              {#if phoneApp}<span class="qrver">Eve<b>{phoneApp.version}</b></span>{/if}
            </div>
            {#if sync.phone.done}
              <p class="took">✓ The phone is signed in.</p>
            {:else}
              <ol>
                <li>Scan it with the phone's camera. Without Eve it downloads the app — install it.</li>
                <li>Scan it again: Eve opens and signs in as <b>@{sync.settings.user}</b> by itself.</li>
                <li>Already have Eve? The same scan opens it, and it offers {phoneApp ? phoneApp.version : 'the newest version'} at the top of the list.</li>
              </ol>
            {/if}
          </div>
          <p class="sub pad">The phone and this Mac need the same Wi-Fi. The code works once, for ten minutes.</p>
          <div class="actions pad"><button class="btn" onclick={() => sync.phoneDone()}>Done</button></div>
        {:else}
          <div class="row">
            <span class="label">Set up a phone
              <span class="sub">one QR installs Eve on Android and signs it in to <span class="mono">{sync.settings.repo}</span>{phoneApp ? ` · newest phone app ${phoneApp.version}` : ''}</span></span>
            <button class="btn primary" onclick={() => sync.phoneSetup(phoneApp?.version)}>Show QR</button>
          </div>
        {/if}
      </div>
{/if}

{#if !isMobile}
      <h3>Claude</h3>
      <div class="card">
        <div class="row">
          <span class="label">Let Claude read your notes
            <span class="sub">{isTauri ? claudeText : 'Needs the desktop app.'}</span></span>
          {#if claudeOn}
            <button class="btn" disabled={claudeBusy} onclick={() => connectClaude(false)}>
              {#if claudeBusy}<span class="spin" aria-hidden="true"></span>{/if}Disconnect
            </button>
          {:else}
            <button class="btn primary" disabled={claudeBusy || !claudeFound.length} onclick={() => connectClaude(true)}>
              {#if claudeBusy}<span class="spin light" aria-hidden="true"></span>{/if}Connect
            </button>
          {/if}
        </div>
        {#if claudeError}<p class="alert">{claudeError}</p>
        {:else if claudeOn}<p class="alert dim">Claude can list, search and read notes, and open one here for you — never change them. Restart Claude Desktop to pick it up; Claude Code sees it in its next session.</p>{/if}
      </div>
{/if}

    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: var(--scrim); z-index: 20; }
  /* a phone: settings is a page, and the strip above the status bar is part of it */
  :global(html.mobile) .backdrop { background: var(--bg); }
  .panel {
    position: fixed; z-index: 21; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(560px, 92vw); max-height: 82vh; display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg-pop); border-radius: var(--panel-radius); box-shadow: var(--panel-shadow);
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
  /* group captions as macOS writes them: sentence case, a touch heavier than the rows, no shouting caps */
  h3 { font-size: 12px; font-weight: 600; color: var(--fg-dim); margin: 18px 6px 6px; }

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
  .btn:has(.spin):disabled { opacity: 0.75; }
  .spin {
    display: inline-block; width: 12px; height: 12px; margin: 0 7px -2px 0; border-radius: 50%;
    border: 1.8px solid var(--line); border-top-color: var(--fg-dim); animation: spin 0.7s linear infinite;
  }
  .spin.light { border-color: rgba(255, 255, 255, 0.45); border-top-color: #fff; }
  .btn.primary:has(.spin):disabled { opacity: 0.85; }
  @keyframes spin { to { transform: rotate(360deg); } }
  input:not([type]), input[type='password'] {
    font: inherit; font-size: 12.5px; padding: 5px 8px; border-radius: 7px; border: 0; outline: none;
    background: var(--bg-pop); color: var(--fg); box-shadow: 0 0 0 0.5px var(--line); max-width: 240px;
  }
  input:not([type]), input[type='password'] { flex: 1; }
  input:not([type]):focus, input[type='password']:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  .link.small { font-size: inherit; }
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
  .steps { margin: 0 auto 12px; padding-left: 20px; max-width: 420px; text-align: left; font-size: 12.5px; line-height: 1.5; color: var(--fg-dim); }
  .steps li + li { margin-top: 4px; }
  .steps .nowrap { white-space: nowrap; }
  .device .sub.later { margin-bottom: 14px; }
  .steps b { color: var(--fg); font-weight: 600; }
  .devicecode { display: block; border: 0; background: none; color: inherit; cursor: copy; font: 600 30px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.14em; margin: 14px auto 16px; user-select: all; -webkit-user-select: all; }
  .actions { display: flex; justify-content: center; gap: 8px; }
  .actions.pad { padding: 0 0 14px; }
  .phone { display: flex; gap: 18px; align-items: center; padding: 14px 16px; }
  /* the code stays black on white in dark mode too: cameras read it best that way */
  .qr { position: relative; flex: none; width: 184px; height: 184px; border-radius: 10px; overflow: hidden; background: #fff; }
  .qr :global(svg) { display: block; width: 100%; height: 100%; }
  .qrver {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column;
    align-items: center; padding: 4px 7px; border-radius: 7px; background: #fff; color: #111318;
    font-size: 9px; font-weight: 600; line-height: 1.15; letter-spacing: 0.02em; box-shadow: 0 0 0 3px #fff;
  }
  .qrver b { font-size: 12px; font-weight: 700; letter-spacing: 0; }
  .phone ol { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.5; color: var(--fg); }
  .phone li + li { margin-top: 8px; }
  .qr.done { opacity: 0.25; }
  .took { margin: 0; font-size: 14px; color: var(--fg); }
  p.sub.pad { margin: 0; padding: 0 16px 10px; font-size: 12px; }
  .codechip {
    display: block; margin: 6px 0 2px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg-pop); color: var(--fg); font-size: 16px; font-weight: 600; letter-spacing: 0.12em;
    min-width: 128px; text-align: center; cursor: copy; user-select: all; -webkit-user-select: all;
  }
  .codechip:hover { border-color: var(--accent); }

  /* a setting that only applies while the one above is on: indented in the same group, macOS-style, and
     the hairline above it starts at the indent, so it reads as part of its parent rather than a peer */
  .row.child { margin-left: 22px; border-top: 1px solid var(--line); }
  .controls { display: flex; align-items: center; gap: 10px; flex: none; }
  .time {
    font: inherit; font-size: 13px; padding: 4px 8px; border: 0; border-radius: 7px; outline: none;
    background: var(--bg-pop); color: var(--fg); box-shadow: 0 0 0 0.5px var(--line); font-variant-numeric: tabular-nums;
  }
  .time:focus { box-shadow: 0 0 0 2px var(--accent-soft); }
  :global(html.mobile) .time { font-size: 16px; padding: 8px 10px; background: var(--bg-input); box-shadow: none; }
  .sample { margin: 12px 0 0; padding: 14px 16px; border-radius: 10px; background: var(--bg-input); color: var(--fg); }
</style>
