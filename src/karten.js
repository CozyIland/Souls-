// Geworfene Karten: fliegen drehend geradeaus (oder leicht zum erfassten Ziel), bleiben in Puppen und Wänden stecken.
import * as THREE from 'three';
import { toon } from './toon.js';
import { colliders } from './kollision.js';
import { cardFront, CARD_BACK, CARD_W, CARD_H } from './kartenbild.js';
import { GLOW } from './requisiten.js';
import { rumble } from './input.js';

const SPEED = 24, LIFE = 0.9, STICK = 2.5;
const CARD_DMG = 8;
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
export function nextSuit() { return SUITS[suitI++ % 4]; }

/** Karte losschicken: from = Startpunkt, dir = Richtung (Länge egal), target = erfasstes Ziel oder null */
export function throwCard(from, dir, target, suit) {
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
export function hitFx(tg, dir, heavy, dmg) {
  const p = tg.pos.clone(); p.addScaledVector(dir, -0.25);
  burst(p, tg.onHit ? (heavy ? 0xff6040 : 0xff9a70) : (heavy ? 0xffc860 : 0xe8f0ff), heavy ? 26 : 14);
  if (tg.onHit) tg.onHit(dmg || 10, dir, heavy);
  else { tg.hitT = 0.6; tg.hitDir = dir.clone(); }
  rumble(heavy ? 0.8 : 0.4, heavy ? 0.6 : 0.5, heavy ? 180 : 100);
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
        if (!tg.dead && Math.hypot(p.x - tg.pos.x, p.z - tg.pos.z) < (tg.onHit ? 0.5 : 0.4) && Math.abs(p.y - tg.pos.y) < 0.9) { hit = tg; break; }
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
      burst(c.m.position, 0xffd27a, 14);
      if (hit.onHit) hit.onHit(CARD_DMG, c.vel.clone().setY(0).normalize(), false);
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
    const p = sparks[i]; p.t += dt; p.v.y -= 9 * dt;
    p.s.position.addScaledVector(p.v, dt); p.s.material.opacity = 1 - p.t / p.life;
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
