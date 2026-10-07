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
