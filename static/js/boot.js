// First screen: sign in (name + class + seat, agree to data collection) or play as a guest.
// The server matches the name against the teacher's class list (>= 90% similar, name only): on the list -> play;
// not on it -> wait here until the teacher approves (polls every 3 s, survives a reload).
// It runs before anything else loads, because every save key depends on who is playing (account.js).
// After signing in on a new computer, the save from the server is put in place before the game reads it.
const $ = s => document.querySelector(s);
const SESSION = 'lamshell.session', MODE = 'lamshell.mode';
const SAVED = ['lamshell.progress.v1', 'lamshell.world.v1', 'lamshell.journal.v1'];
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

const start = () => { $('#signin').hidden = true; import('./game.js'); };

function useServerSave(me) {
  const dirty = (() => { try { return JSON.parse(get(`lamshell.sync@${me.code}`) || '{}').dirty; } catch { return false; } })();
  if (dirty || !me.state) return;   // this computer has progress the server hasn't seen yet: keep it, it gets pushed
  for (const k of SAVED) if (k in me.state) put(`${k}@${me.code}`, me.state[k]);
}

function remember(me) {
  put(SESSION, JSON.stringify({ code: me.code, name: me.name, class: me.class, seat: me.seat, status: me.status }));
  put(MODE, 'student');
}

function enter(me) {
  remember(me);
  if (me.status === 'ok') { useServerSave(me); return start(); }
  waitForTeacher(me);
}

// Not on the class list: wait for the teacher's OK.
function waitForTeacher(me) {
  const box = $('#signin');
  box.hidden = false;
  box.querySelector('form').hidden = true;
  const card = box.querySelector('.si-wait');
  card.hidden = false;
  card.querySelector('.who').textContent = me.name;
  let stop = false;
  card.querySelector('.again').onclick = () => { stop = true; put(SESSION, null); card.hidden = true; show(); };
  const tick = async () => {
    if (stop) return;
    const r = await post('api/login', { code: me.code }).catch(() => null);
    if (r?.ok && r.data.status === 'ok') { card.hidden = true; return enter(r.data); }
    if (r && !r.ok) { put(SESSION, null); card.hidden = true; return show('ครูไม่ได้ยอมรับ ลองกรอกใหม่ หรือถามครู'); }   // rejected
    setTimeout(tick, 3000);
  };
  tick();
}

let wired = false;
function show(msg = '') {
  const box = $('#signin');
  box.hidden = false;
  const f = box.querySelector('form');
  f.hidden = false;
  const err = box.querySelector('.err');
  err.textContent = msg;
  const ok = () => { f.go.disabled = !(f.name.value.trim() && f.klass.value.trim() && f.seat.value.trim() && f.consent.checked); };
  ok();
  f.name.focus();
  if (wired) return;
  wired = true;
  f.addEventListener('input', ok);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    err.textContent = '';
    f.go.disabled = true;
    try {
      const r = await post('api/register', { name: f.name.value, class: f.klass.value, seat: f.seat.value, consent: f.consent.checked });
      if (!r.ok) throw new Error(r.data.error || 'เข้าสู่ระบบไม่สำเร็จ');
      f.hidden = true;
      enter(r.data);
    } catch (x) {
      err.textContent = x.message === 'Failed to fetch' ? 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง หรือเล่นแบบไม่บันทึก' : x.message;
      ok();
    }
  });
  box.querySelector('.guest').onclick = () => { put(MODE, 'guest'); start(); };
}

const saved = (() => { try { return JSON.parse(get(SESSION) || 'null'); } catch { return null; } })();
if (saved?.status === 'pending') waitForTeacher(saved);
else if (saved || get(MODE) === 'guest') start();
else show();
