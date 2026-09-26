// What the player has typed, level by level. น้องล่าม's memory files (made when the virus locks her away) are written
// from this, so her memories are of this player: the first thing they said to her, their Thai, the night she fell.
const KEY = 'lamshell.journal.v1';
const MAX = 400;

export function journal() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
// entry: { lv: level id, phase, said: what was typed, ran: the command that actually ran (translated or typed), code }
export function logInput(entry) {
  const j = journal();
  j.push(entry);
  if (j.length > MAX) j.splice(0, j.length - MAX);
  try { localStorage.setItem(KEY, JSON.stringify(j)); } catch {}
}
export function clearJournal() {
  try { localStorage.removeItem(KEY); } catch {}
}
