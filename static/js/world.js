// The one machine the whole game happens on.
//
// "Live" = the level at the front of the player's progress. It runs on the saved machine, so everything the player
// did in earlier levels is still there; the level's arrive() adds what the story brings at that point.
// Replaying an older level runs on a copy rebuilt for that point in the story (starting machine, then every earlier
// level's arrivals and solution), so it never disturbs the real machine.
// "ย้อนเวลา" (reset) goes back to how the machine was when the level started.
import { VFS, baseFS } from './vfs.js';
import { Shell } from './shell.js';
import { LEVELS, initialWorld } from './levels.js';

const STORE = 'lamshell.world.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
function store(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {}
}

// Solutions are written for people ("cd lab → cat notes/day1.txt", "rm x  แล้ว  sudo poweroff (รหัส pass123)");
// turn one into the commands to type.
export function solutionCommands(lv) {
  return lv.solution.replace(/\([^)]*\)/g, ' ')
    .split(/\s*→\s*|\s+และ\s+|\s+แล้ว\s+/).map(c => c.trim()).filter(Boolean);
}

// Play a level's solution on a machine without anyone watching (for rebuilding the story up to a point).
async function solve(fs, lv) {
  const quiet = { write() {}, clear() {}, prompt: async t => (/password/.test(t) ? lv.password || 'pass123' : 'y') };
  const sh = new Shell(fs, quiet, { cwd: lv.cwd, password: lv.password || 'pass123', programs: lv.programs });
  sh.sudoAuth = true;
  for (const c of solutionCommands(lv)) await sh.exec(c);
  if (lv.id === '1-4') await sh.exec('mkdir backup');   // "create it, then create it again"
}

// What a level needs to be playable, on a machine the player may have rearranged: its own start (and target)
// folder, plus whatever its needs() puts back (a folder the mission uses, the nest a level counts).
function prepare(fs, lv) {
  lv.needs?.(fs);
  fs.mkdirp(lv.cwd);
  if (lv.target) fs.mkdirp(lv.target);
}

// The machine as the story has it when level idx starts.
export async function storyWorld(idx) {
  const fs = baseFS();
  initialWorld(fs);
  for (let i = 0; i < idx; i++) {
    LEVELS[i].arrive?.(fs);
    await solve(fs, LEVELS[i]);
  }
  LEVELS[idx].arrive?.(fs);
  prepare(fs, LEVELS[idx]);
  return fs;
}

// The machine to play level idx on. live: the real, saved one; otherwise a rebuilt copy.
export async function worldFor(idx, live) {
  const lv = LEVELS[idx];
  if (!live) return storyWorld(idx);
  const saved = load();
  if (saved && saved.at === lv.id) { const fs = new VFS(saved.root); prepare(fs, lv); return fs; }   // came back mid-level
  let fs;
  if (saved && idx > 0 && saved.at === LEVELS[idx - 1].id) {               // just finished the level before
    fs = new VFS(saved.root);
    lv.arrive?.(fs);
    prepare(fs, lv);
  } else {
    fs = await storyWorld(idx);                                           // new game, or a save from before this system
  }
  store({ at: lv.id, root: fs.root, start: structuredClone(fs.root) });
  return fs;
}

// After every command on the live machine.
export function saveWorld(lvId, fs) {
  const saved = load();
  if (saved && saved.at === lvId) store({ ...saved, root: fs.root });
}

// ย้อนเวลา on the live machine: back to how it was when this level started.
export function levelStart(lvId) {
  const saved = load();
  return saved && saved.at === lvId ? new VFS(structuredClone(saved.start)) : null;
}

export function forgetWorld() {
  try { localStorage.removeItem(STORE); } catch {}
}

// ---- ครูสมใจ's backup: work files (node.keep = original path) that disappeared get put back ----
export function keptFiles(fs) {
  const found = new Map();
  const walk = (node, path) => {
    for (const [name, n] of Object.entries(node.kids)) {
      const p = path === '/' ? '/' + name : path + '/' + name;
      if (n.t === 'd') walk(n, p);
      else if (n.keep && !found.has(n.keep)) found.set(n.keep, structuredClone(n));
    }
  };
  walk(fs.root, '/');
  return found;
}
// Returns the paths put back (deleted, not moved: a moved or copied work file still counts as there).
export function restoreKept(fs, before) {
  const now = keptFiles(fs);
  const back = [];
  for (const [orig, node] of before) {
    if (now.has(orig)) continue;
    const dir = orig.slice(0, orig.lastIndexOf('/'));
    fs.mkdirp(dir).kids[orig.slice(orig.lastIndexOf('/') + 1)] = structuredClone(node);
    back.push(orig);
  }
  return back;
}
