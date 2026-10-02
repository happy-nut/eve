import { describe, test, expect, afterEach } from 'vitest';
import { ui } from './ui.svelte';
import { editorWith, md, posOf, type, press, paste } from './testEditor';
import { runEditorCommand } from './editor';

afterEach(() => {
  ui.linkDone(null);
  ui.closeMenu();
  document.body.innerHTML = '';
});

describe('toggle', () => {
  test('saves as GitHub\'s <details> and reads back the same, nested and in a list', () => {
    const note = [
      '<details open>', '<summary>제목 &lt;b&gt; &amp;</summary>', '', '- 항목', '',
      '<details>', '<summary>안쪽</summary>', '', '본문', '', '</details>', '', '</details>', '',
      '- a', '', '  <details>', '  <summary>t</summary>', '', '  b', '', '  </details>',
    ].join('\n');
    const ed = editorWith(note);
    expect(ed.state.doc.firstChild!.type.name).toBe('details');
    expect(ed.state.doc.firstChild!.attrs.open).toBe(true);
    expect(md(ed)).toBe(note);
  });

  test('a <details> written elsewhere, with no <summary>, keeps its body inside', () => {
    const ed = editorWith('<details>\n\nbody only\n\n</details>');
    const toggle = ed.state.doc.firstChild!;
    expect(toggle.type.name).toBe('details');
    expect(toggle.lastChild!.textContent).toBe('body only');
    expect(ed.state.doc.childCount).toBe(1);
  });

  test('a standard markdown quote is still a quote', () => {
    const ed = editorWith('> 인용 문장\n\n> [!💡]\n> 콜아웃');
    expect(ed.state.doc.child(0).type.name).toBe('blockquote');
    expect(ed.state.doc.child(1).type.name).toBe('callout');
  });

  test('"> " starts a toggle, Enter in its title goes into it, Enter on an empty line leaves it', () => {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, '> 제목');
    expect(ed.state.doc.firstChild!.type.name).toBe('details');
    press(ed, 'Enter');
    type(ed, 'body');
    press(ed, 'Enter');
    press(ed, 'Enter');
    type(ed, 'after');
    expect(md(ed).trimEnd()).toBe('<details open>\n<summary>제목</summary>\n\nbody\n\n</details>\n\nafter');
  });

  test('"> " in front of a written line makes that line the title', () => {
    const ed = editorWith('기존 줄');
    ed.commands.setTextSelection(1);
    type(ed, '> ');
    expect(ed.state.doc.firstChild!.firstChild!.textContent).toBe('기존 줄');
  });

  test('"| " starts a quote', () => {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, '| 인용');
    expect(ed.state.doc.firstChild!.type.name).toBe('blockquote');
  });

  test('the arrow opens and closes it, and the note remembers', () => {
    const ed = editorWith('<details>\n<summary>t</summary>\n\nb\n\n</details>');
    const view = ed.view.dom.querySelector('[data-type="details"]')!;
    const body = view.querySelector('[data-type="detailsContent"]')!;
    expect(view.classList.contains('is-open')).toBe(false);
    view.querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(view.classList.contains('is-open')).toBe(true);
    expect(body.hasAttribute('hidden')).toBe(false); // CSS hides a closed body, not the stock timer
    expect(md(ed).startsWith('<details open>')).toBe(true);
  });
});

describe('arrows', () => {
  test.each([['->', '→'], ['<-', '←'], ['=>', '⇒'], ['<=', '⇐']])('%s becomes %s', (typed, arrow) => {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, `a${typed}b`);
    expect(ed.state.doc.textContent).toBe(`a${arrow}b`);
  });
});

describe('pasting a link', () => {
  const URL = 'https://example.com/a';

  test('over selected text: links it at once, nothing asked', () => {
    const ed = editorWith('여기 링크');
    ed.commands.setTextSelection({ from: posOf(ed, '링크'), to: posOf(ed, '링크', true) });
    paste(ed, URL);
    expect(ui.link).toBeNull();
    expect(md(ed)).toBe(`여기 [링크](${URL})`);
  });

  test.each([
    ['link', `앞 <${URL}>뒤`],
    ['card', `앞 뒤\n\n${URL}`],
    ['both', `앞 <${URL}>뒤\n\n${URL}`],
  ] as const)('mid-sentence: asked, and %s lands as picked', async (how, want) => {
    const ed = editorWith('앞 뒤');
    ed.commands.setTextSelection(posOf(ed, '뒤'));
    paste(ed, URL);
    expect(ui.link).not.toBeNull();
    ui.linkDone(how);
    await Promise.resolve();
    expect(md(ed).trimEnd()).toBe(want);
  });

  test('an empty line becomes the card itself', async () => {
    const ed = editorWith('');
    ed.commands.focus('end');
    paste(ed, URL);
    ui.linkDone('card');
    await Promise.resolve();
    expect(ed.state.doc.firstChild!.type.name).toBe('bookmark');
  });

  test('inside a list the card goes under the item\'s line', async () => {
    const ed = editorWith('- 항목');
    ed.commands.setTextSelection(posOf(ed, '항목', true));
    paste(ed, URL);
    ui.linkDone('both');
    await Promise.resolve();
    const item = ed.state.doc.firstChild!.firstChild!;
    expect(item.child(0).textContent).toBe(`항목${URL}`);
    expect(item.child(1).type.name).toBe('bookmark');
  });

  test('Esc keeps the plain link', async () => {
    const ed = editorWith('앞 뒤');
    ed.commands.setTextSelection(posOf(ed, '뒤'));
    paste(ed, URL);
    ui.linkDone(null);
    await Promise.resolve();
    expect(md(ed)).toBe(`앞 <${URL}>뒤`);
  });

  test('in a code block it is just text', () => {
    const ed = editorWith('```\ncode\n```');
    ed.commands.setTextSelection(posOf(ed, 'code', true));
    paste(ed, URL);
    expect(ui.link).toBeNull();
  });
});

describe('links', () => {
  test('hovering one opens nothing; a right-click still has its menu', () => {
    const ed = editorWith('[link](https://example.com) text');
    const a = ed.view.dom.querySelector('a')!;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(ui.menu).toBeNull();
    a.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(ui.menu?.items.map((i) => i.label)).toEqual(['Open link', 'Remove link', 'Copy link']);
  });
});

describe('lists of different kinds', () => {
  test('under a to-do, "- " makes a bullet, "[] " a to-do again, "1. " a number', () => {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, '[] a');
    press(ed, 'Enter');
    press(ed, 'Tab');
    type(ed, '- b');
    press(ed, 'Enter');
    type(ed, 'c');
    press(ed, 'Enter');
    type(ed, '[] d');
    press(ed, 'Enter');
    type(ed, '1. e');
    expect(md(ed).trimEnd()).toBe('- [ ] a\n  - b\n  - c\n  - [ ] d\n  1. e');
  });

  test('a bullet and a to-do written one after the other read back as they were, no empty to-do', () => {
    for (const note of ['- b\n- [ ] d', '- [ ] d\n- b', '- [ ] a\n  - b\n  - [ ] d']) {
      const ed = editorWith(note);
      const texts: string[] = [];
      ed.state.doc.descendants((n) => { if (n.isTextblock) texts.push(n.textContent); });
      expect(texts.filter(Boolean)).toEqual(note.match(/[a-z]$/gm));
      expect(texts.slice(0, -1)).not.toContain('');
      const again = editorWith(md(ed));
      expect(md(again)).toBe(md(ed));
    }
  });

  test('⇧Tab brings a bullet out from under its to-do as a bullet, Tab puts it back', () => {
    const ed = editorWith('- [ ] a\n  - b\n- [ ] c');
    ed.commands.setTextSelection(posOf(ed, 'b', true));
    press(ed, 'Tab', { shiftKey: true });
    expect(md(ed).trimEnd()).toBe('- [ ] a\n\n- b\n\n- [ ] c');
    press(ed, 'Tab');
    expect(md(ed).trimEnd()).toBe('- [ ] a\n  - b\n- [ ] c');
  });
});

describe('⌥↑ / ⌥↓ light up what moved', () => {
  const lit = (ed: ReturnType<typeof editorWith>) =>
    [...ed.view.dom.querySelectorAll('.moved-flash-0, .moved-flash-1')].map((e) => `${e.className.match(/moved-flash-\d/)![0]}:${e.textContent}`);

  test('the moved lines, a fresh class each time so the fade starts over, and nothing when nothing moved', () => {
    const ed = editorWith('- a\n- [ ] t\n- b\n\n문단');
    ed.commands.setTextSelection({ from: posOf(ed, 'a'), to: posOf(ed, 't', true) });
    runEditorCommand(ed, 'moveBlockDown');
    const first = lit(ed);
    expect(first.map((l) => l.split(':')[1])).toEqual(['a', 't']);
    runEditorCommand(ed, 'moveBlockDown');
    const second = lit(ed);
    expect(second.map((l) => l.split(':')[1])).toEqual(['a', 't']);
    expect(second[0].split(':')[0]).not.toBe(first[0].split(':')[0]);
  });

  test('a caret in an item lights the item and what hangs under it', () => {
    const ed = editorWith('- [ ] t1\n  - a\n- [ ] t2');
    ed.commands.setTextSelection(posOf(ed, 't1', true));
    runEditorCommand(ed, 'moveBlockDown');
    expect(lit(ed).map((l) => l.split(':')[1])).toEqual(['t1', 'a']);
  });
});

describe('a selection over pictures and cards', () => {
  test('every one it covers whole is marked, one it only touches is not, a caret marks nothing', () => {
    const ed = editorWith('시작 문단\n\n![](a.png)\n\nhttps://github.com\n\n끝 문단');
    const marked = () => [...ed.view.dom.querySelectorAll('.in-sel')].map((e) => e.className.split(' ')[0]);
    ed.commands.setTextSelection({ from: posOf(ed, '문단'), to: posOf(ed, '끝', true) });
    expect(marked()).toEqual(['img-fig', 'bookmark']);
    ed.commands.setTextSelection({ from: posOf(ed, '문단'), to: posOf(ed, '문단', true) });
    expect(marked()).toEqual([]);
    ed.commands.setTextSelection(posOf(ed, '끝'));
    expect(marked()).toEqual([]);
  });
});

describe('Tab in the real keymap', () => {
  test('a to-do\'s sub-items keep their level', () => {
    const ed = editorWith('- [ ] a\n- [ ] b\n  - [ ] c\n- [ ] d');
    ed.commands.setTextSelection(posOf(ed, 'b', true));
    press(ed, 'Tab');
    expect(md(ed).trimEnd()).toBe('- [ ] a\n  - [ ] b\n  - [ ] c\n- [ ] d');
  });
});
