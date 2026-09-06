/**
 * Custom (non-emoji) icons offered in the picker's "기타" tab. Stored as ":name:" tokens.
 * Inline SVG uses currentColor (theme-aware); the picker gets a data-URI copy in grey.
 */
export interface CustomIcon { name: string; label: string; svg: string }

export const CUSTOM_ICONS: CustomIcon[] = [
  {
    name: 'claude',
    label: 'Claude',
    svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#D97757" d="M12 1.5l1.4 7.3L19.4 4.6l-4.2 6.1L22.5 12l-7.3 1.3 4.2 6.1-6-4.2L12 22.5l-1.4-7.3-6 4.2 4.2-6.1L1.5 12l7.3-1.3L4.6 4.6l6 4.2z"/></svg>',
  },
  {
    name: 'codex',
    label: 'Codex',
    svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z"/><path d="M12 7.2l4.2 2.4v4.8L12 16.8l-4.2-2.4V9.6z"/><path d="M12 2.6v4.6M20.1 7.3l-3.9 2.3M20.1 16.7l-3.9-2.3M12 21.4v-4.6M3.9 16.7l3.9-2.3M3.9 7.3l3.9 2.3"/></svg>',
  },
];

export const isCustom = (icon?: string) => !!icon && /^:[a-z0-9_-]+:$/.test(icon);
export const customIcon = (icon?: string) => (isCustom(icon) ? CUSTOM_ICONS.find((c) => `:${c.name}:` === icon) : undefined);
export const customUrl = (c: CustomIcon) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(c.svg.replace(/currentColor/g, '#8e8e93'));
