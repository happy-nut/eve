/**
 * A page's cover (Notion's): a band across the top of the page. The note's frontmatter keeps `cover: gradient:sea` for
 * one of these, or an image's address (a picture next to the notes, or a link) for one of the user's own.
 */
import { assetUrl } from './platform';

export const GRADIENTS: Record<string, { label: string; css: string }> = {
  sea: { label: 'Sea', css: 'linear-gradient(120deg, #84fab0, #8fd3f4)' },
  sky: { label: 'Sky', css: 'linear-gradient(120deg, #a1c4fd, #5b8def)' },
  dawn: { label: 'Dawn', css: 'linear-gradient(120deg, #f6d365, #fda085)' },
  dusk: { label: 'Dusk', css: 'linear-gradient(120deg, #a18cd1, #fbc2eb)' },
  sand: { label: 'Sand', css: 'linear-gradient(120deg, #e8dfd5, #c9b29b)' },
  night: { label: 'Night', css: 'linear-gradient(120deg, #2b3a55, #0b0c10)' },
};
const PREFIX = 'gradient:';

export const gradientCover = (name: string) => PREFIX + name;
/** a cover to start with, as Notion picks one when "Add cover" is pressed */
export const randomCover = () => gradientCover(Object.keys(GRADIENTS)[Math.floor(Math.random() * Object.keys(GRADIENTS).length)]);

/** the cover as a CSS background; a gradient no longer known (written by a newer Eve) is the first one */
export function coverCss(cover: string): string {
  if (cover.startsWith(PREFIX)) return (GRADIENTS[cover.slice(PREFIX.length)] ?? Object.values(GRADIENTS)[0]).css;
  const src = (assetUrl(cover) ?? cover).replace(/["\\\n]/g, encodeURIComponent);
  return `center / cover no-repeat url("${src}")`;
}
