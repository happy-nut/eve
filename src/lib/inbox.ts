/**
 * Changes Claude makes through the MCP server (`eve mcp`: create_note, append_note, edit_note). Each comes as a
 * file in the app's inbox (src-tauri/src/core.rs ask_app), taken once (files.rs take_inbox), and is done here
 * through the notes store as if it were typed: the store stays the only writer, the change is saved and synced as
 * any edit, and a note the user has open shows it at once (Editor.svelte's takeBody, the caret kept by its text).
 * The answer goes back to the server waiting on it.
 */
import { notes, titleOf, type Note } from './notes.svelte';
import { depthOf, MAX_DEPTH } from './groups.svelte';

export interface Ask {
  ask: string;
  op: 'create' | 'append' | 'edit';
  id?: string;
  body?: string;
  group?: string;
  parent?: string;
  text?: string;
  old?: string;
  new?: string;
}
export interface Answer { ok: boolean; text: string }

const no = (text: string): Answer => ({ ok: false, text });
const live = (id = '') => notes.all.find((n) => n.id === id && !n.deleted);

export function apply(a: Ask): Answer {
  if (a.op === 'create') {
    const up = a.parent ? live(a.parent) : undefined;
    if (a.parent && !up) return no('The parent note is not there any more (deleted since it was found).');
    // a sub-page sits in its page's folder, as a database row does
    const group = up ? up.group : (a.group ?? '');
    if (depthOf(group) > MAX_DEPTH) return no(`Folders go ${MAX_DEPTH} deep at most; "${group}" is deeper.`);
    // made as an import is: the note the user has open stays open
    const n = notes.addImported(a.body ?? '', group, Date.now(), up?.id);
    const where = up ? ` under "${titleOf(up)}"` : group ? ` in ${group}` : '';
    return { ok: true, text: `Made "${titleOf(n)}"${where} in Eve (id ${n.id}).` };
  }
  if (a.op !== 'append' && a.op !== 'edit') return no(`Eve does not know "${a.op}": update Eve.`);
  const was = live(a.id);
  if (!was) return no(`No note with id "${a.id}" (deleted since it was found?).`);
  notes.flush(was.id); // the open editor's last keys first: the change is made to what the user sees
  const n = live(a.id) as Note;
  const title = titleOf(n);
  let body: string;
  if (a.op === 'append') {
    const text = (a.text ?? '').replace(/^\n+|\n+$/g, '');
    if (!text) return no('Nothing to add.');
    body = `${n.body.replace(/\n+$/, '')}\n\n${text}\n`;
  } else {
    const old = a.old ?? '';
    const at = old ? n.body.indexOf(old) : -1;
    if (at < 0) return no(`That passage is not in "${title}" as written. Read the note again (read_note) and copy it exactly.`);
    if (n.body.indexOf(old, at + 1) >= 0) return no(`That passage is in "${title}" more than once: give more of the text around it.`);
    body = n.body.slice(0, at) + (a.new ?? '') + n.body.slice(at + old.length);
  }
  notes.update(n.id, body);
  notes.flush(n.id);
  return { ok: true, text: a.op === 'append' ? `Added to "${title}".` : `Changed "${titleOf(n)}".` };
}

/** Each change, done in the order asked; one that throws is answered, the rest still done. */
export function applyAll(texts: string[], answer: (ask: string, a: Answer) => void) {
  for (const t of texts) {
    let a: Ask;
    try { a = JSON.parse(t); } catch { continue; } // no ask to answer: the server gives up on its own
    let out: Answer;
    try { out = apply(a); } catch (e) { out = no(`Eve could not do it: ${e}`); }
    answer(a.ask, out);
  }
}
