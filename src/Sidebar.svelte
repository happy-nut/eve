<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fade, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { notes, titleOf, plain } from './lib/notes.svelte';
  import { shortcuts, prettyKeys } from './lib/shortcuts.svelte';
  import { sync } from './lib/sync.svelte';

  let { open = $bindable(true), searchEl = $bindable<HTMLInputElement | null>(null), onSettings }:
    { open: boolean; searchEl: HTMLInputElement | null; onSettings: () => void } = $props();

  let query = $state('');
  const list = $derived(
    query
      ? notes.visible.filter((n) => n.body.toLowerCase().includes(query.toLowerCase()))
      : notes.visible,
  );

  function ago(t: number) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
  function preview(body: string) {
    return body.split('\n').slice(1).map(plain).find((l) => l && !/^```/.test(l)) ?? '';
  }
  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { query = ''; searchEl?.blur(); e.preventDefault(); }
    if (e.key === 'Enter' && list[0]) { notes.currentId = list[0].id; searchEl?.blur(); e.preventDefault(); }
  }
</script>

{#if open}
  <aside transition:slide={{ axis: 'x', duration: 220, easing: cubicOut }}>
    <div class="top" data-tauri-drag-region>
      <input
        bind:this={searchEl}
        bind:value={query}
        onkeydown={onSearchKey}
        placeholder="Search  {prettyKeys(shortcuts.keysFor('search'))}"
        spellcheck="false"
      />
      <button class="icon" title="New note {prettyKeys(shortcuts.keysFor('newNote'))}" onclick={() => notes.create()}>+</button>
    </div>

    <ul>
      {#each list as n (n.id)}
        <li animate:flip={{ duration: 200 }} transition:fade={{ duration: 120 }}>
          <button class:active={n.id === notes.currentId} onclick={() => (notes.currentId = n.id)}>
            <span class="title">{titleOf(n)}</span>
            <span class="meta"><span class="preview">{preview(n.body)}</span><time>{ago(n.updatedAt)}</time></span>
          </button>
        </li>
      {/each}
    </ul>

    <footer>
      <span class="sync {sync.status}" title={sync.error || (sync.enabled ? 'Synced' : 'Sync off')}>
        {sync.enabled ? (sync.status === 'error' ? 'sync error' : sync.status === 'syncing' ? 'syncing…' : 'synced') : 'local only'}
      </span>
      <button class="icon" title="Settings {prettyKeys(shortcuts.keysFor('settings'))}" onclick={onSettings}>⚙︎</button>
    </footer>
  </aside>
{/if}

<style>
  aside {
    width: 240px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--bg-side);
    border-right: 1px solid var(--line);
    overflow: hidden;
  }
  .top {
    display: flex;
    gap: 6px;
    padding: 40px 10px 8px; /* room for traffic lights */
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 6px;
    padding: 6px 8px;
    background: var(--bg-input);
    color: inherit;
    font: inherit;
    font-size: 13px;
    outline: none;
    transition: box-shadow 0.15s;
  }
  input:focus { box-shadow: 0 0 0 2px var(--accent-soft), var(--glow); }
  ul { list-style: none; margin: 0; padding: 4px 6px; overflow-y: auto; flex: 1; }
  li button {
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    padding: 7px 10px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: default;
    transition: background 0.12s, transform 0.12s;
  }
  li button:hover { background: var(--bg-hover); }
  li button:active { transform: scale(0.985); }
  li button.active { background: var(--bg-active); }
  .title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; gap: 8px; font-size: 11.5px; color: var(--fg-dim); }
  .preview { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 8px 14px;
    font-size: 11.5px;
    color: var(--fg-dim);
    border-top: 1px solid var(--line);
  }
  .sync::before {
    content: '';
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    margin-right: 6px;
    background: var(--fg-dim);
    transition: background 0.3s;
  }
  .sync.ok::before { background: var(--accent); box-shadow: var(--glow); }
  .sync.error::before { background: #ff453a; }
  .sync.syncing::before { background: var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
</style>
