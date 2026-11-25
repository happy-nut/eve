// WebKit's input method keeps the syllable it is putting together (한 from ㅎ, ㅏ, ㄴ) by its place in the page: anything
// else drawn in the note while it does (a label's words, a span around a letter, a node at the caret) split the syllable
// into jamo, lost it or put it in front. ProseMirror keeps its own text still for it; what the app draws itself goes
// through here: a node view's drawing (whenComposed) and the decorations (heldWhileComposing) wait until the input
// method has the syllable in. A line's attributes alone may follow each key (lineAttributes).
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';
import { Decoration, DecorationSet, type DecorationAttrs, type DecorationSource, type EditorView } from '@tiptap/pm/view';

type Draw = () => void;
/** `since`: the changes made since the note began holding its drawing, null when it holds nothing */
interface Gate { readonly editor: object; readonly since: Mapping | null }

const GATE = new PluginKey<Gate>('ime');
const LET_GO = 'let go';
// prosemirror-view reads the word in at compositionend and ends its composition 20 ms later (endComposition): drawn
// before that, WebKit lost letters of the line the word went into
const AFTER_COMPOSITION_MS = 60;

const waiting = new WeakMap<EditorView, Set<Draw>>();
const timers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();

const holding = (view: EditorView) => view.composing || !!GATE.getState(view.state)?.since;

/** What a node view draws of its node outside the note's text: now, or once the input method has the syllable in. */
export function whenComposed(view: EditorView, draw: Draw): void {
  if (!GATE.getState(view.state) || !holding(view)) { draw(); return; }
  const queued = waiting.get(view) ?? new Set<Draw>();
  waiting.set(view, queued.add(draw));
}

/** A plugin's decorations, drawn anew at each change, but held where they were while a syllable is put together. */
export function heldWhileComposing(decorate: (state: EditorState) => DecorationSource | null | undefined) {
  const drawn = new WeakMap<object, DecorationSource | null>();
  return (state: EditorState): DecorationSource | null => {
    const gate = GATE.getState(state);
    if (gate?.since) {
      const was = drawn.get(gate.editor);
      return was === undefined ? decorate(state) ?? null : was?.map(gate.since, state.doc) ?? null;
    }
    const now = decorate(state) ?? null;
    if (gate) drawn.set(gate.editor, now);
    return now;
  };
}

/** Attributes of one block that follow every key, a syllable half typed or not (an empty line's hint goes at its first
 *  jamo): an attribute of the line is all this can draw, and the input method keeps its syllable through that. */
export function lineAttributes(of: (state: EditorState) => { from: number; to: number; attrs: DecorationAttrs } | null) {
  return (state: EditorState): DecorationSet | null => {
    const line = of(state);
    return line ? DecorationSet.create(state.doc, [Decoration.node(line.from, line.to, line.attrs)]) : null;
  };
}

type DomObserver = { flush?(): void; forceFlush?(): void };
export const domObserverOf = (view: EditorView) => (view as unknown as { domObserver?: DomObserver }).domObserver;

function letGo(view: EditorView) {
  timers.delete(view);
  if (view.isDestroyed || view.composing) return;
  domObserverOf(view)?.forceFlush?.();
  const draws = waiting.get(view);
  waiting.delete(view);
  draws?.forEach((draw) => draw());
  if (GATE.getState(view.state)?.since) view.dispatch(view.state.tr.setMeta(GATE, LET_GO));
}

function letGoSoon(view: EditorView) {
  clearTimeout(timers.get(view));
  timers.set(view, setTimeout(() => letGo(view), AFTER_COMPOSITION_MS));
}

export const ImeGate = Extension.create({
  name: 'imeGate',
  addProseMirrorPlugins() {
    let view: EditorView | null = null;
    return [new Plugin<Gate>({
      key: GATE,
      state: {
        init: () => ({ editor: {}, since: null }),
        apply: (tr, gate) => {
          if (tr.getMeta(GATE) === LET_GO) return { editor: gate.editor, since: null };
          if (gate.since ? !tr.docChanged : !view?.composing) return gate;
          return { editor: gate.editor, since: new Mapping([...(gate.since?.maps ?? []), ...tr.mapping.maps]) };
        },
      },
      view: (v) => {
        view = v;
        return {
          update: (v) => { if (!v.composing && holding(v)) letGoSoon(v); },
          destroy: () => { clearTimeout(timers.get(v)); waiting.delete(v); },
        };
      },
      props: { handleDOMEvents: { compositionend: (v) => { letGoSoon(v); return false; } } },
    })];
  },
});
