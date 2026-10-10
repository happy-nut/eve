import { describe, test, expect, afterEach } from 'vitest';
import { ui } from './ui.svelte';
import { editorWith, md, posOf, type, press, paste } from './testEditor';
import { runEditorCommand } from './editor';
import { eventToKeys } from './shortcuts.svelte';

afterEach(() => {
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

describe('insert block (the phone bar\'s /)', () => {
  test.each([['main text', 'main text /'], ['main text ', 'main text /'], ['', '/']])('after "%s" gives "%s"', (text, out) => {
    const ed = editorWith(text);
    ed.commands.focus('end');
    runEditorCommand(ed, 'slash');
    expect(ed.state.doc.textContent).toBe(out);
  });
});

describe('arrows', () => {
  test.each([['->', '→'], ['<-', '←'], ['=>', '⇒'], ['<=', '⇐'], ['<->', '↔'], ['<=>', '⇔']])('%s becomes %s', (typed, arrow) => {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, `a${typed}b`);
    expect(ed.state.doc.textContent).toBe(`a${arrow}b`);
  });

  test('not inside `code` being typed: its mark only comes with the closing backtick', () => {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, '`x => y` and a <- b');
    expect(md(ed)).toBe('`x => y` and a ← b');
  });

  test('"<-" whose ← was taken back, then ">", is both ways, not "<" and →', () => {
    const ed = editorWith('');
    ed.commands.focus('end');
    type(ed, 'a<-');
    press(ed, 'Backspace');
    type(ed, '>');
    expect(ed.state.doc.textContent).toBe('a↔');
  });
});

describe('pasting a link', () => {
  const URL = 'https://example.com/a';

  test('over selected text: links it', () => {
    const ed = editorWith('여기 링크');
    ed.commands.setTextSelection({ from: posOf(ed, '링크'), to: posOf(ed, '링크', true) });
    paste(ed, URL);
    expect(md(ed)).toBe(`여기 [링크](${URL})`);
  });

  test('anywhere else: in as a plain link, nothing asked', () => {
    const ed = editorWith('앞 뒤');
    ed.commands.setTextSelection(posOf(ed, '뒤'));
    paste(ed, URL);
    expect(ui.menu).toBeNull();
    expect(md(ed)).toBe(`앞 <${URL}>뒤`);
    const blank = editorWith('');
    blank.commands.focus('end');
    paste(blank, URL);
    expect(blank.state.doc.firstChild!.type.name).toBe('paragraph');
  });

  test('in a code block it is just text', () => {
    const ed = editorWith('```\ncode\n```');
    ed.commands.setTextSelection(posOf(ed, 'code', true));
    paste(ed, URL);
    expect(ed.state.doc.firstChild!.textContent).toBe(`code${URL}`);
  });
});

describe('a link and its card, from the keyboard', () => {
  const URL = 'https://example.com/a';
  const menu = () => ui.menu?.items.map((i) => i.label) ?? [];
  const pick = (label: string) => ui.menu!.items.find((i) => i.label === label)!.run!();

  test('⌥↩ on a link alone on its line: "Show as card" makes the line the card, ⌥↩ on the card brings the link back', () => {
    const ed = editorWith(`<${URL}>\n\n끝`);
    ed.commands.setTextSelection(posOf(ed, 'example'));
    press(ed, 'Enter', { altKey: true });
    expect(menu()[0]).toBe('Show as card');
    pick('Show as card');
    expect(ed.state.doc.firstChild!.type.name).toBe('bookmark');
    ui.closeMenu();
    press(ed, 'Enter', { altKey: true });
    expect(menu()).toEqual(['Show as link', 'Open link', 'Copy link']);
    pick('Show as link');
    expect(md(ed).trimEnd()).toBe(`<${URL}>\n\n끝`);
  });

  test('a link inside a sentence keeps its place; the card goes under the line', () => {
    const ed = editorWith(`앞 <${URL}> 뒤`);
    ed.commands.setTextSelection(posOf(ed, 'example'));
    press(ed, 'Enter', { altKey: true });
    pick('Show as card');
    expect(ed.state.doc.child(0).textContent).toBe(`앞 ${URL} 뒤`);
    expect(ed.state.doc.child(1).type.name).toBe('bookmark');
  });

  test('⌘↩ on a link or a card is the link\'s, not the to-do\'s', async () => {
    const opened: string[] = [];
    const platform = await import('./platform');
    const spy = (await import('vitest')).vi.spyOn(platform, 'openUrl').mockImplementation(async (u: string) => { opened.push(u); });
    const ed = editorWith(`- [ ] read <${URL}>\n\n${URL}`);
    ed.commands.setTextSelection(posOf(ed, 'example'));
    runEditorCommand(ed, 'toggleCheck');
    expect(opened).toEqual([URL]);
    expect(md(ed)).toContain('- [ ] read'); // the box is left as it was
    ed.commands.setTextSelection(posOf(ed, 'read'));
    runEditorCommand(ed, 'toggleCheck');
    expect(md(ed)).toContain('- [x] read');
    spy.mockRestore();
  });
});

describe('links', () => {
  test('hovering one opens nothing; a right-click still has its menu', () => {
    const ed = editorWith('[link](https://example.com) text');
    const a = ed.view.dom.querySelector('a')!;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(ui.menu).toBeNull();
    a.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(ui.menu?.items.map((i) => i.label)).toEqual(['Show as card', 'Open link', 'Remove link', 'Copy link']);
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

describe('Enter on an empty line under an item of another kind', () => {
  // the stock lift made the line an unmarked one inside the item above, where WebKit lost the caret
  const blankUnder = (src: string, word: string) => {
    const ed = editorWith(src);
    ed.commands.setTextSelection(posOf(ed, word, true));
    press(ed, 'Enter');
    return ed;
  };
  const kinds = (ed: ReturnType<typeof editorWith>) => {
    const $ = ed.state.selection.$from;
    return [...Array($.depth + 1).keys()].map((d) => $.node(d).type.name).reverse().join('<');
  };

  test('a bullet under a to-do: out as a bullet, then a plain line, never a line with no mark inside the to-do', () => {
    const ed = blankUnder('- [ ] a\n  - b', 'b');
    press(ed, 'Enter');
    expect(kinds(ed)).toBe('paragraph<listItem<bulletList<doc');
    press(ed, 'Enter');
    expect(kinds(ed)).toBe('paragraph<doc');
  });

  test('a to-do under a bullet, the same', () => {
    const ed = blankUnder('- a\n  - [ ] t', 't');
    press(ed, 'Enter');
    expect(kinds(ed)).toBe('paragraph<taskItem<taskList<doc');
  });

  test('the same kind keeps the stock behaviour (out one level, still in the list above)', () => {
    const ed = blankUnder('- a\n  - b', 'b');
    press(ed, 'Enter');
    expect(kinds(ed)).toBe('paragraph<listItem<bulletList<doc');
    expect(ed.state.doc.firstChild!.childCount).toBe(2);
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

describe('⌘↩ checks a to-do', () => {
  const boxes = (ed: ReturnType<typeof editorWith>) => md(ed).trimEnd().split('\n').map((l) => l.match(/\[( |x)\]/)?.[1] ?? '-').join('');

  test('the to-do under the caret, back and forth; a nested one alone, not its parent', () => {
    const ed = editorWith('- [ ] a\n  - [ ] a1\n- [ ] b');
    ed.commands.setTextSelection(posOf(ed, 'a1', true));
    runEditorCommand(ed, 'toggleCheck');
    expect(boxes(ed)).toBe(' x ');
    runEditorCommand(ed, 'toggleCheck');
    expect(boxes(ed)).toBe('   ');
  });

  test('several lines: all ticked if any was open, all cleared once every one is done', () => {
    const ed = editorWith('- [x] a\n- [ ] b\n- [x] c');
    ed.commands.setTextSelection({ from: posOf(ed, 'a'), to: posOf(ed, 'c', true) });
    runEditorCommand(ed, 'toggleCheck');
    expect(boxes(ed)).toBe('xxx');
    runEditorCommand(ed, 'toggleCheck');
    expect(boxes(ed)).toBe('   ');
  });

  test('not a to-do: nothing happens, and the key is left to others', () => {
    const ed = editorWith('- a\n\n문단');
    ed.commands.setTextSelection(posOf(ed, '문단'));
    expect(runEditorCommand(ed, 'toggleCheck')).toBe(false);
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

describe('⌥↑ / ⌥↓ in a table', () => {
  const table = '| Name | Qty |\n| --- | --- |\n| Pen | 2 |\n| Ink | 5 |\n| Cap | 7 |';
  const moved = (word: string, cmd: 'moveBlockDown' | 'moveBlockUp') => {
    const ed = editorWith(table);
    ed.commands.setTextSelection(posOf(ed, word, true));
    runEditorCommand(ed, cmd);
    return md(ed).trim().replace(/ +\|/g, ' |').replace(/-+/g, '-');
  };

  test('the caret\'s row moves, from any column, its cells kept together', () => {
    const swapped = '| Name | Qty |\n| - | - |\n| Ink | 5 |\n| Pen | 2 |\n| Cap | 7 |';
    expect(moved('Pen', 'moveBlockDown')).toBe(swapped);
    expect(moved('2', 'moveBlockDown')).toBe(swapped);
    expect(moved('Ink', 'moveBlockUp')).toBe(swapped);
  });

  test('the header row stays on top, and a row never leaves its table', () => {
    const same = table.replace(/-+/g, '-');
    expect(moved('Pen', 'moveBlockUp')).toBe(same);
    expect(moved('Name', 'moveBlockDown')).toBe(same);
    expect(moved('Qty', 'moveBlockDown')).toBe(same);
    expect(moved('Cap', 'moveBlockDown')).toBe(same);
  });
});

describe('⌘⇧- puts in a divider', () => {
  test('with Shift held the key reads "_": the binding answers it all the same', () => {
    const ed = editorWith('one');
    ed.commands.setTextSelection(posOf(ed, 'one', true));
    const e = press(ed, '_', { code: 'Minus', ctrlKey: true, shiftKey: true, keyCode: 189 } as KeyboardEventInit);
    expect(e.defaultPrevented).toBe(true);
    expect(md(ed)).toContain('---');
  });

  test('recorded, the key is the one the list writes', () => {
    const e = new KeyboardEvent('keydown', { key: '_', code: 'Minus', ctrlKey: true, shiftKey: true });
    expect(eventToKeys(e)).toBe('Mod-Shift-Minus');
  });
});

describe('Enter on the empty last line of a callout', () => {
  test('leaves the callout for a new line right after it; the block below stays whole', () => {
    const ed = editorWith('> [!💡]\n> one\n\n## Next');
    ed.commands.setTextSelection(posOf(ed, 'one', true));
    press(ed, 'Enter');
    press(ed, 'Enter');
    expect(md(ed)).toContain('## Next');
    const { $from } = ed.state.selection;
    expect($from.parent.type.name).toBe('paragraph');
    expect($from.parent.content.size).toBe(0);
    expect($from.depth).toBe(1);
    expect(ed.state.doc.child($from.index(0) - 1).type.name).toBe('callout');
    expect(ed.state.doc.child($from.index(0) + 1).type.name).toBe('heading');
  });
});
