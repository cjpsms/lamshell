import { baseFS, sizeOf } from './vfs.js';
import { Shell } from './shell.js';
import { decode } from './decoder.js';
import { interpret, aiStatus, hasThai, fromKedmanee } from './translate.js';
import { LEVELS, PHASES } from './levels.js';

const WHO = {
  lam: ['น้องล่าม', '🐧'], kru: ['ครูสมใจ', '👩‍🏫'], root: ['พี่รูท', '🧑‍💻'],
  lung: ['ลุงภารโรงเอก', '🧹'], virus: ['ไวรัสมั่วซั่ว', '👾'],
};
const KNOWN = new Set(Object.keys(Shell.prototype.cmds));
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- progress (per-browser convenience) ----------
const SAVE_KEY = 'lamshell.progress.v1';
let progress = { unlocked: 0, stars: {}, cards: [] };
try { Object.assign(progress, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch {} };

// ---------- terminal ----------
const lines = $('#lines');
const input = $('#cmd');
const term = $('#term');
let pending = null;      // { resolve, text, hidden } while a program asks for input
let busy = false;
const history = [];
let histPos = 0;

function scroll() { term.scrollTop = term.scrollHeight; }

function ansi(text) {
  let out = '', open = false;
  const parts = text.split(/\x1b\[([0-9;]*)m/);
  parts.forEach((p, i) => {
    if (i % 2 === 0) { out += esc(p); return; }
    if (open) { out += '</span>'; open = false; }
    const cls = { '1;34': 'a-blue', '1;31': 'a-red', '32': 'a-green', '90': 'a-gray' }[p];
    if (cls) { out += `<span class="${cls}">`; open = true; }
  });
  return out + (open ? '</span>' : '');
}

function add(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'ln ' + cls;
  d.innerHTML = html;
  lines.appendChild(d);
  scroll();
  return d;
}

function write(kind, s) {
  const text = s.endsWith('\n') ? s.slice(0, -1) : s;
  add(ansi(text), kind === 'err' ? 'err' : 'out');
}

function say(who, text) {
  const [name, icon] = WHO[who];
  add(`<span class="av">${icon}</span><div class="bubble"><b>${name}</b>${esc(text)}</div>`, 'say who-' + who);
}
function sys(text, cls = '') { add(esc(text), 'sys ' + cls); }

const io = {
  write,
  clear: () => { lines.innerHTML = ''; },
  prompt: (text, opts = {}) => new Promise(resolve => {
    pending = { resolve, text, hidden: !!opts.hidden };
    setPrompt();
    input.focus();
  }),
};

function setPrompt() {
  if (pending) {
    $('#pcwd').textContent = '';
    $('#plabel').textContent = pending.text;
    input.type = pending.hidden ? 'password' : 'text';
  } else {
    $('#pcwd').textContent = L ? L.sh.pretty() : '';
    $('#plabel').textContent = L ? PHASES[L.lv.phase].prompt : '$';
    input.type = 'text';
  }
  input.placeholder = pending ? '' : L && L.lv.phase === 1 ? 'พิมพ์ภาษาไทยได้เลย…' : L && L.lv.phase === 2 ? 'ภาษาอังกฤษง่ายๆ…' : '';
}

input.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const v = input.value;
    input.value = '';
    submit(v);
  } else if (e.key === 'ArrowUp' && !pending) {
    if (histPos > 0) { histPos--; input.value = history[histPos]; e.preventDefault(); }
  } else if (e.key === 'ArrowDown' && !pending) {
    if (histPos < history.length) { histPos++; input.value = history[histPos] || ''; e.preventDefault(); }
  } else if (e.key === 'c' && e.ctrlKey && pending) {
    add(esc(pending.text) + '^C', 'out');
    const p = pending; pending = null; setPrompt(); p.resolve(null);
  }
});
term.addEventListener('click', () => { if (!getSelection().toString()) input.focus(); });

async function submit(v) {
  if (pending) {
    add(esc(pending.text) + (pending.hidden ? '' : esc(v)), 'out');
    const p = pending; pending = null; setPrompt(); p.resolve(v);
    return;
  }
  if (busy || !L) return;
  const text = v.trim();
  add(`<span class="pcwd">${esc(L.sh.pretty())}</span> <span class="plabel">${esc(PHASES[L.lv.phase].prompt)}</span> ${esc(v)}`, 'echo');
  if (!text) return;
  history.push(text); histPos = history.length;
  busy = true;
  input.classList.add('busy');
  try { await handle(text); }
  catch (e) { console.error(e); sys('เกมสะดุด: ' + e.message, 'fail'); }
  finally { busy = false; input.classList.remove('busy'); setPrompt(); input.focus(); }
}

// ---------- level state ----------
let L = null;

function treeFor() {
  const out = [];
  const walk = (node, depth, indent) => {
    for (const [k, n] of Object.entries(node.kids)) {
      if (out.length > 90) return;
      const big = n.t === 'f' && sizeOf(n) >= 1_000_000 ? ` (${Math.round(sizeOf(n) / 1048576)}M)` : '';
      out.push(indent + k + (n.t === 'd' ? '/' : '') + big);
      if (n.t === 'd' && !n.priv && depth < 3) walk(n, depth + 1, indent + '  ');
    }
  };
  const node = L.fs.get(L.sh.cwd);
  if (node) walk(node, 1, '');
  return out.join('\n') || '(ว่างเปล่า)';
}

function aiReq(text) {
  return {
    level: L.lv.id, phase: L.lv.phase, text, cwd: L.sh.pretty(), tree: treeFor(),
    aliases: L.lv.aliases || {},
  };
}

async function loadLevel(idx, { replay = false } = {}) {
  const lv = LEVELS[idx];
  const fs = baseFS();
  lv.setup(fs);
  const sh = new Shell(fs, io, { cwd: lv.cwd, password: lv.password || 'pass123' });
  L = { idx, lv, fs, sh, hist: [], attempts: 0, aiUsed: 0, typedReal: false, hint: 0, decoderOpened: false, passed: false, shownPower: false };
  io.clear();
  renderSide();
  setPrompt();
  const first = LEVELS.findIndex(x => x.phase === lv.phase) === idx;
  add(`<span class="place">[${esc(lv.place)}]</span>   <span class="pcwd">${esc(sh.pretty())} ${esc(PHASES[lv.phase].prompt)}</span>`, 'head');
  if (first && !replay) sys(`— เฟส ${lv.phase === 'B' ? 'สะพาน' : lv.phase}: ${PHASES[lv.phase].name} — ${PHASES[lv.phase].lam}`, 'phase');
  if (replay) sys('⏪ ย้อนเวลาแล้ว โลกกลับเป็นเหมือนตอนเริ่มด่าน', 'phase');
  else for (const [who, t] of lv.intro) { say(who, t); await sleep(250); }
  sys('🎯 ภารกิจ: ' + lv.mission, 'mission');
  input.focus();
}

// ---------- input handling per phase ----------

async function handle(text) {
  if (L.passed && L.challenge) return challenge(text);
  const phase = L.lv.phase;
  const first = text.split(/\s+/)[0];
  const realFirst = !hasThai(first) && KNOWN.has(first);

  if (phase === 1) {
    if (realFirst && !hasThai(text)) { L.typedReal = true; return runAndHelp(text); }
    return translateAndRun(text);
  }

  if (phase === 2) {
    if (hasThai(text)) {
      if (kedmaneeHint(text)) return;
      say('lam', 'ง่ำๆ...ฟังไม่ออก T_T ภาษาไทยโดนไวรัสกัดไปแล้ว ลองภาษาอังกฤษนะ');
      return;
    }
    if (realFirst) { L.typedReal = true; return runAndHelp(text); }
    await run(text);                                  // real bash: command not found [127]
    const r = await think(text);
    if (!r.command) { say('lam', r.reply || 'น้องล่ามก็ไม่รู้ว่าหมายถึงอะไร'); return; }
    L.aiUsed++;
    const name = r.command.split(/\s+/)[0] === 'sudo' ? r.command.split(/\s+/).slice(0, 2).join(' ') : r.command.split(/\s+/)[0];
    const card = `<div class="card-map"><span>${esc(first)}</span> → <b>${esc(name)}</b></div>`;
    if (L.lv.mode === 'run') {
      add(`<span class="tag">น้องล่ามช่วย</span> คุณหมายถึง <code>${esc(name)}</code> ใช่ไหม? เรารันให้ก่อนนะ ${card}`, 'trans');
      showTranslation(r);
      return run(r.command, true);
    }
    add(`<span class="tag">น้องล่ามช่วย</span> หมายถึง <code>${esc(name)}</code> ใช่ไหม? พิมพ์เองนะ ${card}`, 'trans');
    return;
  }

  if (phase === 3) {
    if (!realFirst) {
      await run(text);
      if (!kedmaneeHint(text)) say('lam', 'คำแรกต้องเป็นชื่อคำสั่งจริงนะ ส่วนที่เหลือค่อยพิมพ์ภาษาคนได้');
      return;
    }
    const rest = text.slice(first.length);
    if (!hasThai(rest)) { L.typedReal = true; return runAndHelp(text); }
    return translateAndRun(text);
  }

  // phase 4 / bridge: exact syntax only
  await run(text);
  if (hasThai(text)) kedmaneeHint(text);
}

function kedmaneeHint(text) {
  const conv = fromKedmanee(text);
  const w = conv.split(/\s+/)[0];
  if (conv !== text && KNOWN.has(w)) {
    say(L.lv.phase >= 4 || L.lv.phase === 'B' ? 'root' : 'lam', `ลืมเปลี่ยนภาษาคีย์บอร์ดหรือเปล่า? (${text.split(/\s+/)[0]} = ${w})  ลองกด Super+Space / ปุ่มเปลี่ยนภาษา แล้วพิมพ์ ${conv} ใหม่`);
    return true;
  }
  return false;
}

async function think(text) {
  const el = add('<span class="dots">น้องล่ามกำลังคิด</span>', 'thinking');
  const r = await interpret(aiReq(text));
  el.remove();
  return r;
}

function showTranslation(r) {
  let cmd = esc(r.command);
  for (const p of L.lv.phase === 3 ? r.parts || [] : []) {
    if (!p.token || p.token === r.command) continue;
    const t = esc(p.token);
    if (cmd.includes(t)) cmd = cmd.replace(t, `<mark title="${esc(p.meaning)}">${t}</mark>`);
  }
  const partsLine = (r.parts || []).filter(p => p.token && p.meaning && p.token !== r.command)
    .map(p => `<span class="pp"><mark>${esc(p.token)}</mark> = "${esc(p.meaning)}"</span>`).join('');
  add(`<span class="tag">น้องล่ามแปล</span> <code class="cmdt">${cmd}</code>` +
      (partsLine && L.lv.phase === 3 ? `<div class="parts">${partsLine}</div>` : '') +
      (r.explain ? `<div class="explain">${esc(r.explain)}</div>` : ''), 'trans');
}

async function translateAndRun(text) {
  const r = await think(text);
  if (!r.command) { say('lam', r.reply || 'น้องล่ามยังไม่เข้าใจ ลองพูดอีกแบบนะ'); return; }
  L.aiUsed++;
  L.lastTranslated = r.command;
  showTranslation(r);
  if (/(^|[\s|;&])(rm|find\b.*-delete)\b|-delete\b/.test(r.command) && !(await previewDelete(r.command))) return;
  else if (r.confidence < 0.6) {
    const a = await io.prompt(`หมายถึง ${r.command} ใช่ไหม? (y/n) `);
    if (!a || !/^y|ใช่/i.test(a.trim())) { say('lam', 'โอเค งั้นลองบอกใหม่อีกแบบนะ'); return; }
  }
  await run(r.command, true);
}

// "Look before you delete": dry-run the command on a copy of the world and list what would disappear.
async function previewDelete(cmd) {
  const ghostFs = L.fs.clone();
  const ghost = new Shell(ghostFs, { write() {}, clear() {}, prompt: async () => 'y' }, { cwd: L.sh.cwd });
  ghost.sudoAuth = true;
  await ghost.exec(cmd);
  const after = new Set(ghostFs.allPaths());
  const gone = L.fs.allPaths().filter(p => !after.has(p));
  const top = gone.filter(p => !gone.some(q => q !== p && q.endsWith('/') && p.startsWith(q)));
  if (!top.length) return true;
  const rel = p => L.sh.pretty(p.replace(/\/$/, '')).replace(L.sh.pretty() + '/', '') + (p.endsWith('/') ? '/' : '');
  add(`<div class="preview"><b>ดูก่อนลบ:</b> จะลบ ${top.length} รายการนี้<ul>${top.map(p => `<li>${esc(rel(p))}</li>`).join('')}</ul></div>`, 'trans');
  const a = await io.prompt('ยืนยันไหม? (y/n) ');
  if (a && /^y|ใช่/i.test(a.trim())) return true;
  say('lam', 'ยกเลิกแล้ว ไม่มีอะไรถูกลบ ดีมากที่อ่านก่อน!');
  return false;
}

// Phases 1-3: when a real command the player typed fails, น้องล่าม analyses it (fading by phase).
async function runAndHelp(text) {
  const res = await run(text);
  if (!res || res.code === 0 || L.passed || !res.stderr) return res;
  const el = add('<span class="dots">น้องล่ามกำลังดูว่าผิดตรงไหน</span>', 'thinking');
  const r = await interpret({ ...aiReq(text), mode: 'fix', error: res.stderr });
  el.remove();
  if (r.offline) return res;
  const phase = L.lv.phase;
  const same = r.command && r.command.replace(/\s+/g, ' ').trim() === text.replace(/\s+/g, ' ').trim();
  if (phase === 3 || !r.command || same) {
    const msg = phase === 3 ? r.hint || r.explain : r.explain || r.hint;
    if (msg) say('lam', msg);
    return res;
  }
  add(`<span class="tag">น้องล่ามช่วยแก้</span> <code class="cmdt">${esc(r.command)}</code>` +
      (r.explain ? `<div class="explain">${esc(r.explain)}</div>` : ''), 'trans');
  if (phase === 2 && L.lv.mode === 'suggest') { say('lam', 'ลองแก้แล้วพิมพ์เองนะ'); return res; }
  const a = await io.prompt('ให้เรารันแบบที่แก้แล้วไหม? (y/n) ');
  if (!a || !/^y|ใช่/i.test(a.trim())) { say('lam', 'โอเค ลองแก้เองนะ สู้ๆ!'); return res; }
  L.aiUsed++;
  L.typedReal = false;
  L.lastTranslated = r.command;
  if (/(^|[\s|;&])rm\b|-delete\b/.test(r.command) && !(await previewDelete(r.command))) return res;
  return run(r.command, true);
}

async function run(line, translated = false) {
  const res = await L.sh.exec(line);
  res.translated = translated;
  L.hist.push(res);
  L.attempts++;
  const phase = L.lv.phase;
  if (phase === 4 || phase === 'B') add(`[${res.code}]`, res.code === 0 ? 'code ok' : 'code bad');
  renderDecoder(res.stderr);
  if (L.sh.flags.wiped) return wipedScene();
  if (L.sh.flags.poweroff && !L.shownPower) { L.shownPower = true; await powerScene(); }
  checkLevel();
  return res;
}

function renderDecoder(stderr) {
  const items = [];
  for (const line of stderr.split('\n').filter(Boolean)) {
    const d = decode(line);
    if (!d) continue;
    if (d.tryLine) { if (items.length) items[items.length - 1].tip = d.why; continue; }
    if (!items.some(x => x.why === d.why && x.who === d.who)) items.push(d);
  }
  if (!items.length) return;
  const phase = L.lv.phase;
  const box = d => {
    const full = phase === 1 || phase === 2 || phase === 4 || phase === 'B';
    const rows = full
      ? `<span class="k who">ใครบ่น</span><span>${esc(d.who || '-')}</span>` +
        (d.what ? `<span class="k what">เรื่องอะไร</span><span>${esc(d.what)}</span>` : '') +
        `<span class="k why">เพราะอะไร</span><span>${esc(d.why || '(สมุดยังไม่มีคำอธิบาย ลองอ่านดูเองนะ)')}</span>`
      : `<span class="k why">เพราะอะไร</span><span>${esc(d.why || '-')}</span>`;
    return `<div class="dec"><div class="grid">${rows}</div>${d.tip && full ? `<div class="tip">» ${esc(d.tip)}</div>` : ''}</div>`;
  };
  const html = items.slice(0, 3).map(box).join('');
  if (phase === 4 || phase === 'B') {
    const el = add(`<button class="book">📖 เปิดสมุดน้องล่าม</button>`, 'decwrap');
    el.querySelector('button').onclick = () => {
      L.decoderOpened = true;
      el.innerHTML = html;
      scroll();
      renderSide();
    };
  } else add(html, 'decwrap');
}

async function powerScene() {
  const ov = $('#overlay');
  ov.className = 'overlay power show';
  ov.innerHTML = '<div>ป้าเซิร์ฟกำลังปิดเครื่อง…</div><div class="small">Stopping all services… 💤</div>';
  await sleep(1800);
  ov.innerHTML = '<div>…เปิดเครื่องใหม่แล้ว ✨</div>';
  await sleep(900);
  ov.className = 'overlay';
}

async function wipedScene() {
  const ov = $('#overlay');
  ov.className = 'overlay wiped show';
  ov.innerHTML = '<div>💥 ป้าเซิร์ฟพังทั้งเครื่อง!</div><div class="small">rm -rf --no-preserve-root / ลบทุกอย่างตั้งแต่ราก ในเครื่องจริงไม่มีปุ่มย้อนเวลา<br>ครั้งนี้เกมย้อนเวลาให้ แต่ห้ามทำบนเครื่องจริงเด็ดขาด</div>';
  await sleep(4000);
  ov.className = 'overlay';
  loadLevel(L.idx, { replay: true });
}

// ---------- pass / stars / hints ----------

function checkLevel() {
  if (L.passed) return;
  const g = { fs: L.fs, sh: L.sh, res: L.hist[L.hist.length - 1], hist: L.hist };
  const f = L.lv.fail && L.lv.fail(g);
  if (f) { sys('⚠️ ' + f, 'fail'); return; }
  if (L.lv.check(g)) return pass();
  // The command worked but the mission isn't done: say so, because a silent success looks like nothing happened.
  const r = g.res;
  if (!r || r.code !== 0) return;
  const early = [1, 2, 3].includes(L.lv.phase);
  if (early && !L.silentShown && !r.stdout && !r.stderr) {
    L.silentShown = true;
    sys('✓ ไม่มีข้อความตอบกลับ = ทำสำเร็จแล้ว (Linux จะเงียบเมื่อทำเสร็จ และจะบ่นเฉพาะตอนมีปัญหา)', 'win');
  }
  if (lostHint(r)) return;
  const n = L.lv.nudge && L.lv.nudge(g);
  if (n && n !== L.lastNudge) {
    L.lastNudge = n;
    say(early ? 'lam' : 'root', n);
  }
}

// Relative path from one absolute dir to another, e.g. /a/b/c -> /a/x  =>  ../../x
function relPath(from, to) {
  const f = from.split('/').filter(Boolean), t = to.split('/').filter(Boolean);
  let i = 0;
  while (i < f.length && i < t.length && f[i] === t[i]) i++;
  return [...Array(f.length - i).fill('..'), ...t.slice(i)].join('/') || '.';
}

// Wandered somewhere the mission doesn't need? Say where they are and how to get back.
// "On track" = at the target, on the way to it (an ancestor), or inside it.
function lostHint(r) {
  const cwd = L.sh.cwd;
  const target = L.lv.target || L.lv.cwd;
  const phase = L.lv.phase;
  const early = [1, 2, 3].includes(phase);
  if (r.cmds.some(c => c.name === 'ls' && c.code === 0) && !r.stdout && early) {
    sys('(ห้องนี้ว่างเปล่า ls เลยไม่แสดงอะไร)', '');
  }
  if (!r.cmds.some(c => c.name === 'cd')) return false;
  const onTrack = cwd === target || target.startsWith(cwd + '/') || cwd.startsWith(target + '/') || cwd === '/';
  if (onTrack || cwd === L.lostAt) return false;
  L.lostAt = cwd;
  const here = L.sh.pretty(cwd), back = relPath(cwd, target), goal = L.sh.pretty(target);
  if (phase === 1 || phase === 2) say('lam', `ตอนนี้เราอยู่ที่ ${here} ซึ่งไม่ใช่ที่ที่ภารกิจต้องการนะ (ต้องไปที่ ${goal}) หลงแล้วไม่เป็นไร ถอยกลับด้วย cd ${back}  หรือ cd .. เพื่อถอยทีละชั้น`);
  else if (phase === 3) say('lam', `หลงมาที่ ${here} แล้วนะ ภารกิจอยู่ที่ ${goal} ถอยออกทีละชั้นด้วย cd .. แล้ว ls ดูทาง`);
  else say('root', `ดู prompt สิ ตอนนี้อยู่ที่ ${here} ไม่ใช่ที่ที่ต้องทำภารกิจ`);
  return true;
}

function calcStars() {
  const p = L.lv.phase;
  let s;
  if (p === 1) s = L.typedReal ? 3 : 2;
  else if (p === 2 || p === 3) s = L.typedReal && !L.aiUsed ? 3 : 2;
  else { s = L.attempts <= 3 ? 2 : 1; if (!L.decoderOpened && L.hint < 2) s = 3; }
  if (L.hint >= 3) s = Math.min(s, 1);
  else if (L.hint >= 2) s = Math.min(s, 2);
  return s;
}

const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

async function pass() {
  L.passed = true;
  L.stars = calcStars();
  const id = L.lv.id;
  progress.stars[id] = Math.max(progress.stars[id] || 0, L.stars);
  progress.unlocked = Math.max(progress.unlocked, Math.min(L.idx + 1, LEVELS.length - 1));
  for (const c of L.lv.cards || []) if (!progress.cards.includes(c)) progress.cards.push(c);
  save();
  for (const [who, t] of L.lv.outro || []) { await sleep(200); say(who, t); }
  const cards = (L.lv.cards || []).map(c => `<span class="cardchip">${esc(c)}</span>`).join(' ');
  const el = add(`<div class="passbox"><div class="pt">✅ ผ่านด่าน ${esc(id)}</div>` +
    (cards ? `<div>ได้การ์ดคำสั่ง ${cards}</div>` : '') +
    `<div class="stars">${starStr(L.stars)}</div>` +
    `<div class="why">${esc(starWhy())}</div>` +
    `<div class="btns">${L.idx < LEVELS.length - 1 ? '<button class="next">ด่านถัดไป →</button>' : ''}<button class="again">เล่นด่านนี้อีกรอบ</button></div></div>`, 'pass');
  el.querySelector('.next')?.addEventListener('click', () => loadLevel(L.idx + 1));
  el.querySelector('.again').addEventListener('click', () => loadLevel(L.idx, { replay: true }));
  if (L.lv.phase === 1 && L.stars < 3 && L.lastTranslated && L.hint < 3) {
    L.challenge = true;
    sys(`⭐ ท้าพิมพ์เอง: พิมพ์คำสั่งจริง (สีเทาข้างบน) ด้วยมือตัวเองเพื่อรับดาวที่ 3`, 'mission');
  }
  renderSide();
}

function starWhy() {
  const p = L.lv.phase;
  if (L.hint >= 3) return 'ใช้เฉลยของพี่รูท ดาวสูงสุด 1';
  if (p === 1) return L.typedReal ? 'พิมพ์คำสั่งจริงเอง ได้ครบ 3 ดาว!' : 'ดาว 3: พิมพ์คำสั่งจริงเองแทนประโยคภาษาคน';
  if (p === 2 || p === 3) return L.stars === 3 ? 'พิมพ์คำสั่งจริงเองทั้งด่าน ไม่ต้องให้น้องล่ามแปล!' : 'ดาว 3: พิมพ์คำสั่งจริงเองทั้งด่านโดยไม่ต้องแปล';
  return L.stars === 3 ? 'ไม่ได้เปิดสมุดถอดรหัสเลย อ่าน error เองเป็นแล้ว!' : `ดาว 3: ผ่านโดยไม่เปิดสมุดถอดรหัส (ครั้งนี้พิมพ์ ${L.attempts} ครั้ง)`;
}

async function challenge(text) {
  const norm = s => s.trim().replace(/\s+/g, ' ').replace(/\/(\s|$)/g, '$1');
  if (!hasThai(text) && norm(text) === norm(L.lastTranslated)) {
    L.challenge = false;
    L.stars = 3;
    progress.stars[L.lv.id] = 3;
    save();
    sys('⭐⭐⭐ พิมพ์เองได้แล้ว! ได้ครบ 3 ดาว คนใช้ Linux จริงพิมพ์แบบนี้แหละ', 'win');
    renderSide();
  } else {
    sys(`ยังไม่ตรงนะ คำสั่งจริงคือ ${L.lastTranslated} (หรือกด "ด่านถัดไป" ข้ามได้)`, 'fail');
  }
}

function useHint() {
  if (!L || L.passed || L.hint >= 3) return;
  L.hint++;
  if (L.hint === 1) say('lung', 'คำสั่งที่อาจต้องใช้: ' + L.lv.hint1.join(', '));
  else if (L.hint === 2) {
    const lastErr = [...L.hist].reverse().find(r => r.stderr);
    if (lastErr) {
      L.decoderOpened = true;
      const d = decode(lastErr.stderr.split('\n')[0]);
      say('lam', d ? `(จากสมุด) error ล่าสุดคือ ${d.who} บ่นเรื่อง "${d.what || '-'}" เพราะ${d.why || 'อ่านไม่ออก'} ${d.tip ? '→ ' + d.tip : ''}` : 'สมุดอ่าน error ล่าสุดไม่ออกแฮะ ลองอ่านทีละส่วนดูนะ');
    } else say('lam', '(จากสมุด) ยังไม่มี error ให้ถอด ลองสั่งอะไรดูก่อน ผิดก็ไม่เป็นไร ที่นี่ไม่มีวันพัง');
  } else say('root', 'เฉลย: ' + L.lv.solution);
  renderSide();
}

// ---------- side panel ----------

function renderSide() {
  if (!L) return;
  const lv = L.lv;
  $('#lvid').textContent = lv.id + (lv.boss ? ' · บอส' : '');
  $('#lvtitle').textContent = lv.title;
  $('#lvphase').textContent = lv.phase === 'B' ? 'ด่านสะพาน · ' + PHASES.B.name : `เฟส ${lv.phase} · ${PHASES[lv.phase].name}`;
  $('#mission').textContent = lv.mission;
  const best = progress.stars[lv.id] || 0;
  $('#lvstars').textContent = L.passed ? starStr(L.stars) : best ? `สถิติ ${starStr(best)}` : '☆☆☆';
  const hb = $('#hint');
  hb.disabled = L.passed || L.hint >= 3;
  hb.textContent = L.hint >= 3 ? '💡 ใช้คำใบ้ครบแล้ว' : `💡 คำใบ้ขั้นที่ ${L.hint + 1}/3`;
  hb.title = ['ลุงภารโรง: คำสั่งที่อาจต้องใช้ (ไม่หักดาว)', 'สมุดน้องล่าม: ถอดรหัส error ล่าสุด (ดาวสูงสุด 2)', 'พี่รูท: เฉลย (ดาวสูงสุด 1)'][L.hint] || '';
  $('#hintnote').textContent = ['ขั้น 1 ไม่หักดาว', 'ขั้น 2: ดาวสูงสุดเหลือ 2', 'ขั้น 3 (เฉลย): ดาวสูงสุดเหลือ 1', ''][L.hint];

  // level map
  const map = $('#map');
  map.innerHTML = '';
  const groups = [1, 2, 3, 4, 'B'];
  for (const ph of groups) {
    const g = document.createElement('div');
    g.className = 'mapgroup';
    g.innerHTML = `<div class="mg">${ph === 'B' ? 'สะพาน' : 'เฟส ' + ph}</div>`;
    const row = document.createElement('div');
    row.className = 'mrow';
    LEVELS.forEach((x, i) => {
      if (x.phase !== ph) return;
      const b = document.createElement('button');
      const s = progress.stars[x.id] || 0;
      b.className = 'lvbtn' + (i === L.idx ? ' cur' : '') + (s ? ' done' : '') + (x.boss ? ' boss' : '');
      b.disabled = i > progress.unlocked;
      b.innerHTML = `<span>${x.id}</span><small>${s ? '★'.repeat(s) : ''}</small>`;
      b.title = x.title;
      b.onclick = () => loadLevel(i);
      row.appendChild(b);
    });
    g.appendChild(row);
    map.appendChild(g);
  }
  $('#cards').innerHTML = progress.cards.length ? progress.cards.map(c => `<span class="cardchip">${esc(c)}</span>`).join('') : '<span class="muted">ยังไม่มีการ์ด</span>';
  const total = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  $('#total').textContent = `★ ${total}/${LEVELS.length * 3}`;
}

$('#hint').onclick = useHint;
$('#reset').onclick = () => L && loadLevel(L.idx, { replay: true });
$('#wipe').onclick = () => {
  if (!confirm('ล้างความคืบหน้าทั้งหมด (ดาว/การ์ด) ใช่ไหม?')) return;
  progress = { unlocked: 0, stars: {}, cards: [] };
  save();
  loadLevel(0);
};

(async () => {
  const st = await aiStatus();
  const el = $('#ai');
  el.textContent = st.ok ? 'AI: Claude Haiku' : 'AI ออฟไลน์';
  el.className = 'ai ' + (st.ok ? 'on' : 'off');
  const start = Math.min(progress.unlocked, LEVELS.length - 1);
  loadLevel(start);
})();
