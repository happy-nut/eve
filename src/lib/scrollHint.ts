/** A box wider than its place scrolls sideways; its edge fades where there is more past it (a diagram or a formula
 *  was cut off at the card's edge with nothing to say it went on). Returns its undoing. */
export function scrollHint(el: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}; // no layout to watch (a test's page)
  const update = () => {
    const more = el.scrollWidth - el.clientWidth > 2;
    el.classList.toggle('more-l', more && el.scrollLeft > 2);
    el.classList.toggle('more-r', more && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  };
  const sizes = new ResizeObserver(update);
  const watch = () => { sizes.disconnect(); sizes.observe(el); for (const c of el.children) sizes.observe(c); update(); };
  const kids = new MutationObserver(watch); // drawn anew: its new picture watched
  kids.observe(el, { childList: true });
  el.addEventListener('scroll', update, { passive: true });
  watch();
  return () => { sizes.disconnect(); kids.disconnect(); el.removeEventListener('scroll', update); el.classList.remove('more-l', 'more-r'); };
}
