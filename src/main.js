// Aschenblatt – Einstieg: Welt, Figur, Kamera, Menüs und Spielschleife.
import * as THREE from 'three';
import { setupInput, poll, inp } from './input.js';
import { buildWorld, updateWorld, targets, blockers } from './world.js';
import { Player } from './player.js';
import { OrbitCam } from './camera.js';
import { makeComposer } from './bildfilter.js';
import { setupCards, throwCard, updateCards, hitFx } from './karten.js';

// ---------- Renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Handy: etwas geringere Auflösung, damit es flüssig bleibt
const MOBILE = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 240);
const world = buildWorld(scene, renderer);
const player = new Player(scene);
player.pos.set(0, 0, 6);
const cam = new OrbitCam(camera);
// Begleitlicht von der Kameraseite: sonst ist der dunkle Mantel von hinten nur ein schwarzer Umriss
const fill = new THREE.PointLight(0xffe2c8, 9, 8, 1.4);
scene.add(fill);
cam.blockers = blockers;
setupCards(scene, targets);
player.onThrow = (from, dir, suit) => throwCard(from, dir, cam.lock, suit);
player.targets = targets;
player.onHit = (tg, dir, heavy) => hitFx(tg, dir, heavy);
const post = makeComposer(renderer, scene, camera);
cam.yaw = 0;

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (typeof post !== 'undefined') { post.setPixelRatio(renderer.getPixelRatio()); post.setSize(window.innerWidth, window.innerHeight); }
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Zustände & Menüs ----------
const $ = (id) => document.getElementById(id);
let state = 'title'; // title | play | pause
setupInput(canvas, () => state === 'play');

function setState(s) {
  state = s;
  $('title').classList.toggle('show', s === 'title');
  $('pause').classList.toggle('show', s === 'pause');
  $('hud').classList.toggle('on', s !== 'title');
  if (s !== 'play' && document.pointerLockElement) document.exitPointerLock();
  if (s === 'pause') $('resumeBtn').classList.add('padFocus');
}
$('resumeBtn').onclick = () => setState('play');
$('title').addEventListener('click', () => setState('play'));
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setState('pause'); });

// ---------- HUD ----------
const hpBar = $('hpBar'), stBar = $('stBar'), lockMark = $('lockMark'), hint = $('hint');
const pv = new THREE.Vector3();
let hintT = 8;
function hud(dt) {
  hpBar.style.width = (100 * player.hp / player.maxHp) + '%';
  stBar.style.width = (100 * player.st / player.maxSt) + '%';
  stBar.parentElement.classList.toggle('empty', player.exhausted);
  if (cam.lock) {
    pv.copy(cam.lock.pos).project(camera);
    lockMark.style.display = pv.z < 1 ? 'block' : 'none';
    lockMark.style.left = ((pv.x + 1) / 2 * window.innerWidth) + 'px';
    lockMark.style.top = ((1 - pv.y) / 2 * window.innerHeight) + 'px';
  } else lockMark.style.display = 'none';
  // Hinweis unten: passend zum Gerät, verschwindet nach ein paar Sekunden
  hintT -= dt;
  hint.style.display = hintT > 0 ? 'block' : 'none';
  hint.textContent = inp.touch
    ? 'Links ziehen: Laufen · Rechts wischen: Kamera · ⚔ tippen: Schlag, halten: schwerer Schlag · 🃏: Karte · ⟲: Rolle/Rennen · ◎: Ziel'
    : inp.pad
    ? 'RB: Schlag · RT: schwerer Schlag · LB: Karte · B: Rolle/Rennen · R3: Ziel · Start: Steuerung'
    : 'WASD · Maus (ins Bild klicken) · Links-/Rechtsklick: Schlag/schwer · F: Karte · Leertaste: Rolle · Shift: Rennen · Q: Ziel · Esc: Steuerung';
  $('ctrlPad').style.display = inp.pad ? 'grid' : 'none';
  $('ctrlTouch').style.display = inp.touch ? 'grid' : 'none';
  $('ctrlKeys').style.display = inp.pad || inp.touch ? 'none' : 'grid';
}

// ---------- Spielschleife ----------
let last = performance.now(), time = 0;
const mv = { x: 0, z: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now; time += dt;
  poll(dt);

  if (state === 'title') {
    if (inp.confirm) setState('play');
    // Kamerafahrt um die Kreuzung
    camera.position.set(Math.sin(time * 0.08) * 16, 6 + Math.sin(time * 0.2), Math.cos(time * 0.08) * 16);
    camera.lookAt(0, 2.5, 0);
    player.update(dt, { x: 0, z: 0 }, {}, null);
  } else if (state === 'pause') {
    if (inp.pause || inp.back || inp.confirm) setState('play');
  } else {
    if (inp.pause) { setState('pause'); }
    if (inp.lock) cam.toggleLock(player, targets);
    if (inp.flick) cam.switchTarget(player, targets, inp.flick);
    const f = cam.forward();
    // Stick relativ zur Kamera: oben = vorwärts (von der Kamera weg), rechts = (−f.z, f.x)
    mv.x = f.x * -inp.my - f.z * inp.mx;
    mv.z = f.z * -inp.my + f.x * inp.mx;
    // Trefferstopp: bei einem Treffer friert alles kurz ein (fühlt sich wuchtiger an)
    const pdt = player.hitStop > 0 ? dt * 0.08 : dt;
    player.hitStop = Math.max(0, player.hitStop - dt);
    player.update(pdt, mv, inp, cam.lock ? cam.lock.pos : null, f);
    cam.update(dt, player, cam.lock ? 0 : inp.cx, cam.lock ? 0 : inp.cy);
    hud(dt);
  }
  fill.position.set(player.pos.x + (camera.position.x - player.pos.x) * 0.35, 2.4, player.pos.z + (camera.position.z - player.pos.z) * 0.35);
  updateWorld(dt, time, world, player.pos);
  if (state !== 'pause') updateCards(dt);
  post.render(time);
}
setState('title');
requestAnimationFrame(frame);
