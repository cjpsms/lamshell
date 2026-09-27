// First screen: sign in (real name + class + seat, and agree to data collection) or play as a guest.
// It runs before anything else loads, because every save key depends on who is playing (account.js).
// After signing in on a new computer, the save from the server is put in place before the game reads it.
const $ = s => document.querySelector(s);
const SESSION = 'lamshell.session', MODE = 'lamshell.mode';
const SAVED = ['lamshell.progress.v1', 'lamshell.world.v1', 'lamshell.journal.v1'];
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

const start = () => import('./game.js');

function useServerSave(me) {
  const dirty = (() => { try { return JSON.parse(get(`lamshell.sync@${me.code}`) || '{}').dirty; } catch { return false; } })();
  if (dirty || !me.state) return;   // this computer has progress the server hasn't seen yet: keep it, it gets pushed
  for (const k of SAVED) if (k in me.state) put(`${k}@${me.code}`, me.state[k]);
}

async function signIn(body) {
  const r = await fetch('api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const me = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(me.error || 'เข้าสู่ระบบไม่สำเร็จ');
  useServerSave(me);
  put(SESSION, JSON.stringify({ code: me.code, name: me.name, class: me.class, seat: me.seat }));
  put(MODE, 'student');
}

function show() {
  const box = $('#signin');
  box.hidden = false;
  const f = box.querySelector('form');
  const err = box.querySelector('.err');
  const ok = () => { f.go.disabled = !(f.name.value.trim() && f.klass.value.trim() && f.seat.value.trim() && f.consent.checked); };
  f.addEventListener('input', ok);
  ok();
  f.name.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    err.textContent = '';
    f.go.disabled = true;
    try {
      await signIn({ name: f.name.value, class: f.klass.value, seat: f.seat.value, consent: f.consent.checked });
      box.hidden = true;
      start();
    } catch (x) {
      err.textContent = x.message === 'Failed to fetch' ? 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง หรือเล่นแบบไม่บันทึก' : x.message;
      ok();
    }
  });
  box.querySelector('.guest').onclick = () => { put(MODE, 'guest'); box.hidden = true; start(); };
}

if (get(SESSION) || get(MODE) === 'guest') start();
else show();
