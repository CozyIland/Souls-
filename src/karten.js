// Geworfene Karten: fliegen drehend geradeaus (oder leicht zum erfassten Ziel), bleiben in Puppen und Wänden stecken.
import * as THREE from 'three';
import { toon } from './toon.js';
import { colliders } from './kollision.js';
import { cardFront, CARD_BACK, CARD_W, CARD_H } from './kartenbild.js';
import { GLOW } from './requisiten.js';
import { rumble } from './input.js';
import { spray } from './blut.js';
import { sfx } from './ton.js';

const SPEED = 24, LIFE = 0.9, STICK = 2.5;
const CARD_DMG = 8;
export const cardMods = { dmg: 1, critC: 0, critD: 1.5 }; // Magie (stufe.js) macht Karten stärker; Krit wie beim Degen
const flying = [], stuck = [], sparks = [];
let scene = null, targets = [];

export function setupCards(sc, tg) { scene = sc; targets = tg; }

/** eine Karte als Mesh (flach in der XZ-Ebene, Spitze nach +Z) */
export function cardMesh(suit) {
  const g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), toon(0xffffff, { map: cardFront(suit) }));
  f.rotation.x = -Math.PI / 2; f.position.y = 0.0012; g.add(f);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), toon(0xffffff, { map: CARD_BACK }));
  b.rotation.x = Math.PI / 2; b.position.y = -0.0012; g.add(b);
  const e = new THREE.Mesh(new THREE.BoxGeometry(CARD_W + 0.006, 0.0016, CARD_H + 0.006), toon(0x15100c)); g.add(e);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

const SUITS = ['♠', '♥', '♦', '♣'];
let suitI = 0;
/** ausgerüstete Karte (Inventar): ihre Zeichen trägt jede geworfene Karte */
export const wurf = { karte: null };
const FACE = { herzass: 'A♥' };
export function nextSuit() { return FACE[wurf.karte] || SUITS[suitI++ % 4]; }

/** Karte losschicken: from = Startpunkt, dir = Richtung (Länge egal), target = erfasstes Ziel oder null */
export function throwCard(from, dir, target, suit) {
  sfx.card();
  const m = cardMesh(suit);
  m.position.copy(from);
  scene.add(m);
  const trail = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffc860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.scale.setScalar(0.18 - i * 0.02); scene.add(s); trail.push(s);
  }
  flying.push({ m, vel: dir.clone().normalize().multiplyScalar(SPEED), t: 0, target, trail, hist: [] });
}

function burst(p, col, n) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(p); s.scale.setScalar(0.12); scene.add(s);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
    sparks.push({ s, v, t: 0, life: 0.25 + Math.random() * 0.25 });
  }
}

function stick(c, hitNode) {
  for (const s of c.trail) { scene.remove(s); s.material.dispose(); }
  if (hitNode) { hitNode.attach(c.m); }
  stuck.push({ m: c.m, t: 0 });
}

/** Treffer mit dem Degen: Funken, Puppe wackelt, Controller rüttelt */
export function hitFx(tg, dir, heavy, dmg, poise) {
  const p = tg.pos.clone(); p.addScaledVector(dir, -0.25);
  if (tg.onHit) { // Lebewesen: Blut statt Funken, kein Aufleuchten
    spray(p, dir, heavy ? 26 : 14);
    sfx.hit(heavy);
    tg.onHit(dmg || 10, dir, heavy, poise);
  } else { // Übungspuppe: Stroh/Staub
    burst(p, 0xd8c08a, heavy ? 16 : 9);
    sfx.thud();
    tg.hitT = 0.6; tg.hitDir = dir.clone();
  }
  rumble(heavy ? 0.8 : 0.4, heavy ? 0.6 : 0.5, heavy ? 180 : 100);
}

/** Staubwolke am Boden (Rolle, Landung) */
let dustTex = null;
export function dust(p, n = 8) {
  if (!dustTex) dustTex = GLOW;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0x6a5a4c, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.position.set(p.x + (Math.random() - 0.5) * 0.5, 0.12, p.z + (Math.random() - 0.5) * 0.5); s.scale.setScalar(0.3);
    scene.add(s);
    const a = Math.random() * Math.PI * 2;
    sparks.push({ s, v: new THREE.Vector3(Math.cos(a) * 1.2, 0.5 + Math.random() * 0.4, Math.sin(a) * 1.2), t: 0, life: 0.6 + Math.random() * 0.4, dust: true });
  }
}

const tmp = new THREE.Vector3(), want = new THREE.Vector3();
export function updateCards(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const c = flying[i];
    c.t += dt;
    // leicht zum Ziel lenken
    if (c.target) {
      want.copy(c.target.pos).sub(c.m.position).normalize().multiplyScalar(SPEED);
      c.vel.lerp(want, Math.min(1, dt * 6));
    }
    const steps = 3; // in kleinen Schritten, damit nichts durchfliegt
    let hit = null, wall = false;
    for (let k = 0; k < steps && !hit && !wall; k++) {
      c.m.position.addScaledVector(c.vel, dt / steps);
      const p = c.m.position;
      for (const tg of targets) {
        if (!tg.dead && (tg.hitTest ? tg.hitTest(p) : Math.hypot(p.x - tg.pos.x, p.z - tg.pos.z) < (tg.onHit ? 0.5 : 0.4) && Math.abs(p.y - tg.pos.y) < 0.9)) { hit = tg; break; }
      }
      if (!hit && p.y < 2.5) for (const b of colliders) if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) { wall = true; break; }
      if (p.y < 0.03) { p.y = 0.03; wall = true; }
    }
    // Ausrichtung: flach, Spitze in Flugrichtung, dreht sich schnell um die eigene Hochachse
    c.m.lookAt(tmp.copy(c.m.position).add(c.vel));
    c.m.rotateZ(Math.sin(c.t * 40) * 0.08);
    c.m.children.forEach((ch) => { ch.rotation.z = 0; });
    c.m.rotateY(c.t * 38);
    // Leuchtspur
    c.hist.unshift(c.m.position.clone()); if (c.hist.length > 12) c.hist.pop();
    c.trail.forEach((s, j) => { const h = c.hist[Math.min(c.hist.length - 1, j * 2)]; s.position.copy(h); s.material.opacity = 0.6 * (1 - j / c.trail.length); });
    if (hit) {
      if (!hit.onHit) burst(c.m.position, 0xffd27a, 10);
      if (hit.onHit) { const dd = c.vel.clone().setY(0).normalize(); spray(c.m.position, dd, 6); sfx.hit(false); hit.onHit(Math.round(CARD_DMG * cardMods.dmg * (Math.random() < cardMods.critC ? cardMods.critD : 1)), dd, false, 5); }
      else { hit.hitT = 0.6; hit.hitDir = c.vel.clone().normalize(); }
      rumble(0.2, 0.5, 90);
      flying.splice(i, 1); stick(c, hit.node);
    } else if (wall) {
      burst(c.m.position, 0xffe8c0, 6);
      flying.splice(i, 1); stick(c, null);
    } else if (c.t > LIFE) {
      flying.splice(i, 1); c.m.visible = false; stick(c, null); stuck[stuck.length - 1].t = STICK;
    }
  }
  for (let i = stuck.length - 1; i >= 0; i--) {
    const s = stuck[i]; s.t += dt;
    if (s.t > STICK) { s.m.removeFromParent(); stuck.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i]; p.t += dt;
    if (p.dust) { p.v.multiplyScalar(Math.exp(-4 * dt)); p.s.scale.setScalar(0.3 + p.t * 1.6); p.s.material.opacity = 0.5 * (1 - p.t / p.life); }
    else { p.v.y -= 9 * dt; p.s.material.opacity = 1 - p.t / p.life; }
    p.s.position.addScaledVector(p.v, dt);
    if (p.t > p.life) { scene.remove(p.s); p.s.material.dispose(); sparks.splice(i, 1); }
  }
  // getroffene Puppen wackeln
  for (const tg of targets) {
    if (!tg.hitT) continue;
    tg.hitT = Math.max(0, tg.hitT - dt);
    const k = tg.hitT / 0.6, a = Math.sin((1 - k) * 28) * 0.18 * k;
    tg.node.rotation.x = a * (tg.hitDir ? tg.hitDir.z : 1);
    tg.node.rotation.z = -a * (tg.hitDir ? tg.hitDir.x : 0);
  }
}
