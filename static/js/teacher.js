// Teacher dashboard (design doc: "Dashboard ครู"). Progress per student (who's stuck > 5 min: the teacher is
// hint #4), levels that take longest, the class's most common errors, Thai น้องล่าม couldn't translate,
// checkpoint quiz results, and the research indicators. Refreshes every 10 seconds.
import { LEVELS, phaseLabel } from './levels.js';
import { CHECKPOINTS } from './quiz.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (path, body) => fetch('api/teacher/' + path, body ? {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
} : {}).then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

const ORDER = Object.fromEntries(LEVELS.map((l, i) => [l.id, i]));
const TITLE = Object.fromEntries(LEVELS.map(l => [l.id, l.title]));
const lvName = id => id?.startsWith('CP') ? `เช็กพอยต์ ${id.slice(2)}` : id || '-';
const mins = ms => ms == null ? '-' : ms < 60000 ? `${Math.round(ms / 1000)} วิ` : `${Math.round(ms / 60000)} นาที`;
const ago = (t, now) => !t ? '-' : now - t < 60000 ? 'เมื่อกี้' : now - t < 3600000 ? `${Math.floor((now - t) / 60000)} นาทีก่อน` :
  new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
const pct = x => x == null ? '-' : Math.round(x * 100) + '%';
const bar = (x, label) => `<div class="bar"><i style="width:${Math.round((x || 0) * 100)}%"></i><span>${esc(label ?? pct(x))}</span></div>`;
const phaseName = ph => ph == null ? '-' : phaseLabel(/^\d$/.test(ph) ? +ph : ph);

let data = null, tab = 'people';

// ---------- sign in ----------
async function auth() {
  const st = (await fetch('api/teacher/status').then(r => r.json())) || {};
  if (st.in) return start();
  const box = $('#auth'), f = box.querySelector('form');
  box.hidden = false;
  if (!st.set) {   // the password is only ever set in the terminal, on the teacher's machine
    $('#authmsg').innerHTML = 'ยังไม่ได้ตั้งรหัสผ่านครู ตั้งได้ที่เครื่องที่รันเซิร์ฟเวอร์ ด้วยคำสั่ง<br><code>lamshell --setup</code> (หรือ <code>python3 server.py --setup</code>) แล้วโหลดหน้านี้ใหม่';
    f.pw.hidden = true;
    f.querySelector('button').hidden = true;
    return;
  }
  $('#authmsg').textContent = 'ใส่รหัสผ่านครู';
  f.pw.focus();
  f.onsubmit = async e => {
    e.preventDefault();
    const err = f.querySelector('.err');
    const r = await api('login', { password: f.pw.value });
    if (!r.ok) { err.textContent = r.data.error || 'เข้าสู่ระบบไม่ได้'; return; }
    box.hidden = true;
    start();
  };
}

function start() {
  $('#app').hidden = false;
  document.querySelectorAll('nav button').forEach(b => {
    b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); render(); };
  });
  $('#klass').onchange = () => { $('#csv').href = 'api/teacher/export.csv' + ($('#klass').value ? '?class=' + encodeURIComponent($('#klass').value) : ''); load(); };
  $('#logout').onclick = async () => { await api('logout', {}); location.reload(); };
  load();
  setInterval(load, 10000);
}

async function load() {
  const k = $('#klass').value;
  const r = await api('overview' + (k ? '?class=' + encodeURIComponent(k) : ''));
  if (r.status === 401) return location.reload();
  if (!r.ok) return;
  data = r.data;
  const sel = $('#klass');
  const have = [...sel.options].map(o => o.value);
  for (const c of data.classes) if (!have.includes(c)) sel.add(new Option(c, c));
  $('#updated').textContent = 'อัปเดต ' + new Date(data.now).toLocaleTimeString('th-TH');
  // Don't redraw under the teacher's cursor while they're selecting text.
  if (!getSelection().toString()) render();
}

function render() {
  if (!data) return;
  $('#view').innerHTML = { people, levels, errors, thai, quiz, research }[tab]();
  if (tab === 'people') {
    document.querySelectorAll('.del').forEach(b => {
      b.onclick = async () => {
        if (!confirm(`ลบข้อมูลทั้งหมดของ ${b.dataset.name} (${b.dataset.code})? ลบแล้วกู้คืนไม่ได้`)) return;
        await api('delete', { code: b.dataset.code });
        load();
      };
    });
  }
}

// ---------- tabs ----------
function people() {
  const S = data.students;
  if (!S.length) return '<div class="empty">ยังไม่มีนักเรียนลงชื่อเข้าเล่น (นักเรียนกรอกชั้น + เลขที่เองได้ที่หน้าเกม)</div>';
  const stuck = S.filter(s => s.stuck);
  const cps = Object.keys(CHECKPOINTS);
  const rows = S.map(s => `<tr class="${s.stuck ? 'stuck' : ''}">
    <td><span class="dot ${s.online ? 'on' : ''}"></span>${esc(s.class)}</td><td>${esc(s.seat)}</td><td class="mono">${esc(s.code)}</td>
    <td>${esc(lvName(s.current))}${s.stuck ? ` <span class="tag red">ติด ${mins(s.on_level_ms)}</span>` : s.on_level_ms != null && s.online ? ` <span class="muted">${mins(s.on_level_ms)}</span>` : ''}</td>
    <td>${esc(s.front || '-')}</td><td>★ ${s.stars}</td>
    ${cps.map(c => { const q = s.quiz[c]; return `<td>${q ? `<span class="tag ${q.passed ? 'green' : 'amber'}">${q.best}/${q.total}</span> <span class="muted">${q.tries} รอบ</span>` : '<span class="muted">-</span>'}</td>`; }).join('')}
    <td>${s.inputs}</td><td class="muted">${ago(s.last, data.now)}</td>
    <td><button class="del" title="ลบข้อมูลนักเรียนคนนี้" data-code="${esc(s.code)}" data-name="${esc(s.class + ' เลขที่ ' + s.seat)}">🗑</button></td></tr>`).join('');
  return `${stuck.length ? `<h2>🚨 ติดด่านเดิมเกิน 5 นาที (${stuck.length} คน) ครูไปช่วยได้เลย</h2>
    <p class="note">${stuck.map(s => `<b>${esc(s.class)} เลขที่ ${esc(s.seat)}</b> (${esc(s.code)}) ด่าน ${esc(lvName(s.current))}`).join(' · ')}</p>` : ''}
    <h2>ความคืบหน้ารายคน (${S.length} คน)</h2>
    <p class="note">ระบบไม่เก็บชื่อ จับคู่รหัส/เลขที่กับชื่อนักเรียนในรายชื่อของครูเอง · ด่านที่เปิดอยู่ = ด่านที่กำลังเล่นตอนนี้ · ไกลสุด = ด่านที่ปลดล็อกไกลที่สุด · จุดเขียว = ออนไลน์ภายใน 3 นาที</p>
    <div class="tbl"><table><tr><th>ชั้น</th><th>เลขที่</th><th>รหัส</th><th>ด่านที่เปิดอยู่</th><th>ไกลสุด</th><th>ดาว</th>
    ${cps.map(c => `<th>เช็กพอยต์ ${c}</th>`).join('')}<th>พิมพ์ไป</th><th>ล่าสุด</th><th></th></tr>${rows}</table></div>`;
}

function levels() {
  const L = data.levels;
  const ids = Object.keys(L).sort((a, b) => (ORDER[a] ?? 999) - (ORDER[b] ?? 999));
  if (!ids.length) return '<div class="empty">ยังไม่มีใครผ่านด่านไหน</div>';
  const maxMs = Math.max(...ids.map(i => L[i].median_ms || 0), 1);
  const slow = [...ids].filter(i => L[i].median_ms).sort((a, b) => L[b].median_ms - L[a].median_ms).slice(0, 5);
  return `<h2>ด่านที่ใช้เวลานานที่สุด</h2><p class="note">${slow.map(i => `<b>${esc(i)}</b> ${esc(TITLE[i] || '')} (${mins(L[i].median_ms)})`).join(' · ') || '-'}</p>
    <h2>ทุกด่าน</h2><p class="note">เวลา/จำนวนครั้ง = ค่ามัธยฐานของคนที่ผ่าน · ใช้คำใบ้ = % ที่กดคำใบ้อย่างน้อยขั้นเดียว · ดูเฉลย = % ที่ใช้คำใบ้ขั้น 3</p>
    <div class="tbl"><table><tr><th>ด่าน</th><th>ชื่อด่าน</th><th>ผ่านแล้ว</th><th>ติดอยู่ตอนนี้</th><th>เวลาที่ใช้</th><th>พิมพ์กี่ครั้ง</th><th>ใช้คำใบ้</th><th>ดูเฉลย</th><th>ดาวเฉลี่ย</th></tr>
    ${ids.map(i => { const x = L[i]; return `<tr><td>${esc(i)}</td><td>${esc(TITLE[i] || '')}</td><td>${x.passed || 0}</td>
      <td>${x.stuck_now ? `<span class="tag red">${x.stuck_now}</span>` : '-'}</td>
      <td>${bar((x.median_ms || 0) / maxMs, mins(x.median_ms))}</td><td>${x.median_attempts ?? '-'}</td>
      <td>${pct(x.hint_rate)}</td><td>${pct(x.answer_rate)}</td><td>${x.stars ?? '-'}</td></tr>`; }).join('')}</table></div>`;
}

function errors() {
  const E = data.errors;
  if (!E.length) return '<div class="empty">ยังไม่มี error</div>';
  const max = E[0].n;
  return `<h2>error ที่เจอบ่อยที่สุดของห้อง</h2><p class="note">นับจากทุกคำสั่งที่พิมพ์ แยกตามชนิดของ error และเฟส (ชื่อไฟล์ในข้อความถูกแทนด้วย '…')</p>
    <div class="tbl"><table><tr><th>error</th><th>เฟส</th><th>จำนวนครั้ง</th></tr>
    ${E.map(e => `<tr><td class="mono">${esc(e.kind)}</td><td>${esc(phaseName(e.phase))}</td><td>${bar(e.n / max, e.n)}</td></tr>`).join('')}</table></div>`;
}

function thai() {
  const T = data.untranslated;
  if (!T.length) return '<div class="empty">ยังไม่มีประโยคที่น้องล่ามแปลไม่ออก</div>';
  return `<h2>ประโยคภาษาไทยที่น้องล่ามแปลเป็นคำสั่งไม่ได้</h2><p class="note">ใช้ดูว่านักเรียน "คิดคำสั่ง" เป็นภาษาไทยยังไง และเป็นข้อมูลวิจัย (ประโยคที่พิมพ์บ่อย)</p>
    <div class="tbl"><table><tr><th>ประโยค</th><th>ครั้ง</th><th>ด่าน</th><th>ล่าสุด</th></tr>
    ${T.map(t => `<tr><td class="wrap">${esc(t.text)}</td><td>${t.n}</td><td>${esc(t.levels.join(', '))}</td><td class="muted">${ago(t.last, data.now)}</td></tr>`).join('')}</table></div>`;
}

function quiz() {
  const Q = data.quiz;
  const cps = Object.keys(CHECKPOINTS);
  const byId = Object.fromEntries(Object.values(CHECKPOINTS).flatMap(c => c.bank.map(b => [b.id, b])));
  return `<h2>แบบทดสอบเช็กพอยต์</h2><p class="note">5 ข้อต่อรอบ สุ่มจากคลังข้อสอบ ผ่านที่ 4/5 (80%) · ค่าเฉลี่ยใช้คิด E1 ได้ ·
    "ตอบถูก" รายข้อ = ค่าความยาก p (ข้อที่ตอบถูกน้อยอยู่บนสุด)</p>
    <div class="cards">${cps.map(c => { const q = Q[c]; return `<div class="card"><div class="lbl">${esc(CHECKPOINTS[c].title)}</div>
      ${q ? `<div class="big">${pct(q.avg)}</div><div class="lbl">คะแนนเฉลี่ยทุกรอบ · ผ่านแล้ว ${q.passed_students}/${q.students} คน · ${q.attempts} รอบ</div>` : '<div class="lbl">ยังไม่มีใครทำ</div>'}</div>`; }).join('')}</div>
    ${cps.filter(c => Q[c]).map(c => `<h2>${esc(CHECKPOINTS[c].title)}: รายข้อ</h2>
      <div class="tbl"><table><tr><th>ข้อ</th><th>คำถาม</th><th>ตอบ</th><th>ตอบถูก (p)</th></tr>
      ${Q[c].items.map(it => `<tr><td>${esc(it.id)}</td><td class="wrap">${esc(it.q)}${byId[it.id]?.code ? `<br><code>${esc(byId[it.id].code)}</code>` : ''}</td>
        <td>${it.n}</td><td>${bar(it.right / Math.max(1, it.n), `${pct(it.right / Math.max(1, it.n))} (${it.right}/${it.n})`)}</td></tr>`).join('')}</table></div>`).join('')}`;
}

function research() {
  const M = data.metrics;
  const row = (obj, label, n) => Object.entries(obj).map(([ph, x]) => `<tr><td>${esc(phaseName(ph))}</td><td>${bar(x.rate)}</td><td class="muted">${x[n]} ${label}</td></tr>`).join('');
  return `<h2>ตัวชี้วัดจาก log</h2><p class="note">ตามเอกสารออกแบบข้อ 8 · ข้อมูลดิบทั้งหมดดาวน์โหลดเป็น CSV ได้ที่มุมขวาบน</p>
    <div class="cards">
      <div class="card"><div class="lbl">อัตราเปิดสมุดถอดรหัส (เฟส 4 ขึ้นไป)</div><div class="big">${pct(M.decoder_open.rate)}</div>
        <div class="lbl">เปิด ${M.decoder_open.opened} ครั้ง จาก error ${M.decoder_open.errors} ครั้ง · ยิ่งต่ำ = อ่าน error เองได้มากขึ้น</div></div>
      <div class="card"><div class="lbl">อัตราดูก่อนลบ</div><div class="big">${pct(M.look_before_delete.rate)}</div>
        <div class="lbl">จาก ${M.look_before_delete.levels} ด่านที่มีการลบ: ดู (ls/cat/find/พรีวิว) ก่อนสั่งลบ</div></div>
    </div>
    <h2>อัตรา error ซ้ำ (Becker)</h2><p class="note">error ชนิดเดิมซ้ำติดกันในด่านเดียว ÷ error ทั้งหมด · ถ้าลดลงตามเฟส แปลว่าอ่าน error แล้วแก้ได้จริง</p>
    <div class="tbl"><table><tr><th>เฟส</th><th>อัตรา</th><th></th></tr>${row(M.repeat_error, 'error', 'errors') || '<tr><td colspan="3" class="muted">ยังไม่มีข้อมูล</td></tr>'}</table></div>
    <h2>อัตราพึ่งน้องล่าม</h2><p class="note">% ของสิ่งที่พิมพ์ในเฟส 1-3 ที่น้องล่ามต้องแปลหรือแก้ให้ · ถ้าลดลง แปลว่าตัวช่วยค่อยๆ หายไปได้จริง</p>
    <div class="tbl"><table><tr><th>เฟส</th><th>อัตรา</th><th></th></tr>${row(M.ai_reliance, 'ครั้ง', 'inputs') || '<tr><td colspan="3" class="muted">ยังไม่มีข้อมูล</td></tr>'}</table></div>`;
}

auth();
