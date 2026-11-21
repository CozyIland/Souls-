// Aschenblatt – Einstieg: Welt, Figur, Kamera, Menüs und Spielschleife.
import * as THREE from 'three';
import { setupInput, poll, inp } from './input.js';
import { buildWorld, updateWorld, targets, blockers, REST, GATE, ARENA, STONE, TRUHE } from './world.js';
import { Truhe } from './truhe.js';
import { WAFFEN } from './waffen.js';
import { Werte, SOULS } from './stufe.js';
import { Menue } from './menue.js';
import { karteLaden } from './inventar.js';
import { bildUrl } from './modelle.js';
import { FogGate } from './nebel.js';
import { Boss, BOSS_HP } from './boss.js';
import { Player } from './player.js';
import { OrbitCam } from './camera.js';
import { makeComposer } from './bildfilter.js';
import { setupCards, throwCard, updateCards, hitFx, dust, cardMods, wurf } from './karten.js';
import { spawnDogs, updateDogs, resetDogs, DOG_HP, FENCE } from './hund.js';
import { rumble } from './input.js';
import { setupBlood, updateBlood, spray } from './blut.js';
import { sfx } from './ton.js';
import { glowTex } from './texturen.js';

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
player.pos.set(REST.x, 0, REST.z - 1.2); player.yaw = REST.yaw;
const cam = new OrbitCam(camera);
// Begleitlicht von der Kameraseite: sonst ist der dunkle Mantel von hinten nur ein schwarzer Umriss
const fill = new THREE.PointLight(0xffe2c8, 9, 8, 1.4);
scene.add(fill);
cam.blockers = blockers;
setupCards(scene, targets);
player.onThrow = (from, dir, suit) => throwCard(from, dir, cam.lock, suit);
player.targets = targets;
player.onHit = (tg, dir, heavy, dmg, poise, crit) => { // Krit: wirkt wie ein schwerer Treffer (mehr Blut, Rütteln, Ruck)
  hitFx(tg, dir, heavy || crit, dmg, poise); cam.shake(heavy || crit ? 0.07 : 0.035); cam.punch(crit ? 4.5 : heavy ? 3.5 : 1.5);
  if (crit) player.hitStop = Math.max(player.hitStop || 0, 0.09);
};
player.onSwing = (heavy) => sfx.swing(heavy);
player.onDust = (p, n) => dust(p, n);
player.onSlam = () => { cam.shake(0.05); sfx.thud(); rumble(0.6, 0.4, 160); }; // schwerer Schlag trifft den Boden
setupBlood(scene);
// Gegner: streunende Hunde (zählen als Ziele für Kamera, Karten und Degen)
const dogs = spawnDogs(scene);
FENCE.z = GATE.z + 0.75; // Hunde bleiben vor dem Nebeltor
targets.push(...dogs);
// Nebeltor und Boss hinter dem Nebel
const fog = new FogGate(scene, GATE);
const boss = new Boss(scene, { x: 0, z: -89, yaw: 0 }, ARENA);
targets.push(boss);
const truhe = new Truhe(scene, TRUHE);
let passT = -1, victoryT = -1, chestT = -1, foundT = -1;
// ---------- Stufen-System: Seelen sammeln, am Seelenstein aufsteigen ----------
const werte = new Werte();
const $ = (id) => document.getElementById(id);
const BAR_PX = 2.4; // Leistenlänge je Punkt Leben/Ausdauer (100 → 240 px)
$('portrait').style.backgroundImage = `url(${bildUrl('bilder/portrait.jpg')})`; // Porträt oben links (aus konzept/hauptcharakter.png)
function applyStats() { const m = werte.mods(); player.applyStats(m);
  const lvB = $('lvBadge'), lv = String(werte.lv);
  if (lvB.textContent !== lv) { lvB.textContent = lv; lvB.classList.remove('pop'); void lvB.offsetWidth; lvB.classList.add('pop'); }
  $('hpBar').parentElement.style.width = Math.round(m.maxHp * BAR_PX) + 'px'; $('stBar').parentElement.style.width = Math.round(m.maxSt * BAR_PX) + 'px'; player.setWeapon(werte.waffe); cardMods.dmg = m.card; cardMods.critC = m.critC; cardMods.critD = m.critD; wurf.karte = werte.karte; player.god = werte.god; $('godTag').style.display = werte.god ? 'block' : 'none'; }
applyStats(); player.hp = player.maxHp; player.st = player.maxSt;
if (werte.truhe) truhe.setOpen();
let soulShow = werte.souls;
function gainSouls(n) {
  werte.addSouls(n);
  const g = $('soulGain'); g.textContent = '+' + n; g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
}
for (const d of dogs) d.onDeath = () => gainSouls(SOULS.hund);
boss.onDeath = () => gainSouls(SOULS.boss);
const menue = new Menue({ werte, player, apply: applyStats, onLevel: () => sfx.heal(),
  reset: () => { truhe.close(); },
  closeChest: () => { werte.truhe = false; werte.waffen = ['degen']; werte.waffe = 'degen'; werte.save(); truhe.close(); applyStats(); },
  jump: (w) => {
    const at = w === 'stone' ? [STONE.x + 0.4, STONE.z - 2.2] : w === 'gate' ? [(GATE.x0 + GATE.x1) / 2, GATE.z + 5]
      : w === 'truhe' ? [TRUHE.x - 7, TRUHE.z] : [(GATE.x0 + GATE.x1) / 2, GATE.z - 4];
    const yaw = w === 'truhe' ? Math.PI / 2 : Math.PI;
    player.pos.set(at[0], 0, at[1]); player.yaw = yaw; player.vel.set(0, 0); cam.yaw = yaw + Math.PI; cam.lock = null; passT = -1; setState('play');
  } });
setTimeout(() => karteLaden(werte.karte).catch(() => {}), 1500); // Kartenmodell fürs Inventar im Hintergrund vorbereiten
function openMenu(tab, atStone) { setState('pause'); menue.open(tab, atStone); }
/** am Seelenstein rasten: Leben, Ausdauer und Tränke voll, Hunde kommen zurück – dann aufsteigen */
function useStone() {
  player.hp = player.maxHp; player.st = player.maxSt; player.potions = player.maxPotions; player.exhausted = false;
  resetDogs(); sfx.heal(); openMenu('char', true);
}
boss.onSlam = (x, z, k, howl) => { // Aufschlag: Staub, Rütteln (je näher, desto stärker)
  const near = Math.max(0, 1 - Math.hypot(player.pos.x - x, player.pos.z - z) / 16);
  if (!howl) { for (let i = 0; i < 3; i++) dust(new THREE.Vector3(x + (Math.random() - 0.5) * 3, 0, z + (Math.random() - 0.5) * 3), 10); sfx.boom(); }
  cam.shake(0.03 + 0.1 * k * near); rumble(0.5 + 0.5 * near, 0.6, 250);
};
// Heiltrank: Glucksen, warme Funken steigen auf
const healFx = [], GLOWT = glowTex();
player.onDrink = (empty) => { if (!empty) setTimeout(() => sfx.gulp(), 520); else sfx.thud(); $('potions').classList.remove('pop'); void $('potions').offsetWidth; $('potions').classList.add('pop'); };
player.onHeal = (p) => {
  sfx.heal();
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOWT, color: 0xffb860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.35;
    s.position.set(p.x + Math.cos(a) * r, 0.2 + Math.random() * 0.8, p.z + Math.sin(a) * r); s.scale.setScalar(0.08 + Math.random() * 0.08);
    scene.add(s); healFx.push({ s, t: 0, life: 0.9 + Math.random() * 0.6, vy: 0.8 + Math.random() * 0.9 });
  }
};
function updateHealFx(dt) {
  for (let i = healFx.length - 1; i >= 0; i--) {
    const f = healFx[i]; f.t += dt; f.s.position.y += f.vy * dt; f.s.material.opacity = Math.sin(Math.PI * Math.min(1, f.t / f.life)) * 0.85;
    if (f.t > f.life) { scene.remove(f.s); f.s.material.dispose(); healFx.splice(i, 1); }
  }
}
let deathT = -1;
player.onDamage = (n, dead) => {
  rumble(dead ? 1 : 0.7, 0.8, dead ? 600 : 220);
  cam.shake(dead ? 0.1 : 0.06); sfx.hit(true);
  spray(new THREE.Vector3(player.pos.x, 1.1, player.pos.z), new THREE.Vector3(Math.sin(player.yaw + Math.PI), 0, Math.cos(player.yaw + Math.PI)), 8);
  if (dead) { deathT = 0; cam.lock = null; passT = -1; }
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
let state = 'title'; // title | play | pause
setupInput(canvas, () => state === 'play');

function setState(s) {
  state = s;
  $('title').classList.toggle('show', s === 'title');
  $('pause').classList.toggle('show', s === 'pause');
  $('hud').classList.toggle('on', s !== 'title');
  document.body.classList.toggle('menuOpen', s === 'pause');
  if (s !== 'play' && document.pointerLockElement) document.exitPointerLock();
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
  soulShow += (werte.souls - soulShow) * Math.min(1, dt * 6); if (Math.abs(werte.souls - soulShow) < 0.5) soulShow = werte.souls;
  $('soulN').textContent = Math.round(soulShow);
  $('potN').textContent = player.potions; $('potions').classList.toggle('empty', player.potions <= 0);
  // Bossleiste: erscheint mit dem Kampf, helle Schadensanzeige läuft nach
  const bb = $('bossBar'), bOn = boss.active && (!boss.dead || boss.deadT < 2.5);
  if (bOn) { bb.classList.add('on'); bb.style.opacity = boss.dead ? Math.max(0, 1 - (boss.deadT - 1.5)) : 1; $('bossName').textContent = boss.name;
    $('bossHp').style.width = (100 * boss.hp / BOSS_HP) + '%'; $('bossLag').style.width = (100 * boss.lag / BOSS_HP) + '%'; }
  else { bb.classList.remove('on'); bb.style.opacity = 0; }
  const vt = victoryT < 0 ? 0 : Math.min(1, victoryT / 0.8) * Math.max(0, Math.min(1, (5.5 - victoryT) / 1.0));
  $('victory').style.opacity = vt; $('victory').style.display = vt > 0 ? 'flex' : 'none';
  // Waffe gefunden (Truhe)
  const ft = foundT < 0 ? 0 : Math.min(1, foundT / 0.6) * Math.max(0, Math.min(1, (5.0 - foundT) / 0.9));
  $('found').style.opacity = ft; $('found').style.display = ft > 0 ? 'flex' : 'none';
  if (foundT > 6) foundT = -1;
  if (cam.lock) {
    pv.copy(cam.lock.pos).project(camera);
    lockMark.style.display = pv.z < 1 ? 'block' : 'none';
    lockMark.style.left = ((pv.x + 1) / 2 * window.innerWidth) + 'px';
    lockMark.style.top = ((1 - pv.y) / 2 * window.innerHeight) + 'px';
  } else lockMark.style.display = 'none';
  // Hinweis unten: passend zum Gerät, verschwindet nach ein paar Sekunden
  hintT -= dt;
  hint.style.display = hintT > 0 ? 'block' : 'none';
  hint.textContent = 'Die Straße hinauf nach Norden – hinter dem Nebel wartet etwas …  ' + (inp.touch ? '🧪 Heiltrank' : inp.pad ? 'Y: Heiltrank' : 'H: Heiltrank');
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
  $('hurtFx').style.opacity = Math.min(1, player.hurtFlash * 0.55 + (player.hp < 30 ? 0.25 + 0.1 * Math.sin(time * 4) : 0));
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
    if (menue.update(inp) === 'close') setState('play');
    else menue.frame(dt, inp);
  } else {
    if (inp.pause) { openMenu('char', false); }
    // Seelenstein / Truhe: in der Nähe Hinweis zeigen, A / Enter / Knopf benutzt sie
    const nearStone = deathT < 0 && passT < 0 && Math.hypot(player.pos.x - STONE.x, player.pos.z - STONE.z) < 2.4 && (player.state === 'idle');
    const nearChest = deathT < 0 && chestT < 0 && player.state === 'idle' && truhe.canOpen(player.pos);
    const key = inp.touch ? (nearChest ? '✋' : '🪨') : inp.pad ? 'A' : 'Enter';
    $('prompt').style.display = nearStone || nearChest ? 'block' : 'none';
    if (nearStone) $('prompt').innerHTML = `<b>${key}</b>Seelenstein · rasten und aufsteigen`;
    else if (nearChest) $('prompt').innerHTML = `<b>${key}</b>Truhe öffnen`;
    $('tUse').classList.toggle('on', nearStone || nearChest);
    const useLbl = nearChest ? '✋<small>Öffnen</small>' : '🪨<small>Seelenstein</small>';
    if ($('tUse').dataset.l !== useLbl) { $('tUse').innerHTML = useLbl; $('tUse').dataset.l = useLbl; } // nur bei Wechsel neu schreiben
    if (nearStone && inp.use) useStone();
    else if (nearChest && inp.use) { // Truhe öffnen: kurz stehen bleiben und hineinschauen, dann steigt die Klinge heraus
      chestT = 0; cam.lock = null;
      truhe.open(player, () => { werte.findWeapon('schwert'); foundT = 0; sfx.heal(); });
    }
    if (inp.lock && passT < 0) cam.toggleLock(player, targets);
    if (inp.flick) cam.switchTarget(player, targets, inp.flick);
    const f = cam.forward();
    // Stick relativ zur Kamera: oben = vorwärts (von der Kamera weg), rechts = (−f.z, f.x)
    mv.x = f.x * -inp.my - f.z * inp.mx;
    mv.z = f.z * -inp.my + f.x * inp.mx;
    // Nebeltor: wer hineinläuft, geht langsam hindurch (Steuerung ruht) – dahinter beginnt der Bosskampf
    let ctrl = inp;
    if (chestT >= 0) { // beim Öffnen der Truhe ruht die Steuerung kurz, der Magier schaut zur Truhe
      chestT += dt; ctrl = {}; mv.x = mv.z = 0;
      player.yaw += Math.atan2(Math.sin(TRUHE.yaw + Math.PI - player.yaw), Math.cos(TRUHE.yaw + Math.PI - player.yaw)) * Math.min(1, dt * 8);
      if (chestT > 1.3) chestT = -1;
    }
    if (foundT >= 0) foundT += dt;
    if (passT < 0 && !boss.dead && player.state !== 'dead' && fog.touches(player.pos)) { passT = 0; fog.rip = 1; cam.lock = null; sfx.card(); }
    if (passT < 0 && !boss.active && !boss.dead && player.pos.z < GATE.z - 0.3) { fog.seal(); boss.start(); } // z. B. hindurchgerollt
    if (passT >= 0) {
      passT += dt; ctrl = {}; mv.x = (((GATE.x0 + GATE.x1) / 2) - player.pos.x) * 0.4; mv.z = -0.42;
      if (player.pos.z < GATE.z - 1.4 || passT > 3) { passT = -1; fog.seal(); boss.start(); }
    }
    // Trefferstopp: bei einem Treffer friert alles kurz ein (fühlt sich wuchtiger an)
    const pdt = player.hitStop > 0 ? dt * 0.08 : dt;
    player.hitStop = Math.max(0, player.hitStop - dt);
    player.update(pdt, mv, ctrl, cam.lock ? cam.lock.pos : null, f);
    updateDogs(pdt, player);
    boss.update(pdt, player);
    if (boss.dead && victoryT < 0) { victoryT = 0; fog.vanish(); player.potions = player.maxPotions; }
    if (victoryT >= 0) victoryT += dt;
    if (deathT >= 0) {
      deathT += dt;
      if (deathT > 4.2) { deathT = -1; player.revive(REST.x, REST.z - 1.2, REST.yaw); resetDogs(); cam.yaw = REST.yaw + Math.PI; if (!boss.dead) { boss.reset(); fog.reset(); } }
    }
    cam.update(dt, player, cam.lock ? 0 : inp.cx, cam.lock ? 0 : inp.cy);
    hud(dt);
    enemyHud();
  }
  fill.position.set(player.pos.x + (camera.position.x - player.pos.x) * 0.35, 2.4, player.pos.z + (camera.position.z - player.pos.z) * 0.35);
  updateWorld(dt, time, world, player.pos);
  if (state !== 'pause') { updateCards(dt); updateBlood(dt); updateHealFx(dt); }
  fog.update(dt);
  truhe.update(dt);
  post.render(time);
}
setState('title');
requestAnimationFrame(frame);
