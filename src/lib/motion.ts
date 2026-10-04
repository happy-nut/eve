/**
 * How every popup comes and goes, in one place. Use them with |global (transition:scale|global={popIn}):
 * a popup sits in an {#if} or an {#await} made together with the one that opens it, and a local transition
 * (Svelte's default) only plays when its own block is made, so it silently did not play. e2e/popups.mjs checks.
 */
import { cubicOut } from 'svelte/easing';

/** a menu or a popover: grows a little out of where it was opened */
export const popIn = { start: 0.95, duration: 120, easing: cubicOut };
/** a popup at the caret (the / menu, :emoji, the @ calendar): rises a few pixels under the line */
export const caretIn = { y: 4, duration: 120, easing: cubicOut };
/** a dialog or a floating page (Settings, a confirm, a card, a PDF): grows in place */
export const panelIn = { start: 0.96, duration: 160, easing: cubicOut };
/** the dim page under a dialog, or the clear one under a popover */
export const scrimFade = { duration: 120 };
