// Character stage at the top of the side panel: whoever is speaking shows up here.
// VRM characters (three-vrm) get idle breathing, blinking, a mood expression and a mouth that moves
// for as long as the line "takes to say".
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { playVoice, stopVoice } from './voice.js';

const MODELS = {
  lam: 'models/lam.vrm', kru: 'models/kru.vrm', root: 'models/root.vrm', lung: 'models/lung.vrm', virus: 'models/virus.vrm',
};
const IMAGES = {};   // 2D fallback per character, if a model is ever missing
const MOODS = ['happy', 'angry', 'sad', 'surprised', 'relaxed'];
// Bones any animation may touch (stage idle or cutscenes); restPose() zeroes them.
export const POSED = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'];
export const IDLE_FACE = { lam: { happy: 0.45 } };   // expression weights while standing idle

let box, canvas, img, nameEl, renderer, scene, camera, clock;
const cache = {};          // who -> Promise<VRM>
let cur = null;            // VRM on screen
let curWho = 'lam';
let talkUntil = 0, mood = 'neutral';
let nextBlink = 2, blinkT = -1;
const queue = [];
let playing = false;
let lent = false;          // a cutscene has borrowed the models
let asleep = false;        // story: น้องล่าม is knocked out (phase 4 until she wakes in 5-7)

export function initStage(el) {
  box = el;
  canvas = el.querySelector('canvas');
  img = el.querySelector('img');
  nameEl = el.querySelector('.cast-name');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(20, 1, 0.1, 20);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(0.6, 1.6, 2.2);
  scene.add(sun);
  clock = new THREE.Clock();
  new ResizeObserver(resize).observe(el);
  resize();
  renderer.setAnimationLoop(tick);
  // น้องล่าม stands on stage until someone speaks.
  box.classList.add('loading');
  load('lam').then(v => { if (!cur) showVRM(v); }).catch(() => {}).finally(() => box.classList.remove('loading'));
  // Warm the cache one model at a time so the first line of each character doesn't wait on a 15-20MB download.
  Object.keys(MODELS).reduce((p, who) => p.then(() => load(who).catch(() => {})), Promise.resolve());
}

// Lines are queued so an intro with several speakers plays in order. Each line gets time to be "said",
// then a short pause; switching characters fades out and back in instead of cutting.
const MIN_LINE = 2500, MAX_LINE = 7000, PER_CHAR = 70, PAUSE = 500, FADE = 250;
const wait = ms => new Promise(r => setTimeout(r, ms));
export function speak(who, name, text, m = 'neutral', { now = false } = {}) {
  if (now) { queue.length = 0; cutLine?.(); }   // a question the player must answer: say it right away
  queue.push({ who, name, text, m });
  if (!playing) play();
}

// The current line's timer; calling it ends the line early.
let cutLine = null;
let wasCut = false;
const lineWait = ms => new Promise(r => { const t = setTimeout(r, ms); cutLine = () => { clearTimeout(t); wasCut = true; stopVoice(); r(); }; });

async function play() {
  playing = true;
  while (queue.length) {
    const { who, name, text, m } = queue.shift();
    let dur = Math.min(MAX_LINE, Math.max(MIN_LINE, 1000 + [...text].length * PER_CHAR));
    if (queue.length > 3) dur = MIN_LINE;          // long backlog: keep up, but never cut mid-word
    const swap = who !== curWho;
    if (swap) { box.classList.add('swap'); await wait(FADE); }
    curWho = who;
    nameEl.textContent = name;
    nameEl.className = 'cast-name who-' + who;
    if (IMAGES[who]) {
      showImage(who);
      box.classList.add('talking');
    } else if (MODELS[who]) {
      box.classList.add('loading');
      try { showVRM(await load(who)); } catch (e) { console.warn('stage: model failed', who, e); }
      box.classList.remove('loading');
    }
    box.classList.remove('swap');
    mood = m;
    const voiced = await playVoice(who, text);   // voiced line: its real length decides how long we talk
    if (voiced) dur = voiced + 250;
    talkUntil = performance.now() + (voiced || dur);
    wasCut = false;
    await lineWait(dur);
    cutLine = null;
    box.classList.remove('talking');
    if (queue.length && !wasCut) await wait(PAUSE);   // a cut line hands over at once
  }
  playing = false;
}

export function load(who) {
  if (!cache[who]) {
    const loader = new GLTFLoader();
    loader.register(p => new VRMLoaderPlugin(p));
    cache[who] = loader.loadAsync(MODELS[who]).then(gltf => {
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse(o => { o.frustumCulled = false; });
      restPose(vrm);
      return vrm;
    });
  }
  return cache[who];
}

// Exported models stand in a T-pose; drop the arms so the bust shot looks natural.
export function restPose(vrm) {
  const b = n => vrm.humanoid.getNormalizedBoneNode(n);
  for (const name of POSED) { const n = b(name); if (n) n.rotation.set(0, 0, 0); }
  vrm.scene.position.set(0, 0, 0);
  vrm.scene.rotation.set(0, 0, 0);
  b('leftUpperArm').rotation.z = -1.25;
  b('rightUpperArm').rotation.z = 1.25;
  b('leftLowerArm').rotation.z = -0.1;
  b('rightLowerArm').rotation.z = 0.1;
}

function showVRM(vrm) {
  if (lent) return;
  if (cur !== vrm) {
    if (cur) scene.remove(cur.scene);
    scene.add(vrm.scene);
    cur = vrm;
    MOODS.forEach(k => vrm.expressionManager.setValue(k, 0));
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    frame();
  }
  img.hidden = true;
  canvas.hidden = false;
}

function showImage(who) {
  img.src = IMAGES[who];
  img.hidden = false;
  canvas.hidden = true;
}

// Head-and-shoulders framing: from the real top of the model (ears, hair, hats) down to the chest,
// with the same headroom for every character.
const HEADROOM = 0.06;   // metres of empty space above the tallest point
function frame() {
  if (!cur) return;
  const head = cur.humanoid.getRawBoneNode('head').getWorldPosition(new THREE.Vector3());
  const top = new THREE.Box3().setFromObject(cur.scene).max.y + HEADROOM;
  const bottom = head.y - 0.32;
  const mid = (top + bottom) / 2, half = (top - bottom) / 2;
  const dist = half / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(head.x, mid, head.z + dist);
  camera.lookAt(head.x, mid, head.z);
}

function resize() {
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const ease = (a, b, k) => a + (b - a) * k;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  if (!cur || canvas.hidden || lent) return;
  const em = cur.expressionManager;
  const talking = performance.now() < talkUntil;
  const sleeping = asleep && curWho === 'lam' && !talking;

  // Talking: the line's mood. Standing idle: น้องล่าม smiles, everyone else goes neutral.
  const idle = sleeping ? { relaxed: 0.35 } : !talking && IDLE_FACE[curWho];
  for (const k of MOODS) {
    const target = talking ? (k === mood ? 0.6 : 0) : idle && idle[k] || 0;
    em.setValue(k, ease(em.getValue(k), target, 0.06));
  }
  const open = talking ? 0.25 + 0.5 * Math.abs(Math.sin(t * 13)) * (0.6 + 0.4 * Math.sin(t * 3.7)) : 0;
  em.setValue('aa', ease(em.getValue('aa'), open, 0.45));
  em.setValue('oh', ease(em.getValue('oh'), talking ? 0.25 * Math.max(0, Math.sin(t * 7.3)) : 0, 0.3));

  if (sleeping) { em.setValue('blink', ease(em.getValue('blink'), 1, 0.1)); blinkT = -1; }
  else if (t > nextBlink) { blinkT = 0; nextBlink = t + 2 + Math.random() * 3.5; }
  if (blinkT >= 0) {
    blinkT += dt;
    em.setValue('blink', blinkT < 0.07 ? blinkT / 0.07 : Math.max(0, 1 - (blinkT - 0.07) / 0.09));
    if (blinkT > 0.16) { blinkT = -1; em.setValue('blink', 0); }
  }

  const bone = n => cur.humanoid.getNormalizedBoneNode(n);
  if (sleeping) {   // head drooped, slow breathing
    bone('chest').rotation.x = 0.06 + Math.sin(t * 0.9) * 0.02;
    bone('neck').rotation.y = ease(bone('neck').rotation.y, 0, 0.05);
    bone('head').rotation.z = ease(bone('head').rotation.z, 0.14, 0.05);
    bone('head').rotation.x = ease(bone('head').rotation.x, 0.38, 0.05);
  } else {
    bone('chest').rotation.x = Math.sin(t * 1.7) * 0.015;
    bone('neck').rotation.y = Math.sin(t * 0.45) * 0.06;
    bone('head').rotation.z = Math.sin(t * 0.7) * 0.03;
    bone('head').rotation.x = talking ? Math.sin(t * 5) * 0.025 : ease(bone('head').rotation.x, 0, 0.1);
  }
  box.classList.toggle('asleep', sleeping);

  cur.update(dt);
  renderer.render(scene, camera);
}

// New level: drop lines still waiting from the previous one.
export function clearQueue() { queue.length = 0; cutLine?.(); talkUntil = 0; stopVoice(); }

export function setAsleep(v) { asleep = !!v; }

// Cutscenes borrow the VRMs (an object can only live in one scene): stop drawing and hand them over.
export function lend() {
  clearQueue();
  lent = true;
  if (cur) scene.remove(cur.scene);
}
export function giveBack() {
  lent = false;
  for (const p of Object.values(cache)) p.then(v => { restPose(v); MOODS.forEach(k => v.expressionManager.setValue(k, 0)); }).catch(() => {});
  const v = cur;
  cur = null;
  (v ? Promise.resolve(v) : load(curWho)).then(showVRM).catch(() => {});
}
