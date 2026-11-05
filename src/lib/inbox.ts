/**
 * Changes Claude makes through the MCP server (`eve mcp`: create_note, append_note, edit_note, delete_note), and its asks
 * for a note's diagrams as pictures (diagram_images: pictures.ts, which only the app can draw). Each comes as a
 * file in the app's inbox (src-tauri/src/core.rs ask_app), taken once (files.rs take_inbox), and is done here
 * through the notes store as if it were typed: the store stays the only writer, the change is saved and synced as
 * any edit, and a note the user has open shows it at once (Editor.svelte's takeBody, the caret kept by its text).
 * The answer goes back to the server waiting on it.
 */
import { notes, titleOf, type Note } from './notes.svelte';
import { findPassage, nearestLine } from './passage';
import { pictures, type Picture } from './pictures';

export interface Ask {
  ask: string;
  op: 'create' | 'append' | 'edit' | 'delete' | 'picture';
  id?: string;
  body?: string;
  /** a page path to put it under ("Work/Projects"), each page found by its title or made (an older server calls it a group) */
  page?: string;
  group?: string;
  parent?: string;
  text?: string;
  old?: string;
  new?: string;
  /** a picture: which diagram (1 is the first), or the first `most` */
  number?: number;
  most?: number;
}
export interface Answer { ok: boolean; text: string; pictures?: Picture[] }

const no = (text: string): Answer => ({ ok: false, text });
const live = (id = '') => notes.all.find((n) => n.id === id && !n.deleted);

/** the page at the end of a path of titles, from the top: each found among the pages under the one before, or made */
function pageAt(path: string[]): string | undefined {
  let up: string | undefined;
  for (const t of path) {
    const found = notes.visible.find((n) => (n.parent ?? undefined) === up && titleOf(n).toLowerCase() === t.toLowerCase());
    up = (found ?? notes.addImported(`# ${t}\n`, Date.now(), up)).id;
  }
  return up;
}

export function apply(a: Ask): Answer {
  if (a.op === 'create') {
    const up = a.parent ? live(a.parent) : undefined;
    if (a.parent && !up) return no('The parent note is not there any more (deleted since it was found).');
    const path = (a.page || a.group || '').split('/').map((t) => t.trim()).filter(Boolean);
    // made as an import is: the note the user has open stays open
    const n = notes.addImported(a.body ?? '', Date.now(), up?.id ?? pageAt(path));
    const where = up ? ` under "${titleOf(up)}"` : path.length ? ` under ${path.join(' / ')}` : '';
    return { ok: true, text: `Made "${titleOf(n)}"${where} in Eve (id ${n.id}).` };
  }
  if (a.op !== 'append' && a.op !== 'edit' && a.op !== 'delete') return no(`Eve does not know "${a.op}": update Eve.`);
  const was = live(a.id);
  if (!was) return no(`No note with id "${a.id}" (deleted since it was found?).`);
  notes.flush(was.id); // the open editor's last keys first: the change is made to what the user sees
  const n = live(a.id) as Note;
  const title = titleOf(n);
  // deleted as the user deletes one: to the trash, the toast's Undo and the trash bringing it back
  if (a.op === 'delete') {
    notes.remove(n.id);
    return { ok: true, text: `Deleted "${title}" (it is in Eve's trash, where the user can bring it back).` };
  }
  let body: string;
  if (a.op === 'append') {
    const text = (a.text ?? '').replace(/^\n+|\n+$/g, '');
    if (!text) return no('Nothing to add.');
    body = `${n.body.replace(/\n+$/, '')}\n\n${text}\n`;
  } else {
    const old = a.old ?? '';
    const found = findPassage(n.body, old);
    if (found === 'many') return no(`That passage is in "${title}" more than once: give more of the text around it.`);
    if (found === 'none') {
      const near = nearestLine(n.body, old);
      return no(`That passage is not in "${title}".${near ? ` The nearest line in it is:\n${near}\n` : ' '}Read the note again (read_note) and copy the passage from it.`);
    }
    body = n.body.slice(0, found.at) + (a.new ?? '') + n.body.slice(found.end);
  }
  notes.update(n.id, body);
  notes.flush(n.id);
  return { ok: true, text: a.op === 'append' ? `Added to "${title}".` : `Changed "${titleOf(n)}".` };
}

/** A note's diagrams drawn, for Claude to see: nothing in the notes changes */
async function picture(a: Ask): Promise<Answer> {
  const n = live(a.id);
  if (!n) return no(`No note with id "${a.id}" (deleted since it was found?).`);
  notes.flush(n.id); // drawn as it is on the screen, the last keys in
  const got = await pictures((live(a.id) as Note).body, a.number, a.most);
  if (!got.length) return no(`"${titleOf(n)}" has no diagram${a.number ? ` ${a.number}` : 's'}.`);
  return { ok: true, text: '', pictures: got };
}

/** Each ask, done in the order asked; one that throws is answered, the rest still done. */
export async function applyAll(texts: string[], answer: (ask: string, a: Answer) => void) {
  for (const t of texts) {
    let a: Ask;
    try { a = JSON.parse(t); } catch { continue; } // no ask to answer: the server gives up on its own
    let out: Answer;
    try { out = a.op === 'picture' ? await picture(a) : apply(a); } catch (e) { out = no(`Eve could not do it: ${e}`); }
    answer(a.ask, out);
  }
}
