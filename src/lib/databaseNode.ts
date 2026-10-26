import { Node } from '@tiptap/core';
import { mount, unmount } from 'svelte';
import Database from '../Database.svelte';
import { notes } from './notes.svelte';
import { focusBack } from './code';
import { defaultDb, parseDb, serializeDb, type DbSchema } from './database';

/**
 * The database block: an atom whose whole state is one attribute (what the table is), the table itself
 * Database.svelte mounted in the node view, as a board is (kanban.ts). File form is a ```database fence of JSON; one
 * that does not parse stays a code block, nothing lost. Its rows are the pages under the note it is in.
 */
export const insertDatabase = (editor: { chain: () => any }) =>
  editor.chain().focus().insertContent([{ type: 'database', attrs: { schema: defaultDb() } }, { type: 'paragraph' }]).run();

export const DatabaseBlock = Node.create({
  name: 'database',
  group: 'block',
  atom: true,
  selectable: false,

  // the note the editor is (createEditor says): a day's page or a card floats over another note, the one open
  addOptions() {
    return { page: (): string | null => notes.currentId };
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
          // the note it is in: a day's page's own, not the calendar's (every day's database showed the same rows, written
          // under the calendar)
          page: () => this.options.page(),
        },
      });
      return {
        dom,
        stopEvent: () => true, // the table owns its keys, clicks and drags
        ignoreMutation: () => true,
        update: (n) => {
          if (n.type.name !== 'database') return false;
          app.set(n.attrs.schema);
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
