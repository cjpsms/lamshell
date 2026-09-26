// Story cutscenes: a full-screen stage where several VRM characters act at once (walk in, wave, sleep,
// cheer, glitch), with subtitles. Models are borrowed from the side-panel stage and handed back after.
// Everything is animated in code (bone rotations), so no video or motion files are needed.
import * as THREE from 'three';
import { load, lend, giveBack, restPose, POSED } from './stage.js';

const NAMES = { lam: 'น้องล่าม', kru: 'ครูสมใจ', root: 'พี่รูท', lung: 'ลุงภารโรงเอก', virus: 'ไวรัสมั่วซั่ว' };
const MOODS = ['happy', 'angry', 'sad', 'surprised', 'relaxed'];
const REST = { leftUpperArm: [0, 0, -1.25], rightUpperArm: [0, 0, 1.25], leftLowerArm: [0, 0, -0.1], rightLowerArm: [0, 0, 0.1] };

const sin = Math.sin, abs = Math.abs;
export const WAVE = { uy: 0.35, uz: 0.2, lz: -1.75, twist: 0, hand: -1.2 };   // exported so the pose can be tuned live
const ease = (a, b, k) => a + (b - a) * k;

// Each pose returns target rotations per bone ([x, y, z]), an optional body lift (metres), face weights,
// and whether the eyes are shut. t = seconds since the pose started. Anything not returned goes to rest.
const POSES = {
  idle: t => ({ chest: [sin(t * 1.7) * 0.015, 0, 0], neck: [0, sin(t * 0.45) * 0.06, 0], head: [0, 0, sin(t * 0.7) * 0.03] }),
  // Elbow out at about shoulder height, forearm up, palm to the camera, waving from the elbow.
  wave: t => ({
    rightUpperArm: [0, WAVE.uy, WAVE.uz], rightLowerArm: [WAVE.twist, 0, WAVE.lz + sin(t * 8) * 0.32],
    rightHand: [WAVE.hand, 0, sin(t * 8 + 0.6) * 0.15],
    head: [0, 0, 0.1], chest: [sin(t * 1.7) * 0.015, 0, -0.05], spine: [0, 0, -0.03], face: { happy: 0.6 },
  }),
  point: t => ({ rightUpperArm: [0, 1.35, 0.15], rightLowerArm: [0, 0, 0], head: [0.05, 0, 0], chest: [sin(t * 1.7) * 0.015, 0, 0] }),
  cheer: t => ({
    leftUpperArm: [0, 0, 0.9 + sin(t * 12) * 0.12], rightUpperArm: [0, 0, -0.9 - sin(t * 12) * 0.12],
    leftLowerArm: [0, 0, 0.3], rightLowerArm: [0, 0, -0.3],
    head: [-0.12, 0, 0], lift: abs(sin(t * 6)) * 0.07, face: { happy: 0.9 },
  }),
  shock: t => ({
    leftUpperArm: [0, 0, -1.05], rightUpperArm: [0, 0, 1.05], leftLowerArm: [0, -1.35, 0], rightLowerArm: [0, 1.35, 0],   // hands up to the chest
    head: [-0.14, 0, sin(t * 20) * 0.02], chest: [-0.07, 0, 0], face: { surprised: 0.9 },
  }),
  sad: t => ({ head: [0.28, 0, 0.05], chest: [0.1 + sin(t * 1.2) * 0.01, 0, 0], face: { sad: 0.75 } }),
  sleep: t => ({
    head: [0.45, 0, 0.16], neck: [0.15, 0, 0], chest: [0.08 + sin(t * 0.9) * 0.02, 0, 0], spine: [0.05, 0, 0],
    face: { relaxed: 0.35 }, eyes: 1,
  }),
  stir: t => ({   // half-waking: head lifts a little and falls back
    head: [0.3 - abs(sin(t * 1.6)) * 0.22, 0, 0.1], neck: [0.1, 0, 0], chest: [0.06, 0, 0],
    face: { relaxed: 0.2 }, eyes: 1,
  }),
  wake: t => ({ head: [-0.05, 0, sin(t * 2) * 0.05], chest: [sin(t * 1.7) * 0.015, 0, 0], face: { surprised: Math.max(0, 0.7 - t * 0.35) } }),
  nod: t => ({ head: [abs(sin(t * 5)) * 0.18, 0, 0], chest: [sin(t * 1.7) * 0.015, 0, 0] }),
  bow: t => ({ spine: [0.32, 0, 0], head: [0.2, 0, 0], face: { happy: 0.4 } }),
  glitch: (t, a) => {   // the virus: jerky random twitches, grinning
    if (!a.j || t > a.jT) { a.jT = t + 0.05 + Math.random() * 0.12; a.j = [0, 0, 0, 0, 0].map(() => Math.random() * 2 - 1); }
    const j = a.j;
    return {
      head: [j[0] * 0.25, j[1] * 0.35, j[2] * 0.2], chest: [j[3] * 0.1, j[4] * 0.2, 0],
      leftUpperArm: [0, 0, -0.9 + j[1] * 0.4], rightUpperArm: [0, 0, 0.9 + j[2] * 0.4],
      lift: abs(j[4]) * 0.04, face: { happy: 0.8, angry: j[0] > 0.3 ? 0.6 : 0 }, jitterX: j[3] * 0.03,
    };
  },
  laugh: t => ({ head: [-0.2 + abs(sin(t * 10)) * 0.08, 0, 0], chest: [-0.05, 0, 0], leftUpperArm: [0, 0, -0.9], rightUpperArm: [0, 0, 0.9], face: { happy: 1 } }),
};

const CAM_Z = 4.4;
let baseZ = CAM_Z;   // far enough that the tallest character (พี่รูท) fits head to toe
let el, canvas, renderer, scene, camera, clock;
const actors = new Map();   // who -> actor
let skipped = false, advance = null;

class Skip extends Error {}

function build() {
  el = document.createElement('div');
  el.className = 'cs';
  el.hidden = true;
  el.innerHTML = `
    <div class="cs-bg"></div>
    <canvas></canvas>
    <div class="cs-fx"></div>
    <div class="cs-caption"></div>
    <div class="cs-sub" hidden><b></b><span></span></div>
    <button class="cs-skip">ข้าม ⏭</button>
    <div class="cs-hint">คลิก / Enter = ไปต่อ · Esc = ข้าม</div>`;
  document.body.appendChild(el);
  canvas = el.querySelector('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  camera.position.set(0, 1.0, CAM_Z);
  camera.lookAt(0, 0.95, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(0.8, 2, 2.5);
  scene.add(sun);
  clock = new THREE.Clock();
  new ResizeObserver(resize).observe(el);
  el.querySelector('.cs-skip').onclick = e => { e.stopPropagation(); skipped = true; advance?.(); };
  el.addEventListener('click', () => advance?.());
  window.addEventListener('keydown', e => {
    if (el.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { skipped = true; advance?.(); } else if (e.key === 'Enter' || e.key === ' ') advance?.();
  }, true);
}

function resize() {
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep everyone in frame on narrow screens by backing the camera off.
  baseZ = w / h < 1.2 ? CAM_Z * (1.2 / (w / h)) : CAM_Z;
  camera.updateProjectionMatrix();
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1), now = performance.now();
  for (const a of actors.values()) {
    const v = a.vrm, t = (now - a.poseAt) / 1000;
    const P = { ...(POSES[a.pose] || POSES.idle)(t, a) };
    const moving = abs(a.x - a.tx) > 0.03;
    const step = Math.sign(a.tx - a.x);
    a.x += Math.max(-a.stride, Math.min(a.stride, (a.tx - a.x) * a.speed * 3));   // walk at a steady pace
    if (moving) Object.assign(P, walk(now / 1000));
    else if (now < a.talkUntil && (a.pose === 'idle' || a.pose === 'nod')) Object.assign(P, gesture(now / 1000, P));
    v.scene.position.x = a.x + (P.jitterX || 0);
    v.scene.position.y = ease(v.scene.position.y, (P.lift || 0), 0.3);
    // Turn toward where we're walking; face the scene again when we stop.
    v.scene.rotation.y = ease(v.scene.rotation.y, moving ? step * 1.1 : a.ry, 0.12);
    for (const name of POSED) {
      const n = v.humanoid.getNormalizedBoneNode(name);
      if (!n) continue;
      const [x, y, z] = P[name] || REST[name] || [0, 0, 0];
      const k = a.pose === 'glitch' ? 0.6 : 0.15;
      n.rotation.set(ease(n.rotation.x, x, k), ease(n.rotation.y, y, k), ease(n.rotation.z, z, k));
    }
    const em = v.expressionManager;
    const face = { ...a.face, ...(P.face || {}) };
    for (const k of MOODS) em.setValue(k, ease(em.getValue(k), face[k] || 0, 0.08));
    const talking = now < a.talkUntil;
    const open = talking ? 0.25 + 0.5 * abs(sin(now / 77)) * (0.6 + 0.4 * sin(now / 270)) : 0;
    em.setValue('aa', ease(em.getValue('aa'), open, 0.45));
    if (P.eyes != null) em.setValue('blink', ease(em.getValue('blink'), P.eyes, 0.1));
    else {
      if (!a.blinkAt || now > a.blinkAt) { a.blinkAt = now + 2000 + Math.random() * 3000; a.blinkT = now; }
      const b = (now - a.blinkT) / 1000;
      em.setValue('blink', b < 0.07 ? b / 0.07 : Math.max(0, 1 - (b - 0.07) / 0.09));
    }
    v.update(dt);
  }
  fitCamera();
  renderer.render(scene, camera);
}

// A walking step cycle: legs alternate, knees bend on the back swing, arms swing opposite, a little bounce.
function walk(t) {
  const ph = t * 9;
  return {
    leftUpperLeg: [-sin(ph) * 0.45, 0, 0], rightUpperLeg: [sin(ph) * 0.45, 0, 0],
    leftLowerLeg: [Math.max(0, sin(ph)) * 0.7, 0, 0], rightLowerLeg: [Math.max(0, -sin(ph)) * 0.7, 0, 0],
    leftUpperArm: [sin(ph) * 0.35, 0, -1.2], rightUpperArm: [-sin(ph) * 0.35, 0, 1.2],
    leftLowerArm: [0, -0.25, 0], rightLowerArm: [0, 0.25, 0],
    chest: [0.04, 0, 0], lift: abs(sin(ph)) * 0.025,
  };
}

// Small hand movement while talking, so nobody delivers a line like a statue.
function gesture(t, P) {
  return {
    leftUpperArm: [0, 0, -1.12 + sin(t * 2.3) * 0.06], rightUpperArm: [0, 0, 1.12 + sin(t * 2.9 + 1) * 0.06],
    leftLowerArm: [0, -0.5 - sin(t * 3.1) * 0.25, 0], rightLowerArm: [0, 0.45 + sin(t * 2.6 + 2) * 0.25, 0],
    chest: [(P.chest?.[0] || 0) + 0.01, sin(t * 1.3) * 0.04, 0],
  };
}

// Back the camera off until everyone who's in the scene (not walking out) fits, with a margin.
function fitCamera() {
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  let need = 0;
  for (const a of actors.values()) if (abs(a.tx) < 2.4) need = Math.max(need, abs(a.x) + 0.55);
  const z = Math.max(baseZ, need / half);
  camera.position.z = ease(camera.position.z, z, 0.05);
}

// ---------- script API ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check() { if (skipped) throw new Skip(); }

// Wait ms, or until the player clicks / presses Enter.
function waitOrClick(ms) {
  check();
  return new Promise(r => {
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); advance = null; r(); }
    advance = done;
  }).then(check);
}

const S = {
  bg(name) { el.querySelector('.cs-bg').className = 'cs-bg bg-' + name; },
  fx(name, ms = 700) {
    const f = el.querySelector('.cs-fx');
    f.className = 'cs-fx';
    void f.offsetWidth;
    f.className = 'cs-fx fx-' + name;
    setTimeout(() => { if (f.classList.contains('fx-' + name)) f.className = 'cs-fx'; }, ms);
  },
  async caption(text, ms = 2600) {
    const c = el.querySelector('.cs-caption');
    c.textContent = text;
    c.classList.add('show');
    await waitOrClick(ms);
    c.classList.remove('show');
    await sleep(400);
    check();
  },
  async enter(who, { x = 0, from = null, pose = 'idle', ry = 0, face = {} } = {}) {
    check();
    const vrm = await load(who);
    check();
    restPose(vrm);
    scene.add(vrm.scene);
    const start = from === 'left' ? -2.6 : from === 'right' ? 2.6 : x;
    const a = { who, vrm, x: start, tx: x, speed: from ? 0.05 : 1, stride: from ? 0.028 : 99, ry, pose, poseAt: performance.now(), face, talkUntil: 0 };
    vrm.scene.position.set(start, 0, 0);
    vrm.scene.rotation.y = ry;
    actors.set(who, a);
    return a;
  },
  exit(who, to = 'right') {
    const a = actors.get(who);
    if (!a) return;
    a.tx = to === 'left' ? -3.2 : 3.2;
    a.speed = 0.06;
    a.stride = 0.03;
    setTimeout(() => { if (actors.get(who) === a) { scene.remove(a.vrm.scene); actors.delete(who); } }, 4000);
  },
  vanish(who) {
    const a = actors.get(who);
    if (!a) return;
    scene.remove(a.vrm.scene);
    actors.delete(who);
  },
  pose(who, pose, face) {
    const a = actors.get(who);
    if (!a) return;
    a.pose = pose;
    a.poseAt = performance.now();
    if (face) a.face = face;
  },
  move(who, x) { const a = actors.get(who); if (a) { a.tx = x; a.speed = 0.05; a.stride = 0.028; } },
  face(who, ry) { const a = actors.get(who); if (a) a.ry = ry; },
  async say(who, text, { pose, ms } = {}) {
    check();
    const a = actors.get(who);
    if (pose && a) S.pose(who, pose);
    const dur = ms || Math.min(6500, Math.max(2200, 900 + [...text].length * 65));
    if (a) a.talkUntil = performance.now() + dur;
    const sub = el.querySelector('.cs-sub');
    sub.hidden = false;
    sub.className = 'cs-sub who-' + who;
    sub.querySelector('b').textContent = NAMES[who] || who;
    sub.querySelector('span').textContent = text;
    await waitOrClick(dur + 900);
    if (a) a.talkUntil = 0;
    sub.hidden = true;
  },
  wait: ms => waitOrClick(ms),
};

// ---------- the story ----------
export const POSE_TEST = ['wave', 'point', 'cheer', 'shock'];
const SCRIPTS = {
  // Dev only: walk in, then hold each pose so it can be judged. playCutscene('_poses')
  async _poses() {
    S.bg('future');
    await S.enter('lam', { x: 0, from: 'left' });
    await S.wait(3500);
    for (const p of POSE_TEST) { S.pose('lam', p); await S.wait(2500); }
  },
  // Before 1-1: the world, น้องล่าม, and the virus.
  async intro() {
    S.bg('future');
    await S.caption('ปี 2050', 2200);
    await S.caption('คอมพิวเตอร์ทุกเครื่องในโลก มีผู้ช่วยตัวเล็กๆ อาศัยอยู่', 3000);
    await S.enter('lam', { x: 0, pose: 'wave' });
    await S.wait(600);
    await S.say('lam', 'สวัสดี! เราชื่อน้องล่าม เป็นล่ามประจำเครื่องนี้');
    await S.say('lam', 'ใครพิมพ์อะไรมา ภาษาไทยมั่วๆ ก็ได้ เราแปลเป็นภาษาเครื่องให้หมดเลย', { pose: 'cheer' });
    S.pose('lam', 'idle');
    S.fx('glitch', 900);
    S.bg('alert');
    S.move('lam', -0.55);
    S.face('lam', 0.35);
    await S.enter('virus', { x: 0.6, from: 'right', pose: 'glitch', ry: -0.35 });
    await S.wait(900);
    S.pose('lam', 'shock');
    await S.say('virus', 'ฮ่าๆๆ ข้าคือไวรัสมั่วซั่ว!', { pose: 'laugh' });
    await S.say('virus', 'ข้าจะกัดกินภาษาของล่ามไปทีละคำ ทีละเครื่อง จนไม่มีใครสั่งคอมได้อีก 👾', { pose: 'glitch' });
    await S.say('lam', 'ไม่นะ! ถ้าเราแปลไม่ได้ ทุกคนก็คุยกับคอมไม่รู้เรื่อง...', { pose: 'shock' });
    S.fx('glitch', 700);
    S.exit('virus', 'right');
    await S.wait(900);
    S.bg('future');
    S.move('lam', 0);
    S.face('lam', 0);
    await S.say('lam', 'ตอนนี้เรายังพอแปลได้อยู่ แต่ต้องมีคนช่วย...', { pose: 'sad' });
    await S.say('lam', 'เธอนั่นแหละ! เปิด terminal แล้วมาสู้ไปด้วยกันนะ', { pose: 'point' });
    S.pose('lam', 'wave');
    await S.caption('เปิด terminal...', 1800);
  },

  // After R4: she's out of quarantine, but doesn't wake up.
  async nowake() {
    S.bg('dark');
    await S.enter('lam', { x: 0, pose: 'sleep' });
    await S.caption('./wake.sh ...', 1800);
    S.fx('pulse', 900);
    S.pose('lam', 'stir');
    await S.wait(2600);
    S.pose('lam', 'sleep');
    S.fx('fail', 800);
    await S.caption('[FAIL] น้องล่ามยังไม่ตื่น', 2200);
    S.move('lam', 0.5);
    await S.enter('root', { x: -0.6, from: 'left', ry: 0.3 });
    await S.wait(900);
    await S.say('root', 'ออกจากห้องขังมาได้แล้ว แต่น้องยังไม่ตื่น...', { pose: 'sad' });
    await S.say('root', 'สมองของน้องมีไฟล์ขยะของไวรัสอุดอยู่ ต้องใช้เวลาหาทางเคลียร์ให้ปลอดภัย', { pose: 'idle' });
    await S.enter('kru', { x: -1.25, from: 'left', ry: 0.3 });
    await S.wait(800);
    await S.say('kru', 'ระหว่างนี้ ครูมีงานด่วนในเครื่องเยอะเลย ช่วยครูก่อนได้ไหมจ๊ะ', { pose: 'idle' });
    await S.say('root', 'ช่วยครูไปก่อนนะ พี่จะหาทางปลุกน้องล่ามเอง', { pose: 'nod' });
    await S.enter('virus', { x: 1.3, from: 'right', pose: 'glitch', ry: -0.4 });
    S.fx('glitch', 700);
    await S.say('virus', 'หลับยาวไปเลยล่ามน้อย ฮ่าๆๆ 👾', { pose: 'laugh' });
    S.exit('virus', 'right');
    await S.caption('ต่อไป: เฟส 5 ภารกิจประยุกต์', 2200);
  },

  // After 5-7: the blocks are gone, she wakes up.
  async ending() {
    S.bg('dark');
    await S.enter('lam', { x: 0, pose: 'sleep' });
    await S.caption('ไฟล์ .block ชิ้นสุดท้ายหายไปแล้ว...', 2400);
    S.fx('pulse', 900);
    S.pose('lam', 'stir');
    await S.wait(1800);
    S.fx('white', 1400);
    S.bg('dawn');
    S.pose('lam', 'wake');
    await S.wait(1200);
    await S.say('lam', 'หืม...? ที่นี่ที่ไหน...');
    await S.say('lam', 'ตื่นแล้ว! ภาษากลับมาครบเลย!', { pose: 'cheer' });
    S.pose('lam', 'idle', { happy: 0.5 });
    S.move('lam', 0.2);
    await S.enter('root', { x: -0.75, from: 'left', ry: 0.3, face: { happy: 0.4 } });
    await S.enter('kru', { x: 1.1, from: 'right', ry: -0.3, face: { happy: 0.5 } });
    await S.wait(1000);
    await S.say('root', 'ยินดีต้อนรับกลับมานะ', { pose: 'nod' });
    await S.say('kru', 'เก่งมากเลย ช่วยทั้งครูทั้งน้องล่ามได้หมด', { pose: 'bow' });
    S.pose('kru', 'idle');
    S.pose('root', 'idle');
    S.face('lam', 0);
    await S.say('lam', 'ขอบคุณนะ ตอนเราหลับ เธอสั่งคอมได้เองหมดเลยนี่นา', { pose: 'idle' });
    await S.say('lam', 'ต่อไปนี้ ไม่ต้องมีล่ามก็ได้แล้วล่ะ แต่เราจะอยู่ข้างๆ ตลอดนะ!', { pose: 'wave' });
    await S.enter('virus', { x: 2.1, pose: 'glitch', ry: -0.5 });
    S.fx('glitch', 600);
    await S.say('virus', 'ไม่จริง... ข้าแพ้คนที่อ่าน error เป็นงั้นเหรอ...', { pose: 'shock' });
    S.fx('glitch', 900);
    S.vanish('virus');
    S.pose('lam', 'cheer');
    await S.caption('จบ — ขอบคุณที่ช่วยน้องล่าม 🐧', 3500);
  },
};

export const CUTSCENES = { intro: 'เปิดเรื่อง: ปี 2050', nowake: 'น้องล่ามไม่ตื่น', ending: 'ตอนจบ: น้องล่ามตื่นแล้ว' };

// Play one scene; resolves when it ends or is skipped. The game keeps working if anything here fails.
export async function playCutscene(name) {
  if (!SCRIPTS[name]) return;
  if (!el) build();
  skipped = false;
  lend();
  document.activeElement?.blur?.();
  el.hidden = false;
  el.classList.remove('out');
  resize();
  clock.getDelta();
  renderer.setAnimationLoop(tick);
  try { await SCRIPTS[name](); }
  catch (e) { if (!(e instanceof Skip)) console.warn('cutscene', name, e); }
  el.classList.add('out');
  await sleep(500);
  renderer.setAnimationLoop(null);
  for (const a of actors.values()) scene.remove(a.vrm.scene);
  actors.clear();
  el.hidden = true;
  el.querySelector('.cs-caption').classList.remove('show');
  el.querySelector('.cs-sub').hidden = true;
  advance = null;
  giveBack();
}
