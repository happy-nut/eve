// The selection layer measures each piece of selected text with a range. A range that begins or ends between
// elements holds whole elements, and WebKit adds every such element's box: a numbered list's lines were lit half a
// line low and across the page. Each range must start and end in the text it measures.
import { test, expect } from 'vitest';
import { editorWith } from './testEditor';
import { inText } from './selectionLayer';

const NOTES = [
  '# 통합어드민 개선\n\n1. 누가 요청했는가? → AuthN\n2. 이 사람이 해도 되는가? → AuthZ\n   - 하위 **굵게** 항목\n\n- [ ] 할 일 [[Page]] 뒤\n- 통합 어드민 자체 기능들\n\n> [!note] 제목\n> 본문 `code` 끝\n\n| a | b |\n| --- | --- |\n| 셀 | *기울임* |\n',
  '<details open>\n<summary>토글</summary>\n\n안쪽 줄 ==형광== 끝\n\n</details>',
];

test.each(NOTES)('every piece of text is measured inside its own text node', (note) => {
  const ed = editorWith(note);
  const bad: string[] = [];
  ed.state.doc.descendants((n, pos) => {
    if (!n.isText) return true;
    const a = inText(ed.view.domAtPos(pos), 1), b = inText(ed.view.domAtPos(pos + n.nodeSize), -1);
    if (a.node.nodeType !== Node.TEXT_NODE || a.node !== b.node || a.offset !== 0 || b.offset !== (b.node as Text).length) bad.push(n.text!);
    return false;
  });
  expect(bad).toEqual([]);
  ed.destroy();
});

// an empty line a drag runs through holds nothing, and nothing is drawn on it: a sliver marked there read as a space
// selected on each empty line (the `&nbsp;` the note's file keeps it with is not in the line)
test('an empty line inside the selection is left unmarked', () => {
  const ed = editorWith('above\n\n&nbsp;\n\n&nbsp;\n\nbelow');
  expect(ed.state.doc.childCount).toBe(4);
  ed.commands.setTextSelection({ from: 2, to: ed.state.doc.content.size - 2 });
  const empties = [...ed.view.dom.querySelectorAll('p')].filter((p) => !p.textContent);
  expect(empties.length).toBe(2);
  expect(empties.map((p) => p.className)).toEqual(['', '']);
  ed.destroy();
});
