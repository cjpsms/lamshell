// Reads the teacher's class list (class + seat + name) from their Excel (.xlsx) or CSV file. The dashboard sends the
// rows to the server, which matches students' names against it at sign-in (classroom.register).
//
// .xlsx is read without a library: it's a zip of XML files, unzipped with the browser's DecompressionStream.

// Same normalising as the server: "ม. 4/2" = "ม.4/2", seat "07" = "7".
export const normClass = s => String(s ?? '').replace(/\s+/g, '').trim();
export const normSeat = s => String(s ?? '').trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');

// ---------- reading files -> rows of cells (per sheet) ----------

async function unzip(buf) {
  const dv = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;   // end of central directory
  if (e < 0) throw new Error('ไฟล์นี้ไม่ใช่ .xlsx');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    files[dec.decode(new Uint8Array(buf, p + 46, nlen))] = {
      method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), at: dv.getUint32(p + 42, true),
    };
    p += 46 + nlen + xlen + clen;
  }
  return async name => {
    const f = files[name.replace(/^\//, '')];
    if (!f) return null;
    const start = f.at + 30 + dv.getUint16(f.at + 26, true) + dv.getUint16(f.at + 28, true);
    const data = new Uint8Array(buf, start, f.size);
    if (f.method === 0) return dec.decode(data);
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
}

const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const byTag = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
const colIndex = ref => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

async function readXlsx(buf) {
  const get = await unzip(buf);
  const shared = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const si of byTag(xml(ss), 'si')) shared.push(byTag(si, 't').map(t => t.textContent).join(''));
  const wb = xml(await get('xl/workbook.xml'));
  const rels = xml(await get('xl/_rels/workbook.xml.rels'));
  const target = Object.fromEntries(byTag(rels, 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sheets = [];
  for (const sh of byTag(wb, 'sheet')) {
    const rid = sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id');
    let path = target[rid] || '';
    path = path.startsWith('/') ? path.slice(1) : 'xl/' + path;
    const text = await get(path);
    if (!text) continue;
    const rows = [];
    for (const row of byTag(xml(text), 'row')) {
      const cells = [];
      for (const c of byTag(row, 'c')) {
        const t = c.getAttribute('t'), v = byTag(c, 'v')[0]?.textContent ?? '';
        const val = t === 's' ? shared[+v] ?? '' : t === 'inlineStr' ? byTag(c, 't').map(x => x.textContent).join('') : v;
        cells[c.getAttribute('r') ? colIndex(c.getAttribute('r')) : cells.length] = val;
      }
      rows.push(Array.from(cells, x => x ?? ''));
    }
    sheets.push({ name: sh.getAttribute('name') || '', rows });
  }
  return sheets;
}

function readCsv(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return [{ name: '', rows }];
}

// ---------- rows -> names ----------

const H = {
  klass: /^(ชั้น|ห้อง|ชั้นเรียน|ระดับชั้น|class|room)/i,
  seat: /^(เลขที่|เลข|ที่|no\.?|number|seat|#)$/i,
  first: /^(ชื่อ|name|first)/i,
  last: /^(นามสกุล|สกุล|surname|last)/i,
  title: /^(คำนำหน้า|คำนำ|prefix|title)/i,
};
const looksLikeClass = s => /ม\.?\s*\d|^\d+\/\d+$/.test(String(s || ''));

// One sheet -> [{klass, seat, name}]. The header row can be anywhere in the first 10 rows. Without a class column
// the sheet's name is used if it looks like a class ("ม.4-2"), else fallbackClass (what the teacher typed).
function parseSheet(sheet, fallbackClass) {
  const hi = sheet.rows.slice(0, 10).findIndex(r => r.some(c => H.seat.test(String(c).trim())) && r.some(c => H.first.test(String(c).trim())));
  if (hi < 0) return { rows: [], problem: 'หาแถวหัวตารางไม่เจอ (ต้องมีคอลัมน์ "เลขที่" และ "ชื่อ")' };
  const head = sheet.rows[hi].map(c => String(c).trim());
  const col = k => head.findIndex(h => H[k].test(h));
  const cSeat = col('seat'), cKlass = col('klass'), cLast = col('last'), cTitle = col('title');
  const cFirst = head.findIndex((h, i) => H.first.test(h) && i !== cLast);
  const sheetClass = looksLikeClass(sheet.name) ? sheet.name.replace(/-/g, '/') : '';
  const out = [];
  let missingClass = false;
  for (const r of sheet.rows.slice(hi + 1)) {
    const seat = normSeat(r[cSeat]);
    const name = [cTitle >= 0 ? r[cTitle] : '', r[cFirst], cLast >= 0 ? r[cLast] : ''].map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
    if (!/^\d+$/.test(seat) || !name) continue;
    const klass = normClass((cKlass >= 0 && r[cKlass]) || sheetClass || fallbackClass);
    if (!klass) { missingClass = true; continue; }
    out.push({ klass, seat, name });
  }
  return { rows: out, problem: missingClass ? 'ไม่รู้ว่าเป็นชั้นไหน: ใส่ชั้นในช่องด้านบนแล้วเลือกไฟล์อีกครั้ง' : '' };
}

// Read a file into rows [{klass, seat, name}] + a summary for the teacher.
export async function parseFile(file, fallbackClass = '') {
  const buf = await file.arrayBuffer();
  if (/\.xls$/i.test(file.name)) throw new Error('ไฟล์ .xls แบบเก่าอ่านไม่ได้ กด "บันทึกเป็น" ใน Excel แล้วเลือก .xlsx');
  const isXlsx = /\.xlsx$/i.test(file.name) || new Uint8Array(buf, 0, 2).join() === '80,75';   // "PK"
  const sheets = isXlsx ? await readXlsx(buf) : readCsv(new TextDecoder().decode(buf));
  const rows = [], classes = {}, problems = [];
  for (const sh of sheets) {
    const r = parseSheet(sh, fallbackClass);
    if (r.problem) problems.push((sh.name && !r.rows.length ? `ชีต ${sh.name}: ` : '') + r.problem);
    for (const x of r.rows) { rows.push(x); classes[x.klass] = (classes[x.klass] || 0) + 1; }
  }
  return { rows, classes, problems };
}

// A starter file the teacher can open in Excel (UTF-8 BOM so Thai shows right).
export function templateCsv() {
  return '﻿ชั้น,เลขที่,ชื่อ,นามสกุล\nม.4/2,1,สมชาย,ใจดี\nม.4/2,2,สมหญิง,รักเรียน\n';
}
