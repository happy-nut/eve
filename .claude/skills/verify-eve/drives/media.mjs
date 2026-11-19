const BLUE = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAAsUlEQVR42u3RAQkAAAgEsY9jJrMbxhoig0twS/XocbEAsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmABBizAAizAAizAAgxYgAVYgAVYgAUYsAuABViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMACLMACLMCABViABViABViAAQuwAOteC/Ysd/xjJNNhAAAAAElFTkSuQmCC';
const GREEN = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAAsUlEQVR42u3RAQkAAAgEsY9jHMMa0Boig0twS03rcbEAsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmABBizAAizAAizAAgxYgAVYgAVYgAUYsAuABViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMACLMACLMCABViABViABViAAQuwAOteC9ZYQkj7gtWMAAAAAElFTkSuQmCC';
const RED = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAAsUlEQVR42u3RAQ0AAAjDsGu6fymIwQYhTaZgzbR6XCwALMACLMACLMACDFiABViABViABRiwAAuwAAuwAAuwAAMWYAEWYAEWYAEGLMACLMACLMACDFiABViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEG7AJgARZgARZgARZgwAIswAIswAIswIAFWIAFWIAFWIAFGLAAC7AAC7AACzBgARZgARZgARZgwAIswLrXAqSyJJPo+85TAAAAAElFTkSuQmCC';
const PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

const newLine = async (t) => {
  await t.click('.tiptap > p:last-of-type');
  await t.key('End');
  await t.key('Enter');
};

const send = (t, kind, file) => t.page.evaluate(([kind, file]) => {
  const bytes = file.b64 ? Uint8Array.from(atob(file.b64), (c) => c.charCodeAt(0)) : new TextEncoder().encode(file.text);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], file.name, { type: file.type }));
  const p = [...document.querySelectorAll('.tiptap > p')].at(-1);
  if (kind === 'paste') return p.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  const r = p.getBoundingClientRect();
  for (const type of ['dragenter', 'dragover', 'drop'])
    p.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 5, clientY: r.top + r.height / 2 }));
}, [kind, file]);

const images = (t) => t.page.locator('.tiptap img').count();
const dataImages = async (t) => ((await t.markdown()).match(/!\[[^\]]*\]\(data:image\/png;base64,/g) ?? []).length;

export default async (t) => {
  await t.page.evaluate(() => import('/src/PdfViewer.svelte')).catch(() => {});
  await t.wait(1500);
  await t.page.waitForSelector('.tiptap');
  await newLine(t);
  await t.type('/image');
  await t.page.waitForSelector('.suggest li');
  const chooser = t.page.waitForEvent('filechooser');
  await t.key('Enter');
  await (await chooser).setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(BLUE, 'base64') });
  await t.ok('media-image-menu', async () => await images(t) === 1 && await dataImages(t) === 1,
    'the picture chosen after /image is in the note and saved as ![](data:image/png…)');
  await t.shot('image-picked');

  await t.page.locator('.tiptap img').first().dblclick();
  await t.ok('media-image-viewer', () => t.page.locator('.viewer img').isVisible(), 'a double-click shows the picture full size in the viewer');
  await t.shot('viewer');
  await t.key('Escape');
  await t.ok('media-image-viewer', async () => await t.page.locator('.viewer').count() === 0, 'Esc closes the viewer');

  await t.click('.tiptap img');
  await t.ok('media-image-viewer', () => t.page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent.trim()).join('|');
    return ['Copy image', 'left', 'center', 'right', 'Delete'].every((w) => items.includes(w));
  }), 'a single click opens the picture menu: Copy image, Align left, center, right, Delete');
  await t.shot('image-menu');
  await t.key('Escape');
  await t.page.waitForSelector('[role="menuitem"]', { state: 'detached' });

  await newLine(t);
  await send(t, 'paste', { name: 'green.png', type: 'image/png', b64: GREEN });
  await t.ok('media-image-paste', async () => await images(t) === 2 && await dataImages(t) === 2,
    'a pasted picture goes in at the caret: two pictures in the note, two saved data lines');
  await t.shot('pasted');

  await newLine(t);
  await send(t, 'drop', { name: 'red.png', type: 'image/png', b64: RED });
  await t.ok('media-image-drop', async () => await images(t) === 3 && await dataImages(t) === 3,
    'a picture dropped on the note goes in: three pictures, three saved data lines');
  await t.shot('dropped');

  await newLine(t);
  await send(t, 'drop', { name: 'report.pdf', type: 'application/pdf', text: PDF });
  await t.ok('media-pdf', async () => (await t.page.locator('.tiptap .pdf-card').textContent())?.includes('report.pdf')
    && (await t.markdown()).includes('[report.pdf]('), 'a dropped PDF is a card reading report.pdf, saved as [report.pdf](…)');
  await t.shot('pdf-card');
  await t.click('.tiptap .pdf-card');
  await t.ok('media-pdf', async () => (await t.page.locator('.pdf-panel').textContent())?.includes('report.pdf'),
    'a click on the card opens a panel titled report.pdf');
  await t.shot('pdf-panel');
  await t.click('.pdf-panel button[aria-label="Close"]');

  await newLine(t);
  await t.type('https://example.com ');
  await t.key('Backspace');
  await t.key('ArrowLeft');
  await t.key('Alt+Enter');
  await t.ok('media-card', () => t.page.locator('button[role="menuitem"]:has-text("Show as card")').isVisible(),
    'Option-Enter on the address lists Show as card');
  await t.click('button[role="menuitem"]:has-text("Show as card")');
  const card = async () => (await t.page.locator('.tiptap a.bookmark').textContent())?.includes('example.com');
  await t.ok('media-card', async () => await card() && /^https:\/\/example\.com$/m.test(await t.markdown()),
    'the address is a card reading example.com and the note keeps the bare address');
  await t.shot('card');
  await t.page.reload();
  await t.page.waitForSelector('.tiptap');
  await t.ok('media-card', card, 'after a reload the address is still a card');
  await t.shot('card-reloaded');
};
