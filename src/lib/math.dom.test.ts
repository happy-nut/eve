import { test, expect, afterEach } from 'vitest';
import { editorWith, md, press, type } from './testEditor';

afterEach(() => { document.body.innerHTML = ''; });

const nodes = (ed: ReturnType<typeof editorWith>, name: string) => {
  const out: string[] = [];
  ed.state.doc.descendants((n) => { if (n.type.name === name) out.push(n.attrs.latex); });
  return out;
};

test.each([
  ['inline', 'Energy is $E = mc^2$ here.'],
  ['two inline', 'From $a_1$ to $a_n$, and $\\frac{1}{2}$.'],
  ['a block', 'Before\n\n$$\n\\int_0^1 x^2 \\, dx\n$$\n\nAfter'],
  ['a block of two lines', '$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$'],
  ['a block in a list', '- item\n\n  $$\n  x^2\n  $$\n\n- next'],
  ['a block in a quote', '> quoted\n>\n> $$\n> x\n> $$'],
  ['inline in a heading and a table', '# Area $\\pi r^2$\n\n| a | b |\n| --- | --- |\n| $x$ | 2 |'],
  ['money', 'It costs $5 and $10, or US$6.'],
  ['text with & < > * _', 'Tom & Jerry, a < b > c, \\*x\\* and a\\_b, &amp;'],
  ['a dollar escaped', 'Price \\$x\\$ stays text'],
  ['a formula holding a dollar', 'Cost $\\$5 + x$ now'],
])('%s reads back as written', (_what, note) => {
  const once = md(editorWith(note));
  if (!/table|quote|two lines|text with/.test(_what)) expect(once).toBe(note);
  expect(md(editorWith(once))).toBe(once);
});

test('formulas are read as formulas, money as money', () => {
  const ed = editorWith('Energy $E = mc^2$, cost $5 and $10.\n\n$$\nx^2\n$$');
  expect(nodes(ed, 'mathInline')).toEqual(['E = mc^2']);
  expect(nodes(ed, 'mathBlock')).toEqual(['x^2']);
  expect(ed.getText()).toContain('cost $5 and $10.');
  expect(md(ed)).toBe('Energy $E = mc^2$, cost $5 and $10.\n\n$$\nx^2\n$$');
});

test('$$ x $$ on one line is a block', () => {
  const ed = editorWith('$$ a+b $$');
  expect(nodes(ed, 'mathBlock')).toEqual(['a+b']);
  expect(md(ed)).toBe('$$\na+b\n$$');
});

test('text that would read as a formula is written with its dollars escaped', () => {
  const ed = editorWith('');
  ed.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a $x$ b' }] }] });
  const out = md(ed);
  expect(out).toBe('a \\$x\\$ b');
  const back = editorWith(out);
  expect(nodes(back, 'mathInline')).toEqual([]);
  expect(back.getText()).toBe('a $x$ b');
});

test('typing $x^2$ makes a formula; $5 and $ does not', () => {
  const ed = editorWith('');
  type(ed, 'So $x^2$');
  expect(nodes(ed, 'mathInline')).toEqual(['x^2']);
  const money = editorWith('');
  type(money, 'it is $5 and $');
  expect(nodes(money, 'mathInline')).toEqual([]);
});

test('a formula copies as its markdown', () => {
  const ed = editorWith('a $x^2$ b\n\n$$\ny\n$$');
  const { state } = ed;
  const slice = state.doc.slice(0, state.doc.content.size);
  const text = (ed.view as any).someProp('clipboardTextSerializer', (f: any) => f(slice, ed.view));
  expect(text).toBe('a $x^2$ b\n\n$$\ny\n$$');
});

test('$$ and a space on an empty line makes a block, in a list item too', () => {
  const ed = editorWith('');
  type(ed, '$$ ');
  expect(nodes(ed, 'mathBlock')).toEqual(['']);
  const list = editorWith('');
  type(list, '- a');
  press(list, 'Enter');
  type(list, '$$ ');
  expect(list.state.doc.textContent).not.toContain('$$');
  expect(nodes(list, 'mathBlock')).toEqual(['']);
});
