import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { isMobile } from './lib/platform';
import { watchFocus } from './lib/focusWatch';

document.documentElement.classList.toggle('mobile', isMobile);

if (import.meta.env.DEV && !isMobile) {
  const losses: string[] = [];
  Object.assign(window as any, { __focusLosses: losses });
  watchFocus((what) => { losses.push(what); console.warn(`[focus] ${what}`); });
}

export default mount(App, { target: document.getElementById('app')! });
