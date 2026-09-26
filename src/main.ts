import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { isMobile } from './lib/platform';

document.documentElement.classList.toggle('mobile', isMobile);

export default mount(App, { target: document.getElementById('app')! });
