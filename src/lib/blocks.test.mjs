import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { moveBlock, indentLines, switchItem } from './blocks.ts';

// the editor's node names and content rules (editor.ts), without the editor
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
    codeBlock: { group: 'block', content: 'text*', code: true },
    image: { group: 'block', atom: true },
    bulletList: { group: 'block', content: 'listItem+' },
    orderedList: { group: 'block', content: 'listItem+', attrs: { start: { default: 1 } } },
    listItem: { content: '(paragraph|image) block*', defining: true },
    taskList: { group: 'block', content: 'taskItem+' },
    taskItem: { content: 'paragraph block*', defining: true, attrs: { checked: { default: false } } },
  },
});

/**
 * A note from lines the way they read: "- a" bullet, "1. a" numbered, "[] a" to-do, "# a" title, "``` a" code,
 * "img" picture, "" an empty line, anything else a paragraph; two spaces per level. Neighbouring lines of the
 * same kind and level share a list (as the editor's joinLists keeps them).
 */
function doc(...lines) {
  const kinds = { '- ': ['bulletList', 'listItem'], '1. ': ['orderedList', 'listItem'], '[] ': ['taskList', 'taskItem'] };
  const parse = (l) => {
    const depth = l.match(/^ */)[0].length / 2;
    const t = l.trim();
    const k = Object.keys(kinds).find((m) => t.startsWith(m));
    return { depth, kind: k, text: k ? t.slice(k.length) : t };
  };
  const block = (text) => {
    if (text.startsWith('# ')) return schema.node('heading', null, schema.text(text.slice(2)));
    if (text.startsWith('``` ')) return schema.node('codeBlock', null, schema.text(text.slice(4)));
    if (text === 'img') return schema.node('image');
    return schema.node('paragraph', null, text ? schema.text(text) : null);
  };
  // builds the blocks of one level from items[i..] while they are at `depth` or deeper
  const build = (items, i, depth) => {
    const out = [];
    while (i < items.length && items[i].depth >= depth) {
      const it = items[i];
      if (!it.kind) { out.push(block(it.text)); i++; continue; }
      const [listName, itemName] = kinds[it.kind];
      const children = [];
      while (i < items.length && items[i].depth === depth && items[i].kind === it.kind) {
        const head = items[i++];
        const [kids, next] = build(items, i, depth + 1);
        i = next;
        children.push(schema.node(itemName, null, [block(head.text), ...kids]));
      }
      out.push(schema.node(listName, null, children));
    }
    return [out, i];
  };
  return schema.node('doc', null, build(lines.map(parse), 0, 0)[0]);
}

/** The note back as lines, in the same notation: what the writer sees, whatever the lists are cut into. */
function lines(node, depth = 0, marker = '') {
  const out = [];
  node.forEach((child) => {
    const pad = '  '.repeat(depth);
    if (/List$/.test(child.type.name)) {
      const m = { bulletList: '- ', orderedList: '1. ', taskList: '[] ' }[child.type.name];
      child.forEach((item) => out.push(...lines(item, depth + 1, m)));
    } else if (child.type.name === 'image') out.push(pad.slice(2) + marker + 'img');
    else {
      const prefix = child.type.name === 'heading' ? '# ' : child.type.name === 'codeBlock' ? '``` ' : '';
      out.push((marker ? '  '.repeat(depth - 1) + marker : pad) + prefix + child.textContent);
    }
    marker = ''; // only an item's first line carries its marker
  });
  return out;
}

/** Put the selection on the lines named (by their text), run `cmd`, give back the lines and what is selected. */
function run(src, from, to, ...cmds) {
  let state = EditorState.create({ doc: src });
  const at = (word, end) => {
    let p = -1;
    state.doc.descendants((n, pos) => { if (p < 0 && n.isText && n.text === word) p = pos + (end ? word.length : 0); });
    assert.ok(p >= 0, `no line "${word}"`);
    return p;
  };
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at(from), to ? at(to, true) : at(from))));
  const results = [];
  for (const cmd of cmds) {
    let ok = cmd(state, (tr) => { state = state.apply(tr); });
    results.push({ ok, lines: lines(state.doc), selected: state.doc.textBetween(state.selection.from, state.selection.to, '/') });
  }
  return results;
}

/** For indentLines, which is a tiptap command over a transaction: the same shape as a ProseMirror command. */
const indent = (dir) => (state, dispatch) => {
  const tr = state.tr;
  const ok = indentLines(dir)({ tr });
  if (ok && tr.docChanged) dispatch(tr);
  return ok;
};
/** moveBlock is a tiptap command too ({ state, dispatch }) */
const move = (dir) => (state, dispatch) => moveBlock(dir)({ state, dispatch });
const up = move(-1), down = move(1), tab = indent(1), untab = indent(-1);
const last = (r) => r.at(-1).lines;

// ---- ⌥↑ / ⌥↓: every line is one step, a list item and an empty line included ----

// a paragraph walks through a list one item at a time, both ways
{
  const r = run(doc('문단', '- a', '- b', '- c', '끝'), '문단', null, down, down, down, down, up, up, up, up);
  assert.deepEqual(r.map((x) => x.lines), [
    ['- a', '문단', '- b', '- c', '끝'],
    ['- a', '- b', '문단', '- c', '끝'],
    ['- a', '- b', '- c', '문단', '끝'],
    ['- a', '- b', '- c', '끝', '문단'],
    ['- a', '- b', '- c', '문단', '끝'],
    ['- a', '- b', '문단', '- c', '끝'],
    ['- a', '문단', '- b', '- c', '끝'],
    ['문단', '- a', '- b', '- c', '끝'],
  ]);
}

// a code block passes a list item by item too
assert.deepEqual(last(run(doc('``` x', '- a', '- b', '끝'), 'x', null, down)), ['- a', '``` x', '- b', '끝']);

// a bullet passing a numbered list goes between its items, and the numbering carries on after it
{
  let state = EditorState.create({ doc: doc('- x', '1. one', '1. two', '1. three') });
  let p = -1;
  state.doc.descendants((n, pos) => { if (p < 0 && n.isText && n.text === 'x') p = pos; });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, p)));
  down(state, (tr) => { state = state.apply(tr); });
  assert.deepEqual(lines(state.doc), ['1. one', '- x', '1. two', '1. three']);
  const lists = [];
  state.doc.forEach((n) => { if (n.type.name === 'orderedList') lists.push(n.attrs.start); });
  assert.deepEqual(lists, [1, 2], 'the part after the bullet starts at 2, not 1');
}

// empty lines are lines: an item steps over each one
assert.deepEqual(run(doc('하나', '', '- a', '- b', '', '둘'), 'a', null, down, down, down).map((x) => x.lines), [
  ['하나', '', '- b', '- a', '', '둘'],
  ['하나', '', '- b', '', '- a', '둘'],
  ['하나', '', '- b', '', '둘', '- a'],
]);

// the empty line the editor keeps at the very end is not passed: it would only come back, again and again
{
  const r = run(doc('- a', '- b', ''), 'b', null, down);
  assert.equal(r[0].ok, true, 'the key is still ours');
  assert.deepEqual(r[0].lines, ['- a', '- b', '']);
}

// a title (a heading as the first line) stays on top
{
  const r = run(doc('# 제목', '문단'), '문단', null, up);
  assert.deepEqual(r[0].lines, ['# 제목', '문단']);
}

// several bullets selected move together and stay selected; out of the list and back in
assert.deepEqual(run(doc('위', '- a', '- bb', '- cc', '- d', '아래'), 'bb', 'cc', up, up, down, down, down, down).map((x) => [x.lines.join(' | '), x.selected]), [
  ['위 | - bb | - cc | - a | - d | 아래', 'bb/cc'],
  ['- bb | - cc | 위 | - a | - d | 아래', 'bb/cc'],
  ['위 | - bb | - cc | - a | - d | 아래', 'bb/cc'],
  ['위 | - a | - bb | - cc | - d | 아래', 'bb/cc'],
  ['위 | - a | - d | - bb | - cc | 아래', 'bb/cc'],
  ['위 | - a | - d | 아래 | - bb | - cc', 'bb/cc'],
]);
// …and leave no empty bullet behind when the whole list goes
assert.ok(!last(run(doc('위', '- a', '- b', '아래'), 'a', 'b', up)).includes('- '));

// a sub-item at the top of its list steps out beside its parent, never above the parent's own line
assert.deepEqual(run(doc('- a', '  - a1', '  - a2', '- b'), 'a2', null, up, up).map((x) => x.lines), [
  ['- a', '  - a2', '  - a1', '- b'],
  ['- a2', '- a', '  - a1', '- b'],
]);
// and at the bottom of its list, out after its parent
assert.deepEqual(last(run(doc('- a', '  - a1', '- b'), 'a1', null, down)), ['- a', '- a1', '- b']);

// an item's own line takes what hangs under it along
assert.deepEqual(last(run(doc('- a', '  - a1', '- b', '- c'), 'a', null, down)), ['- b', '- a', '  - a1', '- c']);

// ---- Tab / ⇧Tab: only the caret's line, or the selected lines, change level ----

// a to-do's sub-items stay where they are when it is indented, and when it comes back
assert.deepEqual(run(doc('[] a', '[] b', '  [] c', '[] d'), 'b', null, tab, untab).map((x) => x.lines), [
  ['[] a', '  [] b', '  [] c', '[] d'],
  ['[] a', '[] b', '  [] c', '[] d'],
]);

// the selected lines move, the ones under them that were not selected do not
assert.deepEqual(run(doc('[] a', '[] b', '  [] b1', '  [] b2', '[] c'), 'b', 'b1', tab, untab).map((x) => [x.lines.join(' | '), x.selected]), [
  ['[] a |   [] b |     [] b1 |   [] b2 | [] c', 'b/b1'],
  ['[] a | [] b |   [] b1 |   [] b2 | [] c', 'b/b1'],
]);

// several selected lines together, bullets the same as to-dos
assert.deepEqual(last(run(doc('- a', '- b', '- c', '- d'), 'b', 'c', tab)), ['- a', '  - b', '  - c', '- d']);
assert.deepEqual(last(run(doc('- a', '- b', '  - c', '- d'), 'b', null, tab)), ['- a', '  - b', '  - c', '- d']);

// ⇧Tab: the line below keeps its level (it now hangs under the line that came out)
assert.deepEqual(last(run(doc('- a', '  - b', '  - c'), 'b', null, untab)), ['- a', '- b', '  - c']);

// ⇧Tab at the outermost level does nothing: a to-do keeps its box
{
  const r = run(doc('[] a', '[] b'), 'a', null, untab);
  assert.equal(r[0].ok, true);
  assert.deepEqual(r[0].lines, ['[] a', '[] b']);
}

// the first item has nothing to go under: Tab leaves it be
assert.deepEqual(last(run(doc('- a', '- b'), 'a', null, tab)), ['- a', '- b']);

// outside a list Tab is not ours (the editor keeps it from leaving the page)
assert.equal(run(doc('문단'), '문단', null, tab)[0].ok, false);

// ---- lists of different kinds under one another (bullets under a to-do, a to-do under a bullet) ----

// ⇧Tab takes a bullet out from under its to-do as a bullet (it used to become a plain line inside the to-do),
// and Tab puts it back under the to-do it came from
assert.deepEqual(run(doc('[] a', '  - b', '[] c'), 'b', null, untab, tab).map((x) => x.lines), [
  ['[] a', '- b', '[] c'],
  ['[] a', '  - b', '[] c'],
]);
// a to-do under a bullet, the same both ways
assert.deepEqual(run(doc('- a', '  [] t', '- c'), 't', null, untab, tab).map((x) => x.lines), [
  ['- a', '[] t', '- c'],
  ['- a', '  [] t', '- c'],
]);
// two bullets selected come out and go back together; one bullet out, the one under it stays at its level
assert.deepEqual(last(run(doc('[] a', '  - b', '  - b2', '[] c'), 'b', 'b2', untab)), ['[] a', '- b', '- b2', '[] c']);
assert.deepEqual(last(run(doc('[] a', '  - b', '  - b2', '[] c'), 'b', null, untab)), ['[] a', '- b', '  - b2', '[] c']);
// Tab under a to-do that has sub-to-dos already: the bullet joins them at their level
assert.deepEqual(last(run(doc('[] a', '  [] a1', '- b'), 'b', null, tab)), ['[] a', '  [] a1', '  - b']);

// typing another kind's marker at the start of a list line turns that one line into it
{
  const kind = (src, word, list, item, attrs) => {
    let state = EditorState.create({ doc: src });
    let p = -1;
    state.doc.descendants((n, pos) => { if (p < 0 && n.isText && n.text.startsWith(word)) p = pos; });
    const tr = state.tr;
    const ok = switchItem(tr, p, p + word.length, schema.nodes[list], schema.nodes[item], attrs);
    return ok ? lines(state.apply(tr).doc) : false;
  };
  assert.deepEqual(kind(doc('[] a', '  [] -b', '  [] c'), '-', 'bulletList', 'listItem'), ['[] a', '  - b', '  [] c']);
  assert.deepEqual(kind(doc('[] a', '  - x', '  - []y'), '[]', 'taskList', 'taskItem'), ['[] a', '  - x', '  [] y']);
  assert.deepEqual(kind(doc('- a', '- 1.b', '- c'), '1.', 'orderedList', 'listItem', { start: 1 }), ['- a', '1. b', '- c']);
  assert.equal(kind(doc('- a', '- -b'), '-', 'bulletList', 'listItem'), false, 'already a bullet: nothing to do');
  assert.equal(kind(doc('-x'), '-', 'bulletList', 'listItem'), false, 'not in a list: the stock rule\'s business');
}

// ---- ⌥↑ / ⌥↓ through lists of different kinds ----

// a bullet under a to-do: up past the to-do's own line, it steps out above it (it used to break the to-do's
// text apart); down from the bottom, out under it and on past the next to-dos (it used to stay put)
assert.deepEqual(last(run(doc('[] t1', '  - a', '  - b', '[] t2'), 'a', null, up)), ['- a', '[] t1', '  - b', '[] t2']);
assert.deepEqual(run(doc('[] t1', '  - a', '  - b', '[] t2', '[] t3'), 'b', null, down, down, down).map((x) => x.lines), [
  ['[] t1', '  - a', '- b', '[] t2', '[] t3'],
  ['[] t1', '  - a', '[] t2', '- b', '[] t3'],
  ['[] t1', '  - a', '[] t2', '[] t3', '- b'],
]);
// a to-do under a bullet, the same
assert.deepEqual(last(run(doc('- a', '  [] x', '  [] y', '- b'), 'y', null, down, down)), ['- a', '  [] x', '- b', '[] y']);
// a bullet passing to-dos and a to-do passing bullets: one line at a time, both ways
assert.deepEqual(last(run(doc('- a', '[] t1', '[] t2', '- b'), 'a', null, down, down)), ['[] t1', '[] t2', '- a', '- b']);
assert.deepEqual(last(run(doc('[] t', '- a', '- b', '[] u'), 't', null, down, down, up, up)), ['[] t', '- a', '- b', '[] u']);
// a to-do between two child lists of another kind: past the bullet above it first, then out
assert.deepEqual(run(doc('[] t', '  - a', '  [] x', '  - b', '[] u'), 'x', null, up, up).map((x) => x.lines), [
  ['[] t', '  [] x', '  - a', '  - b', '[] u'],
  ['[] x', '[] t', '  - a', '  - b', '[] u'],
]);
// a selection from a bullet into the to-do under the list: only those two move, the to-do after them stays
assert.deepEqual(run(doc('- a', '[] t1', '[] t2', '- b', 'p'), 'a', 't1', down, down, up, up).map((x) => [x.lines.join(' | '), x.selected]), [
  ['[] t2 | - a | [] t1 | - b | p', 'a/t1'],
  ['[] t2 | - b | - a | [] t1 | p', 'a/t1'],
  ['[] t2 | - a | [] t1 | - b | p', 'a/t1'],
  ['- a | [] t1 | [] t2 | - b | p', 'a/t1'],
]);
// several lines of several kinds, nested ones included, travel together and keep their levels
assert.deepEqual(last(run(doc('p', '[] t', '  - a', '1. one', '1. two', '끝'), 't', 'one', up)), ['[] t', '  - a', '1. one', 'p', '1. two', '끝']);

console.log('BLOCKS_OK');
