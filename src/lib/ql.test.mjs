/**
 * The floating viewer shows a spreadsheet or a .hwp by loading Quick Look's own preview of it
 * (`ql_preview` in the desktop side runs `qlmanage -p`). Nothing in this app parses those formats,
 * so the one thing worth pinning down is the premise: Quick Look turns a real .xlsx into a
 * Preview.html the webview can load, and it does it for a file this test builds from scratch.
 *
 * macOS only, like the app itself — qlmanage is the whole mechanism.
 */
import assert from 'node:assert/strict';
import { crc32, deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A zip file from `{ name: contents }`, which is all an .xlsx is. */
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text, 'utf8');
    const body = deflateRawSync(raw);
    const sum = crc32(raw);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(8, 10); // deflate
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const book = zip({
  '[Content_Types].xml':
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  '_rels/.rels':
    `<?xml version="1.0"?><Relationships xmlns="${REL.replace('officeDocument/2006', 'package/2006')}">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml':
    `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}">` +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':
    `<?xml version="1.0"?><Relationships xmlns="${REL.replace('officeDocument/2006', 'package/2006')}">` +
    `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  'xl/worksheets/sheet1.xml':
    `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData><row r="1">` +
    `<c r="A1" t="inlineStr"><is><t>eve-sheet-cell</t></is></c>` +
    `<c r="B1"><v>42</v></c></row></sheetData></worksheet>`,
});

const dir = mkdtempSync(join(tmpdir(), 'eve-ql-'));
const xlsx = join(dir, 'book.xlsx');
writeFileSync(xlsx, book);

execFileSync('/usr/bin/qlmanage', ['-p', '-o', dir, xlsx], { stdio: 'ignore', timeout: 60_000 });

const html = join(dir, 'book.xlsx.qlpreview', 'Preview.html');
assert.ok(existsSync(html), 'Quick Look wrote no Preview.html for a .xlsx');

const preview = readFileSync(html, 'utf8');
assert.match(preview, /<table/i, 'the preview is not a laid-out sheet');
assert.match(preview, /eve-sheet-cell/, 'the cell text never reached the preview');
assert.match(preview, />42</, 'the numeric cell never reached the preview');

console.log('QL_HTML_OK');
