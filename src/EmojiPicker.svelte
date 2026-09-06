<script lang="ts">
  import 'emoji-picker-element';
  import dataSource from 'emoji-picker-element-data/en/emojibase/data.json?url';
  import { fade, scale } from 'svelte/transition';
  import { ui } from './lib/ui.svelte';
  import { CUSTOM_ICONS, customUrl } from './lib/icons';

  const req = $derived(ui.emoji!);
  let el: HTMLElement & { i18n?: unknown };
  // keep the panel inside the window
  const W = 352, H = 400;
  const x = $derived(Math.max(8, Math.min(req.x, window.innerWidth - W - 8)));
  const y = $derived(req.y + H > window.innerHeight - 8 ? Math.max(8, req.y - H - 40) : req.y);

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
    if (root && !root.querySelector('#eve-nav')) {
      const st = document.createElement('style');
      st.id = 'eve-nav';
      st.textContent = `.nav-button[data-group-id="-1"] { order: 99 } .indicator-wrapper { display: none }
        .nav-button[aria-selected="true"] { background: var(--button-active-background); border-radius: 6px }`;
      root.append(st);
    }
  });

  function onPick(e: Event) {
    const d = (e as CustomEvent).detail;
    ui.emojiDone(d.unicode ?? `:${d.emoji.shortcodes[0]}:`);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ui.emojiDone(null); }
  }
</script>

<svelte:window onkeydown={onKey} />
<div class="backdrop" transition:fade={{ duration: 100 }} onmousedown={() => ui.emojiDone(null)} role="presentation"></div>
<div class="panel" style="left: {x}px; top: {y}px; width: {W}px" transition:scale={{ start: 0.96, duration: 140 }} role="dialog" aria-label="이모지 선택">
  <header>
    <span class="tab">이모지</span>
    {#if req.current}<button class="remove" onclick={() => ui.emojiDone('')}>제거</button>{/if}
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
  .remove { border: 0; background: none; color: var(--fg-dim); font: inherit; font-size: 12.5px; }
  .remove:hover { color: var(--fg); }
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
