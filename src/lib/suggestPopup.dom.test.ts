// The [[ and / popup itself (Suggest.svelte), mounted on its own.
import { test, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Suggest from '../Suggest.svelte';
import type { SuggestItem, SuggestionUI } from './slash';

// jsdom lays nothing out, so has no scrolling either; the popup keeps the highlighted row in view with it
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, onfinish: null })) as any;

let made: Record<string, any> | null = null;
afterEach(() => { if (made) unmount(made); made = null; document.body.innerHTML = ''; });

function popup() {
  made = mount(Suggest, { target: document.body });
  return (made as unknown as { ui: SuggestionUI }).ui;
}
const labels = () => [...document.querySelectorAll('.suggest li')].map((li) => li.querySelector('.s-label')?.textContent);

test('a page with two headings of the same name opens into its sections without an error', () => {
  const ui = popup();
  const sections = ['Plan', 'TODO', 'TODO', 'Zeta'].map((h) => ({ label: h, value: `Dup#${h}`, hint: 'Dup' }));
  const items: SuggestItem[] = [{ label: 'Dup', sections }, ...sections];
  ui.show(items, null, () => {});
  flushSync();
  expect(() => { ui.expand(); flushSync(); }).not.toThrow();
  expect(labels()).toEqual(['Dup', 'Plan', 'TODO', 'TODO', 'Zeta', 'Plan', 'TODO', 'TODO', 'Zeta']);
});
