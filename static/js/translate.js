// Turns what the player typed into a real command via Claude Haiku (/api/interpret -> server.py -> claude CLI).
// Without a server or AI (e.g. the web demo) it falls back to the phrase dictionary in offline.js.
import { offlineInterpret } from './offline.js';

// ---------- Kedmanee (Thai) keyboard -> QWERTY, for "forgot to switch language" ----------
const KED = {
  'ๅ': '1', '/': '2', '-': '3', 'ภ': '4', 'ถ': '5', 'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0', 'ข': '-', 'ช': '=',
  'ๆ': 'q', 'ไ': 'w', 'ำ': 'e', 'พ': 'r', 'ะ': 't', 'ั': 'y', 'ี': 'u', 'ร': 'i', 'น': 'o', 'ย': 'p', 'บ': '[', 'ล': ']', 'ฃ': '\\',
  'ฟ': 'a', 'ห': 's', 'ก': 'd', 'ด': 'f', 'เ': 'g', '้': 'h', '่': 'j', 'า': 'k', 'ส': 'l', 'ว': ';', 'ง': "'",
  'ผ': 'z', 'ป': 'x', 'แ': 'c', 'อ': 'v', 'ิ': 'b', 'ื': 'n', 'ท': 'm', 'ม': ',', 'ใ': '.', 'ฝ': '/',
  '%': '~', '+': '!', '๑': '@', '๒': '#', '๓': '$', '๔': '%', 'ู': '^', '฿': '&', '๕': '*', '๖': '(', '๗': ')', '๘': '_', '๙': '+',
  '๐': 'Q', 'ฎ': 'E', 'ฑ': 'R', 'ธ': 'T', 'ํ': 'Y', '๊': 'U', 'ณ': 'I', 'ฯ': 'O', 'ญ': 'P', 'ฐ': '{', 'ฅ': '|',
  'ฤ': 'A', 'ฆ': 'S', 'ฏ': 'D', 'โ': 'F', 'ฌ': 'G', '็': 'H', '๋': 'J', 'ษ': 'K', 'ศ': 'L', 'ซ': ':',
  '(': 'Z', ')': 'X', 'ฉ': 'C', 'ฮ': 'V', 'ฺ': 'B', '์': 'N', '?': 'M', 'ฒ': '<', 'ฬ': '>', 'ฦ': '?',
};
export const hasThai = s => /[฀-๿]/.test(s);
// Only Thai characters are mapped; ASCII passes through untouched.
export function fromKedmanee(s) {
  return [...s].map(ch => (/[฀-๿]/.test(ch) ? (KED[ch] ?? ch) : ch)).join('');
}

// ---------- AI ----------
let aiState = null;

export async function aiStatus() {
  if (aiState) return aiState;
  try {
    const r = await fetch('api/health', { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    aiState = { ok: !!j.ai, server: true, model: j.model || '' };
  } catch {
    aiState = { ok: false, server: false };
  }
  return aiState;
}

const OFFLINE = 'แค่กๆ... น้องล่ามติดต่อสมองไม่ได้ (เซิร์ฟเวอร์ AI ไม่ตอบ) ลองใหม่อีกทีนะ';

// req: { level, phase, text, cwd, tree, mission, aliases }
// -> { command|null, confidence, explain, parts: [{token, meaning}], reply, offline? }
export async function interpret(req) {
  const fallback = () => (req.mode === 'fix' ? { command: null, reply: OFFLINE, offline: true } : offlineInterpret(req));
  if (!(await aiStatus()).ok) return fallback();
  try {
    const r = await fetch('api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(60000),
    });
    const j = await r.json();
    if (!r.ok || j.error) return fallback();
    return j;
  } catch {
    return fallback();
  }
}
