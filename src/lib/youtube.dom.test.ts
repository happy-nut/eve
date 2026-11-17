import { test, expect } from 'vitest';
import { editorWith, md, paste } from './testEditor';
import { youtubeEmbed } from './bookmark';
import type { Editor } from '@tiptap/core';

const onEmptyLine = (ed: Editor) => {
  const end = ed.state.doc.content.size - 1;
  ed.chain().focus().setTextSelection({ from: end - 'xx'.length, to: end }).deleteSelection().run();
  expect(ed.state.selection.$from.parent.type.name).toBe('paragraph');
  expect(ed.state.selection.$from.parent.content.size).toBe(0);
};

test.each([
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', ''],
  ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ', '42'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'dQw4w9WgXcQ', '90'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', ''],
  ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ', ''],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=7', 'dQw4w9WgXcQ', '7'],
])('%s plays as video %s', (url, id, start) => {
  const src = youtubeEmbed(url)!;
  expect(new URL(src).pathname).toBe(`/embed/${id}`);
  expect(new URL(src).searchParams.get('start') ?? '').toBe(start);
});

test.each(['https://www.youtube.com/', 'https://www.youtube.com/@someone', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://notyoutube.com/watch?v=dQw4w9WgXcQ'])('%s is no video', (url) => {
  expect(youtubeEmbed(url)).toBeNull();
});

test('a YouTube address pasted on an empty line plays in the note, and is saved as the bare address', () => {
  const U = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const ed = editorWith('# T\n\nxx');
  onEmptyLine(ed);
  paste(ed, U);
  const frame = ed.view.dom.querySelector('iframe');
  expect(frame?.getAttribute('src')).toBe(youtubeEmbed(U));
  expect(frame?.getAttribute('allowfullscreen')).not.toBeNull();
  expect(md(ed)).toBe(`# T\n\n${U}`);
  expect(editorWith(md(ed)).view.dom.querySelector('iframe')?.getAttribute('src')).toBe(youtubeEmbed(U));
});

test('in a sentence, or any other address, a paste is still a link', () => {
  const ed = editorWith('# T\n\nwatch ');
  ed.commands.focus('end');
  paste(ed, 'https://youtu.be/dQw4w9WgXcQ');
  expect(ed.view.dom.querySelector('iframe')).toBeNull();
  const other = editorWith('# T\n\nxx');
  onEmptyLine(other);
  paste(other, 'https://example.com/page');
  expect(other.view.dom.querySelector('iframe, .bookmark')).toBeNull();
});

test('the right-click menu\'s Paste (the text handed to the note, no clipboard event) makes the player too', () => {
  const ed = editorWith('# T\n\nxx');
  onEmptyLine(ed);
  ed.view.pasteText('https://youtu.be/dQw4w9WgXcQ', new Event('paste') as ClipboardEvent);
  expect(ed.view.dom.querySelector('iframe')).not.toBeNull();
});
