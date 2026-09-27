// Signed-in players only: keep the save on the server (so any school computer can continue it) and send what
// happens in play for the teacher's dashboard and the research log. Guests: every call here does nothing.
//
// Events wait in an outbox in localStorage, so a flaky school network loses nothing; they go out every few
// seconds and when the page closes.
import { session, key, signOut } from './account.js';

export const SAVED = ['lamshell.progress.v1', 'lamshell.world.v1', 'lamshell.journal.v1'];
const OUTBOX = key('lamshell.outbox');
const SYNC = key('lamshell.sync');     // { dirty, updated }: dirty while the server lacks local changes; updated = server time of the save we have

const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function snapshot() {
  const data = {};
  for (const k of SAVED) data[k] = get(key(k));
  return data;
}

let last = session ? JSON.stringify(snapshot()) : '';
let pushing = false;

async function pushState() {
  const now = JSON.stringify(snapshot());
  if (now === last || pushing) return;
  put(SYNC, JSON.stringify({ dirty: true }));
  pushing = true;
  try {
    const r = await fetch('api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session.token, data: JSON.parse(now) }),
    });
    if (r.status === 401) return signOut();   // the teacher reset the password: log in again
    if (r.ok) { last = now; put(SYNC, JSON.stringify({ dirty: false, updated: (await r.json()).updated })); }
  } catch {} finally { pushing = false; }
}

function outbox() {
  try { return JSON.parse(get(OUTBOX) || '[]'); } catch { return []; }
}

// One thing that happened: type + level/phase + whatever else describes it.
export function track(type, fields = {}) {
  if (!session) return;
  const box = outbox();
  box.push({ t: Date.now(), type, ...fields });
  if (box.length > 2000) box.splice(0, box.length - 2000);
  put(OUTBOX, JSON.stringify(box));
}

let flushing = false;
async function flush() {
  const box = outbox();
  if (!box.length || flushing) return;
  flushing = true;
  try {
    const r = await fetch('api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session.token, events: box }),
    });
    if (r.status === 401) return signOut();
    if (r.ok) put(OUTBOX, JSON.stringify(outbox().slice(box.length)));   // keep what was added meanwhile
  } catch {} finally { flushing = false; }
}

if (session) {
  setInterval(() => { flush(); pushState(); }, 4000);
  addEventListener('pagehide', () => {
    const box = outbox();
    if (box.length && navigator.sendBeacon(`api/events`, new Blob([JSON.stringify({ token: session.token, events: box })], { type: 'application/json' })))
      put(OUTBOX, '[]');
    const now = JSON.stringify(snapshot());
    if (now !== last) navigator.sendBeacon('api/state', new Blob([JSON.stringify({ token: session.token, data: JSON.parse(now) })], { type: 'application/json' }));
  });
}
