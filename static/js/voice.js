// Voiced lines. Every fixed line has an audio file (made outside this repo), listed in
// voice/manifest.json under the FNV-1a hash of "who\ntext"; here the same hash finds the file for a line.
// Lines built at runtime (hints with file names, AI replies) have no file and stay silent.
let manifest = {};
fetch('voice/manifest.json').then(r => (r.ok ? r.json() : {})).then(m => { manifest = m; }).catch(() => {});

const PREF = 'lamshell.voice';
let muted = false;
try { muted = localStorage.getItem(PREF) === 'off'; } catch {}
export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(PREF, muted ? 'off' : 'on'); } catch {}
  if (muted) stopVoice();
}

function fnv(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
// Entries are { src, ms } (older builds wrote just the src string).
const entry = (who, text) => {
  const e = manifest[fnv(who + '\n' + text)];
  return typeof e === 'string' ? { src: e, ms: 0 } : e || null;
};
export const voiceUrl = (who, text) => entry(who, text)?.src || null;

let current = null;
// Start the line's audio. Resolves with its length in ms, or 0 when there's no file, it's muted, or the browser
// won't play yet (autoplay before the first click) -- callers then fall back to timing by text length.
export function playVoice(who, text) {
  stopVoice();
  const e = entry(who, text);
  if (!e || muted) return Promise.resolve(0);
  const a = new Audio(e.src);
  current = a;   // keep a reference: an unreferenced Audio can be collected mid-play
  return new Promise(resolve => {
    const len = () => e.ms || (Number.isFinite(a.duration) ? a.duration * 1000 : 0);
    // Trust the 'playing' event, not play()'s promise: Chrome can reject that promise with an AbortError and
    // still start the audio a moment later.
    a.addEventListener('playing', () => resolve(len()), { once: true });
    a.addEventListener('error', () => resolve(0), { once: true });
    a.play().catch(e => { if (e.name === 'NotAllowedError') resolve(0); });   // blocked until the first click
    setTimeout(() => resolve(0), 2500);   // slow or missing file: don't hold up the line
  });
}
export function stopVoice() {
  if (current) { current.pause(); current = null; }
}
