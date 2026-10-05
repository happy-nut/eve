<script lang="ts">
  import 'emoji-picker-element';
  import dataSource from 'emoji-picker-element-data/en/emojibase/data.json?url';
  import { fade, scale } from 'svelte/transition';
  import { popIn, scrimFade } from './lib/motion';
  import { ui } from './lib/ui.svelte';
  import { CUSTOM_ICONS, customUrl, randomIcon } from './lib/icons';
  import { held } from './lib/popup';

  // the last one asked: closing, it fades out showing what it showed (ui.emoji is already null by then)
  const req = $derived.by(held(() => ui.emoji));
  let el: HTMLElement & { i18n?: unknown };
  // keep the panel inside the window
  const W = 352, H = 400;
  const TOP = 44; // stay clear of the traffic lights / toolbar strip
  const x = $derived(Math.max(8, Math.min(req.x, window.innerWidth - W - 8)));
  const y = $derived(Math.max(TOP, req.y + H > window.innerHeight - 8 ? req.y - H - 40 : req.y));

  const ko = {
    categoriesLabel: '카테고리', emojiUnsupportedMessage: '이 브라우저는 컬러 이모지를 지원하지 않습니다.',
    favoritesLabel: '최근 사용됨', loadingMessage: '불러오는 중…', networkErrorMessage: '이모지를 불러올 수 없습니다.',
    regionLabel: '이모지 선택', searchDescription: '검색 결과에서 위/아래 키로 이동하고 Enter 로 선택합니다.',
    searchLabel: '찾기', searchResultsLabel: '검색 결과', skinToneDescription: '열린 상태에서 위/아래 키로 이동하고 Enter 로 선택합니다.',
    skinToneLabel: '피부색 선택 (현재 {skinTone})', skinTonesLabel: '피부색',
    skinTones: ['기본', '밝은', '약간 밝은', '중간', '약간 어두운', '어두운'],
    categories: {
      custom: '기타', 'smileys-emotion': '표정 및 사람', 'people-body': '사람 및 신체', 'animals-nature': '동물 및 자연',
      'food-drink': '음식 및 음료', 'travel-places': '여행 및 장소', activities: '활동', objects: '사물', symbols: '기호', flags: '깃발',
    },
  };
  $effect(() => {
    if (!el) return;
    el.i18n = ko;
    (el as any).customEmoji = CUSTOM_ICONS.map((c) => ({ name: c.label, shortcodes: [c.name], url: customUrl(c), category: '기타' }));
    // the element always lists custom icons first; move that tab to the far right and mark the
    // selected tab by background instead of the sliding indicator (which assumes source order)
    const root = el.shadowRoot;
    // focus the search box as soon as it exists, so you can type straight away
    let tries = 0;
    const focusSearch = () => {
      const inp = root?.querySelector<HTMLInputElement>('input.search, input[type="search"], input');
      if (inp) inp.focus(); else if (tries++ < 40) setTimeout(focusSearch, 25);
    };
    focusSearch();
    // the element opens on the custom icons, whose tab is moved to the far right: open on the first tab
    // shown instead, so ↓ walks the categories from the start
    let waits = 0;
    const firstTab = () => {
      // once the emoji are drawn: before that no tab is selected yet, and the custom one gets picked after
      const tab = root?.querySelector<HTMLButtonElement>('.nav-button:not([data-group-id="-1"])');
      if (!tab || !root?.querySelector('.tabpanel button.emoji')) { if (waits++ < 80) setTimeout(firstTab, 25); return; }
      if (root?.querySelector('.nav-button[data-group-id="-1"][aria-selected="true"]')) tab.click();
      focusSearch();
    };
    firstTab();
    if (root && !root.querySelector('#eve-nav')) {
      const st = document.createElement('style');
      st.id = 'eve-nav';
      st.textContent = `.nav-button[data-group-id="-1"] { order: 99 } .indicator-wrapper { display: none }
        .nav-button[aria-selected="true"] { background: var(--button-active-background); border-radius: 6px }
        .tabpanel .emoji:focus { background: var(--button-active-background); outline: 2px solid var(--outline-color); outline-offset: -2px }`;
      root.append(st);
    }
  });

  function onPick(e: Event) {
    const d = (e as CustomEvent).detail;
    ui.emojiDone(d.unicode ?? `:${d.emoji.shortcodes[0]}:`);
  }
  /**
   * The emoji as a grid under the keyboard: the search results, or the open category when nothing is typed.
   * The element's own ↑↓ walk the results one by one (a row is nine presses) and do nothing in a category;
   * here ↓ from the search box goes into the grid, ←→ move by cell, ↑↓ to the nearest cell on the line above
   * or below. Past a category's last line ↓ opens the next category (↑ past its first, the one before), so
   * every section is a few presses away; ↑ from the very top goes back to the box. ↩ / space pick. Typing
   * (a letter, ⌫) goes back to the box too, and the key lands there.
   */
  function onGridKey(e: KeyboardEvent) {
    const root = el?.shadowRoot;
    if (!root || e.metaKey || e.ctrlKey || e.altKey) return;
    const input = root.querySelector<HTMLInputElement>('input.search');
    const cells = [...root.querySelectorAll<HTMLButtonElement>('.tabpanel button.emoji')].filter((c) => c.offsetParent);
    const at = e.composedPath()[0];
    const i = cells.indexOf(at as HTMLButtonElement);
    const go = (cell: HTMLElement) => { e.preventDefault(); e.stopPropagation(); cell.focus(); cell.scrollIntoView({ block: 'nearest' }); void showCell(cell); };
    if (at === input) {
      if (e.key === 'ArrowDown' && cells.length && !e.isComposing) go(cells[0]);
      return;
    }
    if (i < 0 || !input) return;
    /** the cell on the next line up or down, nearest to this one sideways */
    const line = (dir: 1 | -1) => {
      const r = cells[i].getBoundingClientRect();
      let best: HTMLButtonElement | null = null, bestTop = 0, bestDx = Infinity;
      for (const c of cells) {
        const b = c.getBoundingClientRect();
        if (dir * (b.top - r.top) < r.height / 2) continue; // this line, or the wrong way
        const dx = Math.abs(b.left - r.left);
        if (!best || dir * (b.top - bestTop) < -1 || (Math.abs(b.top - bestTop) <= 1 && dx < bestDx)) { best = c; bestTop = b.top; bestDx = dx; }
      }
      return best;
    };
    if (e.key === 'ArrowRight') { if (i + 1 < cells.length) go(cells[i + 1]); else e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { if (i > 0) go(cells[i - 1]); else go(input); }
    else if (e.key === 'ArrowDown') { const c = line(1); if (c) go(c); else { e.preventDefault(); e.stopPropagation(); void category(root, 1, cells[i]); } }
    else if (e.key === 'ArrowUp') {
      const c = line(-1);
      if (c) go(c);
      else { e.preventDefault(); e.stopPropagation(); void category(root, -1, cells[i]).then((moved) => moved || input.focus()); }
    }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); cells[i].click(); }
    else if (e.key === 'Backspace' || e.key.length === 1 || e.key === 'Process' || e.isComposing) {
      // not prevented: the key itself goes on to the box, caret at the end of what was typed
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  /** Opens the next (or previous) category tab, in the order they are shown (the custom icons last), and puts the
   *  keyboard on its first line (or its last), nearest to where it was. Not searching only: results have no tabs. */
  async function category(root: ShadowRoot, dir: 1 | -1, from: HTMLElement): Promise<boolean> {
    if (root.querySelector('#search-results')) return false;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.nav-button')]
      .sort((a, b) => Number(a.dataset.groupId === '-1') - Number(b.dataset.groupId === '-1'));
    const next = tabs[tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true') + dir];
    if (!next) return false;
    const x = from.getBoundingClientRect().left;
    next.click();
    for (let n = 0; n < 20; n++) { // the element draws the new category a frame or two later
      await new Promise((r) => setTimeout(r, 16));
      const cells = [...root.querySelectorAll<HTMLButtonElement>('.tabpanel button.emoji')];
      if (!cells.length || cells.includes(from as HTMLButtonElement)) continue;
      const tops = cells.map((c) => c.getBoundingClientRect().top);
      const edge = dir > 0 ? Math.min(...tops) : Math.max(...tops);
      const row = cells.filter((_, k) => Math.abs(tops[k] - edge) <= 1);
      const cell = row.reduce((a, c) => (Math.abs(c.getBoundingClientRect().left - x) < Math.abs(a.getBoundingClientRect().left - x) ? c : a));
      cell.focus();
      cell.scrollIntoView({ block: 'nearest' });
      void showCell(cell);
      return true;
    }
    return false;
  }

  /** the emoji under the mouse or the keyboard, with the :code: that types it in a note (the same data) */
  let preview = $state<{ face: string; url?: string; code: string } | null>(null);
  function show(e: Event) {
    const b = e.composedPath().find((n): n is HTMLButtonElement => n instanceof HTMLElement && n.matches('.tabpanel button.emoji'));
    if (b) void showCell(b);
  }
  async function showCell(b: HTMLElement) {
    if (!b.matches('button.emoji')) { preview = null; return; } // the search box
    const id = b.id.slice(b.id.indexOf('-') + 1); // emo-😀, fav-😀, or a custom icon's name
    const own = CUSTOM_ICONS.find((c) => c.label === id); // the app's own icons are not in the element's data
    if (own) { preview = { face: '', url: customUrl(own), code: own.name }; return; }
    const found = await (el as any)?.database?.getEmojiByUnicodeOrName(id);
    const code = found?.shortcodes?.[0];
    if (code) preview = { face: found.unicode ?? '', code };
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ui.emojiDone(null); }
  }
</script>

<svelte:window onkeydown={onKey} />
<div class="backdrop" transition:fade|global={scrimFade} onmousedown={() => ui.emojiDone(null)} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="panel" style="left: {x}px; top: {y}px; width: {W}px" transition:scale|global={popIn} role="dialog" aria-label="이모지 선택" onkeydowncapture={onGridKey}>
  <header>
    <span class="tab">이모지</span>
    <span class="acts">
      <!-- the same pool the "아이콘 추가" button rolls from, so a page can be given a face without choosing one -->
      <button class="act" aria-label="랜덤" title="랜덤" onclick={() => ui.emojiDone(randomIcon(req.current))}>
        <svg viewBox="0 0 16 16"><path d="M2 4.5h2.2c1.3 0 2.4.7 3 1.8l1.6 3.4c.6 1.1 1.7 1.8 3 1.8H14M2 11.5h2.2c.9 0 1.8-.4 2.4-1.1M9.4 5.6c.6-.7 1.5-1.1 2.4-1.1H14M12.3 2.8 14 4.5l-1.7 1.7M12.3 9.8 14 11.5l-1.7 1.7"/></svg>
      </button>
      {#if req.current}
        <button class="act" aria-label="제거" title="제거" onclick={() => ui.emojiDone('')}>
          <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 9h4.8l.6-9"/></svg>
        </button>
      {/if}
    </span>
  </header>
  <!-- the preview follows the mouse and the keyboard (focusin) alike; the picker itself is the interactive part -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <emoji-picker bind:this={el} data-source={dataSource} skin-tone-emoji="✌️" onemoji-click={onPick}
    onmouseover={show} onfocusin={show}></emoji-picker>
  <footer class="preview" aria-live="polite">
    {#if preview}
      {#if preview.url}<img src={preview.url} alt="" />{:else}<span class="face">{preview.face}</span>{/if}
      <span class="code">:{preview.code}:</span>
    {/if}
  </footer>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 40; }
  .panel {
    position: fixed; z-index: 41; overflow: hidden;
    background: var(--bg-pop); border: var(--pop-border); border-radius: var(--pop-radius); box-shadow: var(--pop-shadow);
    transform-origin: top left;
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 6px; border-bottom: 1px solid var(--line); font-size: 13px; }
  .tab { font-weight: 600; }
  .acts { display: flex; gap: 2px; margin-right: -6px; }
  .act {
    width: 28px; height: 28px; border: 0; border-radius: 7px; background: none; color: var(--fg-dim); padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .act:hover { color: var(--fg); background: var(--bg-hover); }
  .act:active { background: var(--bg-active); }
  .act svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  /* a thumb, not a pointer */
  :global(html.mobile) .act { width: 44px; height: 44px; border-radius: 12px; }
  :global(html.mobile) .act svg { width: 22px; height: 22px; }
  emoji-picker {
    width: 100%; height: 312px; /* + the preview line: the same 400 the panel is placed by */
    --background: var(--bg-pop); --border-color: var(--line); --border-size: 0;
    --indicator-color: var(--accent); --input-border-color: transparent; --input-font-color: var(--fg);
    --input-placeholder-color: var(--fg-dim); --input-border-radius: 8px; --input-padding: 7px 10px; --input-font-size: 13px;
    --outline-color: var(--accent); --category-font-color: var(--fg-dim); --category-font-size: 11.5px;
    --button-hover-background: var(--bg-hover); --button-active-background: var(--bg-active);
    --emoji-size: 1.35rem; --emoji-padding: 0.4rem; --num-columns: 9; --skintone-border-radius: 8px; --custom-emoji-size: 1.35rem;
  }
  /* what is under the mouse or the keyboard, as it is typed in a note */
  .preview {
    display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-top: 1px solid var(--line);
    font-size: 12px; color: var(--fg-dim);
  }
  .preview .face { font-size: 16px; line-height: 1; }
  .preview img { width: 16px; height: 16px; }
  .preview .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
