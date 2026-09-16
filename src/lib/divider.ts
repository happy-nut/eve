import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { nodeInputRule } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, Selection } from '@tiptap/pm/state';

/**
 * The `---` divider, with two things the stock one does not do:
 *
 * - it stays out of lists, where "- - -" is how someone writes three empty bullets;
 * - the caret can land on it. → from the line above selects the divider, → again carries on into the
 *   line below, and ← walks back the same way, so a divider can be reached (and deleted) without a
 *   mouse. Stock ProseMirror steps straight over it, since a divider holds no text position.
 */
const IN_A_LIST = /(^|_)(listItem|taskItem)$/;

/** true while the caret sits inside a bullet / numbered / to-do item */
const inList = ($from: any) => {
  for (let d = $from.depth; d > 0; d--) if (IN_A_LIST.test($from.node(d).type.name)) return true;
  return false;
};

type Dir = 1 | -1;
type Probe = 'forward' | 'backward' | 'up' | 'down';

/** Arrow keys around a divider: onto it, then off it. `probe` is how the caret's edge is measured. */
const stepOver = (dir: Dir, probe: Probe) =>
  ({ editor }: { editor: any }): boolean =>
    editor.commands.command(({ state, dispatch }: { state: any; dispatch?: (tr: any) => void }) => {
      const sel = state.selection;
      if (sel instanceof NodeSelection && sel.node.type.name === 'horizontalRule') {
        const next = Selection.near(state.doc.resolve(dir > 0 ? sel.to : sel.from), dir);
        if (dispatch) dispatch(state.tr.setSelection(next).scrollIntoView());
        return true;
      }
      const { $from, empty } = sel;
      // endOfTextblock asks the browser where the caret really is, so this works on a wrapped line too
      if (!empty || !$from.parent.isTextblock || $from.depth === 0 || !editor.view.endOfTextblock(probe)) return false;
      const at = dir > 0 ? $from.after() : $from.before();
      const node = dir > 0 ? state.doc.nodeAt(at) : state.doc.resolve(at).nodeBefore;
      if (node?.type.name !== 'horizontalRule') return false;
      const pos = dir > 0 ? at : at - node.nodeSize;
      if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView());
      return true;
    });

export const Divider = HorizontalRule.extend({
  addInputRules() {
    return [
      nodeInputRule({
        find: /^(?:---|—-|___\s|\*\*\*\s)$/,
        type: this.type,
        // a list is made of dashes already; "- - -" there is three empty bullets, not a divider
        getAttributes: () => ({}),
      }),
    ].map((rule) => {
      const run = rule.handler.bind(rule);
      rule.handler = (props: any) => (inList(props.state.selection.$from) ? null : run(props));
      return rule;
    });
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      ArrowRight: stepOver(1, 'forward'),
      ArrowLeft: stepOver(-1, 'backward'),
      ArrowDown: stepOver(1, 'down'),
      ArrowUp: stepOver(-1, 'up'),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dividerClick'),
        props: {
          // clicking the line itself picks it up — the same selection the arrow keys leave behind
          handleClickOn(view, _pos, node, nodePos, event) {
            if (node.type.name !== 'horizontalRule') return false;
            event.preventDefault();
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
            return true;
          },
        },
      }),
    ];
  },
});
