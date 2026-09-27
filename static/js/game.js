import { sizeOf } from './vfs.js';
import { Shell } from './shell.js';
import { decode } from './decoder.js';
import { interpret, aiStatus, hasThai, fromKedmanee } from './translate.js';
import { LEVELS, PHASES, STRICT, PHASE_ORDER, phaseLabel } from './levels.js';
import { isMuted, setMuted } from './voice.js';
import { worldFor, saveWorld, levelStart, forgetWorld, keptFiles, restoreKept } from './world.js';
import { logInput, clearJournal } from './journal.js';
import { session, key, signOut } from './account.js';
import { track } from './sync.js';
import { CHECKPOINTS, runQuiz } from './quiz.js';

const WHO = {
  lam: ['น้องล่าม', '🐧'], kru: ['ครูสมใจ', '👩‍🏫'], root: ['พี่รูท', '🧑‍💻'],
  lung: ['ลุงภารโรงเอก', '🧹'], virus: ['ไวรัสมั่วซั่ว', '👾'], serv: ['ป้าเซิร์ฟ', '🖥️'],
};
const KNOWN = new Set(Object.keys(Shell.prototype.cmds));
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- progress (per player; signed-in players' saves also live on the server, see sync.js) ----------
const SAVE_KEY = key('lamshell.progress.v1');
let progress = { unlocked: 0, stars: {}, cards: [], seen: {} };
try { Object.assign(progress, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch {}
progress.seen ||= {};
progress.quiz ||= {};   // checkpoint -> { best, tries, passed }
// Progress used to be a bare level index, which shifts whenever levels are added. Phase 2 grew from 8 to 9
// levels (2-9 is new), so an old save that reached phase 3 moves one slot on. From now on the furthest level is
// also kept by id and wins over the index.
if (!progress.unlockedId && progress.unlocked >= 17) progress.unlocked += 1;
if (progress.unlockedId) {
  const i = LEVELS.findIndex(l => l.id === progress.unlockedId);
  if (i >= 0) progress.unlocked = i;
}
// The final level was called 5-7 before it became LAST.
if (progress.unlockedId === '5-7') progress.unlockedId = 'LAST';
if (progress.stars['5-7']) { progress.stars.LAST = progress.stars['5-7']; delete progress.stars['5-7']; }
if (progress.unlockedId === 'LAST') progress.unlocked = LEVELS.length - 1;
progress.unlockedId = LEVELS[Math.min(progress.unlocked, LEVELS.length - 1)].id;
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch {} };

// ---------- terminal ----------
const lines = $('#lines');
const input = $('#cmd');
const term = $('#term');
const feed = $('#feed');     // everything the game says lives here, so `clear` in the terminal never loses it
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
    const cls = { '1;34': 'a-blue', '1;31': 'a-red', '1;32': 'a-exe', '32': 'a-green', '90': 'a-gray' }[p];
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

function note(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'f ' + cls;
  d.innerHTML = html;
  feed.appendChild(d);
  feed.scrollTop = feed.scrollHeight;
  return d;
}

// Grey line in the terminal showing the command น้องล่าม actually ran for you.
function ranLine(cmd, label = 'น้องล่ามแปล') {
  add(`↳ ${esc(label)}: <b>${esc(cmd)}</b>`, 'cmt');
}

function write(kind, s) {
  const text = s.endsWith('\n') ? s.slice(0, -1) : s;
  add(ansi(text), kind === 'err' ? 'err' : 'out');
}

// Character stage (3D models). Loaded on the side: if three.js or a model fails, the game still works.
let stage = null;
const earlyLines = [];   // lines said before the stage finished loading (the first level's intro)
import('./stage.js').then(m => {
  m.initStage($('#cast'));
  stage = m;
  earlyLines.splice(0).forEach(a => m.speak(...a));
}).catch(e => console.warn('stage off:', e));

const SCENE_NAMES = { intro: 'เปิดเรื่อง: ปี 2050', nowake: 'น้องล่ามไม่ตื่น', timeskip: 'สามเดือนต่อมา', ending: 'ตอนจบ' };
// Story cutscenes (full screen, 3D). Also optional: without them the levels still play.
const cutscenes = import('./cutscene.js').catch(e => { console.warn('cutscenes off:', e); return null; });
async function cutscene(name) {
  const m = await cutscenes;
  if (!m) return;
  await m.playCutscene(name);
  progress.seen[name] = true;
  save();
  renderSide();
  input.focus();
}

// น้องล่าม is knocked out from phase 4 until she wakes at the end of phase 5.
const lamAsleep = () => STRICT.has(L.lv.phase) && !(L.passed && L.lv.lamWakes);

function moodFor(who, text) {
  if (who === 'virus') return 'happy';      // smug
  if (/ดีมาก|เก่ง|เยี่ยม|ผ่าน|ได้แล้ว|สำเร็จ|ขอบใจ|ขอบคุณ|เจอแล้ว/.test(text)) return 'happy';
  if (/หลง|ห้าม|ระวัง|พัง|ไม่ได้|ผิด|ช่วยด้วย|เต็ม|ด่วน/.test(text)) return 'surprised';
  return 'neutral';
}

function say(who, text, extraHtml = '', now = false) {
  const [name, icon] = WHO[who];
  const el = note(`<div class="who">${icon} ${name}</div>${esc(text)}${extraHtml}`, 'say who-' + who);
  const line = [who, name, text, moodFor(who, text), { now }];
  if (stage) stage.speak(...line); else earlyLines.push(line);
  return el;
}

// A yes/no question from a character: asked in the side panel (spoken on stage, with buttons);
// the terminal only shows "(y/n)" so it can still be answered from the keyboard.
async function ask(who, text, extraHtml = '') {
  const el = say(who, text, extraHtml, true);
  const btns = document.createElement('div');
  btns.className = 'qbtns';
  btns.innerHTML = '<button data-a="y">ใช่</button><button data-a="n">ไม่</button>';
  el.appendChild(btns);
  feed.scrollTop = feed.scrollHeight;
  btns.onclick = e => { const a = e.target.dataset.a; if (a && pending) submit(a); };
  const a = await io.prompt('(y/n) ');
  const yes = !!a && /^y|ใช่/i.test(a.trim());
  btns.querySelectorAll('button').forEach(b => { b.disabled = true; if (b.dataset.a === (yes ? 'y' : 'n')) b.classList.add('chosen'); });
  return yes;
}
function sys(text, cls = '') { note(esc(text), 'sys ' + cls); }

const io = {
  write,
  clear: () => { lines.innerHTML = ''; },
  prompt: (text, opts = {}) => new Promise(resolve => {
    pending = { resolve, text, hidden: !!opts.hidden };
    setPrompt();
    input.focus();
  }),
};

const HOST = 'student@ป้าเซิร์ฟ';
const label = () => PHASES[L.lv.phase].prompt;
// "$" hugs the path like bash; the phase prompts (ภาษาคน>, eng>, cmd>) get a space.
const promptHTML = () => `<span class="pcwd"><span class="pu">${HOST}</span><span>:</span>${esc(L.sh.pretty())}</span>` +
  `<span class="plabel">${label() === '$' ? '$' : ' ' + esc(label())}</span> `;

function setPrompt() {
  if (pending) {
    $('#pcwd').innerHTML = '';
    $('#plabel').textContent = pending.text;
    $('#plabel').style.marginLeft = '0';
    input.type = pending.hidden ? 'password' : 'text';
  } else {
    $('#pcwd').innerHTML = L ? `<span class="pu">${HOST}</span><span>:</span>${esc(L.sh.pretty())}` : '';
    $('#plabel').textContent = L ? label() : '$';
    $('#plabel').style.marginLeft = L && label() !== '$' ? '.6ch' : '0';
    if (L) $('#tabtitle').textContent = `${HOST}: ${L.sh.pretty()}`;
    input.type = 'text';
  }
  input.placeholder = pending ? '' : L && L.lv.phase === 1 ? 'พิมพ์ภาษาไทยได้เลย…' : L && L.lv.phase === 2 ? 'ถามเป็นภาษาไทย หรือพิมพ์คำสั่งเอง…' : '';
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
  if (busy || building || !L) return;
  const text = v.trim();
  add(promptHTML() + esc(v), 'echo');
  if (!text) return;
  history.push(text); histPos = history.length;
  busy = true;
  input.classList.add('busy');
  const lvAt = L.lv, histAt = L.hist.length;
  try {
    await handle(text);
    const ran = L.lv === lvAt && L.hist.length > histAt ? L.hist[L.hist.length - 1] : null;
    // Only the real playthrough becomes น้องล่าม's memories, not replays.
    if (L.live) logInput({ lv: lvAt.id, phase: lvAt.phase, said: text, ran: ran?.line || null, code: ran ? ran.code : null });
    track('input', { lv: lvAt.id, phase: lvAt.phase, live: L.live, said: text, ran: ran?.line || null, exit: ran ? ran.code : null,
      ai: !!ran?.translated, err: ran?.stderr ? ran.stderr.split('\n').find(Boolean) : null, ms: Date.now() - L.t0 });
  }
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
    level: L.lv.id, phase: L.lv.phase, text, cwd: L.sh.pretty(), tree: treeFor(), code: session?.code,
    aliases: L.lv.aliases || {},
  };
}

let loading = 0, building = false;
async function loadLevel(idx, { replay = false, reset = false } = {}) {
  const lv = LEVELS[idx];
  closeQuiz();
  // The next phase opens only after its checkpoint quiz (only on the way forward: finished phases stay open).
  const cp = checkpointBefore(idx);
  if (cp && !progress.quiz[cp]?.passed && idx === progress.unlocked && !replay) return openQuiz(cp, idx);
  const token = ++loading;
  // The level at the front of progress plays on the real, saved machine; older levels on a rebuilt copy.
  const live = idx === progress.unlocked;
  building = true;   // commands typed while the machine is being built would land on the old level
  input.classList.add('busy');
  let fs;
  try { fs = (reset && live && levelStart(lv.id)) || await worldFor(idx, live); }
  finally { if (token === loading) { building = false; input.classList.remove('busy'); } }
  if (token !== loading) return;   // another level was picked while this one was being built
  const sh = new Shell(fs, io, { cwd: lv.cwd, password: lv.password || 'pass123', programs: lv.programs });
  L = { idx, lv, fs, sh, live, t0: Date.now(), kept: keptFiles(fs), hist: [], attempts: 0, aiUsed: 0, typedReal: false, hint: 0, decoderOpened: false, passed: false, shownPower: false };
  // A question left open in the previous level (sudo password, y/n) must not swallow this level's first command.
  // Drop it without resolving: resolving would let the old level's command carry on and print into this one.
  if (pending) { pending = null; busy = false; input.classList.remove('busy'); }
  io.clear();
  feed.innerHTML = '';
  stage?.clearQueue();
  earlyLines.length = 0;
  renderSide();
  setPrompt();
  track('level_start', { lv: lv.id, phase: lv.phase, live, replay });
  if (lv.cutsceneBefore && !progress.seen[lv.cutsceneBefore] && !replay) await cutscene(lv.cutsceneBefore);
  if (L.lv !== lv) return;   // the player picked another level during the scene
  stage?.setAsleep(lamAsleep());
  const first = LEVELS.findIndex(x => x.phase === lv.phase) === idx;
  sys('📍 ' + lv.place);
  if (!live) sys('(เล่นซ้ำ: เครื่องนี้จำลองตามเนื้อเรื่องตอนด่านนี้ ทำอะไรก็ไม่กระทบเครื่องจริงของเธอ)');
  if (first && !replay) sys(`— ${phaseLabel(lv.phase)}: ${PHASES[lv.phase].name} — ${PHASES[lv.phase].lam}`, 'phase');
  if (replay) sys('⏪ ย้อนเวลาแล้ว โลกกลับเป็นเหมือนตอนเริ่มด่าน', 'phase');
  else for (const [who, t] of lv.intro) { say(who, t); await sleep(250); }
  input.focus();
}

// ---------- checkpoint quizzes ----------

// The quiz that stands before level idx (the first level of phases 2, 3, 4 and the bridge), or null.
function checkpointBefore(idx) {
  const prev = LEVELS[idx - 1], lv = LEVELS[idx];
  return prev && lv && CHECKPOINTS[prev.phase] && prev.phase !== lv.phase ? prev.phase : null;
}

function closeQuiz() {
  const box = $('#quiz');
  box.abort?.();
  box.className = 'quiz';
  box.innerHTML = '';
}

async function openQuiz(cp, idx) {
  ++loading;
  if (pending) { pending = null; busy = false; input.classList.remove('busy'); }
  L = null;   // no level while the quiz is up: the terminal ignores input
  building = false;
  input.classList.remove('busy');
  feed.innerHTML = '';
  stage?.clearQueue();
  stage?.setAsleep(false);
  $('#lvid').textContent = 'เช็กพอยต์ ' + cp;
  $('#lvtitle').textContent = CHECKPOINTS[cp].title.replace(/^.*?: /, 'ประตูของป้าเซิร์ฟ: ');
  $('#lvphase').textContent = `ก่อนเข้า ${phaseLabel(LEVELS[idx].phase)} · ${PHASES[LEVELS[idx].phase].name}`;
  $('#mission').textContent = 'ตอบคำถาม 5 ข้อ ถูกอย่างน้อย 4 ข้อ (80%) เพื่อเปิดโซนถัดไป กดปุ่ม 1-4 บนคีย์บอร์ดเพื่อเลือกคำตอบได้';
  $('#steps').innerHTML = '';
  const q0 = progress.quiz[cp];
  $('#lvstars').textContent = q0 ? `สถิติ ${q0.best}/5` : '';
  $('#hint').disabled = true;
  $('#hint').textContent = '💡 ไม่มีคำใบ้ในแบบทดสอบ';
  $('#reset').disabled = true;
  $('#hintnote').textContent = '';
  $('#tabtitle').textContent = 'ป้าเซิร์ฟ: เช็กพอยต์ ' + cp;
  const box = $('#quiz');
  for (;;) {
    track('quiz_start', { phase: cp, cp });
    const r = await runQuiz(cp, box, (who, t) => say(who, t));
    if (!r) return;   // left for another level
    track('quiz', { phase: cp, cp, score: r.score, total: r.total, passed: r.passed, answers: r.answers });
    const q = progress.quiz[cp] ||= { best: 0, tries: 0, passed: false };
    q.tries++;
    q.best = Math.max(q.best, r.score);
    q.passed ||= r.passed;
    save();
    if (r.next === 'retry') continue;
    closeQuiz();
    return loadLevel(r.next === 'continue' ? idx : idx - 1);
  }
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

  // Phase 2 (ห้องเรียนน้องล่าม): a real command runs; anything else gets taught, never run for you.
  if (phase === 2) {
    if (realFirst && !hasThai(text)) { L.typedReal = true; return runAndHelp(text); }
    if (hasThai(text) && kedmaneeHint(text)) return;
    return teach(text);
  }

  if (phase === 3) {
    if (!realFirst) {
      await run(text);
      if (!kedmaneeHint(text)) say('lam', 'คำแรกต้องเป็นชื่อคำสั่งจริงนะ ส่วนที่เหลือค่อยพิมพ์ภาษาคนได้');
      return;
    }
    const rest = text.slice(first.length);
    if (!hasThai(rest) && !humanWords(rest)) { L.typedReal = true; return runAndHelp(text); }
    return translateAndRun(text);
  }

  // phase 4 / bridge: exact syntax only
  await run(text);
  if (hasThai(text)) kedmaneeHint(text);
}

// Phase 3 lets the part after the command be human language, English included (`mkdir create projects/x`).
// A word counts as human only if it's on this list and isn't a real name here (a file in this folder or a
// name from the mission), so `mkdir backup` still runs as typed.
const HUMAN_EN = new Set(('create make new all every everything each file files folder folders directory dir hidden ' +
  'secret show list see find search look inside into in to from the a an and with named called name big bigger large ' +
  'larger than small copy move delete remove rename go back home up down whole entire nested layers deep please ' +
  'including include also only just here there it them this that of for').split(' '));
function humanWords(rest) {
  const here = L.fs.get(L.sh.cwd);
  const names = new Set([...Object.keys(here?.kids || {}), ...(L.lv.mission.match(/[A-Za-z0-9_.\-]+/g) || [])]);
  return rest.split(/\s+/).some(w => HUMAN_EN.has(w.toLowerCase()) && !names.has(w));
}

function kedmaneeHint(text) {
  const conv = fromKedmanee(text);
  const w = conv.split(/\s+/)[0];
  if (conv !== text && KNOWN.has(w)) {
    say(STRICT.has(L.lv.phase) ? 'root' : 'lam', `ลืมเปลี่ยนภาษาคีย์บอร์ดหรือเปล่า? (${text.split(/\s+/)[0]} = ${w})  ลองกด Super+Space / ปุ่มเปลี่ยนภาษา แล้วพิมพ์ ${conv} ใหม่`);
    return true;
  }
  return false;
}

async function think(text) {
  const el = note('<span class="dots">🐧 น้องล่ามกำลังคิด</span>', 'thinking');
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
  ranLine(r.command);
  note(`<span class="tag">น้องล่ามแปล</span><code class="cmdt">${cmd}</code>` +
      (partsLine && L.lv.phase === 3 ? `<div class="parts">${partsLine}</div>` : '') +
      (r.explain ? `<div class="explain">${esc(r.explain)}</div>` : ''), 'trans');
}

// The lesson: the command, what every part of it means, then "type it yourself".
function lessonCard(r, tag = 'น้องล่ามสอน') {
  const parts = (r.parts || []).filter(p => p.token && p.meaning)
    .map(p => `<li><code>${esc(p.token)}</code> = ${esc(p.meaning)}</li>`).join('');
  note(`<span class="tag">${esc(tag)}</span><code class="cmdt big">${esc(r.command)}</code>` +
       (parts ? `<ul class="lesson">${parts}</ul>` : '') +
       (r.explain ? `<div class="explain">${esc(r.explain)}</div>` : ''), 'trans');
}

async function teach(text) {
  const r = await think(text);
  if (!r.command) { if (!r.offline) track('untranslated', { lv: L.lv.id, phase: L.lv.phase, said: text }); say('lam', r.reply || 'เรายังไม่เข้าใจ ลองบอกอีกแบบนะ'); return; }
  L.aiUsed++;
  L.lastTaught = r.command;
  lessonCard(r);
  say('lam', `ลองพิมพ์ ${r.command} เองดูสิ`);
}

async function translateAndRun(text) {
  const r = await think(text);
  if (!r.command) { if (!r.offline) track('untranslated', { lv: L.lv.id, phase: L.lv.phase, said: text }); say('lam', r.reply || 'น้องล่ามยังไม่เข้าใจ ลองพูดอีกแบบนะ'); return; }
  L.aiUsed++;
  L.lastTranslated = r.command;
  showTranslation(r);
  if (/(^|[\s|;&])(rm|find\b.*-delete)\b|-delete\b/.test(r.command) && !(await previewDelete(r.command))) return;
  else if (r.confidence < 0.6) {
    if (!(await ask('lam', `หมายถึง ${r.command} ใช่ไหม?`))) { say('lam', 'โอเค งั้นลองบอกใหม่อีกแบบนะ'); return; }
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
  const list = `<ul class="gone">${top.map(p => `<li>${esc(rel(p))}</li>`).join('')}</ul>`;
  L.looked = true;
  const yes = await ask('lam', `ดูก่อนลบ: คำสั่งนี้จะลบ ${top.length} รายการนี้ ยืนยันไหม?`, list);
  track('preview_delete', { lv: L.lv.id, phase: L.lv.phase, n: top.length, yes });
  if (yes) return true;
  say('lam', 'ยกเลิกแล้ว ไม่มีอะไรถูกลบ ดีมากที่อ่านก่อน!');
  return false;
}

// Phases 1-3: when a real command the player typed fails, น้องล่าม analyses it (fading by phase).
async function runAndHelp(text) {
  const res = await run(text);
  if (!res || res.code === 0 || L.passed || !res.stderr) return res;
  const el = note('<span class="dots">🐧 น้องล่ามกำลังดูว่าผิดตรงไหน</span>', 'thinking');
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
  note(`<span class="tag">น้องล่ามช่วยแก้</span><code class="cmdt">${esc(r.command)}</code>` +
      (r.explain ? `<div class="explain">${esc(r.explain)}</div>` : ''), 'trans');
  if (phase === 2) { say('lam', 'ลองแก้แล้วพิมพ์ใหม่เองนะ'); return res; }
  if (!(await ask('lam', 'ให้เรารันแบบที่แก้แล้วไหม?'))) { say('lam', 'โอเค ลองแก้เองนะ สู้ๆ!'); return res; }
  L.aiUsed++;
  L.typedReal = false;
  L.lastTranslated = r.command;
  if (/(^|[\s|;&])rm\b|-delete\b/.test(r.command) && !(await previewDelete(r.command))) return res;
  ranLine(r.command, 'น้องล่ามแก้');
  return run(r.command, true);
}

async function run(line, translated = false) {
  const before = new Set(L.fs.allPaths());
  const res = await L.sh.exec(line);
  res.created = L.fs.allPaths().filter(p => !before.has(p));
  res.cwd = L.sh.cwd;
  res.translated = translated;
  L.hist.push(res);
  L.attempts++;
  const phase = L.lv.phase;
  if (STRICT.has(phase)) add(`[exit ${res.code}]`, 'code');
  renderDecoder(res.stderr);
  if (L.sh.flags.wiped) return wipedScene();
  if (L.sh.flags.poweroff && !L.shownPower) { L.shownPower = true; await powerScene(); }
  const back = restoreKept(L.fs, L.kept);
  if (back.length) {
    const names = back.map(p => p.split('/').pop()).join(', ');
    say('kru', `เดี๋ยวๆ! จะลบไฟล์งานของครูทำไมจ๊ะ (${names}) ครูกู้คืนจากสำรองให้แล้วนะ แต่เครื่องจริงลบแล้วหายเลย ระวังด้วย`);
  }
  if (L.live) saveWorld(L.lv.id, L.fs);
  checkLevel();
  renderSteps();
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
    const full = phase === 1 || phase === 2 || STRICT.has(phase);
    const rows = full
      ? `<span class="k who">ใครบ่น</span><span>${esc(d.who || '-')}</span>` +
        (d.what ? `<span class="k what">เรื่องอะไร</span><span>${esc(d.what)}</span>` : '') +
        `<span class="k why">เพราะอะไร</span><span>${esc(d.why || '(สมุดยังไม่มีคำอธิบาย ลองอ่านดูเองนะ)')}</span>`
      : `<span class="k why">เพราะอะไร</span><span>${esc(d.why || '-')}</span>`;
    return `<div class="dec"><div class="grid">${rows}</div>${d.tip && full ? `<div class="tip">» ${esc(d.tip)}</div>` : ''}</div>`;
  };
  const html = items.slice(0, 3).map(box).join('');
  if (STRICT.has(phase)) {
    const el = note(`<button class="book">📖 เปิดสมุดน้องล่าม</button>`, 'decwrap');
    el.querySelector('button').onclick = () => {
      L.decoderOpened = true;
      track('decoder', { lv: L.lv.id, phase: L.lv.phase });
      el.innerHTML = html;
      feed.scrollTop = feed.scrollHeight;
      renderSide();
    };
  } else note(html, 'decwrap');
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
  loadLevel(L.idx, { replay: true, reset: true });
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
  if (r && r.code !== 0) {
    const n = (L.lv.errNudge && L.lv.errNudge(g)) || (STRICT.has(L.lv.phase) && findPatternHint(r));
    if (n && n !== L.lastNudge) { L.lastNudge = n; say([1, 2, 3].includes(L.lv.phase) ? 'lam' : 'root', n); }
  }
  if (!r || r.code !== 0) return;
  const early = [1, 2, 3].includes(L.lv.phase);
  if (early && !L.silentShown && !r.stdout && !r.stderr) {
    L.silentShown = true;
    sys('✓ ไม่มีข้อความตอบกลับ = ทำสำเร็จแล้ว (Linux จะเงียบเมื่อทำเสร็จ และจะบ่นเฉพาะตอนมีปัญหา)', 'win');
  }
  if (typoHint(r)) return;
  if (lostHint(r)) return;
  const n = L.lv.nudge && L.lv.nudge(g);
  if (n && n !== L.lastNudge) {
    L.lastNudge = n;
    say(early ? 'lam' : 'root', n);
  }
}

// `find . "*.mua"`: find took the pattern as a second place to search. Phases 1-3 get this from Haiku's fix;
// in the strict phases พี่รูท says it (a short rule, not the full answer).
function findPatternHint(r) {
  const m = /^find: '([^']+)': No such file or directory$/m.exec(r.stderr);
  if (!m || !r.cmds.some(c => c.name === 'find') || !/[*?]|\.\w+$/.test(m[1])) return '';
  return `find เข้าใจว่า '${m[1]}' คือที่ที่จะเข้าไปค้น ไม่ใช่ชื่อที่หา ลืม -name หรือเปล่า? รูปแบบคือ find <ค้นที่ไหน> -name "<ชื่อ>"`;
}

// Levenshtein distance, small strings only.
function editDist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Created something whose name is *almost* a name from the mission (scores.cvs vs scores.csv)?
// The command succeeded silently, so without this the player just sees "not passed" and no reason.
// Built a mission path in the wrong place? e.g. `cd projects` then `mkdir -p projects/2569/science`
// makes projects/projects/2569/science. Mission paths count from the level's starting folder.
function wrongPlaceHint(r) {
  const paths = (L.lv.mission.match(/[A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+)+/g) || []);
  const created = (r.created || []).map(p => p.replace(/\/$/, ''));
  for (const w of paths) {
    const right = L.lv.cwd + '/' + w;
    if (L.fs.exists(right)) continue;
    const bad = created.find(p => p.endsWith('/' + w) && p !== right);
    if (!bad || L.placeSaid?.has(bad)) continue;
    (L.placeSaid ||= new Set()).add(bad);
    const where = L.sh.pretty(bad), from = L.sh.pretty(L.lv.cwd);
    if (STRICT.has(L.lv.phase)) say('root', `ไปสร้างไว้ที่ ${where} ซ้อนผิดชั้น path ในภารกิจนับจาก ${from} ดู prompt ว่าตอนนี้อยู่ไหน`);
    else say('lam', `เอ๊ะ ไปได้ ${where} ซ้อนกันผิดที่ เพราะตอนสั่งเราอยู่ใน ${L.sh.pretty()} แล้ว path ในภารกิจนับจาก ${from} นะ ลอง cd กลับไปที่ ${from} ก่อนแล้วสั่งใหม่`);
    return true;
  }
  return false;
}

function typoHint(r) {
  if (wrongPlaceHint(r)) return true;
  const wanted = [...new Set(L.lv.mission.match(/[A-Za-z0-9_][A-Za-z0-9_.\-]{2,}/g) || [])];
  for (const p of r.created || []) {
    const name = p.replace(/\/$/, '').split('/').pop();
    if (wanted.includes(name)) continue;
    const near = wanted.find(w => editDist(name.toLowerCase(), w.toLowerCase()) <= (w.length < 5 ? 1 : 2));
    if (!near || L.typoSaid?.has(name)) continue;
    (L.typoSaid ||= new Set()).add(name);
    const where = L.sh.pretty(p.replace(/\/$/, ''));
    if (STRICT.has(L.lv.phase)) say('root', `เพิ่งสร้าง ${where} แต่ภารกิจบอก ${near} อ่านชื่อทีละตัวดีๆ`);
    else say('lam', `เอ๊ะ เพิ่งสร้าง ${where} ขึ้นมา แต่ภารกิจบอกว่า ${near} นะ ชื่อต่างกันนิดเดียว เครื่องถือว่าเป็นคนละไฟล์เลย ลองดูชื่อด้วย ls แล้วแก้ด้วย mv`);
    return true;
  }
  return false;
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
  progress.unlockedId = LEVELS[progress.unlocked].id;
  for (const c of L.lv.cards || []) if (!progress.cards.includes(c)) progress.cards.push(c);
  save();
  track('pass', { lv: id, phase: L.lv.phase, live: L.live, stars: L.stars, attempts: L.attempts, hints: L.hint, ai: L.aiUsed,
    typedReal: L.typedReal, decoder: L.decoderOpened, ms: Date.now() - L.t0, looked: lookedFirst() });
  for (const [who, t] of L.lv.outro || []) { await sleep(200); say(who, t); }
  if (L.lv.lamSleeps) stage?.setAsleep(true);
  if (L.lv.cutsceneAfter) {
    await sleep(L.lv.outro?.length ? 2500 : 600);
    for (const name of [].concat(L.lv.cutsceneAfter)) await cutscene(name);
  }
  stage?.setAsleep(lamAsleep() || !!L.lv.lamSleeps);
  const cards = (L.lv.cards || []).map(c => `<span class="cardchip">${esc(c)}</span>`).join(' ');
  const el = note(`<div class="passbox"><div class="pt">✅ ผ่านด่าน ${esc(id)}</div>` +
    (cards ? `<div>ได้การ์ดคำสั่ง ${cards}</div>` : '') +
    `<div class="stars">${starStr(L.stars)}</div>` +
    `<div class="why">${esc(starWhy())}</div>` +
    `<div class="btns">${L.idx < LEVELS.length - 1 ? `<button class="next">${checkpointBefore(L.idx + 1) && !progress.quiz[checkpointBefore(L.idx + 1)]?.passed ? 'เช็กพอยต์ของป้าเซิร์ฟ →' : 'ด่านถัดไป →'}</button>` : ''}<button class="again">เล่นด่านนี้อีกรอบ</button></div></div>`, 'pass');
  el.querySelector('.next')?.addEventListener('click', () => loadLevel(L.idx + 1));
  el.querySelector('.again').addEventListener('click', () => loadLevel(L.idx, { replay: true, reset: true }));
  if (L.lv.phase === 1 && L.stars < 3 && L.lastTranslated && L.hint < 3) {
    L.challenge = true;
    sys(`⭐ ท้าพิมพ์เอง: พิมพ์คำสั่งจริง (บรรทัดสีเทา ↳ ในเทอร์มินัล) ด้วยมือตัวเองเพื่อรับดาวที่ 3`, 'mission');
  }
  renderSide();
}

// "Look before you delete" (research indicator): in a level where something got deleted, was there a look first
// (ls / cat / find without -delete, or น้องล่าม's preview)? null when nothing was deleted.
function lookedFirst() {
  const cmds = L.hist.flatMap(r => r.cmds);
  const del = cmds.findIndex(c => c.code === 0 && (c.name === 'rm' || (c.name === 'find' && c.args.includes('-delete')) ||
    (c.name === 'xargs' && c.args[0] === 'rm')));
  if (del < 0) return null;
  return !!L.looked || cmds.slice(0, del).some(c => ['ls', 'cat'].includes(c.name) || (c.name === 'find' && !c.args.includes('-delete')));
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
  track('hint', { lv: L.lv.id, phase: L.lv.phase, step: L.hint });
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

// Multi-part missions show a checklist, so the player can see what's done and what's left.
function renderSteps() {
  const el = $('#steps');
  if (!L.lv.steps) { el.innerHTML = ''; return; }
  const g = { fs: L.fs, sh: L.sh, res: L.hist[L.hist.length - 1], hist: L.hist };
  // Optional steps (good habits like "look before you delete") are marked as recommended, never as missing.
  el.innerHTML = L.lv.steps.map(([t, done, o]) =>
    `<li class="${done(g) ? 'ok' : o?.optional ? 'opt' : ''}">${esc(typeof t === 'function' ? t(g) : t)}${o?.optional ? ' <small>(แนะนำ)</small>' : ''}</li>`).join('');
}

function renderSide() {
  if (!L) return;
  const lv = L.lv;
  $('#lvid').textContent = lv.id + (lv.boss ? ' · บอส' : '');
  $('#reset').disabled = false;
  $('#lvtitle').textContent = lv.title;
  $('#lvphase').textContent = `${phaseLabel(lv.phase)} · ${PHASES[lv.phase].name}`;
  $('#mission').textContent = lv.mission;
  renderSteps();
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
  for (const ph of PHASE_ORDER) {
    const g = document.createElement('div');
    g.className = 'mapgroup';
    g.innerHTML = `<div class="mg">${phaseLabel(ph)}</div>`;
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
    if (CHECKPOINTS[ph]) {   // the phase's checkpoint quiz, at the end of its row
      const next = LEVELS.findIndex((x, i) => i > 0 && checkpointBefore(i) === ph);
      const q = progress.quiz[ph];
      const b = document.createElement('button');
      b.className = 'lvbtn cp' + (q?.passed ? ' done' : '');
      b.disabled = next < 0 || next > progress.unlocked;
      b.innerHTML = `<span>✓${ph}</span><small>${q ? q.best + '/5' : ''}</small>`;
      b.title = CHECKPOINTS[ph].title;
      b.onclick = () => openQuiz(ph, next);
      row.appendChild(b);
    }
    g.appendChild(row);
    map.appendChild(g);
  }
  // The opening is always watchable; later scenes unlock once seen in play.
  const scenes = Object.keys(SCENE_NAMES).filter(k => k === 'intro' || progress.seen[k]);
  $('#scenes').innerHTML = scenes.map(k => `<button class="scenebtn" data-scene="${k}">▶ ${esc(SCENE_NAMES[k])}</button>`).join('');
  $('#scenes').querySelectorAll('button').forEach(b => { b.onclick = () => cutscene(b.dataset.scene); });
  $('#cards').innerHTML = progress.cards.length ? progress.cards.map(c => `<span class="cardchip">${esc(c)}</span>`).join('') : '<span class="muted">ยังไม่มีการ์ด</span>';
  const total = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  $('#total').textContent = `★ ${total}/${LEVELS.length * 3}`;
}

$('#hint').onclick = useHint;
// Who is playing, top of the side panel.
$('#player').innerHTML = session
  ? `👤 <b>${esc(session.class)} เลขที่ ${esc(session.seat)}</b> รหัส ${esc(session.code)}<button class="linkbtn" id="signout">ออกจากระบบ</button>`
  : `เล่นแบบไม่บันทึก<button class="linkbtn" id="signin-btn">ลงชื่อเข้าเล่น</button>`;
$('#signout')?.addEventListener('click', signOut);
$('#signin-btn')?.addEventListener('click', () => { try { localStorage.removeItem('lamshell.mode'); } catch {} location.reload(); });
const soundBtn = $('#sound');
const showSound = () => { soundBtn.textContent = isMuted() ? '🔇' : '🔊'; soundBtn.title = isMuted() ? 'เปิดเสียงพากย์' : 'ปิดเสียงพากย์'; };
soundBtn.onclick = () => { setMuted(!isMuted()); showSound(); };
showSound();
$('#reset').onclick = () => L && loadLevel(L.idx, { replay: true, reset: true });
$('#wipe').onclick = () => {
  if (!confirm('ล้างความคืบหน้าทั้งหมด (ดาว/การ์ด) ใช่ไหม?')) return;
  progress = { unlocked: 0, unlockedId: LEVELS[0].id, stars: {}, cards: [], seen: {}, quiz: {} };
  save();
  forgetWorld();
  clearJournal();
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
