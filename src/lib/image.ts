import Image from '@tiptap/extension-image';
import { assetUrl } from './platform';

/**
 * Images. Markdown keeps a portable relative path (`assets/x.png`, next to the notes);
 * only the rendered <img src> is mapped to something the webview can load.
 */
export const LocalImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    return ['img', { ...HTMLAttributes, src: assetUrl(HTMLAttributes.src), draggable: 'false' }];
  },
});
