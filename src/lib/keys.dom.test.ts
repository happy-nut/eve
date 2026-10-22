// Who hears a key (keys.ts): the order, the layer on top, an element's own keys, a word being put together.
import { test, expect, afterEach } from 'vitest';
import { claimKeys, handledBy, composing } from './keys';
import { ui } from './ui.svelte';

const offs: (() => void)[] = [];
afterEach(() => { for (const f of offs.splice(0)) f(); ui.layers.closeAll('putAway'); document.body.innerHTML = ''; });
const claim = (...a: Parameters<typeof claimKeys>) => { const off = claimKeys(...a); offs.push(off); return off; };
const key = (key: string, init: KeyboardEventInit = {}, at: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  at.dispatchEvent(e);
  return e;
};

test('the higher priority first, then the order claimed; a handler that returns true ends it', () => {
  const heard: string[] = [];
  claim('global', { '*': () => void heard.push('a') });
  claim('global', { '*': () => void heard.push('app') }, { priority: -100 });
  claim('global', { Escape: () => { heard.push('b'); return true; } });
  claim('global', { '*': () => void heard.push('top') }, { priority: 10 });
  const e = key('Escape');
  expect(heard).toEqual(['top', 'a', 'b']);
  expect(e.defaultPrevented).toBe(true);
  expect(handledBy(e)).toBe('taken');
  heard.length = 0;
  key('x');
  expect(heard).toEqual(['top', 'a', 'app']);
});

test('capture claims hear a key before the element does, and can stop it reaching it', () => {
  const heard: string[] = [];
  const box = document.body.appendChild(document.createElement('input'));
  box.addEventListener('keydown', () => heard.push('box'));
  claim('global', { '*': () => void heard.push('after') });
  claim('global', { z: (e) => { heard.push('before'); e.stopPropagation(); } }, { capture: true });
  key('a', {}, box);
  key('z', {}, box);
  expect(heard).toEqual(['box', 'after', 'before']);
});

test('a combo, a key, or any key; an element hears only keys typed inside it', () => {
  const heard: string[] = [];
  const mine = document.body.appendChild(document.createElement('div'));
  const inside = mine.appendChild(document.createElement('button'));
  claim(mine, { 'Shift-Enter': () => void heard.push('combo'), Enter: () => void heard.push('key'), '*': () => void heard.push('any') });
  key('Enter', { shiftKey: true }, inside);
  key('Enter', {}, inside);
  key('q', {}, inside);
  key('Enter');
  expect(heard).toEqual(['combo', 'key', 'any']);
});

test('whileTop: only while that layer is the one on top', () => {
  const heard: string[] = [];
  claim('global', { '*': () => void heard.push('dialog') }, { whileTop: 'confirm' });
  key('a');
  const off = ui.layers.push({ id: 'confirm', close: () => {}, from: null });
  key('b');
  const menu = ui.layers.push({ id: 'menu', close: () => {}, from: null });
  key('c');
  menu();
  off();
  expect(heard).toEqual(['dialog']);
});

test("a key typed into an IME is the word's, unless a claim asks for those too", () => {
  const heard: string[] = [];
  claim('global', { '*': () => void heard.push('plain') });
  claim('global', { '*': () => void heard.push('all') }, { composing: true });
  key('Enter', { isComposing: true });
  // WebKit's Enter that ends a Korean word: no longer composing, but 229 all the same
  key('Enter', { keyCode: 229 } as KeyboardEventInit);
  expect(heard).toEqual(['all', 'all']);
  expect(composing(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
});
