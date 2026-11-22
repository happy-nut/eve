import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Confirm from '../Confirm.svelte';
import { ui } from './ui.svelte';

Element.prototype.animate ??= (() => ({ cancel() {}, finished: Promise.resolve(), onfinish: null })) as never;

let app: ReturnType<typeof mount> | null = null;
afterEach(() => { ui.layers.closeAll('putAway'); if (app) unmount(app); app = null; document.body.innerHTML = ''; });

test('a question asked as the one before it is answered (a property\'s name, then its formula) takes the keyboard too', async () => {
  document.body.innerHTML = '<main><div class="tiptap" tabindex="0" contenteditable="true"></div></main>';
  document.querySelector<HTMLElement>('main .tiptap')!.focus();
  const first = ui.prompt('Property name', 'Formula');
  app = mount(Confirm, { target: document.body });
  flushSync();
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"] input'));
  ui.done('Cost');
  await first;
  const second = ui.prompt('Formula', '');
  flushSync();
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  expect(document.querySelector('[role="dialog"] p')!.textContent).toBe('Formula');
  expect(document.activeElement).toBe(input);
  ui.done(null);
  await second;
});

test('the keyboard is back where it was before the answer is given: what the answer opens next takes it from there', async () => {
  document.body.innerHTML = '<main><div class="tiptap" tabindex="0" contenteditable="true"></div></main>';
  const note = document.querySelector<HTMLElement>('main .tiptap')!;
  note.focus();
  const asked = ui.prompt('Property name', 'Formula');
  app = mount(Confirm, { target: document.body });
  flushSync();
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"] input'));
  const answer = ui.pending!.resolve;
  let keyboardAtAnswer: Element | null = null;
  ui.pending!.resolve = (v) => { keyboardAtAnswer = document.activeElement; answer(v); };
  ui.done('Cost');
  expect(keyboardAtAnswer).toBe(note);
  expect(await asked).toBe('Cost');
});
