// Teacher dashboard (design doc: "Dashboard ครู"). Pages (URL hash, so Back works):
//   #live      the classroom right now: one box per student, stuck ones first (the teacher is hint #4)
//   #people    everyone's progress; click a name -> #s/<code>, that student's own page
//   #stars #log #levels #errors #thai #quiz #research   class-wide views
// Any table header with an arrow sorts; the search box in the header filters students everywhere.
import { LEVELS, PHASE_ORDER, phaseLabel } from './levels.js';
import { CHECKPOINTS } from './quiz.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (path, body) => fetch('api/teacher/' + path, body ? {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
} : {}).then(async r => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

const ORDER = Object.fromEntries(LEVELS.map((l, i) => [l.id, i]));
const TITLE = Object.fromEntries(LEVELS.map(l => [l.id, l.title]));
const MAX_STARS = LEVELS.length * 3;
const CPS = Object.keys(CHECKPOINTS);
const lvName = id => id?.startsWith('CP') ? `เช็กพอยต์ ${id.slice(2)}` : id || '-';
const lvFull = id => id?.startsWith('CP') ? lvName(id) : id ? `${id} ${TITLE[id] || ''}` : '-';
const mins = ms => ms == null ? '-' : ms < 60000 ? `${Math.round(ms / 1000)} วิ` : ms < 3600000 ? `${Math.round(ms / 60000)} นาที`
  : `${Math.floor(ms / 3600000)} ชม. ${Math.round(ms % 3600000 / 60000)} นาที`;
const ago = (t, now) => !t ? '-' : now - t < 60000 ? 'เมื่อกี้' : now - t < 3600000 ? `${Math.floor((now - t) / 60000)} นาทีก่อน` :
  now - t < 86400000 ? `${Math.floor((now - t) / 3600000)} ชม.ก่อน` : new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
const date = t => t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const pct = x => x == null ? '-' : Math.round(x * 100) + '%';
const bar = (x, label) => `<div class="bar"><i style="width:${Math.round((x || 0) * 100)}%"></i><span>${esc(label ?? pct(x))}</span></div>`;
const phaseName = ph => ph == null ? '-' : phaseLabel(/^\d$/.test(ph) ? +ph : ph);
const starStr = n => `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></span>`;

let data = null;          // /overview
let stu = null;           // /student for the page that's open
let query = '';
const sortBy = {};        // table key -> { i, dir }

// ---------- dialog (instead of the browser's alert / confirm / prompt) ----------
function modal({ text, input = false, ok = 'ตกลง', cancel = 'ยกเลิก', danger = false, check }) {
  const d = $('#dlg'), inp = $('#dlgin'), err = $('#dlgerr'), f = d.querySelector('form');
  $('#dlgmsg').textContent = text;
  inp.hidden = !input; inp.value = ''; err.textContent = '';
  $('#dlgok').textContent = ok;
  $('#dlgok').className = 'btn ' + (danger ? 'danger' : 'primary');
  $('#dlgcancel').hidden = cancel == null;
  $('#dlgcancel').textContent = cancel || '';
  return new Promise(res => {
    const done = v => { f.onsubmit = null; $('#dlgcancel').onclick = null; d.onclose = null; if (d.open) d.close(); res(v); };
    f.onsubmit = e => {
      e.preventDefault();
      const v = input ? inp.value : true;
      const bad = check?.(v);
      if (bad) { err.textContent = bad; return; }
      done(v);
    };
    $('#dlgcancel').onclick = () => done(null);
    d.onclose = () => done(null);   // Esc
    d.showModal();
    (input ? inp : $('#dlgok')).focus();
  });
}

// ---------- sign in ----------
async function auth() {
  const st = await fetch('api/teacher/status').then(r => r.json()).catch(() => null);
  const box = $('#auth'), f = box.querySelector('form');
  if (!st) {   // the web version (GitHub Pages) has no server behind it
    box.hidden = false;
    $('#authmsg').textContent = 'เวอร์ชันออนไลน์ไม่มีหน้าครู ต้องรัน lamshell บนเครื่อง';
    f.querySelectorAll('input, button').forEach(el => { el.hidden = true; });
    return;
  }
  if (st.in) return start();
  box.hidden = false;
  if (!st.set) {   // the password is only ever set in the terminal, on the teacher's machine
    $('#authmsg').innerHTML = 'ยังไม่ได้ตั้งรหัสผ่านครู<br>รัน <code>lamshell --setup</code> ที่เครื่องเซิร์ฟเวอร์';
    f.pw.hidden = true;
    f.querySelector('button').hidden = true;
    return;
  }
  $('#authmsg').textContent = '';
  f.pw.focus();
  f.onsubmit = async e => {
    e.preventDefault();
    const r = await api('login', { password: f.pw.value });
    if (!r.ok) { f.querySelector('.err').textContent = r.data.error || 'เข้าสู่ระบบไม่ได้'; return; }
    box.hidden = true;
    start();
  };
}

function start() {
  $('#app').hidden = false;
  $('#logout').onclick = async () => { await api('logout', {}); location.reload(); };
  $('#search').oninput = e => { query = e.target.value.trim().toLowerCase(); render(); };
  window.addEventListener('hashchange', () => { stu = null; logRows = []; window.scrollTo(0, 0); tick(true); });
  document.addEventListener('fullscreenchange', () => document.body.classList.toggle('present', !!document.fullscreenElement));
  $('#view').addEventListener('click', onViewClick);
  tick(true);
}

const route = () => {
  const h = decodeURIComponent(location.hash.slice(1)) || 'live';
  return h.startsWith('s/') ? { page: 'student', code: h.slice(2) } : { page: h };
};

// Refresh: every 5 s on the live screen, 10 s elsewhere.
let timer = null;
async function tick(force = false) {
  clearTimeout(timer);
  const r = route();
  const [o, s] = await Promise.all([api('overview'), r.page === 'student' ? api('student?code=' + encodeURIComponent(r.code)) : null]);
  if (o.status === 401) return location.reload();
  if (o.ok) data = o.data;
  if (s) stu = s.ok ? s.data : { missing: true };
  $('#updated').textContent = data ? 'อัปเดต ' + new Date(data.now).toLocaleTimeString('th-TH') : '';
  // Don't redraw under the teacher while they're selecting text, using a box on the page, or in a dialog.
  const busy = getSelection().toString() || $('#dlg').open || document.activeElement?.closest?.('#view') && document.activeElement.matches('input, select');
  if (force || !busy) render();
  timer = setTimeout(tick, r.page === 'live' ? 5000 : 10000);
}

function render() {
  if (!data) return;
  const r = route();
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on',
    a.getAttribute('href') === '#' + r.page || (r.page === 'student' && a.getAttribute('href') === '#people')));
  if (r.page === 'log') return renderLog();
  const pages = { live, people, stars, levels, errors, thai, quiz, research, student };
  $('#view').innerHTML = (pages[r.page] || live)();
  if (r.page === 'student') loadStudentLog();
}

function onViewClick(e) {
  const th = e.target.closest('th.sortable');
  if (th) {
    const k = th.dataset.t, i = +th.dataset.i, cur = sortBy[k];
    sortBy[k] = { i, dir: cur?.i === i ? -cur.dir : (th.dataset.d === 'asc' ? 1 : -1) };
    return render();
  }
  const tr = e.target.closest('tr[data-go]');
  if (tr && !e.target.closest('a, button')) location.hash = tr.dataset.go;
  const b = e.target.closest('button[data-act]');
  if (b) actions[b.dataset.act]?.(b.dataset);
}

// ---------- helpers ----------
const shown = S => !query ? S : S.filter(s => s.name.toLowerCase().includes(query) || s.username.toLowerCase().includes(query));
const nameLink = s => `<a href="#s/${esc(s.code)}">${esc(s.name)}</a> <span class="muted">@${esc(s.username)}</span>`;
const noMatch = () => `<div class="empty">ไม่พบนักเรียนที่ชื่อตรงกับ "${esc(query)}"</div>`;

// A sortable table. cols: [{ h, c: row -> html, v: row -> sort value, cls, d: 'asc' first click }], opts.row: row -> attrs
function table(key, cols, rows, opts = {}) {
  const s = sortBy[key];
  let rs = rows;
  if (s && cols[s.i]?.v) {
    const v = cols[s.i].v;
    rs = [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th')) * s.dir;
    });
  }
  const head = cols.map((c, i) => `<th class="${c.v ? 'sortable' : ''} ${c.cls || ''}" ${c.t ? `title="${esc(c.t)}"` : ''} data-t="${key}" data-i="${i}" data-d="${c.d || ''}">${c.h}${
    s?.i === i ? `<span class="arrow">${s.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('');
  return `<div class="tbl"><table><tr>${head}</tr>${rs.map(r => `<tr ${opts.row ? opts.row(r) : ''}>${
    cols.map(c => `<td class="${c.cls || ''}">${c.c(r)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

const stats = items => `<dl class="stats">${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

// ---------- live classroom ----------
const SLOW_MS = 3 * 60 * 1000;
const SEAT_TIP = { stuck: 'อยู่ด่านนี้เกิน 5 นาที', slow: 'อยู่ด่านนี้เกิน 3 นาที', ok: 'ออนไลน์', off: 'ออฟไลน์' };
function seatState(s) {
  if (s.stuck) return 'stuck';
  if (!s.online) return 'off';
  return s.on_level_ms > SLOW_MS ? 'slow' : 'ok';
}

function live() {
  const all = data.students;
  if (!all.length) return '<div class="empty">ยังไม่มีนักเรียน</div>';
  const rank = { stuck: 0, slow: 1, ok: 2, off: 3 };
  const S = shown(all).map(s => ({ ...s, st: seatState(s) })).sort((a, b) =>
    rank[a.st] - rank[b.st] || (a.st === 'off' ? (b.last || 0) - (a.last || 0) : (b.on_level_ms || 0) - (a.on_level_ms || 0)));
  const on = all.filter(s => s.online);
  const stuck = all.filter(s => s.stuck).length;
  const where = {};
  for (const s of on) if (s.current) where[s.current] = (where[s.current] || 0) + 1;
  const busiest = Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const seat = s => {
    const li = s.last_input;
    const state = s.st === 'off' ? ago(s.last, data.now) : s.current ? mins(s.on_level_ms) : '';
    const cmd = !li ? '<div class="cmd"><span class="p">-</span></div>'
      : `<div class="cmd"><span class="p">$</span> ${esc(li.said)}${li.ran && li.ran !== li.said ? ` <span class="p">→ ${esc(li.ran)}</span>` : ''}</div>` +
        (li.untranslated ? '<div class="foot">แปลไม่ได้</div>' : li.err ? `<div class="errline" title="${esc(li.err)}">${esc(li.err)}</div>` : '');
    return `<a class="seat ${s.st}" title="${esc(SEAT_TIP[s.st])}" href="#s/${esc(s.code)}">
      <div class="top"><span class="name">${esc(s.name)}</span><span class="state">${state}</span></div>
      <div class="lv">${s.current ? `<b>${esc(lvName(s.current))}</b> ${esc(TITLE[s.current] || '')}` : '<span class="muted">-</span>'}</div>
      ${cmd}
      <div class="foot">★ ${s.stars}${s.hints_now ? `&emsp;คำใบ้ ${s.hints_now}/3` : ''}</div>
    </a>`;
  };
  return `<div class="livebar">
      <span class="sum">ออนไลน์ <b>${on.length}</b>/${all.length} คน</span>
      ${stuck ? `<span class="sum"><span class="tag red">ติด ${stuck} คน</span></span>` : ''}
      <button class="btn" data-act="present">${document.fullscreenElement ? 'ออกจากเต็มจอ' : 'เต็มจอ'}</button>
    </div>
    ${S.length ? `<div class="live">${S.map(seat).join('')}</div>` : noMatch()}`;
}

const actions = {
  present() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => document.body.classList.toggle('present'));
  },
  async pw(d) {
    const pw = await modal({ text: `รหัสผ่านใหม่ของ ${d.name}`, input: true,
      ok: 'ตั้งรหัส', check: v => v.length < 4 ? 'อย่างน้อย 4 ตัว' : null });
    if (pw == null) return;
    const r = await api('password', { code: d.code, password: pw });
    await modal({ text: r.ok ? 'ตั้งรหัสแล้ว' : r.data.error || 'ตั้งรหัสไม่สำเร็จ', cancel: null });
  },
  async del(d) {
    const ok = await modal({ text: `ลบบัญชี ${d.name} (@${d.user})\nข้อมูลทั้งหมดของคนนี้จะหายไป`,
      ok: 'ลบบัญชี', danger: true });
    if (!ok) return;
    await api('delete', { code: d.code });
    location.hash = '#people';
  },
  more() { loadStudentLog(true); },
};

// ---------- everyone ----------
function people() {
  const all = data.students;
  if (!all.length) return '<div class="empty">ยังไม่มีนักเรียน</div>';
  const S = shown(all);
  const stuck = all.filter(s => s.stuck);
  const cols = [
    { h: 'ชื่อ', c: s => `<span class="dot ${s.online ? 'on' : ''}"></span>${nameLink(s)}`, v: s => s.name, d: 'asc' },
    { h: 'ด่านตอนนี้', c: s => `${esc(lvName(s.current))}${s.stuck ? ` <span class="tag red">ติด ${mins(s.on_level_ms)}</span>` : s.online && s.on_level_ms != null ? ` <span class="muted">${mins(s.on_level_ms)}</span>` : ''}`,
      v: s => s.current ? ORDER[s.current] ?? 900 + +s.current.slice(2) : null },
    { h: 'ไกลสุด', t: 'ด่านที่ปลดล็อกไกลที่สุด', c: s => esc(s.front || '-'), v: s => ORDER[s.front] },
    { h: 'ดาว', c: s => `${s.stars}<span class="muted">/${MAX_STARS}</span>`, v: s => s.stars, cls: 'num' },
    ...CPS.map(c => ({ h: `CP${c}`, t: CHECKPOINTS[c].title, v: s => s.quiz[c]?.best,
      c: s => { const q = s.quiz[c]; return q ? `<span class="tag ${q.passed ? 'green' : 'amber'}">${q.best}/${q.total}</span> <span class="muted">${q.tries} รอบ</span>` : '<span class="muted">-</span>'; } })),
    { h: 'พิมพ์ไป', c: s => s.inputs, v: s => s.inputs, cls: 'num' },
    { h: 'ล่าสุด', c: s => `<span class="muted">${ago(s.last, data.now)}</span>`, v: s => s.last },
  ];
  return `${stuck.length ? `<div class="alert"><b>ติด ${stuck.length} คน</b>&emsp;${stuck.map(s => `<a href="#s/${esc(s.code)}">${esc(s.name)}</a> (${esc(lvName(s.current))})`).join(' · ')}</div>` : ''}
    <h2>นักเรียน ${all.length} คน</h2>
    ${S.length ? table('people', cols, S, { row: s => `class="go ${s.stuck ? 'stuck' : ''}" data-go="#s/${esc(s.code)}"` }) : noMatch()}`;
}

// Who got how many stars on which level: one row per student, one column per level, phase by phase, with the
// phase's checkpoint quiz after its levels.
function stars() {
  const all = data.students;
  if (!all.length) return '<div class="empty">ยังไม่มีนักเรียน</div>';
  const S = shown(all);
  if (!S.length) return noMatch();
  const cols = PHASE_ORDER.map(ph => ({ ph, items: [...LEVELS.filter(l => l.phase === ph).map(l => ({ id: l.id, title: l.title })),
    ...(CHECKPOINTS[ph] ? [{ cp: String(ph) }] : [])] }));
  const cell = (s, it) => {
    if (it.cp) {
      const q = s.quiz[it.cp];
      return `<td class="cpc">${q ? `<span class="tag ${q.passed ? 'green' : 'amber'}">${q.best}/5</span>` : ''}</td>`;
    }
    const n = s.level_stars?.[it.id] || 0;
    return `<td class="st s${n}" title="${esc(it.id + ' ' + it.title)}">${n ? '★'.repeat(n) : s.front === it.id ? '▶' : ''}</td>`;
  };
  return `<h2>คะแนน</h2>
    <div class="tbl grid"><table>
    <tr><th rowspan="2" class="sticky">ชื่อ</th><th rowspan="2">รวม</th>${cols.map(c => `<th colspan="${c.items.length}" class="ph">${esc(phaseLabel(c.ph))}</th>`).join('')}</tr>
    <tr>${cols.map(c => c.items.map(it => `<th class="lvh">${it.cp ? 'CP' + it.cp : esc(it.id)}</th>`).join('')).join('')}</tr>
    ${S.map(s => `<tr><td class="sticky">${nameLink(s)}</td><td><b>${s.stars}</b><span class="muted">/${MAX_STARS}</span></td>
      ${cols.map(c => c.items.map(it => cell(s, it)).join('')).join('')}</tr>`).join('')}
    </table></div>`;
}

// ---------- one student ----------
function student() {
  if (!stu) return '<div class="empty">กำลังโหลด...</div>';
  if (stu.missing) return '<a class="back" href="#people">← กลับ</a><div class="empty">ไม่พบนักเรียนคนนี้</div>';
  const s = stu.student, T = stu.totals, L = stu.levels, now = stu.now;
  const o = data.students.find(x => x.code === s.code) || {};
  const passed = LEVELS.filter(l => (s.level_stars[l.id] || 0) > 0).length;
  const frontIdx = ORDER[s.front] ?? -1;
  const bestQuiz = {};
  for (const q of stu.quiz) {
    const b = bestQuiz[q.cp] ??= { best: 0, total: q.total, tries: 0, passed: false };
    b.best = Math.max(b.best, q.score); b.tries++; b.passed ||= q.passed;
  }
  const status = o.stuck ? `<span class="tag red">ติดด่าน ${esc(lvName(o.current))} มา ${mins(o.on_level_ms)}</span>`
    : o.online ? `<span class="on-txt"><span class="dot on"></span>ออนไลน์ · อยู่ด่าน ${esc(lvName(o.current))}</span>` : `<span class="muted">ออฟไลน์</span>`;

  // per level, in game order, grouped by phase, with each phase's checkpoint after it
  const lvRows = PHASE_ORDER.map(ph => {
    const rows = LEVELS.filter(l => l.phase === ph).map(l => {
      const x = L[l.id], n = s.level_stars[l.id] || 0, fp = x?.first_pass, i = ORDER[l.id];
      const st = n ? `<span class="tag green">ผ่าน</span>` : l.id === o.current && o.online ? '<span class="tag amber">กำลังเล่น</span>'
        : x?.opens ? '<span class="tag amber">ยังไม่ผ่าน</span>' : '';
      return `<tr class="${!x && !n ? 'dim' : ''}"><td>${esc(l.id)}</td><td>${esc(l.title)}</td><td>${n ? starStr(n) : ''}</td><td>${st}</td>
        <td class="num">${x?.time_ms ? mins(x.time_ms) : '-'}</td><td class="num">${fp?.attempts ?? '-'}</td><td class="num">${fp ? mins(fp.ms) : '-'}</td>
        <td class="num">${x?.hints ? x.hints + '/3' : '-'}</td><td class="num">${x?.errors || '-'}</td><td class="num">${x?.ai || '-'}</td></tr>`;
    }).join('');
    const cp = CHECKPOINTS[ph] && bestQuiz[String(ph)];
    const cpRow = CHECKPOINTS[ph] ? `<tr class="${cp ? '' : 'dim'}"><td>CP${ph}</td><td>${esc(CHECKPOINTS[ph].title)}</td><td></td>
      <td>${cp ? `<span class="tag ${cp.passed ? 'green' : 'amber'}">${cp.best}/${cp.total}</span> <span class="muted">${cp.tries} รอบ</span>` : ''}</td><td colspan="6"></td></tr>` : '';
    return `<tr class="group"><td colspan="10">${esc(phaseLabel(ph))}</td></tr>${rows}${cpRow}`;
  }).join('');

  const errCols = [
    { h: 'error', c: e => `<span class="mono">${esc(e.kind)}</span>`, v: e => e.kind, d: 'asc' },
    { h: 'ครั้ง', c: e => e.n, v: e => e.n, cls: 'num' },
    { h: 'ด่าน', c: e => esc(e.levels.join(', ')) },
    { h: 'ตัวอย่างคำสั่ง', c: e => `<code>${esc(e.example)}</code>`, cls: 'wrap' },
  ];
  const thaiCols = [
    { h: 'เวลา', c: t => `<span class="muted">${date(t.ts)}</span>`, v: t => t.ts },
    { h: 'ด่าน', c: t => esc(t.level || '-'), v: t => ORDER[t.level] },
    { h: 'พิมพ์ว่า', c: t => esc(t.said), cls: 'wrap' },
    { h: 'แปลเป็น', c: t => t.untranslated ? '<span class="tag amber">แปลไม่ได้</span>' : `<code>${esc(t.ran)}</code>${t.err ? `<div class="errline">${esc(t.err)}</div>` : ''}`, cls: 'wrap' },
  ];
  const attempts = stu.quiz.map(q => `<div class="attempt"><div class="ah"><b>${esc(CHECKPOINTS[q.cp]?.title || 'เช็กพอยต์ ' + q.cp)}</b>
      <span class="tag ${q.passed ? 'green' : 'amber'}">${q.score}/${q.total} ${q.passed ? 'ผ่าน' : 'ไม่ผ่าน'}</span><span class="muted">${date(q.ts)}</span></div>
      <ol>${q.answers.map(a => `<li><span class="${a.ok ? 'ok' : 'no'}">${a.ok ? '✓' : '✗'}</span> ${esc(a.q)}${a.chosen != null ? ` <span class="muted">ตอบ: ${esc(a.chosen)}</span>` : ''}</li>`).join('')}</ol></div>`).join('');

  return `<a class="back" href="#people">← กลับ</a>
    <div class="shead"><h1>${esc(s.name)}</h1><span class="muted">@${esc(s.username)}</span> ${status}
      <div class="actions"><button class="btn" data-act="pw" data-code="${esc(s.code)}" data-name="${esc(s.name)}">ตั้งรหัสผ่านใหม่</button>
      <button class="btn quiet" data-act="del" data-code="${esc(s.code)}" data-name="${esc(s.name)}" data-user="${esc(s.username)}">ลบบัญชี</button></div></div>
    <div class="meta">สมัคร ${date(s.created)}&emsp;เล่นล่าสุด ${ago(o.last || s.last_seen, now)}</div>
    ${stats([
      ['ดาว', `${s.stars}<small>/${MAX_STARS}</small>`],
      ['ผ่านแล้ว', `${passed}<small>/${LEVELS.length} ด่าน</small>`],
      ['เวลาเล่น', mins(T.play_ms)],
      ['พิมพ์ไป', `${T.inputs}<small> ครั้ง</small>`],
      ['แปลให้', `${T.ai}<small> ครั้ง</small>`],
      ['ใช้คำใบ้', `${T.hints}<small> ครั้ง</small>`],
      ['เปิดสมุด', `${T.decoder}<small> ครั้ง</small>`],
      ['อ่าน Piki', `${T.piki}<small> หน้า</small>`],
    ])}
    <div class="toc"><a href="javascript:void 0" data-to="st-lv">รายด่าน</a><a href="javascript:void 0" data-to="st-err">error (${stu.errors.length})</a>
      <a href="javascript:void 0" data-to="st-thai">ภาษาไทย (${stu.thai.length})</a><a href="javascript:void 0" data-to="st-quiz">แบบทดสอบ (${stu.quiz.length})</a>
      <a href="javascript:void 0" data-to="st-log">ประวัติ</a></div>

    <h2 id="st-lv">รายด่าน</h2>
    <div class="tbl"><table><tr><th>ด่าน</th><th>ชื่อด่าน</th><th>ดาว</th><th></th><th class="num" title="เวลาทั้งหมดในด่านนี้ ไม่นับช่วงที่หยุดเกิน 5 นาที">เวลาในด่าน</th><th class="num" title="ตอนผ่านครั้งแรก">พิมพ์</th><th class="num" title="ตอนผ่านครั้งแรก">ใช้เวลา</th>
      <th class="num" title="ขั้นสูงสุดที่เปิด (3 = ดูเฉลย)">คำใบ้</th><th class="num">error</th><th class="num" title="น้องล่ามแปลหรือแก้ให้">แปลให้</th></tr>${lvRows}</table></div>

    <h2 id="st-err">error ที่เจอบ่อย</h2>
    ${stu.errors.length ? table('s-err', errCols, stu.errors) : '<div class="empty">-</div>'}

    <h2 id="st-thai">ภาษาไทยที่พิมพ์</h2>
    ${stu.thai.length ? table('s-thai', thaiCols, stu.thai) : '<div class="empty">-</div>'}

    <h2 id="st-quiz">แบบทดสอบ</h2>
    ${attempts || '<div class="empty">-</div>'}

    <h2 id="st-log">ประวัติ</h2>
    <div id="stlog">${stLogCode === s.code ? stLogHtml() : '<div class="empty">กำลังโหลด...</div>'}</div>`;
}

// the toc links scroll inside the page (the hash is the route, so plain #anchors can't be used)
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-to]');
  if (a) { e.preventDefault(); document.getElementById(a.dataset.to)?.scrollIntoView({ behavior: 'smooth' }); }
});

let stLog = [], stLogCode = null, stLogFull = false;
const stLogHtml = () => logTable(stLog, false) + (stLogFull ? '<button class="btn" data-act="more">โหลดเก่ากว่านี้</button>' : '');
async function loadStudentLog(more = false) {
  const r = route();
  if (r.page !== 'student' || stu?.missing) return;
  const q = new URLSearchParams({ code: r.code });
  if (more && stLog.length) q.set('before', `${stLog.at(-1).ts}:${stLog.at(-1).id}`);
  const res = await api('log?' + q);
  if (!res.ok || route().code !== r.code) return;
  if (more) stLog = [...stLog, ...res.data.rows];
  else if (stLogCode !== r.code || stLog.length <= 300) stLog = res.data.rows;   // keep pages the teacher loaded
  else stLog = [...res.data.rows, ...stLog.filter(e => e.ts < res.data.rows.at(-1).ts)];
  stLogCode = r.code;
  stLogFull = res.data.rows.length >= 300;
  const box = $('#stlog');
  if (box) box.innerHTML = stLogHtml();
}

// ---------- log: everything students did, newest first ----------
function logText(e) {
  const d = e.d || {};
  switch (e.type) {
    case 'input': return `<code>${esc(d.said)}</code>` + (d.ran && d.ran !== d.said ? ` <span class="muted">→ น้องล่ามรัน</span> <code>${esc(d.ran)}</code>` : '') +
      (d.exit != null ? ` <span class="muted">[exit ${d.exit}]</span>` : '') + (d.err ? `<div class="errline">${esc(d.err)}</div>` : '');
    case 'untranslated': return `<code>${esc(d.said)}</code> <span class="tag amber">แปลไม่ได้</span>`;
    case 'level_start': return `เปิดด่าน${d.replay ? ' (เล่นซ้ำ)' : d.live === false ? ' (ย้อนเล่นด่านเก่า)' : ''}`;
    case 'pass': return `<span class="tag green">ผ่าน ${'★'.repeat(d.stars || 0)}</span> พิมพ์ ${d.attempts} ครั้ง · ${mins(d.ms)} · คำใบ้ ${d.hints || 0} ขั้น${d.decoder ? ' · เปิดสมุด' : ''}`;
    case 'hint': return `ใช้คำใบ้ขั้น ${d.step}`;
    case 'decoder': return 'เปิดสมุดถอดรหัส error';
    case 'lam_gone': return `<span class="tag red">ลบสมองน้องล่าม</span> <code>${esc(d.cmd)}</code> (${esc((d.lost || []).join(', '))})`;
    case 'game_over': return '<span class="tag red">GAME OVER</span> เริ่มเกมใหม่ตั้งแต่ต้น';
    case 'piki': return `อ่าน Piki หน้า <b>${esc(d.page)}</b>`;
    case 'preview_delete': return `ดูก่อนลบ ${d.n} รายการ → ${d.yes ? 'ยืนยันลบ' : 'ยกเลิก'}`;
    case 'quiz_start': return `เริ่มแบบทดสอบเช็กพอยต์ ${d.cp}`;
    case 'quiz': return `แบบทดสอบเช็กพอยต์ ${d.cp}: <b>${d.score}/${d.total}</b> <span class="tag ${d.passed ? 'green' : 'amber'}">${d.passed ? 'ผ่าน' : 'ไม่ผ่าน'}</span>`;
    default: return esc(e.type);
  }
}

function logTable(rows, withName) {
  if (!rows.length) return '<div class="empty">-</div>';
  const day = t => new Date(t).toLocaleDateString('th-TH', { dateStyle: 'medium' });
  const n = withName ? 4 : 3;
  let lastDay = '';
  return `<div class="tbl"><table><tr><th>เวลา</th>${withName ? '<th>ชื่อ</th>' : ''}<th>ด่าน</th><th>เกิดอะไรขึ้น</th></tr>
    ${rows.map(e => {
      const d = day(e.ts), sep = d !== lastDay ? `<tr class="daysep"><td colspan="${n}">${esc(d)}</td></tr>` : '';
      lastDay = d;
      return `${sep}<tr><td class="muted">${new Date(e.ts).toLocaleTimeString('th-TH')}</td>${withName ? `<td><a href="#s/${esc(e.code)}">${esc(e.name)}</a></td>` : ''}
        <td>${esc(e.level || (e.d?.cp ? 'เช็กพอยต์ ' + e.d.cp : '-'))}</td><td class="wrap">${logText(e)}</td></tr>`;
    }).join('')}</table></div>`;
}

let logFilter = { code: '', typed: false };
let logRows = [];
async function renderLog(more = false) {
  const q = new URLSearchParams();
  if (logFilter.code) q.set('code', logFilter.code);
  if (more && logRows.length) q.set('before', `${logRows.at(-1).ts}:${logRows.at(-1).id}`);
  const r = await api('log?' + q);
  if (!r.ok || route().page !== 'log') return;
  logRows = more ? [...logRows, ...r.data.rows] : r.data.rows;
  let rows = logFilter.typed ? logRows.filter(e => e.type === 'input' || e.type === 'untranslated') : logRows;
  if (query) rows = rows.filter(e => e.name.toLowerCase().includes(query) || (e.username || '').toLowerCase().includes(query));
  $('#view').innerHTML = `<h2>ประวัติ</h2>
    <div class="logbar"><select id="logwho"><option value="">ทุกคน</option>${data.students.map(s => `<option value="${esc(s.code)}" ${s.code === logFilter.code ? 'selected' : ''}>${esc(s.name)} (@${esc(s.username)})</option>`).join('')}</select>
      <label><input type="checkbox" id="logtyped" ${logFilter.typed ? 'checked' : ''}> เฉพาะสิ่งที่พิมพ์</label></div>
    ${logTable(rows, true)}${r.data.rows.length >= 300 ? '<button id="logmore" class="btn">โหลดเก่ากว่านี้</button>' : ''}`;
  $('#logwho').onchange = e => { logFilter.code = e.target.value; renderLog(); };
  $('#logtyped').onchange = e => { logFilter.typed = e.target.checked; renderLog(); };
  $('#logmore')?.addEventListener('click', () => renderLog(true));
}

// ---------- class-wide numbers ----------
function levels() {
  const L = data.levels;
  const ids = Object.keys(L);
  if (!ids.length) return '<div class="empty">-</div>';
  const maxMs = Math.max(...ids.map(i => L[i].median_ms || 0), 1);
  const rows = ids.map(id => ({ id, ...L[id] }));
  if (!sortBy.levels) sortBy.levels = { i: 0, dir: 1 };
  const cols = [
    { h: 'ด่าน', c: x => esc(x.id), v: x => ORDER[x.id] ?? 999, d: 'asc' },
    { h: 'ชื่อด่าน', c: x => esc(TITLE[x.id] || '') },
    { h: 'ผ่านแล้ว', c: x => x.passed || 0, v: x => x.passed || 0, cls: 'num' },
    { h: 'ติดอยู่', c: x => x.stuck_now ? `<span class="tag red">${x.stuck_now}</span>` : '-', v: x => x.stuck_now || 0 },
    { h: 'เวลา', t: 'ค่ามัธยฐานของคนที่ผ่าน', c: x => bar((x.median_ms || 0) / maxMs, mins(x.median_ms)), v: x => x.median_ms },
    { h: 'พิมพ์', t: 'ค่ามัธยฐานของคนที่ผ่าน', c: x => x.median_attempts ?? '-', v: x => x.median_attempts, cls: 'num' },
    { h: 'ใช้คำใบ้', t: '% ที่เปิดคำใบ้อย่างน้อย 1 ขั้น', c: x => pct(x.hint_rate), v: x => x.hint_rate, cls: 'num' },
    { h: 'ดูเฉลย', t: '% ที่เปิดคำใบ้ขั้น 3', c: x => pct(x.answer_rate), v: x => x.answer_rate, cls: 'num' },
    { h: 'ดาวเฉลี่ย', c: x => x.stars ?? '-', v: x => x.stars, cls: 'num' },
  ];
  return `<h2>ด่าน</h2>
    ${table('levels', cols, rows)}`;
}

function errors() {
  const E = data.errors;
  if (!E.length) return '<div class="empty">-</div>';
  const max = E[0].n;
  const cols = [
    { h: 'error', c: e => `<span class="mono">${esc(e.kind)}</span>`, v: e => e.kind, d: 'asc' },
    { h: 'เฟส', c: e => esc(phaseName(e.phase)), v: e => e.phase, d: 'asc' },
    { h: 'จำนวนครั้ง', c: e => bar(e.n / max, e.n), v: e => e.n },
  ];
  return `<h2>error</h2>
    ${table('errors', cols, E)}`;
}

function thai() {
  const T = data.untranslated;
  if (!T.length) return '<div class="empty">-</div>';
  const cols = [
    { h: 'ประโยค', c: t => esc(t.text), v: t => t.text, cls: 'wrap', d: 'asc' },
    { h: 'ครั้ง', c: t => t.n, v: t => t.n, cls: 'num' },
    { h: 'ด่าน', c: t => esc(t.levels.join(', ')) },
    { h: 'ล่าสุด', c: t => `<span class="muted">${ago(t.last, data.now)}</span>`, v: t => t.last },
  ];
  return `<h2>ประโยคที่แปลไม่ได้</h2>
    ${table('thai', cols, T)}`;
}

function quiz() {
  const Q = data.quiz;
  const byId = Object.fromEntries(Object.values(CHECKPOINTS).flatMap(c => c.bank.map(b => [b.id, b])));
  const itemCols = [
    { h: 'ข้อ', c: it => esc(it.id), v: it => it.id, d: 'asc' },
    { h: 'คำถาม', c: it => `${esc(it.q)}${byId[it.id]?.code ? `<br><code>${esc(byId[it.id].code)}</code>` : ''}`, cls: 'wrap' },
    { h: 'ตอบ', c: it => it.n, v: it => it.n, cls: 'num' },
    { h: 'ตอบถูก (p)', t: 'ค่าความยาก p', c: it => bar(it.right / Math.max(1, it.n), `${pct(it.right / Math.max(1, it.n))} (${it.right}/${it.n})`), v: it => it.right / Math.max(1, it.n), d: 'asc' },
  ];
  return `<h2 title="รอบละ 5 ข้อ สุ่มจากคลัง ผ่านที่ 4/5">แบบทดสอบ</h2>
    <div class="tbl"><table><tr><th>เช็กพอยต์</th><th class="num">เฉลี่ย</th><th class="num">ผ่าน</th><th class="num">รอบ</th></tr>
    ${CPS.map(c => { const q = Q[c]; return `<tr class="${q ? '' : 'dim'}"><td>${esc(CHECKPOINTS[c].title)}</td>${q
      ? `<td class="num">${pct(q.avg)}</td><td class="num">${q.passed_students}/${q.students} คน</td><td class="num">${q.attempts}</td>`
      : '<td colspan="3" class="muted">-</td>'}</tr>`; }).join('')}</table></div>
    ${CPS.filter(c => Q[c]).map(c => `<h2>${esc(CHECKPOINTS[c].title)}</h2>${table('quiz' + c, itemCols, Q[c].items)}`).join('')}`;
}

function research() {
  const M = data.metrics;
  const row = (obj, label, n) => Object.entries(obj).map(([ph, x]) => `<tr><td>${esc(phaseName(ph))}</td><td>${bar(x.rate)}</td><td class="muted">${x[n]} ${label}</td></tr>`).join('');
  return `<h2>ตัวชี้วัด</h2>
    ${stats([
      ['เปิดสมุดถอดรหัส (เฟส 4+)', `${pct(M.decoder_open.rate)} <small>${M.decoder_open.opened}/${M.decoder_open.errors}</small>`],
      ['ดูก่อนลบ', `${pct(M.look_before_delete.rate)} <small>${M.look_before_delete.levels} ด่าน</small>`],
    ])}
    <h2 title="error ชนิดเดิมซ้ำติดกันในด่านเดียว ÷ error ทั้งหมด">error ซ้ำ (Becker)</h2>
    <div class="tbl"><table><tr><th>เฟส</th><th>อัตรา</th><th></th></tr>${row(M.repeat_error, 'error', 'errors') || '<tr><td colspan="3" class="muted">-</td></tr>'}</table></div>
    <h2 title="% ของสิ่งที่พิมพ์ในเฟส 1-3 ที่น้องล่ามแปลหรือแก้ให้">พึ่งน้องล่าม</h2>
    <div class="tbl"><table><tr><th>เฟส</th><th>อัตรา</th><th></th></tr>${row(M.ai_reliance, 'ครั้ง', 'inputs') || '<tr><td colspan="3" class="muted">-</td></tr>'}</table></div>`;
}

auth();
