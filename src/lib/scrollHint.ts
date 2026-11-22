export function scrollHint(el: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const update = () => {
    const more = el.scrollWidth - el.clientWidth > 2;
    el.classList.toggle('more-l', more && el.scrollLeft > 2);
    el.classList.toggle('more-r', more && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  };
  const sizes = new ResizeObserver(update);
  const watch = () => { sizes.disconnect(); sizes.observe(el); for (const c of el.children) sizes.observe(c); update(); };
  const kids = new MutationObserver(watch);
  kids.observe(el, { childList: true });
  el.addEventListener('scroll', update, { passive: true });
  watch();
  return () => { sizes.disconnect(); kids.disconnect(); el.removeEventListener('scroll', update); el.classList.remove('more-l', 'more-r'); };
}
