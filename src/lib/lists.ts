import { Extension, InputRule, wrappingInputRule, type Editor } from '@tiptap/core';
import { OrderedList } from '@tiptap/extension-list';
import TaskItem from '@tiptap/extension-task-item';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
import type { Node as PMNode } from '@tiptap/pm/model';
import { suggestionVisible } from './slash';
import { indentLines, switchItem, joinNextItem, joinListBelow, itemAbove, liftCounting } from './blocks';

export const LIST_ITEM_CONTENT = '(paragraph|image) block*';
export const NUMBERED = /^(\d+|a|i)\.[^\S\n]$/;

function twoBlocks(item: PMNode): boolean {
  let n = 0;
  item.forEach((c, _o, i) => { if (!/List$/.test(c.type.name) && !(i === 0 && item.attrs.lead && !c.content.size)) n++; });
  return n > 1;
}
export function readsLoose(list: PMNode): boolean {
  let two = false;
  list.forEach((item) => { if (twoBlocks(item)) two = true; });
  list.descendants((d) => {
    if (two) return false;
    if (/List$/.test(d.type.name) && !d.attrs.tight) two = true;
    if (/Item$/.test(d.type.name) && twoBlocks(d)) two = true;
  });
  return two;
}

export function looseLists(editor: Editor) {
  const serializer = (editor.storage as any).markdown.serializer;
  const nodesOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(serializer), 'nodes')?.get;
  if (!nodesOf) return;
  Object.defineProperty(serializer, 'nodes', {
    configurable: true,
    get() {
      const nodes = nodesOf.call(serializer);
      for (const name of ['bulletList', 'orderedList', 'taskList']) {
        const write = nodes[name];
        if (!write) continue;
        nodes[name] = (state: any, node: PMNode, parent: PMNode, index: number) =>
          write(state, node.attrs.tight && readsLoose(node) ? node.type.create({ ...node.attrs, tight: false }, node.content, node.marks) : node, parent, index);
      }
      return nodes;
    },
  });
}

export const NumberedList = OrderedList.extend({
  // written as tiptap-markdown does (")" for every other of two numbered lists in a row, so they stay two), but a
  // list inside an item from 1: markdown reads one numbered from 5 right under the item's line as more of that
  // line (a note from elsewhere may hold one, separated by a blank line, which a tight list does not keep)
  addStorage: () => ({
    markdown: {
      serialize(state: any, node: PMNode, parent: PMNode, index: number) {
        const nested = /Item$/.test((parent as any)?.type?.name ?? '');
        const start = nested ? 1 : node.attrs.start || 1;
        const width = String(start + node.childCount - 1).length;
        let run = 0;
        while (index - run > 0 && parent.child(index - run - 1).type.name === node.type.name) run++;
        const sep = run % 2 ? ') ' : '. ';
        state.renderList(node, state.repeat(' ', width + 2), (i: number) => {
          const n = String(start + i);
          return state.repeat(' ', width - n.length) + n + sep;
        });
      },
      parse: {},
    },
  }),
  addInputRules() {
    return [wrappingInputRule({ find: NUMBERED, type: this.type, getAttributes: (m) => ({ start: +m[1] || 1 }), joinPredicate: (_m, node) => !node.attrs.type || node.attrs.type === '1' })];
  },
});

export const ListSwitch = Extension.create({
  name: 'listSwitch',
  priority: 102,
  addInputRules() {
    const n = this.editor.schema.nodes;
    const rule = (find: RegExp, list: string, item: string, attrs?: (m: RegExpMatchArray) => Record<string, unknown>, itemAttrs?: (m: RegExpMatchArray) => Record<string, unknown>) =>
      new InputRule({ find, handler: ({ state, range, match }) => (switchItem(state.tr, range.from, range.to, n[list], n[item], attrs?.(match), itemAttrs?.(match)) ? undefined : null) });
    return [
      rule(/^\s*[-+*][^\S\n]$/, 'bulletList', 'listItem'),
      rule(/^\s*\[( |x)?\][^\S\n]$/, 'taskList', 'taskItem', undefined, (m) => ({ checked: m[1] === 'x' })),
      rule(NUMBERED, 'orderedList', 'listItem', (m) => ({ start: +m[1] || 1 })),
    ];
  },
});

export const JoinNextItem = Extension.create({
  name: 'joinNextItem',
  priority: 102,
  addKeyboardShortcuts() {
    return { Delete: () => this.editor.commands.command(joinNextItem) || this.editor.commands.command(joinListBelow) };
  },
});

export const LineIndent = Extension.create({
  name: 'lineIndent',
  priority: 101,
  addKeyboardShortcuts() {
    const run = (dir: 1 | -1) => () => !suggestionVisible(this.editor) && this.editor.commands.command(indentLines(dir));
    const stepOut = () => {
      const doc = this.editor.state.doc;
      return run(-1)() && this.editor.state.doc !== doc;
    };
    return {
      Tab: run(1),
      'Shift-Tab': run(-1),
      Backspace: () => {
        if (this.editor.commands.command(liftCounting(false))) return true;
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parentOffset !== 0 || !$from.parent.isTextblock || $from.depth < 4 || $from.index(-1) !== 0) return false;
        if (!/Item$/.test($from.node(-1).type.name) || !/Item$/.test($from.node(-3).type.name)) return false;
        const item = $from.node(-1);
        if (!$from.parent.content.size && item.childCount === 1) {
          const { state, view } = this.editor;
          const list = $from.node(-2);
          const from = list.childCount === 1 ? $from.before(-2) : $from.before(-1);
          const to = list.childCount === 1 ? $from.after(-2) : $from.after(-1);
          const tr = state.tr.delete(from, to);
          view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(from), -1)).scrollIntoView());
          return true;
        }
        return stepOut();
      },
      Enter: () => {
        const c = this.editor.commands;
        if (c.command(itemAbove) || c.command(liftCounting(true))) return true;
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parent.content.size || $from.depth < 4 || $from.index(-1) !== 0) return false;
        const item = $from.node(-1), owner = $from.node(-3);
        if (!/Item$/.test(item.type.name) || !/Item$/.test(owner.type.name)) return false;
        const last = $from.index(-2) === $from.node(-2).childCount - 1;
        if (last && owner.type === item.type && $from.node(-2).type === $from.node(-4).type) return false;
        return stepOut();
      },
    };
  },
});

export const JoinLists = Extension.create({
  name: 'joinLists',
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(trs, _old, state) {
        if (!trs.some((t) => t.docChanged)) return null;
        const at: number[] = [];
        const scan = (node: PMNode, start: number) => {
          let prev: PMNode | null = null;
          node.forEach((child, offset) => {
            const same = prev?.type === child.type && /List$/.test(child.type.name);
            if (same && prev!.attrs.type === child.attrs.type) at.push(start + offset);
            prev = child;
            scan(child, start + offset + 1);
          });
        };
        scan(state.doc, 0);
        const restart: number[] = [], loose: number[] = [];
        state.doc.descendants((node, pos, parent) => {
          if (node.type.name === 'orderedList' && (node.attrs.start ?? 1) !== 1 && parent && /Item$/.test(parent.type.name)) restart.push(pos);
          if (/List$/.test(node.type.name) && node.attrs.tight && readsLoose(node)) loose.push(pos);
        });
        if (!at.length && !restart.length && !loose.length) return null;
        const tr = state.tr;
        for (const p of restart) tr.setNodeAttribute(p, 'start', 1);
        for (const p of loose) tr.setNodeAttribute(p, 'tight', false);
        for (const p of at.reverse()) if (canJoin(tr.doc, p)) tr.join(p);
        return tr;
      },
    })];
  },
});

export const ListMarkdown = Extension.create({
  name: 'listMarkdown',
  addStorage: () => ({
    markdown: {
      // An empty task item serializes to "- [ ] "; markdown-it drops that trailing space, and
      // markdown-it-task-lists only recognises "[ ] " *followed by* content, so a note with an empty
      // checkbox came back as a bullet with the literal text "[ ]". Put the space back first.
      parse: {
        setup(md: any) {
          md.core.ruler.before('inline', 'eve-empty-task-item', (state: any) => {
            const t = state.tokens;
            for (let i = 2; i < t.length; i++) {
              if (t[i].type === 'inline' && t[i - 2].type === 'list_item_open' && /^\[[ xX]\]$/.test(t[i].content)) t[i].content += ' ';
            }
          });
          // A run of to-dos and a run of bullets one after the other are one list to markdown, and the blank
          // line the two lists are written with makes that one list loose: each run came back loose (spaced
          // out) and was written so, the note changing on the first read. A run with no blank line inside it
          // is tight again; the runs are split apart later (updateDOM).
          md.core.ruler.after('block', 'eve-tight-runs', (state: any) => {
            const t = state.tokens, lines: string[] = state.src.split('\n');
            const blank = (n: number) => n >= 0 && n < lines.length && !lines[n].replace(/^\s*(>\s?)*/, '').trim();
            for (let i = 0; i < t.length; i++) {
              if (t[i].type !== 'bullet_list_open') continue;
              const level = t[i].level;
              const items: { open: number; task: boolean }[] = [];
              let end = i + 1;
              for (; end < t.length && !(t[end].type === 'bullet_list_close' && t[end].level === level); end++) {
                if (t[end].type !== 'list_item_open' || t[end].level !== level + 1) continue;
                const first = t[end + 2];
                items.push({ open: end, task: first?.type === 'inline' && /^\[[ xX]\](\s|$)/.test(first.content) });
              }
              if (!items.some((x) => x.task) || items.every((x) => x.task)) continue;
              for (let a = 0; a < items.length; ) {
                let b = a;
                while (b + 1 < items.length && items[b + 1].task === items[a].task) b++;
                let tight = true;
                for (let k = a; k <= b && tight; k++) {
                  const [from, to] = t[items[k].open].map ?? [0, 0];
                  for (let n = from; n < (k < b ? t[items[k + 1].open].map[0] : to) - (k < b ? 0 : 1); n++) if (blank(n)) { tight = false; break; }
                }
                const stop = b + 1 < items.length ? items[b + 1].open : end;
                for (let k = a; k <= b && tight; k++) {
                  const to = k < b ? items[k + 1].open : stop;
                  let paras = 0;
                  for (let m = items[k].open; m < to; m++) if (t[m].type === 'paragraph_open' && t[m].level === level + 2) paras++;
                  if (paras > 1) tight = false;
                }
                if (tight) {
                  for (let k = items[a].open; k < stop; k++) {
                    if ((t[k].type === 'paragraph_open' || t[k].type === 'paragraph_close') && t[k].level === level + 2) t[k].hidden = true;
                  }
                }
                a = b + 1;
              }
            }
          });
        },
        // markdown-it wraps a loose list item's content in a <p>; ProseMirror then splits that paragraph
        // around the block image, leaving the item with an empty first line above the picture. Unwrap an
        // item that is nothing but an image (the checkbox moves up: the task-item hook reads it there).
        updateDOM(element: HTMLElement) {
          // Markdown writes a to-do and a bullet with the same "-", so one written after the other is a single
          // list, which tiptap-markdown makes a to-do list whole: the bullets in it did not fit and came back
          // as an empty to-do above them. Each run of to-dos or of plain items becomes a list of its own.
          for (const ul of [...element.querySelectorAll<HTMLElement>('ul.contains-task-list')].reverse()) {
            const items = [...ul.children];
            if (items.every((li) => li.classList.contains('task-list-item'))) continue;
            const runs: HTMLElement[] = [];
            let task: boolean | null = null;
            for (const li of items) {
              const isTask = li.classList.contains('task-list-item');
              if (isTask !== task) {
                const run = document.createElement('ul');
                if (isTask) { run.className = 'contains-task-list'; run.dataset.type = 'taskList'; }
                runs.push(run);
                task = isTask;
              }
              runs.at(-1)!.append(li);
            }
            ul.replaceWith(...runs);
          }
          for (const p of element.querySelectorAll('li > p')) {
            const kids = [...p.children];
            const img = kids.find((c) => c.tagName === 'IMG');
            if (!img || p.textContent!.trim() || kids.some((c) => c !== img && c.tagName !== 'INPUT')) continue;
            const box = kids.find((c) => c.tagName === 'INPUT');
            if (box) p.before(box);
            p.replaceWith(img);
          }
        },
      },
    },
  }),
  addGlobalAttributes: () => [{
    types: ['taskList'],
    attributes: {
      tight: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-tight') === 'true' || !el.querySelector('p'),
        renderHTML: (a: Record<string, unknown>) => ({ 'data-tight': a.tight ? 'true' : null }),
      },
    },
  }],
});

export const ToDoItem = TaskItem.extend({
  content: LIST_ITEM_CONTENT,
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*(\[([( |x])?\])[^\S\n]$/, type: this.type, getAttributes: (m) => ({ checked: m[m.length - 1] === 'x' }) })];
  },
  parseHTML() {
    const content = (el: HTMLElement) => (el.querySelector(':scope > label') && el.querySelector<HTMLElement>(':scope > div')) || el;
    return [{ tag: `li[data-type="${this.name}"]`, priority: 51, contentElement: content }];
  },
  // the box and its hidden label are the view's own: tiptap rewrites the label on every update and WebKit
  // touches the box's style after a drag, and ProseMirror read either back as an edit of the item, so a
  // drag selection starting in a to-do collapsed on mouseup. Only the item's own text counts.
  addNodeView() {
    const stock = this.parent?.();
    if (!stock) return null;
    return (props) => {
      const view = stock(props) as any;
      return { ...view, ignoreMutation: (m: { type: string; target: Node }) => m.type !== 'selection' && !view.contentDOM?.contains(m.target) };
    };
  },
  // the box's hidden label says "To-do", not the item's words: tiptap wrote the words into it, on the page just
  // before them, at every key, and the Mac's Korean input lost the letter it was building there — the first
  // syllable typed in a new to-do came out in pieces (사과 as ㅅㅏ과)
}).configure({ nested: true, a11y: { checkboxLabel: () => 'To-do' } });
