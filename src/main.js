// Aschenblatt – Einstieg: Welt, Figur, Kamera, Menüs und Spielschleife.
import * as THREE from 'three';
import { setupInput, poll, inp } from './input.js';
import { buildWorld, updateWorld, targets, blockers } from './world.js';
import { Player } from './player.js';
import { OrbitCam } from './camera.js';
import { makeComposer } from './bildfilter.js';
import { setupCards, throwCard, updateCards, hitFx } from './karten.js';
import { spawnDogs, updateDogs, resetDogs, DOG_HP } from './hund.js';
import { rumble } from './input.js';

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
player.onHit = (tg, dir, heavy, dmg) => hitFx(tg, dir, heavy, dmg);
// Gegner: streunende Hunde (zählen als Ziele für Kamera, Karten und Degen)
const dogs = spawnDogs(scene);
targets.push(...dogs);
const REST = { x: -6.6, z: 6.4, yaw: Math.PI * 0.75 }; // am Spieltisch wieder aufstehen
let deathT = -1;
player.onDamage = (n, dead) => {
  rumble(dead ? 1 : 0.7, 0.8, dead ? 600 : 220);
  if (dead) { deathT = 0; cam.lock = null; }
};
const post = makeComposer(renderer, scene, camera, { ao: !MOBILE });
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
let hintT = 10;
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
    ? 'Hunde im Norden! · Links ziehen: Laufen · ⚔ tippen: Schlag, halten: schwer · 🃏: Karte · ⟲: Rolle/Rennen · ◎: Ziel'
    : inp.pad
    ? 'Hunde im Norden! · R1/RB: Schlag · R2/RT: schwerer Schlag · L1/LB: Karte · B/○: Rolle · R3: Ziel'
    : 'Hunde im Norden! · WASD · Links-/Rechtsklick: Schlag/schwer · F: Karte · Leertaste: Rolle · Shift: Rennen · Q: Ziel';
  $('ctrlPad').style.display = inp.pad ? 'grid' : 'none';
  $('ctrlTouch').style.display = inp.touch ? 'grid' : 'none';
  $('ctrlKeys').style.display = inp.pad || inp.touch ? 'none' : 'grid';
}

// Lebensleisten über den Hunden, roter Rand bei Schaden, „Gestorben“-Bild
const ebars = dogs.map(() => { const e = document.createElement('div'); e.className = 'ebar'; e.innerHTML = '<i></i>'; $('hud').appendChild(e); return e; });
const ev = new THREE.Vector3();
function enemyHud() {
  dogs.forEach((d, i) => {
    const e = ebars[i];
    const show = !d.dead && (d.hp < DOG_HP || cam.lock === d) && d.p.distanceTo(player.pos) < 22;
    if (!show) { e.style.display = 'none'; return; }
    ev.set(d.p.x, 1.05, d.p.z).project(camera);
    if (ev.z > 1) { e.style.display = 'none'; return; }
    e.style.display = 'block';
    e.style.left = ((ev.x + 1) / 2 * window.innerWidth) + 'px';
    e.style.top = ((1 - ev.y) / 2 * window.innerHeight) + 'px';
    e.firstChild.style.width = (100 * d.hp / DOG_HP) + '%';
  });
  $('hurtFx').style.opacity = Math.min(1, player.hurtFlash * 1.2 + (player.hp < 30 ? 0.25 + 0.1 * Math.sin(time * 4) : 0));
  const dt2 = deathT < 0 ? 0 : Math.min(1, Math.max(0, (deathT - 1.0) / 0.8)) * (deathT > 3.6 ? Math.max(0, 1 - (deathT - 3.6) / 0.6) : 1);
  $('death').style.opacity = dt2; $('death').style.display = dt2 > 0 ? 'flex' : 'none';
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
    updateDogs(pdt, player);
    if (deathT >= 0) {
      deathT += dt;
      if (deathT > 4.2) { deathT = -1; player.revive(REST.x, REST.z, REST.yaw); resetDogs(); cam.yaw = REST.yaw + Math.PI; }
    }
    cam.update(dt, player, cam.lock ? 0 : inp.cx, cam.lock ? 0 : inp.cy);
    hud(dt);
    enemyHud();
  }
  fill.position.set(player.pos.x + (camera.position.x - player.pos.x) * 0.35, 2.4, player.pos.z + (camera.position.z - player.pos.z) * 0.35);
  updateWorld(dt, time, world, player.pos);
  if (state !== 'pause') updateCards(dt);
  post.render(time);
}
setState('title');
requestAnimationFrame(frame);
