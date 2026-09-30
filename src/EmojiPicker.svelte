<script lang="ts">
  import 'emoji-picker-element';
  import dataSource from 'emoji-picker-element-data/en/emojibase/data.json?url';
  import { fade, scale } from 'svelte/transition';
  import { ui } from './lib/ui.svelte';
  import { CUSTOM_ICONS, customUrl, randomIcon } from './lib/icons';

  const req = $derived(ui.emoji!);
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
    if (root && !root.querySelector('#eve-nav')) {
      const st = document.createElement('style');
      st.id = 'eve-nav';
      st.textContent = `.nav-button[data-group-id="-1"] { order: 99 } .indicator-wrapper { display: none }
        .nav-button[aria-selected="true"] { background: var(--button-active-background); border-radius: 6px }
        #search-results .emoji:focus { background: var(--button-active-background); outline: 2px solid var(--outline-color); outline-offset: -2px }`;
      root.append(st);
    }
  });

  function onPick(e: Event) {
    const d = (e as CustomEvent).detail;
    ui.emojiDone(d.unicode ?? `:${d.emoji.shortcodes[0]}:`);
  }
  /**
   * The search results as a grid under the keyboard. The element's own ↑↓ walk the results one by one,
   * a row at a time being nine presses; here ↓ from the search box goes into the results, the arrows
   * then move by cell and by row, ↩ / space pick, and ↑ from the top row goes back to the box. Typing
   * (a letter, ⌫) goes back to the box too, and the key lands there.
   */
  function onGridKey(e: KeyboardEvent) {
    const root = el?.shadowRoot;
    if (!root || e.metaKey || e.ctrlKey || e.altKey) return;
    const input = root.querySelector<HTMLInputElement>('input.search');
    const cells = [...root.querySelectorAll<HTMLButtonElement>('#search-results button.emoji')];
    const at = e.composedPath()[0];
    const i = cells.indexOf(at as HTMLButtonElement);
    const go = (cell: HTMLElement) => { e.preventDefault(); e.stopPropagation(); cell.focus(); cell.scrollIntoView({ block: 'nearest' }); };
    if (at === input) {
      if (e.key === 'ArrowDown' && cells.length && !e.isComposing) go(cells[0]);
      return;
    }
    if (i < 0 || !input) return;
    const cols = Math.max(1, cells.filter((c) => c.offsetTop === cells[0].offsetTop).length);
    const lastRow = Math.floor((cells.length - 1) / cols);
    const row = Math.floor(i / cols);
    if (e.key === 'ArrowRight') { if (i + 1 < cells.length) go(cells[i + 1]); else e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { if (i > 0) go(cells[i - 1]); else go(input); }
    else if (e.key === 'ArrowDown') { if (row < lastRow) go(cells[Math.min(i + cols, cells.length - 1)]); else e.preventDefault(); }
    else if (e.key === 'ArrowUp') go(row > 0 ? cells[i - cols] : input);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); cells[i].click(); }
    else if (e.key === 'Backspace' || e.key.length === 1 || e.key === 'Process' || e.isComposing) {
      // not prevented: the key itself goes on to the box, caret at the end of what was typed
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ui.emojiDone(null); }
  }
</script>

<svelte:window onkeydown={onKey} />
<div class="backdrop" transition:fade={{ duration: 100 }} onmousedown={() => ui.emojiDone(null)} role="presentation"></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="panel" style="left: {x}px; top: {y}px; width: {W}px" transition:scale={{ start: 0.96, duration: 140 }} role="dialog" aria-label="이모지 선택" onkeydowncapture={onGridKey}>
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
  <emoji-picker bind:this={el} data-source={dataSource} skin-tone-emoji="✌️" onemoji-click={onPick}></emoji-picker>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 40; }
  .panel {
    position: fixed; z-index: 41; overflow: hidden;
    background: var(--bg-pop); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
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
    width: 100%; height: 340px;
    --background: var(--bg-pop); --border-color: var(--line); --border-size: 0;
    --indicator-color: var(--accent); --input-border-color: transparent; --input-font-color: var(--fg);
    --input-placeholder-color: var(--fg-dim); --input-border-radius: 8px; --input-padding: 7px 10px; --input-font-size: 13px;
    --outline-color: var(--accent); --category-font-color: var(--fg-dim); --category-font-size: 11.5px;
    --button-hover-background: var(--bg-hover); --button-active-background: var(--bg-active);
    --emoji-size: 1.35rem; --emoji-padding: 0.4rem; --num-columns: 9; --skintone-border-radius: 8px; --custom-emoji-size: 1.35rem;
  }
</style>
