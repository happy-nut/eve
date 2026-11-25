import { Node } from '@tiptap/core';
import { mount, unmount } from 'svelte';
import Database from '../Database.svelte';
import { notes } from './notes.svelte';
import { focusBack } from './code';
import { defaultDb, parseDb, serializeDb, type DbSchema } from './database';
import { whenComposed } from './ime';

export const insertDatabase = (editor: { chain: () => any }) =>
  editor.chain().focus().insertContent([{ type: 'database', attrs: { schema: defaultDb() } }, { type: 'paragraph' }]).run();

export const DatabaseBlock = Node.create({
  name: 'database',
  group: 'block',
  atom: true,
  selectable: false,

  addOptions() {
    return { hostNoteId: (): string | null => notes.currentId };
  },

  addAttributes() {
    return { schema: { default: defaultDb(), parseHTML: (el) => parseDb(el.textContent ?? '') ?? defaultDb(), rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-database]' }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-database': '' }, serializeDb(node.attrs.schema)];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'database';
      dom.contentEditable = 'false';
      const pos = () => getPos() as number;
      const app = mount(Database, {
        target: dom,
        props: {
          schema: node.attrs.schema,
          commit: (schema: DbSchema) => editor.view.dispatch(editor.state.tr.setNodeMarkup(pos(), undefined, { ...editor.state.doc.nodeAt(pos())!.attrs, schema })),
          page: () => this.options.hostNoteId(),
        },
      });
      let drawn = node;
      const draw = () => app.set(drawn.attrs.schema);
      return {
        dom,
        stopEvent: () => true,
        ignoreMutation: () => true,
        update: (n) => {
          if (n.type.name !== 'database') return false;
          drawn = n;
          whenComposed(editor.view, draw);
          return true;
        },
        destroy: () => { const had = dom.contains(document.activeElement); void unmount(app); if (had) focusBack(editor); },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write('```database');
          state.ensureNewLine();
          state.text(serializeDb(node.attrs.schema), false);
          state.ensureNewLine();
          state.write('```');
          state.closeBlock(node);
        },
        parse: {
          updateDOM(root: HTMLElement) {
            for (const code of [...root.querySelectorAll('pre > code.language-database')]) {
              if (!parseDb(code.textContent ?? '')) continue;
              const div = document.createElement('div');
              div.setAttribute('data-database', '');
              div.textContent = code.textContent ?? '';
              code.parentElement!.replaceWith(div);
            }
          },
        },
      },
    };
  },
});
