import { test, expect } from 'vitest';
import { editorWith, md, paste } from './testEditor';
import { videoOf } from './bookmark';
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
  const src = videoOf(url)!.src;
  expect(new URL(src).pathname).toBe(`/embed/${id}`);
  expect(new URL(src).searchParams.get('start') ?? '').toBe(start);
});

test.each(['https://www.youtube.com/', 'https://www.youtube.com/@someone', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://notyoutube.com/watch?v=dQw4w9WgXcQ', 'https://vimeo.com/channels', 'https://example.com/movie.mp4.html', 'https://example.com/mp4'])('%s is no video', (url) => {
  expect(videoOf(url)).toBeNull();
});

test('a YouTube address pasted on an empty line plays in the note, and is saved as the bare address', () => {
  const U = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const ed = editorWith('# T\n\nxx');
  onEmptyLine(ed);
  paste(ed, U);
  const frame = ed.view.dom.querySelector('iframe');
  expect(frame?.getAttribute('src')).toBe(videoOf(U)!.src);
  expect(frame?.getAttribute('allowfullscreen')).not.toBeNull();
  expect(md(ed)).toBe(`# T\n\n${U}`);
  expect(editorWith(md(ed)).view.dom.querySelector('iframe')?.getAttribute('src')).toBe(videoOf(U)!.src);
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

test.each([
  ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
  ['https://vimeo.com/76979871#t=30s', 'https://player.vimeo.com/video/76979871#t=30s'],
  ['https://vimeo.com/123456789/abcdef1234', 'https://player.vimeo.com/video/123456789?h=abcdef1234'],
  ['https://vimeo.com/channels/staffpicks/76979871', 'https://player.vimeo.com/video/76979871'],
  ['https://player.vimeo.com/video/76979871?h=abc123', 'https://player.vimeo.com/video/76979871?h=abc123'],
])('%s plays in Vimeo\'s player', (url, src) => {
  expect(videoOf(url)).toEqual({ src, site: 'Vimeo' });
});

test.each(['https://example.com/clip.mp4', 'https://example.com/a/b.webm', 'https://example.com/Home.MOV', 'https://example.com/x.m4v'])('%s, a video file, is no player of a site\'s', (url) => {
  expect(videoOf(url)).toBeNull();
});

test('a Vimeo address pasted on an empty line plays in Vimeo\'s player, saved as the bare address', () => {
  const U = 'https://vimeo.com/76979871';
  const ed = editorWith('# T\n\nxx');
  onEmptyLine(ed);
  paste(ed, U);
  expect(ed.view.dom.querySelector('.bookmark.video iframe')?.getAttribute('src')).toBe(videoOf(U)!.src);
  expect(md(ed)).toBe(`# T\n\n${U}`);
  expect(editorWith(md(ed)).view.dom.querySelector('iframe')?.getAttribute('src')).toBe(videoOf(U)!.src);
});

test('a video file\'s address pasted on an empty line plays as the file itself, as a dropped video does, and stays one', () => {
  const U = 'https://example.com/media/My%20clip.mp4';
  const ed = editorWith('# T\n\nxx');
  onEmptyLine(ed);
  paste(ed, U);
  const v = ed.view.dom.querySelector('figure.vid-fig video') as HTMLVideoElement;
  expect(v?.getAttribute('src')).toBe(U);
  expect(v.controls).toBe(true);
  expect(v.preload).toBe('metadata');
  expect(md(ed)).toBe(`# T\n\n[My clip.mp4](${U})`);
  expect(editorWith(md(ed)).view.dom.querySelector('video')?.getAttribute('src')).toBe(U);
  expect(editorWith(`# T\n\n${U}`).view.dom.querySelector('video')?.getAttribute('src')).toBe(U);
});
