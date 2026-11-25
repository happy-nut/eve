import { test, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { EmojiEntry } from './emoji';

let release: (d: EmojiEntry[]) => void = () => {};
const all = (await import('emoji-picker-element-data/en/emojibase/data.json')).default as EmojiEntry[];
vi.mock('./emoji', async (original) => {
  const real = await original<typeof import('./emoji')>();
  return { ...real, loadEmoji: () => new Promise<EmojiEntry[]>((r) => (release = r)) };
});

const { default: EmojiPicker } = await import('../EmojiPicker.svelte');
const { ui } = await import('./ui.svelte');

Element.prototype.animate ??= function () { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null } as unknown as Animation; };
const settled = () => new Promise((r) => setTimeout(r, 80));
let picker: ReturnType<typeof mount> | null = null;
afterEach(async () => {
  if (ui.emoji) ui.emojiDone(null);
  if (picker) unmount(picker);
  picker = null;
  await settled();
  document.body.innerHTML = '';
  localStorage.clear();
});

function open() {
  document.body.innerHTML = '<main><div class="tiptap" tabindex="0" contenteditable="true">words</div></main>';
  document.querySelector<HTMLElement>('.tiptap')!.focus();
  const chosen = ui.pickEmoji(new DOMRect(40, 40, 20, 20));
  picker = mount(EmojiPicker, { target: document.body });
  flushSync();
  return chosen;
}
const loaded = async () => { release(all); await Promise.resolve(); await Promise.resolve(); flushSync(); };
const key = (k: string) => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); flushSync(); };
const keys = (...ks: string[]) => ks.forEach(key);
const on = () => {
  const a = document.activeElement as HTMLElement;
  if (a.matches('input.search')) return 'search';
  return a.matches('.grid .cell') ? a.textContent!.trim() || a.getAttribute('aria-label')! : `<${a.tagName}>`;
};
const tab = () => document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label');
const smileys = () => all.filter((e) => e.group === 0).sort((a, b) => a.order! - b.order!).map((e) => e.emoji);
const people = () => all.filter((e) => e.group === 1).sort((a, b) => a.order! - b.order!).map((e) => e.emoji);

test('the search field has the keyboard as it opens; ↓ pressed before the emoji are loaded lands on the first one once they are', async () => {
  open();
  expect(on()).toBe('search');
  expect(tab()).toBe('Smileys and emoticons');
  key('ArrowDown');
  expect(on()).toBe('search');
  await loaded();
  expect(on()).toBe('😀');
});

test('arrows move a cell or a row; ← from the first cell and ↑ from the first row go back to the search field', async () => {
  open();
  await loaded();
  const s = smileys();
  keys('ArrowDown', 'ArrowRight', 'ArrowRight');
  expect(on()).toBe(s[2]);
  key('ArrowDown');
  expect(on()).toBe(s[11]);
  key('ArrowLeft');
  expect(on()).toBe(s[10]);
  key('ArrowUp');
  expect(on()).toBe(s[1]);
  key('ArrowUp');
  expect(on()).toBe('search');
  keys('ArrowDown', 'ArrowLeft');
  expect(on()).toBe('search');
});

test('↓ past the last row opens the next category in the same column; ↑ above its first row goes back to the last row', async () => {
  open();
  await loaded();
  const s = smileys(), p = people();
  const rows = Math.ceil(s.length / 9);
  keys('ArrowDown', 'ArrowRight', 'ArrowRight');
  for (let r = 1; r < rows; r++) key('ArrowDown');
  const lastRowStart = (rows - 1) * 9;
  expect(on()).toBe(s[Math.min(lastRowStart + 2, s.length - 1)]);
  key('ArrowDown');
  expect(tab()).toBe('People and body');
  expect(on()).toBe(p[2]);
  key('ArrowUp');
  expect(tab()).toBe('Smileys and emoticons');
  expect(on()).toBe(s[Math.min(lastRowStart + 2, s.length - 1)]);
});

test('Enter picks the cell with the keyboard, and it comes first among the recently used next time', async () => {
  const chosen = open();
  await loaded();
  keys('ArrowDown', 'ArrowRight', 'ArrowDown', 'Enter');
  expect(await chosen).toBe(smileys()[10]);
  unmount(picker!);
  picker = null;
  await settled();
  open();
  expect(document.querySelector('.recent .cell')?.textContent?.trim()).toBe(smileys()[10]);
});

test('a letter typed in the grid goes back to the search field; Enter there picks what was found first', async () => {
  const chosen = open();
  await loaded();
  keys('ArrowDown', 'ArrowRight', 'f');
  expect(on()).toBe('search');
  const input = document.activeElement as HTMLInputElement;
  input.value = 'fire';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(document.querySelector('.grid .cell')?.textContent?.trim()).toBe('🔥');
  key('Enter');
  expect(await chosen).toBe('🔥');
});

test("Eve's own icons are the last category; one picked comes back as :name:", async () => {
  const chosen = open();
  await loaded();
  [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].at(-1)!.click();
  flushSync();
  expect(tab()).toBe('Eve');
  keys('ArrowDown', 'ArrowRight');
  expect(on()).toBe('Codex');
  key('Enter');
  expect(await chosen).toBe(':codex:');
});

test('Esc closes it without a pick', async () => {
  const chosen = open();
  await loaded();
  key('Escape');
  expect(await chosen).toBeNull();
});
