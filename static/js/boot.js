// First screen: log in (username + password) or make an account (name, username, password twice, consent), or play
// as a guest. It runs before anything else loads, because every save key depends on who is playing (account.js).
// After logging in on a new computer, the save from the server is put in place before the game reads it.
const $ = s => document.querySelector(s);
const SESSION = 'lamshell.session', MODE = 'lamshell.mode';
const SAVED = ['lamshell.progress.v1', 'lamshell.world.v1', 'lamshell.journal.v1'];
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

const start = () => { $('#signin').hidden = true; import('./game.js'); };

// Take the server's save when it's newer than the one this browser has (played on another computer, or changed by
// the teacher) -- unless this browser has progress the server hasn't got yet: that one is kept and pushed.
function useServerSave(me, code = me.code) {
  const sync = (() => { try { return JSON.parse(get(`lamshell.sync@${code}`) || '{}'); } catch { return {}; } })();
  if (sync.dirty || !me.state || (me.updated || 0) <= (sync.updated || 0)) return;
  for (const k of SAVED) if (k in me.state) put(`${k}@${code}`, me.state[k]);
  put(`lamshell.sync@${code}`, JSON.stringify({ dirty: false, updated: me.updated }));
}

function show() {
  const box = $('#signin');
  box.hidden = false;
  const forms = { login: box.querySelector('.f-login'), signup: box.querySelector('.f-signup') };
  const tabs = [...box.querySelectorAll('.si-tabs button')];
  const pick = t => {
    tabs.forEach(b => b.classList.toggle('on', b.dataset.t === t));
    for (const [k, f] of Object.entries(forms)) f.hidden = k !== t;
    forms[t].querySelector('input').focus();
  };
  tabs.forEach(b => { b.onclick = () => pick(b.dataset.t); });

  for (const [kind, f] of Object.entries(forms)) {
    const err = f.querySelector('.err');
    const ready = () => {
      const filled = [...f.querySelectorAll('input:not([type=checkbox])')].every(i => i.value.trim());
      f.go.disabled = !filled || (kind === 'signup' && !f.consent.checked);
    };
    f.addEventListener('input', ready);
    ready();
    f.addEventListener('submit', async () => {
      err.textContent = '';
      if (kind === 'signup' && f.password.value !== f.password2.value) { err.textContent = 'รหัสผ่านสองช่องไม่ตรงกัน'; return; }
      f.go.disabled = true;
      const body = kind === 'login'
        ? { username: f.username.value, password: f.password.value }
        : { name: f.name.value, username: f.username.value, password: f.password.value, password2: f.password2.value, consent: f.consent.checked };
      try {
        const r = await fetch('api/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const me = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(me.error || 'เข้าสู่ระบบไม่สำเร็จ');
        useServerSave(me);
        put(SESSION, JSON.stringify({ token: me.token, code: me.code, username: me.username, name: me.name }));
        put(MODE, 'student');
        start();
      } catch (x) {
        err.textContent = x.message === 'Failed to fetch' ? 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง หรือเล่นแบบไม่บันทึก' : x.message;
        ready();
      }
    });
  }
  box.querySelector('.guest').onclick = () => { put(MODE, 'guest'); start(); };
  pick('login');
}

// A session from an older sign-in system (no token) has to log in again.
const saved = (() => { try { return JSON.parse(get(SESSION) || 'null'); } catch { return null; } })();
if (saved && !saved.token) put(SESSION, null);
if (saved?.token) {
  // Already logged in: check the server's save first (a few seconds at most; offline -> play the local one).
  const ask = fetch('api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: saved.token }) });
  Promise.race([ask, new Promise((_, no) => setTimeout(no, 4000))])
    .then(async r => {
      if (r.status === 401) { put(SESSION, null); return show(); }   // password was reset: log in again
      if (r.ok) useServerSave(await r.json(), saved.code);
      start();
    })
    .catch(start);
} else if (get(MODE) === 'guest') start();
else {
  // No server (e.g. the web demo): nothing to sign in to, so play without saving straight away.
  fetch('api/health', { signal: AbortSignal.timeout(2500) }).then(r => r.json()).then(() => show()).catch(start);
}
