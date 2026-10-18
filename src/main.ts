import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { isMobile } from './lib/platform';
import { watchFocus } from './lib/focusWatch';

document.documentElement.classList.toggle('mobile', isMobile);

// while developing, a keyboard left on <body> by accident says so (focusWatch.ts). Not on a phone: it has no keyboard
// focus to lose, and leaves it on <body> on purpose whenever its keyboard goes down
if (import.meta.env.DEV && !isMobile) {
  const losses: string[] = [];
  Object.assign(window as any, { __focusLosses: losses }); // read by the e2e scripts
  watchFocus((what) => { losses.push(what); console.warn(`[focus] ${what}`); });
}

export default mount(App, { target: document.getElementById('app')! });
