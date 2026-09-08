import { Node, type Editor } from '@tiptap/core';
import { Selection, TextSelection } from '@tiptap/pm/state';
import { ui } from './ui.svelte';
import { mount, unmount } from 'svelte';
import Board from '../Kanban.svelte';
import { defaultBoard, parseBoard, serializeBoard, type Column } from './board';

/**
 * Kanban block: an atom node whose whole state is one attribute (the columns); the board UI is
 * Kanban.svelte mounted in the node view. File form is a ```kanban fence holding JSON (see board.ts);
 * a fence that does not parse stays a plain code block so nothing is lost.
 */
let enterNext = false;
/** Insert a fresh board at the cursor and put keyboard focus in it. */
export const insertKanban = (editor: { chain: () => any }) => {
  enterNext = true;
  editor.chain().focus().insertContent([{ type: 'kanban', attrs: { columns: defaultBoard() } }, { type: 'paragraph' }]).run();
};

/** Delete the board at `pos` (asks first when it holds cards; ⌘Z brings it back either way). */
async function deleteBoard(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== 'kanban') return;
  const n = (node.attrs.columns as Column[]).reduce((s, c) => s + c.cards.length, 0);
  if (n && !(await ui.ask(`Delete the board and its ${n} card${n > 1 ? 's' : ''}?`))) return;
  editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).focus().run();
}

/** Keyboard focus into the board at `pos` (Kanban.svelte decides where). */
const enterBoard = (editor: Editor, pos: number) => (editor.view.nodeDOM(pos) as any)?.__enter?.();

export const Kanban = Node.create({
  name: 'kanban',
  group: 'block',
  atom: true,
  selectable: false, // the board is entered, never selected as a block

  addAttributes() {
    return { columns: { default: [] as Column[], parseHTML: (el) => parseBoard(el.textContent ?? '') ?? [], rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-kanban]' }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-kanban': '' }, serializeBoard(node.attrs.columns)];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'kanban';
      dom.contentEditable = 'false';
      const pos = () => getPos() as number;
      const app = mount(Board, {
        target: dom,
        props: {
          columns: node.attrs.columns,
          commit: (columns: Column[]) => editor.view.dispatch(editor.state.tr.setNodeMarkup(pos(), undefined, { columns })),
          // leave to the text before / after the board (a paragraph is added after it when there is none)
          exit: (where: 'before' | 'after') => {
            const p = pos(), tr = editor.state.tr;
            if (where === 'after' && !tr.doc.nodeAt(p + 1)) tr.insert(p + 1, editor.schema.nodes.paragraph.create());
            tr.setSelection(Selection.near(tr.doc.resolve(where === 'before' ? p : p + 1), where === 'before' ? -1 : 1)).scrollIntoView();
            editor.view.dispatch(tr);
            editor.view.focus();
          },
          remove: () => deleteBoard(editor, pos()),
          undo: () => editor.commands.undo(),
          redo: () => editor.commands.redo(),
        },
      });
      (dom as any).__enter = app.enter;
      if (enterNext) { enterNext = false; setTimeout(app.enter); }
      return {
        dom,
        stopEvent: () => true, // the board owns every event inside it (keys, drag, clicks)
        ignoreMutation: () => true,
        update: (n) => {
          if (n.type.name !== 'kanban') return false;
          app.set(n.attrs.columns);
          return true;
        },
        destroy: () => { void unmount(app); },
      };
    };
  },

  addKeyboardShortcuts() {
    // ↓ from the text above / ↑ from the text below step into the board; ⌫ at the start of the line after it deletes it
    const top = (editor: Editor) => {
      const s = editor.state.selection;
      return s instanceof TextSelection && s.empty && s.$from.depth >= 1 ? s.$from : null;
    };
    return {
      ArrowDown: ({ editor }) => {
        const $f = top(editor);
        if (!$f || !editor.view.endOfTextblock('down')) return false;
        const p = $f.after(1);
        if (editor.state.doc.nodeAt(p)?.type.name !== 'kanban') return false;
        enterBoard(editor, p);
        return true;
      },
      ArrowUp: ({ editor }) => {
        const $f = top(editor);
        if (!$f || !editor.view.endOfTextblock('up')) return false;
        const before = editor.state.doc.resolve($f.before(1)).nodeBefore;
        if (before?.type.name !== 'kanban') return false;
        enterBoard(editor, $f.before(1) - before.nodeSize);
        return true;
      },
      Backspace: ({ editor }) => {
        const $f = top(editor);
        if (!$f || $f.parentOffset !== 0 || $f.depth !== 1) return false;
        const before = editor.state.doc.resolve($f.before(1)).nodeBefore;
        if (before?.type.name !== 'kanban') return false;
        void deleteBoard(editor, $f.before(1) - before.nodeSize);
        return true;
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          // JSON lines never start with a backtick, so a plain fence can't be closed early by a card body
          state.write('```kanban');
          state.ensureNewLine();
          state.text(serializeBoard(node.attrs.columns), false);
          state.ensureNewLine();
          state.write('```');
          state.closeBlock(node);
        },
        parse: {
          updateDOM(root: HTMLElement) {
            for (const code of [...root.querySelectorAll('pre > code.language-kanban')]) {
              if (!parseBoard(code.textContent ?? '')) continue; // broken JSON stays a visible, editable code block
              const div = document.createElement('div');
              div.setAttribute('data-kanban', '');
              div.textContent = code.textContent ?? '';
              code.parentElement!.replaceWith(div);
            }
          },
        },
      },
    };
  },
});
