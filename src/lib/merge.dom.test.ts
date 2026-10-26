import { test, expect } from 'vitest';
import { notes, parse, serialize } from './notes.svelte';

test('a note saved with Windows line endings (or a byte-order mark) reads like any other', () => {
  const lf = serialize({ id: 'mgcrl', body: '# Title\n\nline one\nline two\n', updatedAt: 300, deleted: false, group: 'Work', order: 2 });
  const crlf = '﻿' + lf.replace(/\n/g, '\r\n');
  const n = parse(crlf);
  expect(n).not.toBeNull();
  expect(n!.id).toBe('mgcrl');
  expect(n!.group).toBe('Work');
  expect(n!.updatedAt).toBe(300);
  expect(n!.body).toBe('# Title\n\nline one\nline two\n');
});

test('a note laid out at full width reads back that way; one at the reading width writes nothing for it', () => {
  const wide = { id: 'mgfull', body: '# Full\n', updatedAt: 1, deleted: false, group: '', order: 0, wide: true };
  expect(parse(serialize(wide))!.wide).toBe(true);
  expect(serialize({ ...wide, wide: undefined })).not.toContain('wide:');
  expect(parse(serialize({ ...wide, wide: undefined }))!.wide).toBeUndefined();
});

test('small text and a cover read back as set; a cover\'s address keeps its colons, and none writes nothing', () => {
  const n = { id: 'mglook', body: '# Look\n', updatedAt: 1, deleted: false, group: '', order: 0, small: true, cover: 'https://example.com/a:b.png' };
  const back = parse(serialize(n))!;
  expect(back.small).toBe(true);
  expect(back.cover).toBe('https://example.com/a:b.png');
  expect(back.body).toBe('# Look\n');
  expect(serialize({ ...n, small: undefined, cover: undefined })).not.toMatch(/small:|cover:/);
});

test('a cover taken off on another device comes off here too', () => {
  const n = notes.create('# Covered\n');
  notes.setLook(n.id, { cover: 'gradient:sea', small: true });
  const there = { ...n, cover: undefined, small: undefined, updatedAt: Date.now() + 1000 };
  notes.mergeRemote([there]);
  const here = notes.all.find((x) => x.id === n.id)!;
  expect(here.cover).toBeUndefined();
  expect(here.small).toBeUndefined();
});

test("today's note made here and not written in yet gives way to the one written on another device", () => {
  const day = notes.dayNote('2026-10-06');
  const written = { ...day, body: '# 2026-10-06 Tuesday\n\nwritten on the Mac at 8am\n', updatedAt: Date.now() - 3_600_000 };
  notes.mergeRemote([written]);
  expect(notes.all.find((n) => n.id === day.id)!.body).toContain('written on the Mac at 8am');
});

test('…but once written in here, the newer edit wins as always', () => {
  const day = notes.dayNote('2026-10-07');
  notes.update(day.id, '# 2026-10-07\n\nwritten on the phone just now\n');
  notes.mergeRemote([{ ...day, body: '# 2026-10-07\n\nolder, from the Mac\n', updatedAt: Date.now() - 3_600_000 }]);
  expect(notes.all.find((n) => n.id === day.id)!.body).toContain('written on the phone just now');
});
