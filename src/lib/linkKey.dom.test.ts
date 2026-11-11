// ⌘K on chosen words, as in Notion: the box finds notes as it is typed into, and ↩ links the words to the one found
// (a [[link]] that reads as the words); an address typed or pasted links them to it. It asked only for a URL, with
// "https://" already in it, so linking words to another note meant typing [[ and the title all over again.
import { test, expect, afterEach } from 'vitest';
import { editorWith, md, posOf } from './testEditor';
import { editorCommands } from './editor';
import { notes } from './notes.svelte';
import { ui } from './ui.svelte';

afterEach(() => { if (ui.pending) ui.done(null); document.body.innerHTML = ''; });
const tick = () => new Promise((r) => setTimeout(r, 0));

function chosen(text: string, word: string) {
  const ed = editorWith(text);
  ed.commands.setTextSelection({ from: posOf(ed, word), to: posOf(ed, word, true) });
  return ed;
}

test('⌘K on words: the box offers the notes it finds, and ↩ on one links the words to it', async () => {
  notes.addImported('# Alpha plan\n\nx\n');
  notes.addImported('# Beta\n\ny\n');
  const ed = chosen('read the plan today', 'plan');
  editorCommands(ed).link();
  expect(ui.pending?.choices).toBeTruthy();
  expect(ui.pending!.input).toBe(''); // no "https://" to type over
  const found = ui.pending!.choices!('alp');
  expect(found.map((f) => f.label)).toContain('Alpha plan');
  ui.done(found.find((f) => f.label === 'Alpha plan')!.value);
  await tick();
  expect(md(ed)).toContain('read the [[Alpha plan|plan]] today');
});

test('the words the same as the title: a plain [[link]]', async () => {
  notes.addImported('# Beta\n\ny\n');
  const ed = chosen('see Beta now', 'Beta');
  editorCommands(ed).link();
  ui.done(ui.pending!.choices!('beta').find((f) => f.label === 'Beta')!.value);
  await tick();
  expect(md(ed)).toContain('see [[Beta]] now');
});

test.each([['example.com/a', 'https://example.com/a'], ['https://x.org', 'https://x.org']])('an address typed in (%s) links the words to it', async (typed, href) => {
  const ed = chosen('read the plan today', 'plan');
  editorCommands(ed).link();
  ui.done(typed);
  await tick();
  expect(md(ed)).toContain(`read the [plan](${href}) today`);
});

// the box itself: what it found shows under it, ↓ ↑ choose, ↩ answers with the one chosen; an address is the words
test('the box lists what it finds; ↓ and ↩ take one, an address typed is taken as it is', async () => {
  const { mount, unmount, flushSync } = await import('svelte');
  const Confirm = (await import('../Confirm.svelte')).default;
  Element.prototype.animate ??= function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null } as unknown as Animation; };
  const choices = (q: string) => ['Alpha', 'Alps'].filter((t) => t.toLowerCase().includes(q.toLowerCase())).map((t) => ({ label: t, value: `note:${t}` }));
  const type = (v: string) => { const i = document.querySelector<HTMLInputElement>('[role="dialog"] input')!; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); flushSync(); };
  const key = (k: string) => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); flushSync(); };

  const from = document.body.appendChild(document.createElement('button')); // where the keyboard was, and goes back to
  from.focus();
  const asked = ui.prompt('Link to', '', { choices });
  const box = mount(Confirm, { target: document.body });
  flushSync(); await tick();
  type('al');
  expect([...document.querySelectorAll('.choice')].map((b) => b.textContent?.trim())).toEqual(['📄Alpha', '📄Alps']);
  key('ArrowDown');
  key('Enter');
  expect(await asked).toBe('note:Alps');
  unmount(box);

  from.focus();
  const again = ui.prompt('Link to', '', { choices });
  const box2 = mount(Confirm, { target: document.body });
  flushSync(); await tick();
  type('alps.example.com');
  key('Enter');
  expect(await again).toBe('alps.example.com');
  unmount(box2);
});
