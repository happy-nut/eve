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

  test('closed with the caret in its body: the caret goes to the end of the title, where it can be seen', () => {
    const ed = editorWith('<details open>\n<summary>Title</summary>\n\n' + Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n\n') + '\n\n</details>\n\nafter');
    ed.commands.setTextSelection(posOf(ed, 'line 39', true));
    const button = ed.view.dom.querySelector<HTMLElement>('[data-type="details"] > button')!;
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(ed.state.doc.firstChild!.attrs.open).toBe(false);
    const { $head } = ed.state.selection;
    expect($head.parent.type.name).toBe('detailsSummary');
    expect($head.parentOffset).toBe('Title'.length);
    type(ed, '!');
    expect(md(ed)).toContain('<summary>Title!</summary>');
    // and a closed toggle cannot be typed into unseen: a caret put inside its body comes out again
    ed.commands.setTextSelection(posOf(ed, 'line 5'));
    expect(ed.state.selection.$head.parent.type.name).toBe('detailsSummary');
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

  const toggle = (title: string, body: string[], open = true) =>
    `<details${open ? ' open' : ''}>\n<summary>${title}</summary>\n\n${body.join('\n\n')}\n\n</details>`;
  /** the note after `act` with the caret at `at` (a word, and an offset into it); undo gives the note back, and what is
   *  left reads back as itself. `line` is the text of the caret's line, a | where the caret is. */
  function keyed(note: string, at: [string, number], act: (ed: ReturnType<typeof editorWith>) => void) {
    const ed = editorWith(note);
    ed.commands.setTextSelection(posOf(ed, at[0]) + at[1]);
    const before = md(ed);
    act(ed);
    const out = md(ed), { $head } = ed.state.selection;
    const line = `${$head.parent.textContent.slice(0, $head.parentOffset)}|${$head.parent.textContent.slice($head.parentOffset)}`;
    expect(md(editorWith(out))).toBe(out);
    ed.commands.undo();
    expect(md(ed)).toBe(before);
    return { out, line, where: $head.parent.type.name };
  }

  test('Enter in the middle of a title: the rest of it is the first line of the body, the toggle opened', () => {
    expect(keyed(toggle('Title', ['body']), ['Title', 2], (ed) => press(ed, 'Enter')))
      .toEqual({ out: toggle('Ti', ['tle', 'body']), line: '|tle', where: 'paragraph' });
    expect(keyed(toggle('Title', ['body'], false), ['Title', 2], (ed) => press(ed, 'Enter')).out).toBe(toggle('Ti', ['tle', 'body']));
  });

  test('Enter at the start of a title: an empty line above the toggle; at its end, still into the body', () => {
    expect(keyed(`a\n\n${toggle('Title', ['body'])}`, ['Title', 0], (ed) => press(ed, 'Enter')))
      .toEqual({ out: `a\n\n\u00a0\n\n${toggle('Title', ['body'])}`, line: '|', where: 'paragraph' });
    expect(keyed(toggle('Title', ['\u00a0']), ['Title', 5], (ed) => press(ed, 'Enter')).line).toBe('|');
  });

  test('⌫ at the start of the body\'s first line joins it onto the title, as plain text', () => {
    expect(keyed(toggle('Title', ['one', 'two']), ['one', 0], (ed) => press(ed, 'Backspace')))
      .toEqual({ out: toggle('Titleone', ['two']), line: 'Title|one', where: 'detailsSummary' });
    // the only line: the body keeps an empty one
    expect(keyed(toggle('Title', ['one']), ['one', 0], (ed) => press(ed, 'Backspace')).out).toBe(toggle('Titleone', ['\u00a0']));
    // bold and a [[link]] come as their text; nothing of it is lost
    expect(keyed(toggle('T', ['a **b** [[Note|c]]']), ['a', 0], (ed) => press(ed, 'Backspace')).out).toBe(toggle('Ta b c', ['\u00a0']));
  });

  test('⌫ on an empty first line of the body: the line goes, but never the body\'s only one; the caret ends the title', () => {
    const empty = (body: string[]) => {
      const ed = editorWith(toggle('Title', body));
      ed.commands.setTextSelection(posOf(ed, 'Title', true) + 3);
      const before = md(ed);
      press(ed, 'Backspace');
      const { $head } = ed.state.selection;
      expect([$head.parent.type.name, $head.parentOffset]).toEqual(['detailsSummary', 5]);
      const out = md(ed);
      ed.commands.undo();
      expect(md(ed)).toBe(before);
      return out;
    };
    expect(empty(['\u00a0'])).toBe(toggle('Title', ['\u00a0']));
    expect(empty(['\u00a0', 'two'])).toBe(toggle('Title', ['two']));
  });

  test('⌫ at the start of a heading opening the body: only the caret goes up, the heading stays', () => {
    expect(keyed(toggle('Title', ['# Head']), ['Head', 0], (ed) => press(ed, 'Backspace')))
      .toEqual({ out: toggle('Title', ['# Head']), line: 'Title|', where: 'detailsSummary' });
  });

  test('a title ending (or starting) in a space keeps it when read back', () => {
    for (const title of ['- ', '$$ ', '  two  spaces ']) {
      const ed = editorWith('x');
      ed.commands.setTextSelection(posOf(ed, 'x', true));
      press(ed, 'Enter');
      type(ed, '> ');
      type(ed, title);
      expect(editorWith(md(ed)).state.doc.child(1).firstChild!.textContent).toBe(title);
    }
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

  test('↩ after it, pasted or typed alone on its line: still a link, and a new line under it (a card is ⌥↩)', () => {
    const ed = editorWith('');
    ed.commands.focus('end');
    paste(ed, URL);
    press(ed, 'Enter');
    const typed = editorWith('');
    typed.commands.focus('end');
    typed.view.dispatch(typed.state.tr.insertText(URL)); // as typed: text, not markdown read in (a bare address there is a card)
    press(typed, 'Enter');
    for (const e of [ed, typed]) {
      expect(e.state.doc.childCount).toBe(2);
      e.state.doc.forEach((n) => expect(n.type.name).toBe('paragraph'));
      expect(e.state.doc.firstChild!.textContent).toBe(URL);
    }
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

describe('pasting markdown into a line', () => {
  test('the space after it, and what is typed next, are outside its last mark', () => {
    for (const [clip, out] of [[' `y` ', 'x `y` z'], [' **y** ', 'x **y** z']]) {
      const ed = editorWith('x');
      ed.commands.setTextSelection(posOf(ed, 'x', true));
      paste(ed, clip);
      type(ed, 'z');
      expect(md(ed).trim()).toBe(out);
    }
  });
});

describe('inline code deleted', () => {
  /** the webview deleting letters itself, as ProseMirror takes it in: the letters go, their marks kept for the next keys */
  const domDelete = (ed: ReturnType<typeof editorWith>, from: number, to: number) => {
    ed.commands.setTextSelection(to);
    const marks = ed.state.doc.resolve(from).marksAcross(ed.state.doc.resolve(to));
    const tr = ed.state.tr.delete(from, to);
    if (marks) tr.ensureMarks(marks);
    ed.view.dispatch(tr);
  };

  test('all of it cleared out: the text typed next is not code', () => {
    const ed = editorWith('# T\n\n`abc`');
    domDelete(ed, posOf(ed, 'abc'), posOf(ed, 'abc', true));
    type(ed, 'hi');
    expect(md(ed)).toBe('# T\n\nhi');
  });

  test('cleared out after other text: the text typed next is plain too', () => {
    const ed = editorWith('# T\n\nsee `abc`');
    domDelete(ed, posOf(ed, 'abc'), posOf(ed, 'abc', true));
    type(ed, 'hi');
    expect(md(ed)).toBe('# T\n\nsee hi');
  });

  test('part of it deleted: typing there goes on in the code', () => {
    const ed = editorWith('# T\n\n`abc`');
    domDelete(ed, posOf(ed, 'abc') + 2, posOf(ed, 'abc', true));
    type(ed, 'x');
    expect(md(ed)).toBe('# T\n\n`abx`');
  });

  test('code turned on with nothing typed yet: the next text is code', () => {
    const ed = editorWith('# T\n\nsee');
    ed.commands.focus('end');
    type(ed, ' ');
    ed.commands.toggleCode();
    type(ed, 'hi');
    expect(md(ed)).toBe('# T\n\nsee `hi`');
  });
});

describe('⌫ on an emptied sub-item deletes that line, the items after it stay where they were', () => {
  for (const [name, note, after] of [
    ['to-dos, in the middle', '# T\n\n- [ ] parent\n  - [ ] aa\n  - [ ] bb\n  - [ ] cc\n  - [ ] dd\n- [ ] next', '# T\n\n- [ ] parent\n  - [ ] aaZ\n  - [ ] cc\n  - [ ] dd\n- [ ] next'],
    ['to-dos, the first', '# T\n\n- [ ] parent\n  - [ ] bb\n  - [ ] cc\n- [ ] next', '# T\n\n- [ ] parentZ\n  - [ ] cc\n- [ ] next'],
    ['to-dos, the only one', '# T\n\n- [ ] parent\n  - [ ] bb\n- [ ] next', '# T\n\n- [ ] parentZ\n- [ ] next'],
    ['bullets', '# T\n\n- parent\n  - aa\n  - bb\n  - cc\n- next', '# T\n\n- parent\n  - aaZ\n  - cc\n- next'],
    ['numbers, after an item with its own sub-items', '# T\n\n1. one\n   1. aa\n      - x\n   2. bb\n   3. cc', '# T\n\n1. one\n   1. aa\n      - xZ\n   2. cc'],
  ] as const)
    test(name, () => {
      const ed = editorWith(note);
      ed.commands.setTextSelection({ from: posOf(ed, 'bb'), to: posOf(ed, 'bb', true) });
      press(ed, 'Backspace');
      press(ed, 'Backspace');
      type(ed, 'Z');
      expect(md(ed)).toBe(after);
    });
});

describe('toggles and callouts keep their shape at their edges', () => {
  const tog = (open: boolean) => `<details${open ? ' open' : ''}>\n<summary>tog</summary>\n\nsecret\n\n</details>\n\nafter`;
  const at = (ed: ReturnType<typeof editorWith>) => [ed.state.selection.$from.parent.type.name, ed.state.selection.$from.parentOffset];
  test('⌫ after an open toggle joins its last line; after a closed one it goes to the title, the toggle kept', () => {
    let ed = editorWith(tog(true));
    ed.commands.setTextSelection(posOf(ed, 'after'));
    press(ed, 'Backspace');
    expect(md(ed)).toBe('<details open>\n<summary>tog</summary>\n\nsecretafter\n\n</details>');
    ed = editorWith(tog(false));
    ed.commands.setTextSelection(posOf(ed, 'after'));
    press(ed, 'Backspace');
    expect(md(ed)).toBe(tog(false));
    expect(at(ed)).toEqual(['detailsSummary', 3]);
  });
  test('Delete before a toggle or a callout goes into it; an empty line before it goes', () => {
    let ed = editorWith('before\n\n' + tog(false));
    ed.commands.setTextSelection(posOf(ed, 'before', true));
    press(ed, 'Delete');
    expect(md(ed)).toBe('before\n\n' + tog(false));
    expect(at(ed)).toEqual(['detailsSummary', 0]);
    ed = editorWith('before\n\n> [!💡]\n> one\n>\n> two');
    ed.commands.setTextSelection(posOf(ed, 'before', true));
    press(ed, 'Delete');
    type(ed, 'Z');
    expect(md(ed)).toBe('before\n\n> [!💡]\n> Zone\n>\n> two');
  });
  test('a title\'s divider goes under the toggle; --- typed there stays text', () => {
    const ed = editorWith('<details open>\n<summary>tog</summary>\n\none\n\n</details>');
    ed.commands.setTextSelection(posOf(ed, 'tog', true));
    runEditorCommand(ed, 'divider');
    expect(md(ed)).toBe('<details open>\n<summary>tog</summary>\n\none\n\n</details>\n\n---');
    ed.commands.setTextSelection(posOf(ed, 'tog', true));
    type(ed, '---');
    expect(md(ed)).toContain('<summary>tog---</summary>');
  });
  test('⌫ at the start of a callout\'s title: out it goes, and the callout has no title', () => {
    const ed = editorWith('before\n\n> [!warning] Heads up\n> one two');
    ed.commands.setTextSelection(posOf(ed, 'Heads'));
    press(ed, 'Backspace');
    expect(md(ed)).toBe('before\n\nHeads up\n\n> [!warning]\n> one two');
  });
  test('⌥↑ / ⌥↓ step an edge line out of a callout or quote; a callout\'s title and body keep their order', () => {
    const move = (note: string, word: string, key: string) => {
      const ed = editorWith(note);
      ed.commands.setTextSelection(posOf(ed, word));
      press(ed, key, { altKey: true });
      return md(ed);
    };
    expect(move('before\n\n> [!💡]\n> one\n>\n> two', 'one', 'ArrowUp')).toBe('before\n\none\n\n> [!💡]\n> two');
    expect(move('before\n\n> [!💡]\n> one\n>\n> two\n\nafter', 'two', 'ArrowDown')).toBe('before\n\n> [!💡]\n> one\n\ntwo\n\nafter');
    expect(move('before\n\n> q1\n>\n> q2', 'q1', 'ArrowUp')).toBe('before\n\nq1\n\n> q2');
    expect(move('before\n\n> [!warning] Heads up\n> one two', 'one', 'ArrowUp')).toBe('before\n\n> [!warning] Heads up\n> one two');
  });
  test('an empty first line of a callout survives the round trip', () => {
    const ed = editorWith('> [!💡]\n> one two');
    ed.commands.setTextSelection(posOf(ed, 'one'));
    press(ed, 'Enter');
    expect(md(editorWith(md(ed)))).toBe(md(ed));
  });
  test('⌘⌥C over a range reaching into a list takes no unselected line', () => {
    const ed = editorWith('bef\n\n- aa\n- bb\n- cc');
    ed.commands.setTextSelection({ from: posOf(ed, 'bef'), to: posOf(ed, 'aa', true) });
    runEditorCommand(ed, 'codeBlock');
    expect(md(ed)).toContain('bb');
    expect(md(ed)).toContain('cc');
  });
});

describe('list keys that leave the rest of the list as it was', () => {
  /** the key at `word` (its end with `end`): the markdown after it, which reads back the same, and ⌘Z undoes it */
  const after = (note: string, word: string, end: boolean, key: string, init: KeyboardEventInit = {}) => {
    const ed = editorWith(note);
    ed.commands.setTextSelection(posOf(ed, word, end));
    const before = md(ed);
    press(ed, key, init);
    const out = md(ed);
    expect(md(editorWith(out))).toBe(out);
    ed.commands.undo();
    expect(md(ed)).toBe(before);
    return out.trimEnd();
  };
  /** the note with `x` taken out, the caret on the empty line left */
  const emptied = (note: string) => {
    const ed = editorWith(note);
    const p = posOf(ed, 'x');
    ed.view.dispatch(ed.state.tr.delete(p, p + 1));
    ed.commands.setTextSelection(p);
    return ed;
  };

  test('Delete at the end of a line over an item at another level or of another kind: only its text comes up', () => {
    expect(after('- [ ] alpha\n  - [ ] bravo\n  - [x] charlie\n- [x] foxtrot', 'alpha', true, 'Delete')).toBe('- [ ] alphabravo\n  - [x] charlie\n- [x] foxtrot');
    expect(after('- [ ] alpha\n  - [ ] bravo\n  - [ ] echo\n- [x] foxtrot', 'echo', true, 'Delete')).toBe('- [ ] alpha\n  - [ ] bravo\n  - [ ] echofoxtrot');
    expect(after('- [ ] alpha\n  - [x] charlie\n    - [ ] delta\n  - [ ] echo', 'charlie', true, 'Delete')).toBe('- [ ] alpha\n  - [x] charliedelta\n  - [ ] echo');
    expect(after('- alpha\n- [ ] bravo\n- c', 'alpha', true, 'Delete')).toBe('- alphabravo\n- c');
    // its sub-items keep their level, under the item the line is in at that level
    expect(after('- a\n  - b\n- [ ] c\n  - d', 'b', true, 'Delete')).toBe('- a\n  - bc\n  - d');
  });

  test('Enter at the start of a ticked to-do: an empty to-do above, the tick stays with its text', () => {
    expect(after('- [x] alpha\n- [ ] charlie', 'alpha', false, 'Enter')).toBe('- [ ] \u00a0\n- [x] alpha\n- [ ] charlie');
    expect(after('- [ ] z\n  - [x] alpha\n  - [ ] charlie', 'alpha', false, 'Enter')).toBe('- [ ] z\n  - [ ] \u00a0\n  - [x] alpha\n  - [ ] charlie');
  });

  test('Enter on an empty sub-item in the middle of its list steps out as ⇧Tab does, the list tight', () => {
    for (const [note, out] of [['- a\n  - b\n  - x\n  - c\n- d', '- a\n  - b\n- \u00a0\n  - c\n- d'], ['1. a\n   1. b\n   2. x\n   3. c\n2. d', '1. a\n   1. b\n2. \u00a0\n   1. c\n3. d']]) {
      const ed = emptied(note), tab = emptied(note);
      const before = md(ed);
      press(ed, 'Enter');
      press(tab, 'Tab', { shiftKey: true });
      expect(md(ed).trimEnd()).toBe(out);
      expect(md(tab)).toBe(md(ed));
      ed.commands.undo();
      expect(md(ed)).toBe(before);
    }
  });

  test('⌘A then ⌘⇧8 / ⌘⇧7 on a nested to-do list: every line changes kind where it is, one ⌘Z back', () => {
    const note = '- [ ] a\n  - [ ] b\n  - [x] c\n- [x] f';
    for (const [id, out] of [['bulletList', '- a\n  - b\n  - c\n- f'], ['orderedList', '1. a\n   1. b\n   2. c\n2. f']]) {
      const ed = editorWith(note);
      ed.commands.selectAll();
      runEditorCommand(ed, id);
      expect(md(ed).trimEnd()).toBe(out);
      ed.commands.undo();
      expect(md(ed)).toBe(note);
    }
    // ⌘⇧9 on to-dos takes them out of the list, with no empty to-do left at the end
    const ed = editorWith('- [ ] a\n- [x] f');
    ed.commands.selectAll();
    runEditorCommand(ed, 'taskList');
    expect(md(ed).trimEnd()).toBe('a\n\nf');
  });

  test('a numbered item taken out of the middle of its list: the numbers after it carry on', () => {
    expect(after('1. a\n2. b\n3. c\n4. d', 'b', false, 'Backspace')).toBe('1. a\n\nb\n\n3. c\n4. d');
    for (const key of ['Enter', 'Backspace']) {
      const ed = emptied('1. a\n2. b\n3. x\n4. c');
      press(ed, key);
      expect(md(ed).trimEnd()).toBe('1. a\n2. b\n\n\u00a0\n\n4. c');
    }
  });
});

describe('list ends, whole-list toggles and empty lines that read back the same', () => {
  /** the key at `word` (its end with `end`): the markdown after it, which reads back the same, and \u2318Z undoes it */
  const after = (note: string, word: string, end: boolean, key: string, init: KeyboardEventInit = {}) => {
    const ed = editorWith(note);
    ed.commands.setTextSelection(posOf(ed, word, end));
    const before = md(ed);
    press(ed, key, init);
    const out = md(ed);
    expect(md(editorWith(out))).toBe(out);
    ed.commands.undo();
    expect(md(ed)).toBe(before);
    return out.trimEnd();
  };

  test('Delete at the end of a list\'s last line, only the note\'s end after it: nothing changes', () => {
    for (const [note, word] of [['- a\n- b', 'b'], ['- [ ] a\n- [x] b', 'b'], ['1. a\n2. b', 'b'], ['- a\n  - b', 'b'], ['1. a\n   - [ ] b', 'b']]) {
      const ed = editorWith(note);
      ed.commands.setTextSelection(posOf(ed, word, true));
      press(ed, 'Delete');
      expect(md(ed).trimEnd()).toBe(note);
    }
  });

  test('Delete at the end of a list\'s last line with a line after it: that line\'s text comes up onto it', () => {
    expect(after('- a\n- b\n\npara', 'b', true, 'Delete')).toBe('- a\n- bpara');
    expect(after('- [ ] a\n- [x] b\n\npara\n\nnext', 'b', true, 'Delete')).toBe('- [ ] a\n- [x] bpara\n\nnext');
    expect(after('1. a\n   1. b\n\npara', 'b', true, 'Delete')).toBe('1. a\n   1. bpara');
  });

  test('\u2318\u21e78 / \u2318\u21e77 / \u2318\u21e79 over lines all of that kind, nested ones too: every line plain, one \u2318Z back', () => {
    for (const [note, id] of [['- a\n  - b\n  - c\n- f', 'bulletList'], ['1. a\n   1. b\n   2. c\n2. f', 'orderedList'], ['- [ ] a\n  - [x] b\n  - [ ] c\n- [x] f', 'taskList']]) {
      const ed = editorWith(note);
      ed.commands.selectAll();
      runEditorCommand(ed, id);
      const out = md(ed);
      expect(out.trimEnd()).toBe('a\n\nb\n\nc\n\nf');
      expect(md(editorWith(out))).toBe(out);
      ed.commands.undo();
      expect(md(ed)).toBe(note);
    }
    // the lines picked only: the one above stays in its list
    const ed = editorWith('- a\n  - b\n  - c\n- f');
    ed.commands.setTextSelection({ from: posOf(ed, 'b'), to: posOf(ed, 'f', true) });
    runEditorCommand(ed, 'bulletList');
    expect(md(ed).trimEnd()).toBe('- a\n\nb\n\nc\n\nf');
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, '|')).toBe('b|c|f');
    // a line of another kind among them: they are switched to that kind, where they are
    const mixed = editorWith('- a\n  - [ ] b\n- f');
    mixed.commands.selectAll();
    runEditorCommand(mixed, 'bulletList');
    expect(md(mixed).trimEnd()).toBe('- a\n  - b\n- f');
  });

  test('Enter on an empty bullet with a sub-item, under a to-do: it steps out as \u21e7Tab does and reads back the same', () => {
    const note = '- [ ] a\n  - b\n  - y\n    - x\n- [ ] c';
    const emptied = () => {
      const ed = editorWith(note);
      const p = posOf(ed, 'y');
      ed.view.dispatch(ed.state.tr.delete(p, p + 1).setMeta('addToHistory', false));
      ed.commands.setTextSelection(p);
      return ed;
    };
    const ed = emptied(), tab = emptied();
    const before = md(ed);
    expect(md(editorWith(before))).toBe(before);
    press(ed, 'Enter');
    press(tab, 'Tab', { shiftKey: true });
    const out = md(ed);
    expect(out.trimEnd()).toBe('- [ ] a\n  - b\n\n- \u00a0\n  - x\n\n- [ ] c');
    expect(md(tab)).toBe(out);
    expect(md(editorWith(out))).toBe(out);
    ed.commands.undo();
    expect(md(ed)).toBe(before);
  });

  test('\u232b at the start of a numbered list\'s first line: the numbers after it carry on', () => {
    expect(after('1. a\n2. b\n3. c', 'a', false, 'Backspace')).toBe('a\n\n2. b\n3. c');
    expect(after('3. a\n4. b', 'a', false, 'Backspace')).toBe('a\n\n4. b');
    // inside an item, as it was: the line steps out a level, still a number, the one after it under it
    expect(after('- z\n  1. a\n  2. b', 'a', false, 'Backspace')).toBe('- z\n\n1. a\n   1. b');
  });
});
