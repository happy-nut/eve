// The caret when the open note comes in changed (sync: another device saved it): it stays by the text it was in, in
// every kind of block, alone and nested, whatever changed before it — and a picture or a formula chosen whole stays
// chosen. Put back by where it stood in the blocks replaced, it went into another cell of a table, another item of a
// list, as soon as something before it grew or shrank (a click seemed to land somewhere else).
import { test, expect, afterEach } from 'vitest';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { editorWith as make, md } from './testEditor';
import { takeBody } from './takeBody';
import { SAMPLES, INSIDE, BLOCKS } from './schemaSamples';

const made: { destroy(): void }[] = [];
const editorWith = (s: string) => { const ed = make(s); made.push(ed); return ed; };
afterEach(() => { for (const ed of made.splice(0)) ed.destroy(); document.body.innerHTML = ''; });

const NOTES: [string, string][] = [
  ...Object.entries(SAMPLES).map(([k, s]) => [k, s] as [string, string]),
  ...Object.entries(INSIDE).flatMap(([where, wrap]) => BLOCKS.map((k) => [`${k} inside ${where}`, wrap(SAMPLES[k])] as [string, string])),
].map(([k, s]) => [k, `above words\n\n${s.replace(/\n+$/, '')}\n\nbelow words`]);

/** the lines of text in the note (where a caret goes), and the things chosen whole (a picture, a formula, a card) */
function parts(doc: PMNode) {
  const lines: { pos: number; text: string }[] = [], atoms: { pos: number; type: string }[] = [];
  doc.descendants((n, pos) => {
    if (n.isTextblock) { if (n.textContent.length >= 2) lines.push({ pos: pos + 1, text: n.textContent }); return false; }
    if (n.isAtom && n.isBlock && n.type.spec.selectable !== false) atoms.push({ pos, type: n.type.name });
    return true;
  });
  return { lines, atoms };
}

test.each(NOTES)('%s: the caret stays by its text when a line before it changes', (_k, note) => {
  const ed = editorWith(note);
  const body = md(ed);
  const { lines, atoms } = parts(ed.state.doc);
  const wrong: string[] = [];
  for (let e = 0; e < lines.length; e++) {
    for (const change of ['longer', 'shorter'] as const) {
      // the same note as another device saved it: one line before the caret written longer or shorter
      // (made and let go at once: hundreds of them kept to the end made a long list's case run past its time on CI)
      const other = make(body);
      const at = parts(other.state.doc).lines[e].pos;
      other.view.dispatch(change === 'longer' ? other.state.tr.insertText('zz ', at) : other.state.tr.delete(at, at + 1));
      const changed = md(other);
      other.destroy();
      for (const line of lines.slice(e + 1)) {
        for (const [into, back] of [[changed, body], [body, changed]] as const) {
          // (the caret where it would be in the note as it now stands)
          const now = parts(ed.state.doc).lines.find((l) => l.text === line.text) ?? parts(ed.state.doc).lines[lines.indexOf(line)];
          const off = Math.floor(line.text.length / 2);
          ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, now.pos + off)));
          const before = ed.state.selection.$from.parent.textContent;
          takeBody(ed, into);
          const { $from } = ed.state.selection;
          if ($from.parent.textContent !== before || $from.parentOffset !== off) {
            wrong.push(`line ${e + 1} ${change}: caret in "${before}"@${off} went to "${$from.parent.textContent}"@${$from.parentOffset}`);
          }
          takeBody(ed, back);
        }
      }
      for (const atom of atoms.filter((a) => a.pos > lines[e].pos)) {
        const now = parts(ed.state.doc).atoms[atoms.indexOf(atom)];
        ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, now.pos)));
        takeBody(ed, changed);
        const sel = ed.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== atom.type) wrong.push(`line ${e + 1} ${change}: the ${atom.type} chosen whole was let go (${sel.constructor.name} at ${sel.from})`);
        takeBody(ed, body);
      }
    }
  }
  expect([...new Set(wrong)]).toEqual([]);
}, 60_000); // a note of many lines tries every pair of them: seconds on a slow CI machine
