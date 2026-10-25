// One sample of every kind of thing a note can hold, written as the app writes it, and the containers a block can be
// nested in. The guards hold every one of them to their rule: schemaGuard (saved, read back, copied), caretSync (the
// caret kept by its text when the note comes in changed).
export const SAMPLES: Record<string, string> = {
  'marks and inline nodes': '# T\n\nplain **bold** *it* ~~s~~ <u>u</u> `code` ==hi== [l](https://x.y) [[Page]] [[Page|alias]] @2026-10-18 $x^2$ a\\\nb',
  'reminder': 'call @2026-10-26 09:00 ⏰ back, and a day @2026-10-27 alone',
  'text colour': 'a <span style="color: #c4302b">red</span> word',
  'footnote': 'Claim[^1] and another[^note].\n\n[^1]: The source.\n\n[^note]: More.',
  'inline html': 'x <span style="color: red">y</span> z <input type="checkbox"> w',
  'coloured highlight': 'plain ==yellow== and <mark style="background-color: #c9f2d4">mint</mark> and **<mark style="background-color: #e5d8ff">lilac bold</mark>**',
  'code': '```js\nlet a = 1\n```',
  'lists': '- a\n- b\n\n1. one\n2. two\n\n- [ ] todo\n- [x] done',
  'quote': '> quote',
  'toggle': '<details open>\n<summary>T</summary>\n\nbody\n\n</details>',
  'callout': '> [!note] Title\n> body',
  'untitled callout': '> [!tip]\n> body',
  'formula': '$$\nx+1\n$$',
  'table': '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
  // columns dragged wider or narrower: their widths in a comment under the table, which other apps do not show
  'sized table': '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n\n<!-- eve:widths 120 - 240 -->',
  'database': '```database\n{\n  "title": "Tasks",\n  "props": [\n    {\n      "name": "Status",\n      "type": "select",\n      "options": [\n        "Todo",\n        "Done"\n      ]\n    }\n  ],\n  "view": "table"\n}\n```',
  'divider': 'a\n\n---\n\nb',
  'picture': '![cap](assets/a.png)',
  'pdf': '[notes.pdf](assets/notes.pdf)',
  'video': '[clip.mp4](assets/clip.mp4)',
  'link card': 'https://example.com/',
  'board': '```kanban\n{\n  "columns": [\n    {\n      "title": "To do",\n      "cards": [\n        {\n          "title": "A",\n          "body": ""\n        }\n      ]\n    }\n  ]\n}\n```',
  'html around markdown': '<div align="center">\n\n**inside**\n\n</div>',
  'comments': '<!-- a comment -->\n\ntext <!-- c --> more',
  'raw html': '<iframe src="https://x.com"></iframe>',
};

// Each block inside each container a note can nest it in, written as the app writes the container.
export const INSIDE: Record<string, (body: string) => string> = {
  'a quote': (b) => b.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'),
  'a callout': (b) => '> [!note] Box\n' + b.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'),
  'a toggle': (b) => `<details open>\n<summary>T</summary>\n\n${b}\n\n</details>`,
  'a list item': (b) => '- item\n\n' + b.split('\n').map((l) => (l ? `  ${l}` : '')).join('\n'),
};
export const BLOCKS = ['code', 'lists', 'quote', 'toggle', 'callout', 'formula', 'table', 'sized table', 'divider', 'picture', 'board'];
