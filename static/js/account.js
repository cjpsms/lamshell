// Who is playing. Logged in = { token, code, username, name } from the server; otherwise a guest (nothing leaves the
// browser, as before). Every save key is per player, so students sharing a school computer never mix saves.
const SESSION = 'lamshell.session';

function read() {
  try { return JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch { return null; }
}
export const session = read();
export const key = k => (session ? `${k}@${session.code}` : k);

export function setSession(me) {
  try { localStorage.setItem(SESSION, JSON.stringify(me)); } catch {}
}
export function signOut() {
  try { localStorage.removeItem(SESSION); } catch {}
  location.reload();
}
