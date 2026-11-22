import { Node, type Editor } from '@tiptap/core';
import { Selection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { ui } from './ui.svelte';
import { mount, unmount } from 'svelte';
import Board from '../Kanban.svelte';
import { focusBack } from './code';
import { defaultBoard, parseBoard, parseTemplate, serializeBoard, type CardTemplate, type Column } from './board';

let enterNext = false;
export const insertKanban = (editor: { chain: () => any }) => {
  enterNext = true;
  editor.chain().focus().insertContent([{ type: 'kanban', attrs: { columns: defaultBoard() } }, { type: 'paragraph' }]).run();
};

export async function deleteBoard(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== 'kanban') return;
  const n = (node.attrs.columns as Column[]).reduce((s, c) => s + c.cards.length, 0);
  if (n && !(await ui.ask(`Delete the board and its ${n} card${n > 1 ? 's' : ''}?`))) return;
  editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).focus().run();
}

const joinUndoStep = (tr: Transaction, group: string) => tr.setMeta('composition', group);

export function commitBoard(editor: Editor, pos: number, columns: Column[], group?: string) {
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...editor.state.doc.nodeAt(pos)!.attrs, columns });
  if (group) joinUndoStep(tr, group);
  editor.view.dispatch(tr);
}

const enterBoard = (editor: Editor, pos: number) => (editor.view.nodeDOM(pos) as any)?.__enter?.();

export const Kanban = Node.create({
  name: 'kanban',
  group: 'block',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      columns: { default: [] as Column[], parseHTML: (el) => parseBoard(el.textContent ?? '') ?? [], rendered: false },
      template: { default: null as CardTemplate | null, parseHTML: (el) => parseTemplate(el.textContent ?? ''), rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-kanban]' }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-kanban': '' }, serializeBoard(node.attrs.columns, node.attrs.template)];
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
          commit: (columns: Column[], group?: string) => commitBoard(editor, pos(), columns, group),
          template: (): CardTemplate | null => editor.state.doc.nodeAt(pos())?.attrs.template ?? null,
          saveTemplate: (template: CardTemplate) => editor.view.dispatch(editor.state.tr.setNodeMarkup(pos(), undefined, { ...editor.state.doc.nodeAt(pos())!.attrs, template })),
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
      if (enterNext) { enterNext = false; setTimeout(() => app.enter(true)); }
      return {
        dom,
        stopEvent: () => true,
        ignoreMutation: () => true,
        update: (n) => {
          if (n.type.name !== 'kanban') return false;
          app.set(n.attrs.columns);
          return true;
        },
        destroy: () => { const had = dom.contains(document.activeElement); void unmount(app); if (had) focusBack(editor); },
      };
    };
  },

  addKeyboardShortcuts() {
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
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write('```kanban');
          state.ensureNewLine();
          state.text(serializeBoard(node.attrs.columns, node.attrs.template), false);
          state.ensureNewLine();
          state.write('```');
          state.closeBlock(node);
        },
        parse: {
          updateDOM(root: HTMLElement) {
            for (const code of [...root.querySelectorAll('pre > code.language-kanban')]) {
              if (!parseBoard(code.textContent ?? '')) continue;
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
