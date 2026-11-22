// A picked box's or lane's name field: armed (unseen, holding the keyboard) until typed into, when it starts the
// rename; only then do ↩, Esc and Tab keep, drop and pass on the name.
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NameField from '../NameField.svelte';

let app: ReturnType<typeof mount> | null = null;
afterEach(() => { if (app) unmount(app); app = null; document.body.innerHTML = ''; });

function field(editing: boolean, said: string[]) {
  app = mount(NameField, {
    target: document.body,
    props: {
      value: 'Box', editing, shown: 'rename', label: 'Step name', left: 0, top: 0,
      onstart: () => said.push('start'), oncommit: () => said.push('commit'), oncancel: () => said.push('cancel'),
      ontab: () => said.push('tab'), onblur: () => {},
    },
  });
  flushSync();
  const input = document.querySelector('input')!;
  const key = (k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return { input, key };
}

test('armed, it is unseen, the keys pass it by, and typing into it starts the rename', () => {
  const said: string[] = [];
  const { input, key } = field(false, said);
  expect(input.className).toContain('armed');
  key('Enter'); key('Escape'); key('Tab');
  expect(said).toEqual([]);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(said).toEqual(['start']);
});

test('renaming, it is shown, and ↩ keeps, Esc drops, Tab passes on', () => {
  const said: string[] = [];
  const { input, key } = field(true, said);
  expect(input.className).toContain('rename');
  key('Enter'); key('Escape'); key('Tab');
  expect(said).toEqual(['commit', 'cancel', 'tab']);
});
