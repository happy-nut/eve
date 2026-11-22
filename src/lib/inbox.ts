import { notes, titleOf, type Note } from './notes.svelte';
import { findPassage, nearestLine } from './passage';
import { pictures, type Picture } from './pictures';

export interface Ask {
  ask: string;
  op: 'create' | 'append' | 'edit' | 'rewrite' | 'delete' | 'picture';
  id?: string;
  body?: string;
  page?: string;
  group?: string;
  parent?: string;
  text?: string;
  old?: string;
  new?: string;
  number?: number;
  most?: number;
}
export interface Answer { ok: boolean; text: string; pictures?: Picture[] }

const no = (text: string): Answer => ({ ok: false, text });
const live = (id = '') => notes.all.find((n) => n.id === id && !n.deleted);

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
    const n = notes.addImported(a.body ?? '', Date.now(), up?.id ?? pageAt(path));
    const where = up ? ` under "${titleOf(up)}"` : path.length ? ` under ${path.join(' / ')}` : '';
    return { ok: true, text: `Made "${titleOf(n)}"${where} in Eve (id ${n.id}).` };
  }
  if (a.op !== 'append' && a.op !== 'edit' && a.op !== 'rewrite' && a.op !== 'delete') return no(`Eve does not know "${a.op}": update Eve.`);
  const was = live(a.id);
  if (!was) return no(`No note with id "${a.id}" (deleted since it was found?).`);
  notes.flush(was.id);
  const n = live(a.id) as Note;
  const title = titleOf(n);
  if (a.op === 'delete') {
    notes.remove(n.id);
    return { ok: true, text: `Deleted "${title}" (it is in Eve's trash, where the user can bring it back).` };
  }
  let body: string;
  if (a.op === 'append') {
    const text = (a.text ?? '').replace(/^\n+|\n+$/g, '');
    if (!text) return no('Nothing to add.');
    body = `${n.body.replace(/\n+$/, '')}\n\n${text}\n`;
  } else if (a.op === 'rewrite') {
    if (!(a.body ?? '').trim()) return no('Nothing to write: to delete the note, use delete_note.');
    body = a.body as string;
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
  return { ok: true, text: a.op === 'append' ? `Added to "${title}".` : a.op === 'rewrite' ? `Rewrote "${titleOf(n)}".` : `Changed "${titleOf(n)}".` };
}

async function picture(a: Ask): Promise<Answer> {
  const n = live(a.id);
  if (!n) return no(`No note with id "${a.id}" (deleted since it was found?).`);
  notes.flush(n.id);
  const got = await pictures((live(a.id) as Note).body, a.number, a.most);
  if (!got.length) return no(`"${titleOf(n)}" has no diagram${a.number ? ` ${a.number}` : 's'}.`);
  return { ok: true, text: '', pictures: got };
}

export async function applyAll(texts: string[], answer: (ask: string, a: Answer) => void) {
  for (const t of texts) {
    let a: Ask;
    try { a = JSON.parse(t); } catch { continue; }
    let out: Answer;
    try { out = a.op === 'picture' ? await picture(a) : apply(a); } catch (e) { out = no(`Eve could not do it: ${e}`); }
    answer(a.ask, out);
  }
}
