// Notion's editing behaviour, one case each, done the same in Eve: what notion.com/help/keyboard-shortcuts and
// /writing-and-editing-basics say, and what Notion's editor does with the keys they leave unsaid (Enter on an empty
// list line, ⌫ at the start of a heading…). A behaviour Notion has and Eve did not is a case here first. Kept apart:
// what a plain-markdown note cannot hold (a paragraph nested under a paragraph), Esc, which puts Eve away, and a
// breadcrumb block, which the note's top row already is.
import { test, expect, afterEach, describe } from 'vitest';
import { editorWith, md, posOf, type, press, paste } from './testEditor';
import { slashItems } from './slash';
import { dayChoices } from './date';
import { ui } from './ui.svelte';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';

afterEach(() => { document.body.innerHTML = ''; });

/** the note with the caret at the start of `at` (its end with `end`) */
function at(note: string, word: string, end = false): Editor {
  const ed = editorWith(note);
  ed.commands.setTextSelection(posOf(ed, word, end));
  return ed;
}
const saved = (ed: Editor) => md(ed).trimEnd();
const kinds = (ed: Editor) => { const out: string[] = []; ed.state.doc.forEach((n) => out.push(n.type.name)); return out; };

describe('Enter', () => {
  for (const [name, note] of [['bullet', '# T\n\n- a'], ['number', '# T\n\n1. a'], ['to-do', '# T\n\n- [ ] a']]) {
    test(`on an empty ${name} line it leaves the list: the line is text`, () => {
      const ed = at(note, 'a', true);
      press(ed, 'Enter');
      press(ed, 'Enter');
      type(ed, 'z');
      expect(saved(ed)).toBe(`${note}\n\nz`);
    });
  }
  test('at the end of a heading, the next line is text', () => {
    const ed = at('# T\n\n## head', 'head', true);
    press(ed, 'Enter');
    type(ed, 'z');
    expect(saved(ed)).toBe('# T\n\n## head\n\nz');
  });
  test('at the start of a heading, an empty line goes above it and the heading stays one', () => {
    const ed = at('# T\n\n## head', 'head');
    press(ed, 'Enter');
    expect(kinds(ed).slice(0, 3)).toEqual(['heading', 'paragraph', 'heading']);
  });
  test('after a done to-do, the new one is not done', () => {
    const ed = at('# T\n\n- [x] done', 'done', true);
    press(ed, 'Enter');
    type(ed, 'z');
    expect(saved(ed)).toBe('# T\n\n- [x] done\n- [ ] z');
  });
  test('⇧↵ is a line break in the same block', () => {
    const ed = at('# T\n\nab', 'ab', true);
    press(ed, 'Enter', { shiftKey: true });
    type(ed, 'c');
    expect(kinds(ed).filter((k) => k === 'paragraph').length).toBe(kinds(editorWith('# T\n\nab')).filter((k) => k === 'paragraph').length);
  });
});

describe('⌫ at the start of a line turns it into text, where it is', () => {
  for (const [name, note, word, after] of [
    ['heading', '# T\n\n## head', 'head', '# T\n\nhead'],
    ['quote', '# T\n\n> said', 'said', '# T\n\nsaid'],
    ['bullet', '# T\n\n- a\n- b', 'b', '# T\n\n- a\n\nb'],
    ['to-do', '# T\n\n- [ ] a\n- [ ] b', 'b', '# T\n\n- [ ] a\n\nb'],
    ['number', '# T\n\n1. a\n2. b', 'b', '# T\n\n1. a\n\nb'],
  ]) {
    test(name, () => {
      const ed = at(note, word);
      press(ed, 'Backspace');
      expect(saved(ed)).toBe(after);
    });
  }
});

describe('typing', () => {
  test('-> and <- become arrows, as Notion makes them', () => {
    const ed = at('# T\n\nx', 'x', true);
    type(ed, ' a -> b <- c');
    expect(ed.state.doc.lastChild!.textContent || ed.state.doc.child(1).textContent).toContain('a → b ← c');
  });
  test('…but not in code', () => {
    const ed = at('# T\n\n```\nx\n```', 'x', true);
    type(ed, ' -> y');
    expect(saved(ed)).toContain('x -> y');
  });
  test('a link pasted over chosen words links them', () => {
    const ed = editorWith('# T\n\nread this now');
    ed.commands.setTextSelection({ from: posOf(ed, 'this'), to: posOf(ed, 'this', true) });
    paste(ed, 'https://example.com/a');
    expect(saved(ed)).toBe('# T\n\nread [this](https://example.com/a) now');
  });
});

describe('the / menu', () => {
  const labels = (q: string) => slashItems(q).map((i) => i.label);
  for (const [q, label] of [['duplicate', 'Duplicate'], ['delete', 'Delete'], ['toc', 'Table of contents'], ['moveto', 'Move to']]) {
    test(`/${q} offers ${label}`, () => expect(labels(q)).toContain(label));
  }
});

describe('@ days', () => {
  const now = new Date(2026, 9, 26); // a Monday
  for (const [q, iso] of [['today', '2026-10-26'], ['tomorrow', '2026-10-27'], ['next wednesday', '2026-11-04'], ['wednesday', '2026-10-28'], ['next week', '2026-11-02'], ['in 3 days', '2026-10-29']]) {
    test(`@${q}`, () => expect(dayChoices(q, now, 'en-US')[0]?.iso).toBe(iso));
  }
});

describe('⌘↵ acts on the line', () => {
  test('a toggle opens and closes', () => {
    const ed = editorWith('# T\n\n<details><summary>title</summary>\n\nbody\n\n</details>');
    ed.commands.setTextSelection(posOf(ed, 'title', true));
    const open = () => { let o: boolean | undefined; ed.state.doc.descendants((n) => { if (n.type.name === 'details') o = n.attrs.open; }); return o; };
    const was = open();
    press(ed, 'Enter', { ctrlKey: true });
    expect(open()).toBe(!was);
  });
});

describe('what the / menu\'s own lines do', () => {
  const run = (ed: Editor, label: string) => slashItems('').concat(slashItems(label.split(' ')[0].toLowerCase())).find((i) => i.label === label)!.run!(ed);
  test('Delete takes the line away, an item with what is under it', () => {
    const ed = at('# T\n\n- a\n  - under\n- b', 'a', true);
    run(ed, 'Delete');
    expect(saved(ed)).toBe('# T\n\n- b');
  });
  test('Table of contents lists the headings, and follows them as they change; saved, it is a comment other apps leave be', () => {
    const ed = at('# T\n\n## One\n\nx\n\n### Two', 'x', true);
    run(ed, 'Table of contents');
    const items = () => [...ed.view.dom.querySelectorAll('.toc a')].map((a) => a.textContent);
    expect(items()).toEqual(['One', 'Two']);
    expect(saved(ed)).toContain('<!-- toc -->');
    ed.commands.setTextSelection(posOf(ed, 'Two', true));
    press(ed, 'Enter');
    type(ed, '## Three');
    expect(items()).toEqual(['One', 'Two', 'Three']);
  });
});

test('Space on a chosen picture shows it full size, as ↩ does', () => {
  const ed = editorWith('# T\n\n![](a.png)\n\nafter');
  let pos = -1;
  ed.state.doc.descendants((n, p) => { if (n.type.name === 'image') pos = p; });
  ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos)));
  press(ed, ' ');
  expect(ui.photo?.src).toBeTruthy();
  ui.closeImage();
  expect(md(ed)).toContain('![](a.png)');
});
