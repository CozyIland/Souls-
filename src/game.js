// Kampflogik: Spieler, Vargoth (der lernende Boss), Geschosse, Effekte und Runden.
// Gerechnet wird auf einer flachen Ebene (x, y) in Spiel-Einheiten; die 3D-Darstellung
// übersetzt das in die Welt (40 Einheiten = 1 Meter).
import {
  TAU, ARENA_R, clamp, lerp, rand, angDiff, turnToward, dist, norm, damp, easeOut,
} from './util.js';
import { mem, T, updateTraits } from './memory.js';
import { sfx, noise } from './audio.js';
import { input, rumble } from './input.js';

// ================================================================
//  Spielzustand
// ================================================================
export const G = {
  state: 'menu', paused: false, time: 0, hitstop: 0, shake: 0, round: 1,
  introT: 0, endTimer: 0, result: null, summaryShown: false, lastFloat: -9,
  particles: [], projectiles: [], hazards: [], texts: [], ghosts: [],
  quote: '', startTraits: null, hpLag: 1, bossLag: 1,
};
export let P;
export let B;

function newPlayer() {
  return {
    x: 0, y: 250, vx: 0, vy: 0, r: 17, face: -Math.PI / 2, hp: 100, maxHp: 100, st: 100, maxSt: 100, stDelay: 0,
    flasks: 3, state: 'idle', t: 0, invuln: 0, atk: null, combo: 0, rollDir: { x: 0, y: 0 }, swordA: 0.9,
    healDone: false, walk: 0, hurtFlash: 0,
  };
}
function newBoss() {
  return {
    x: 0, y: -170, vx: 0, vy: 0, r: 40, face: Math.PI / 2, hp: 700, maxHp: 700, state: 'idle', t: 0, idleDur: 1.4,
    atk: null, last: [], poise: 100, poiseT: 0, phase2: false, swordA: 1.0, z: 0, flash: 0, airborne: false,
    pending: null, pendingOpts: null, pendingRange: 160, seed: Math.random() * 10, distAcc: 0, behindT: 0, behindChecked: false,
    greedWindow: false, greedCounted: false, glow: 0, swingFrom: 0, alpha: 1, cape: 0, walk: 0,
  };
}

/** Szene fürs Hauptmenü: Boss steht in der Mitte, Spieler weit weg */
export function prepareMenuScene() {
  P = newPlayer(); P.x = 9999; P.y = 9999; P.hp = 0;
  B = newBoss(); B.x = 0; B.y = 0;
  G.projectiles = []; G.hazards = []; G.texts = []; G.ghosts = [];
}

// ================================================================
//  Effekte (werden von der 3D-Darstellung gezeichnet)
//  h = Höhe über dem Boden, vh = Steiggeschwindigkeit, g = Schwerkraft
// ================================================================
export function addP(o) {
  if (G.particles.length >= 700) return;
  if (o.h === undefined) {
    if (o.kind === 'ember' || (o.kind === 'spark' && o.drag === 0)) {
      // aufsteigende Funken: das alte "nach oben" (vy < 0) wird echte Höhe
      o.h = o.hStart !== undefined ? o.hStart : rand(5, 40);
      o.vh = -o.vy; o.vy = rand(-8, 8); o.g = 0;
    } else if (o.kind === 'smoke') {
      o.h = rand(4, 16); o.vh = rand(10, 40); o.g = 0;
    } else if (o.kind === 'ring') {
      o.h = 3; o.vh = 0; o.g = 0;
    } else {
      o.h = rand(30, 70); o.vh = rand(60, 260); o.g = 700;
    }
  }
  G.particles.push(o);
}
function sparks(x, y, n, col, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.3, 1) * (spd || 380);
    addP({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.5), max: 0.5, size: rand(1.5, 3), col: col || '255,200,120', add: true, drag: 4, kind: 'spark' });
  }
}
function dust(x, y, n, spd, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.2, 1) * (spd || 120);
    addP({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.1), max: 1.1, size: rand(6, 14) * (size || 1), col: '120,105,85', add: false, drag: 3, kind: 'smoke' });
  }
}
function blood(x, y, ang, n) {
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-0.7, 0.7), s = rand(120, 380);
    addP({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.6), max: 0.6, size: rand(2, 4), col: '150,20,20', add: false, drag: 5, kind: 'spark' });
  }
}
function ring(x, y, r, col) {
  addP({ x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: r, col: col || '255,190,110', add: true, drag: 0, kind: 'ring' });
}
function floatText(txt, col, force) {
  if (!force && G.time - G.lastFloat < 0.9) return;
  G.lastFloat = G.time;
  G.texts.push({ x: B.x, y: B.y, h: 150 + B.z, txt, col: col || '232,195,114', life: 1.7, max: 1.7, size: 19, vy: -26 });
}
function learnText(txt) { floatText(txt, '240,170,90'); sfx.learn(); }
function dmgText(x, y, h, n, col) {
  G.texts.push({ x: x + rand(-14, 14), y, h, txt: String(Math.round(n)), col: col || '255,235,200', life: 0.9, max: 0.9, size: 15, vy: -50 });
}

// ================================================================
//  Spieler
// ================================================================
export function isInvuln(p) {
  return (p.state === 'roll' && p.t > 0.04 && p.t < 0.38) || p.invuln > 0 || p.state === 'dead';
}

function tryAction(a, ml) {
  const p = P, b = B, toB = Math.atan2(b.y - p.y, b.x - p.x);
  if (a === 'roll') {
    if (p.st <= 0) return;
    p.st -= 22; p.stDelay = 0.55;
    let dx, dy;
    if (ml > 0.2) { dx = input.mx / ml; dy = input.my / ml; } else { dx = -Math.cos(toB); dy = -Math.sin(toB); }
    p.rollDir = { x: dx, y: dy }; p.state = 'roll'; p.t = 0; p.atk = null; input.buf = null;
    mem.rolls++; learnRoll(dx, dy); sfx.roll(); dust(p.x, p.y, 4, 80, 0.7);
  } else if (a === 'light' || a === 'heavy') {
    if (p.st <= 0) return;
    const heavy = a === 'heavy';
    const chain = p.state === 'attack' && !heavy && p.atk && p.atk.type === 'light';
    p.combo = chain ? (p.combo + 1) % 3 : 0;
    p.atk = {
      type: a, phase: 'wind', t: 0, wind: heavy ? 0.42 : 0.12, act: heavy ? 0.14 : 0.1, rec: heavy ? 0.44 : 0.27,
      dmg: heavy ? 19 : (p.combo === 2 ? 10 : 7), range: heavy ? 86 : 72, arc: heavy ? 2.1 : 1.8,
      dir: heavy ? 1 : (p.combo % 2 ? -1 : 1), hitDone: false, from: 0,
    };
    p.st -= heavy ? 32 : 16; p.stDelay = 0.7; p.state = 'attack'; p.t = 0; input.buf = null;
    if (b.greedWindow && !b.greedCounted) { b.greedCounted = true; mem.greedHit++; }
  } else if (a === 'heal') {
    input.buf = null;
    if (p.flasks <= 0) return;
    p.flasks--; p.state = 'heal'; p.t = 0; p.healDone = false; p.atk = null;
    mem.heals++; if (dist(p, b) < 260) mem.healsClose++;
    bossOnHeal();
  }
}

function updatePlayer(dt) {
  const p = P, b = B;
  if (input.bufT > 0) { input.bufT -= dt; if (input.bufT <= 0) input.buf = null; }
  p.invuln = Math.max(0, p.invuln - dt); p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.t += dt;
  const toB = Math.atan2(b.y - p.y, b.x - p.x);
  const ml = Math.hypot(input.mx, input.my);
  if (p.stDelay > 0) p.stDelay -= dt;
  else if (p.state !== 'roll' && p.state !== 'attack') p.st = Math.min(p.maxSt, p.st + (p.state === 'heal' ? 14 : 44) * dt);

  if (p.state === 'dead') { p.vx *= Math.exp(-dt * 5); p.vy *= Math.exp(-dt * 5); p.x += p.vx * dt; p.y += p.vy * dt; return; }

  const canAct = G.state === 'play' || G.state === 'intro';
  const free = p.state === 'idle' ||
    (p.state === 'attack' && p.atk.phase === 'rec' && p.atk.t > p.atk.rec * 0.35) ||
    (p.state === 'roll' && p.t > 0.42);
  if (canAct && free && input.buf) tryAction(input.buf, ml);

  switch (p.state) {
    case 'idle': {
      const spd = 180;
      p.vx = lerp(p.vx, input.mx * spd, damp(14, dt)); p.vy = lerp(p.vy, input.my * spd, damp(14, dt));
      p.face = turnToward(p.face, toB, dt * 10);
      if (ml > 0.1) p.walk += dt * 11 * ml;
      p.swordA = lerp(p.swordA, 0.9, damp(10, dt));
      break;
    }
    case 'roll': {
      const k = p.t / 0.5, sp = k < 0.76 ? 460 * (1 - k * 0.55) : 110;
      p.vx = p.rollDir.x * sp; p.vy = p.rollDir.y * sp;
      if (Math.random() < 0.35) G.ghosts.push({ x: p.x, y: p.y, face: p.face, t: p.t, life: 0.25 });
      if (p.t >= 0.5) p.state = 'idle';
      break;
    }
    case 'attack': updatePlayerAttack(dt, toB); break;
    case 'heal': {
      p.vx = lerp(p.vx, input.mx * 55, damp(10, dt)); p.vy = lerp(p.vy, input.my * 55, damp(10, dt));
      p.face = turnToward(p.face, toB, dt * 6);
      if (Math.random() < 0.6) addP({ x: p.x + rand(-14, 14), y: p.y + rand(-10, 10), vx: 0, vy: rand(-60, -30), life: 0.8, max: 0.8, size: rand(1.5, 3), col: '255,220,120', add: true, drag: 0, kind: 'spark', hStart: rand(5, 50) });
      if (!p.healDone && p.t > 0.6) {
        p.healDone = true; const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + 45);
        sfx.heal(); ring(p.x, p.y, 40, '255,220,140');
        G.texts.push({ x: p.x, y: p.y, h: 80, txt: '+' + Math.round(p.hp - before), col: '170,230,140', life: 1, max: 1, size: 15, vy: -40 });
      }
      if (p.t > 1.0) p.state = 'idle';
      break;
    }
    case 'hurt': {
      p.vx *= Math.exp(-dt * 6); p.vy *= Math.exp(-dt * 6);
      if (p.t > 0.38) p.state = 'idle';
      break;
    }
    default: break;
  }
  p.x += p.vx * dt; p.y += p.vy * dt;
  confine(p);
}

function updatePlayerAttack(dt, toB) {
  const p = P, a = p.atk; a.t += dt;
  const heavy = a.type === 'heavy';
  p.face = turnToward(p.face, toB, dt * (a.phase === 'wind' ? 14 : 2.5));
  const fwd = a.phase === 'act' ? (heavy ? 190 : 120) : 0;
  p.vx = lerp(p.vx, Math.cos(p.face) * fwd, damp(12, dt)); p.vy = lerp(p.vy, Math.sin(p.face) * fwd, damp(12, dt));
  const from = a.dir * (heavy ? 2.3 : 1.9), to = -a.dir * (heavy ? 1.9 : 1.5);
  if (a.phase === 'wind') {
    p.swordA = lerp(p.swordA, from, damp(heavy ? 9 : 22, dt));
    if (a.t >= a.wind) { a.phase = 'act'; a.t = 0; a.from = p.swordA; sfx.swing(heavy); }
  } else if (a.phase === 'act') {
    p.swordA = lerp(a.from, to, easeOut(Math.min(1, a.t / a.act)));
    if (!a.hitDone) checkPlayerHit(a);
    if (a.t >= a.act) { a.phase = 'rec'; a.t = 0; }
  } else {
    if (a.t > a.rec * 0.5) p.swordA = lerp(p.swordA, 0.9, damp(8, dt));
    if (a.t >= a.rec) { p.state = 'idle'; p.atk = null; p.combo = 0; }
  }
}

function inArc(ox, oy, face, range, arc, tx, ty, tr) {
  const dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy);
  if (d - tr > range) return false;
  if (d < tr + 4) return true;
  const slack = Math.asin(Math.min(1, tr / d));
  return Math.abs(angDiff(face, Math.atan2(dy, dx))) <= arc / 2 + slack;
}

function checkPlayerHit(a) {
  const p = P, b = B;
  if (b.airborne || b.state === 'dead') return;
  if (!inArc(p.x, p.y, p.face, a.range, a.arc, b.x, b.y, b.r)) return;
  a.hitDone = true;
  const heavy = a.type === 'heavy';
  const ang = Math.atan2(b.y - p.y, b.x - p.x);
  const hx = b.x - Math.cos(ang) * b.r * 0.8, hy = b.y - Math.sin(ang) * b.r * 0.8;
  sparks(hx, hy, heavy ? 22 : 12, '255,210,140', heavy ? 480 : 340); blood(hx, hy, ang, heavy ? 8 : 4);
  G.hitstop = heavy ? 0.085 : 0.05; G.shake = Math.max(G.shake, heavy ? 7 : 3.5);
  sfx.hit(heavy); dmgText(b.x, b.y, 110, a.dmg);
  rumble(heavy ? 0.45 : 0.15, heavy ? 0.6 : 0.35, heavy ? 120 : 70);
  bossTakeDamage(a.dmg, heavy);
}

function hurtPlayer(dmg, ang, src) {
  const p = P;
  if (isInvuln(p)) return false;
  if (G.state === 'ending' && G.result) return false;
  p.hp -= dmg; p.invuln = 0.45; p.hurtFlash = 0.25; p.atk = null;
  p.state = 'hurt'; p.t = 0;
  p.vx = Math.cos(ang) * 330; p.vy = Math.sin(ang) * 330;
  G.hitstop = 0.1; G.shake = Math.max(G.shake, 11);
  blood(p.x, p.y, ang, 14); sparks(p.x, p.y, 8, '255,120,90', 300); sfx.hurt(); rumble(0.85, 0.6, 240);
  const at = src === undefined ? B.atk : src;
  if (at && !at.hit) { at.hit = true; if (at.done && mem.atk[at.name]) mem.atk[at.name].h++; }
  if (p.hp <= 0) { p.hp = 0; p.state = 'dead'; p.t = 0; roundEnd(false); }
  return true;
}

function learnRoll(dx, dy) {
  const b = B;
  if (b.state !== 'attack' || !b.atk) return;
  const a = b.atk, ph = a.phases[a.i]; if (!ph) return;
  if (!['wind', 'swing', 'spin', 'dash', 'leap'].includes(ph.k)) return;
  // Reaktionszeit: wann rollt der Spieler relativ zur Ausholbewegung?
  const next = a.phases[a.i + 1];
  if (ph.k === 'wind' && ph.base && !ph.rollRec && next && ['swing', 'spin', 'dash'].includes(next.k)) {
    ph.rollRec = true; mem.react.sum += clamp(ph.t / ph.base, 0, 1.5); mem.react.n++;
  } else if (ph.k === 'swing' || ph.k === 'spin' || ph.k === 'dash') {
    const prev = a.phases[a.i - 1];
    if (prev && prev.k === 'wind' && !prev.rollRec) { prev.rollRec = true; mem.react.sum += 1.05; mem.react.n++; }
  }
  // Richtung (aus Sicht des Spielers, der auf den Boss blickt)
  const f = norm(P.x - b.x, P.y - b.y), dot = dx * f.x + dy * f.y;
  let cat;
  if (dot > 0.55) cat = 'back'; else if (dot < -0.55) cat = 'toward';
  else cat = (dx * f.y - dy * f.x) > 0 ? 'right' : 'left';
  mem.dir[cat]++;
}

// ================================================================
//  Boss
// ================================================================
function mkAttack(name, opts) {
  const sp = B.phase2 ? 0.84 : 1;
  const W_ = (d, o) => Object.assign({ k: 'wind', d, base: d, track: 5, move: 0, from: 2.0 }, o);
  switch (name) {
    case 'slash': return [W_(0.62 * sp, { track: 5, move: 50, from: 2.1 }), { k: 'swing', d: 0.17, range: 138, arc: 2.4, dmg: 22, lunge: 260, to: -1.7 }, { k: 'rec', d: 0.75 * sp }];
    case 'combo': {
      const arr = [], n = B.phase2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        arr.push(W_((i === 0 ? 0.56 : 0.3) * sp, { track: 4.5, move: 70, from: i % 2 ? -1.9 : 2.0 }));
        arr.push({ k: 'swing', d: 0.14, range: 128, arc: 2.2, dmg: i === n - 1 ? 24 : 15, lunge: 220, to: i % 2 ? 1.7 : -1.7 });
      }
      arr.push({ k: 'rec', d: 0.85 * sp }); return arr;
    }
    case 'sweep': return [W_(0.72 * sp, { track: 1.2, from: 2.7, spinPrep: true }), { k: 'spin', d: 0.32, r: 152, dmg: 21 }, { k: 'rec', d: 0.7 * sp }];
    case 'charge': return [W_(0.78 * sp, { track: 6, move: -50, from: 0.15, chargeAim: true }), { k: 'dash', d: 0.55, speed: 640, dmg: 26 }, { k: 'rec', d: 0.8 * sp }];
    case 'slam': return [W_(0.45 * sp, { track: 3, from: -0.4 }), { k: 'leap', d: 0.85 * sp }, { k: 'land', d: 0.14, r: 118, dmg: 30 }, { k: 'rec', d: 0.9 * sp }];
    case 'orbs': return [W_((opts && opts.fast ? 0.3 : 0.62) * sp, { track: 6, move: -70, from: 0.7 }), { k: 'shoot', d: 0.1, n: B.phase2 ? 7 : 5 }, { k: 'rec', d: 0.55 * sp }];
    case 'lunge': return [W_(0.24, { track: 9, move: 200, from: 2.2 }), { k: 'swing', d: 0.17, range: 145, arc: 2.2, dmg: 26, lunge: 900, to: -1.7 }, { k: 'rec', d: 0.8 }];
    default: return [{ k: 'rec', d: 0.5 }];
  }
}

function chooseAttack(d) {
  const w = {}, near = d < 175;
  w.slash = near ? 3 : 0.25;
  w.combo = near ? 2.4 : 0.2;
  w.sweep = (d < 165 ? 1.1 : 0.05) * (1 + T.behind * 4);
  w.charge = (d > 230 ? 2.2 : d > 150 ? 0.6 : 0.1) * (1 + T.far * 1.5);
  w.slam = d > 140 ? 1.4 : 0.5;
  w.orbs = (d > 260 ? 1.8 : 0.15) * (1 + T.far * 1.2) * (B.phase2 ? 1.4 : 1);
  for (const k in w) { // Erfolg aus früheren Runden gewichtet die Wahl
    const e = T.eff[k]; w[k] *= lerp(1, 0.35 + 2.3 * e.e, e.c);
  }
  const l = B.last;
  if (l[0] in w && l[0] === l[1]) w[l[0]] *= 0.12; else if (l[0] in w) w[l[0]] *= 0.6;
  let sum = 0; for (const k in w) sum += w[k];
  let r = Math.random() * sum;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'slash';
}
const MELEE = { slash: 175, combo: 165, sweep: 150, lunge: 220 };

function planAttack(name, opts) {
  const b = B, d = dist(b, P);
  if (MELEE[name] && d > MELEE[name] + 20) { b.state = 'approach'; b.t = 0; b.pending = name; b.pendingOpts = opts || {}; b.pendingRange = MELEE[name]; }
  else startAttack(name, opts || {});
}

function startAttack(name, opts) {
  const b = B; opts = opts || {};
  b.state = 'attack'; b.t = 0;
  b.atk = { name, phases: mkAttack(name, opts), i: 0, hit: false, counterDecided: false, isCounter: false, tag: opts.tag || null };
  b.last.unshift(name); b.last.length = 3;
  const first = b.atk.phases[0];
  // Gelernt: Spieler rollt zu früh -> Angriff verzögern
  if (!opts.noFeint && ['slash', 'combo', 'sweep', 'charge'].includes(name) && Math.random() < T.feint) {
    first.feint = rand(0.35, 0.55); first.d += first.feint;
  }
  if (name === 'combo' && T.feint > 0.3) {
    b.atk.phases.forEach((ph, i) => { if (i > 0 && ph.k === 'wind' && Math.random() < T.feint * 0.5) { ph.feint = rand(0.25, 0.4); ph.d += ph.feint; } });
  }
  if (opts.tag) learnText(opts.tag);
  enterPhase();
}

function aimAngle(strength) {
  const b = B, p = P, f = norm(p.x - b.x, p.y - b.y);
  let tx = p.x, ty = p.y;
  const side = T.aimSide * (strength == null ? 1 : strength);
  if (Math.abs(side) > 0.08) { tx += f.y * side * 80; ty += -f.x * side * 80; }
  return Math.atan2(ty - b.y, tx - b.x);
}

function enterPhase() {
  const b = B, a = b.atk, ph = a.phases[a.i], p = P;
  ph.t = 0; ph.hitDone = false; ph.rollRec = false;
  const prev = a.phases[a.i - 1];
  switch (ph.k) {
    case 'wind': break;
    case 'swing': {
      const aim = aimAngle();
      b.face = turnToward(b.face, aim, 0.75);
      ph.range += T.back * 48; ph.lunge *= (1 + T.back * 0.9);
      b.swingFrom = b.swordA; sfx.bossSwing();
      if (prev && prev.feint) learnText('Verzögerter Schlag');
      else if (Math.abs(T.aimSide) > 0.3 && Math.random() < 0.35) learnText('Liest deine Rolle');
      else if (T.back > 0.3 && Math.random() < 0.25) learnText('Lange Reichweite');
      break;
    }
    case 'spin':
      b.swingFrom = b.swordA; sfx.bossSwing();
      if (a.isCounter && !ph.isOrig) learnText('Konter!'); else if (prev && prev.feint) learnText('Verzögerter Schlag');
      break;
    case 'dash':
      ph.dir = aimAngle(0.8); b.face = ph.dir; sfx.bossSwing();
      if (prev && prev.feint) learnText('Verzögerter Ansturm');
      break;
    case 'leap': {
      ph.sx = b.x; ph.sy = b.y; ph.tx = p.x; ph.ty = p.y; b.airborne = true; dust(b.x, b.y, 10, 160);
      noise(0.4, 300, 900, 'bandpass', 0.3); break;
    }
    case 'land': {
      b.airborne = false; b.z = 0; G.shake = Math.max(G.shake, 15); sfx.slam(); rumble(0.6, 0.3, 260);
      dust(b.x, b.y, 22, 260, 1.4); ring(b.x, b.y, ph.r, '255,170,90'); sparks(b.x, b.y, 24, '255,170,90', 420);
      if (dist(b, p) < ph.r + p.r) hurtPlayer(ph.dmg, Math.atan2(p.y - b.y, p.x - b.x));
      if (T.rollSpam > 0.12 && Math.random() < 0.3 + T.rollSpam) {
        G.hazards.push({ x: b.x, y: b.y, t: -0.32, dur: 0.38, rMax: 250, dmg: 18, hit: false });
        learnText('Nachbeben');
      }
      break;
    }
    case 'shoot': {
      const n = ph.n, base = aimAngle(0.7), spd = 330;
      for (let i = 0; i < n; i++) {
        const an = base + (i - (n - 1) / 2) * 0.22;
        G.projectiles.push({ x: b.x + Math.cos(an) * 50, y: b.y + Math.sin(an) * 50, vx: Math.cos(an) * spd, vy: Math.sin(an) * spd, atk: b.atk, r: 11, dmg: 14, life: 3.2, home: b.phase2 ? 0.9 : 0 });
      }
      sfx.orb(); sparks(b.x + Math.cos(base) * 50, b.y + Math.sin(base) * 50, 10, '255,110,70', 200);
      break;
    }
    case 'rec': {
      if (!a.counterDecided) {
        a.counterDecided = true; b.greedWindow = true; b.greedCounted = false; mem.greedOpp++;
        // Gelernt: Spieler greift gierig nach Kombos an -> Konter einschieben
        if (a.name !== 'lunge' && Math.random() < T.greed) {
          a.isCounter = true;
          a.phases.splice(a.i, 0, { k: 'wind', d: 0.24, base: 0.24, track: 7, move: 0, from: 2.6 }, { k: 'spin', d: 0.28, r: 130, dmg: 18 });
          enterPhase();
          return;
        }
      }
      break;
    }
    default: break;
  }
}

function updateBossAttack(dt, d, toP) {
  const b = B, p = P, a = b.atk, ph = a.phases[a.i];
  ph.t += dt;
  const k = Math.min(1, ph.t / ph.d);
  switch (ph.k) {
    case 'wind': {
      b.face = turnToward(b.face, toP, dt * ph.track * (b.phase2 ? 1.2 : 1));
      const mv = d > 90 ? ph.move : Math.min(0, ph.move);
      b.vx = lerp(b.vx, Math.cos(b.face) * mv, damp(8, dt)); b.vy = lerp(b.vy, Math.sin(b.face) * mv, damp(8, dt));
      b.swordA = lerp(b.swordA, ph.from, damp(ph.feint ? 5 : 8, dt));
      b.glow = Math.min(1, ph.t / ph.base);
      break;
    }
    case 'swing': {
      b.swordA = lerp(b.swingFrom, ph.to, easeOut(k));
      const lv = ph.lunge * (1 - k);
      b.vx = Math.cos(b.face) * lv; b.vy = Math.sin(b.face) * lv;
      b.glow = 1 - k;
      if (!ph.hitDone && k > 0.1 && k < 0.95 && p.state !== 'dead' &&
          inArc(b.x, b.y, b.face, ph.range, ph.arc, p.x, p.y, p.r)) {
        if (hurtPlayer(ph.dmg, b.face)) ph.hitDone = true;
      }
      break;
    }
    case 'spin': {
      b.swordA = b.swingFrom - TAU * easeOut(k);
      b.vx *= Math.exp(-dt * 8); b.vy *= Math.exp(-dt * 8);
      if (!ph.hitDone && k > 0.1 && p.state !== 'dead' && d < ph.r + p.r) {
        if (hurtPlayer(ph.dmg, toP)) ph.hitDone = true;
      }
      if (Math.random() < 0.8) {
        const an = b.face + b.swordA;
        addP({ x: b.x + Math.cos(an) * 110, y: b.y + Math.sin(an) * 110, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 3, col: '255,170,90', add: true, drag: 0, kind: 'spark', h: 60, vh: 0, g: 0 });
      }
      break;
    }
    case 'dash': {
      b.vx = Math.cos(ph.dir) * ph.speed; b.vy = Math.sin(ph.dir) * ph.speed;
      b.swordA = lerp(b.swordA, 0.1, damp(12, dt));
      if (Math.random() < 0.7) dust(b.x, b.y, 1, 40, 0.8);
      if (!ph.hitDone && p.state !== 'dead' && d < b.r + p.r + 16) {
        if (hurtPlayer(ph.dmg, ph.dir)) ph.hitDone = true;
      }
      if (Math.hypot(b.x, b.y) > ARENA_R - b.r - 8) { ph.t = ph.d; G.shake = Math.max(G.shake, 8); dust(b.x, b.y, 10, 200); sfx.hit(true); }
      break;
    }
    case 'leap': {
      if (k < 0.7) { // Zielverfolgung – stärker, wenn der Spieler viel rollt
        const n = norm(p.x - ph.tx, p.y - ph.ty), sp = (170 + T.rollSpam * 220) * dt;
        const dd = Math.hypot(p.x - ph.tx, p.y - ph.ty);
        ph.tx += n.x * Math.min(sp, dd); ph.ty += n.y * Math.min(sp, dd);
      }
      const dl = Math.hypot(ph.tx - ph.sx, ph.ty - ph.sy), mx = 460;
      if (dl > mx) { ph.tx = ph.sx + (ph.tx - ph.sx) * mx / dl; ph.ty = ph.sy + (ph.ty - ph.sy) * mx / dl; }
      const e = k * k * (3 - 2 * k);
      b.x = lerp(ph.sx, ph.tx, e); b.y = lerp(ph.sy, ph.ty, e); b.vx = 0; b.vy = 0;
      b.z = Math.sin(k * Math.PI) * 150;
      b.face = turnToward(b.face, toP, dt * 4);
      b.swordA = lerp(b.swordA, -0.2, damp(6, dt));
      break;
    }
    case 'land': b.vx = 0; b.vy = 0; break;
    case 'shoot': b.vx *= 0.9; b.vy *= 0.9; break;
    case 'rec': {
      b.vx *= Math.exp(-dt * 6); b.vy *= Math.exp(-dt * 6);
      b.swordA = lerp(b.swordA, 0.7, damp(3, dt)); b.glow = 0;
      break;
    }
    default: break;
  }
  if (ph.t >= ph.d) {
    if (ph.k === 'spin') b.swordA = angDiff(0, b.swingFrom);
    a.i++;
    if (a.i >= a.phases.length) endAttack(); else enterPhase();
  }
}

function endAttack() {
  const b = B, a = b.atk;
  if (a) { a.done = true; if (mem.atk[a.name]) { mem.atk[a.name].u++; if (a.hit) mem.atk[a.name].h++; } }
  b.atk = null; b.state = 'idle'; b.t = 0; b.airborne = false; b.z = 0; b.glow = 0;
  b.idleDur = rand(0.35, 1.0) * (b.phase2 ? 0.65 : 1);
  b.greedWindow = false;
}

function bossOnHeal() {
  const b = B;
  if (G.state !== 'play' || b.state === 'dead') return;
  const inRec = b.state === 'attack' && b.atk && b.atk.phases[b.atk.i].k === 'rec' && b.atk.counterDecided;
  if (!(b.state === 'idle' || b.state === 'approach' || inRec)) return;
  if (Math.random() >= T.healPunish) return;
  if (b.state === 'attack') endAttack();
  const d = dist(b, P);
  if (d > 250) startAttack('orbs', { fast: true, noFeint: true, tag: 'Bestraft Heilung' });
  else startAttack('lunge', { noFeint: true, tag: 'Bestraft Heilung' });
}

function bossTakeDamage(dmg, heavy) {
  const b = B;
  b.hp -= dmg; b.flash = 0.12;
  b.poise -= dmg * (heavy ? 2.7 : 1.7); b.poiseT = 1.6;
  if (b.hp <= 0) {
    b.hp = 0; b.state = 'dead'; b.t = 0; b.atk = null; b.airborne = false; b.z = 0;
    G.hitstop = 0.25; G.shake = 20; G.projectiles = []; G.hazards = []; sparks(b.x, b.y, 50, '255,200,120', 500); roundEnd(true); return;
  }
  if (!b.phase2 && b.hp <= b.maxHp * 0.5) {
    b.phase2 = true; b.state = 'roar'; b.t = 0; b.roared = false;
    if (b.atk && mem.atk[b.atk.name]) mem.atk[b.atk.name].u++;
    b.atk = null; b.greedWindow = false; b.poise = 100; b.airborne = false; b.z = 0;
    return;
  }
  if (b.poise <= 0 && b.state !== 'roar' && b.state !== 'stagger') {
    if (b.atk && mem.atk[b.atk.name]) mem.atk[b.atk.name].u++;
    b.state = 'stagger'; b.t = 0; b.atk = null; b.poise = 130; b.greedWindow = false; b.glow = 0;
    floatText('Taumelt!', '255,240,200', true); sfx.stagger();
  }
}

function updateBoss(dt) {
  const b = B, p = P;
  b.t += dt; b.flash = Math.max(0, b.flash - dt); b.cape += dt;
  b.walk += dt * Math.hypot(b.vx, b.vy) * 0.045;
  const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy), toP = Math.atan2(dy, dx);
  b.poiseT -= dt; if (b.poiseT <= 0) b.poise = Math.min(100, b.poise + 30 * dt);

  // Beobachten & Lernen
  if (G.state === 'play' && p.state !== 'dead' && b.state !== 'dead') {
    mem.time += dt;
    b.distAcc += dt; if (b.distAcc > 0.5) { b.distAcc = 0; mem.distSum += d; mem.distN++; }
    const behind = Math.abs(angDiff(b.face, toP)) > 2.0 && d < 220 && !b.airborne;
    if (behind) { mem.behind += dt; b.behindT += dt; } else { b.behindT = 0; b.behindChecked = false; }
  }

  const fighting = G.state === 'play' && p.state !== 'dead';
  switch (b.state) {
    case 'idle': {
      b.face = turnToward(b.face, toP, dt * 3.6 * (b.phase2 ? 1.3 : 1));
      const want = d > 175 ? 1 : d < 105 ? -0.5 : 0;
      const spd = (b.phase2 ? 118 : 92) * (1 + T.far * 0.6);
      const strafe = Math.sin(b.t * 0.9 + b.seed) * (d < 300 ? 0.6 : 0.2);
      const mx = Math.cos(toP) * want + Math.cos(toP + Math.PI / 2) * strafe;
      const my = Math.sin(toP) * want + Math.sin(toP + Math.PI / 2) * strafe;
      b.vx = lerp(b.vx, mx * spd, damp(5, dt)); b.vy = lerp(b.vy, my * spd, damp(5, dt));
      b.swordA = lerp(b.swordA, 1.0, damp(4, dt));
      if (!fighting) { b.vx *= 0.9; b.vy *= 0.9; break; }
      if (b.behindT > 0.6 && !b.behindChecked) {
        b.behindChecked = true;
        if (Math.random() < T.behind) { startAttack('sweep', { tag: 'Rücken geschützt' }); break; }
      }
      if (b.t >= b.idleDur) planAttack(chooseAttack(d));
      break;
    }
    case 'approach': {
      b.face = turnToward(b.face, toP, dt * 5);
      const spd = (b.phase2 ? 175 : 150) * (1 + T.far * 0.4);
      b.vx = lerp(b.vx, Math.cos(toP) * spd, damp(6, dt)); b.vy = lerp(b.vy, Math.sin(toP) * spd, damp(6, dt));
      if (!fighting) { b.state = 'idle'; b.t = 0; break; }
      if (d < b.pendingRange || b.t > 1.7) startAttack(b.pending, b.pendingOpts);
      break;
    }
    case 'attack': updateBossAttack(dt, d, toP); break;
    case 'stagger': {
      b.vx *= Math.exp(-dt * 5); b.vy *= Math.exp(-dt * 5);
      b.swordA = lerp(b.swordA, 2.6, damp(4, dt));
      if (b.t > 1.4) { b.state = 'idle'; b.t = 0; b.idleDur = 0.25; }
      break;
    }
    case 'roar': {
      b.vx *= 0.85; b.vy *= 0.85;
      if (!b.roared && b.t > 0.25) {
        b.roared = true; sfx.roar(); G.shake = 18; ring(b.x, b.y, 230, '255,80,50'); ring(b.x, b.y, 160, '255,140,80');
        floatText('Er wird wütend…', '255,110,80', true);
        if (d < 240 && p.state !== 'dead') { const n = norm(dx, dy); p.vx = n.x * 420; p.vy = n.y * 420; p.state = 'hurt'; p.t = 0.1; p.atk = null; }
      }
      if (b.t > 1.2) { b.state = 'idle'; b.t = 0; b.idleDur = 0.3; }
      break;
    }
    case 'dead': {
      b.vx *= 0.9; b.vy *= 0.9; b.alpha = Math.max(0, 1 - b.t / 3);
      if (Math.random() < 0.9) addP({ x: b.x + rand(-40, 40), y: b.y + rand(-40, 40), vx: rand(-10, 10), vy: rand(-90, -30), life: 1.4, max: 1.4, size: rand(2, 4), col: '255,190,110', add: true, drag: 0, kind: 'spark', hStart: rand(10, 110) });
      break;
    }
    default: break;
  }
  if (b.phase2 && b.state !== 'dead' && Math.random() < 0.35) {
    addP({ x: b.x + rand(-30, 30), y: b.y + rand(-30, 30), vx: rand(-15, 15), vy: rand(-70, -30), life: 0.9, max: 0.9, size: rand(1.5, 3), col: '255,80,40', add: true, drag: 0, kind: 'spark', hStart: rand(20, 120) + b.z });
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  confine(b);
}

function confine(o) {
  const d = Math.hypot(o.x, o.y), m = ARENA_R - o.r;
  if (d > m) { o.x *= m / d; o.y *= m / d; }
}
function separate() {
  const p = P, b = B;
  if (b.airborne || b.state === 'dead' || p.state === 'dead') return;
  const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 0.01, m = p.r + b.r;
  if (d < m) { const o = (m - d), nx = dx / d, ny = dy / d; p.x += nx * o * 0.75; p.y += ny * o * 0.75; b.x -= nx * o * 0.25; b.y -= ny * o * 0.25; }
}

export function updateWorld(dt) {
  const p = P;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const o = G.projectiles[i]; o.life -= dt;
    if (o.home > 0 && p.state !== 'dead') {
      const cur = Math.atan2(o.vy, o.vx), tgt = Math.atan2(p.y - o.y, p.x - o.x), sp = Math.hypot(o.vx, o.vy);
      const na = turnToward(cur, tgt, o.home * dt); o.vx = Math.cos(na) * sp; o.vy = Math.sin(na) * sp;
    }
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (Math.random() < 0.6) addP({ x: o.x, y: o.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.35, max: 0.35, size: rand(2, 4), col: '255,90,50', add: true, drag: 2, kind: 'spark', h: 45 + rand(-6, 6), vh: rand(-10, 20), g: 0 });
    let dead = o.life <= 0 || Math.hypot(o.x, o.y) > ARENA_R + 40;
    if (!dead && p.state !== 'dead' && Math.hypot(p.x - o.x, p.y - o.y) < o.r + p.r) {
      if (hurtPlayer(o.dmg, Math.atan2(o.vy, o.vx), o.atk || null)) dead = true;
    }
    if (dead) { sparks(o.x, o.y, 8, '255,110,70', 160); G.projectiles.splice(i, 1); }
  }
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i]; h.t += dt;
    if (h.t >= 0 && !h.started) { h.started = true; G.shake = Math.max(G.shake, 9); sfx.slam(); }
    if (h.t >= 0) {
      const r = h.rMax * (h.t / h.dur), d = Math.hypot(p.x - h.x, p.y - h.y);
      if (!h.hit && p.state !== 'dead' && Math.abs(d - r) < 22 + p.r * 0.5) { if (hurtPlayer(h.dmg, Math.atan2(p.y - h.y, p.x - h.x))) h.hit = true; }
    }
    if (h.t > h.dur) G.hazards.splice(i, 1);
  }
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const q = G.particles[i]; q.life -= dt;
    if (q.life <= 0) { G.particles.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.drag) { const f = Math.exp(-q.drag * dt); q.vx *= f; q.vy *= f; }
    q.h += q.vh * dt;
    if (q.g) q.vh -= q.g * dt;
    if (q.h < 1) { q.h = 1; q.vh *= -0.3; q.vx *= 0.6; q.vy *= 0.6; }
  }
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i]; t.life -= dt; t.h -= t.vy * dt; t.vy *= Math.exp(-dt * 2);
    if (t.life <= 0) G.texts.splice(i, 1);
  }
  for (let i = G.ghosts.length - 1; i >= 0; i--) { G.ghosts[i].life -= dt; if (G.ghosts[i].life <= 0) G.ghosts.splice(i, 1); }
  // Glut in der Luft
  if (Math.random() < 0.5) {
    const a = Math.random() * TAU, r = Math.random() * ARENA_R;
    addP({ x: Math.cos(a) * r, y: Math.sin(a) * r, vx: rand(-10, 10), vy: rand(-30, -10), life: rand(2, 4), max: 4, size: rand(1, 2.2), col: '255,150,70', add: true, drag: 0, kind: 'ember', hStart: rand(0, 60) });
  }
}

// ================================================================
//  Runden
// ================================================================
const QUOTES = {
  first: 'Ein weiterer Narr. Zeig mir, wie du kämpfst.',
  feint: 'Du rollst, bevor meine Klinge fällt. Diesmal warte ich.',
  aimSide: 'Immer zur selben Seite … wie vorhersehbar.',
  back: 'Weiche nur zurück. Meine Klinge reicht weiter.',
  healPunish: 'Trink nur deinen Trank. Ich warte nicht mehr.',
  greed: 'Deine Gier hat dich verraten. Schlag nur zu.',
  behind: 'Mein Rücken ist kein Zufluchtsort mehr.',
  far: 'Distanz wird dich nicht retten.',
  rollSpam: 'Rolle, so viel du willst. Die Erde bebt mit.',
  none: 'Du bist zurück. Ich habe dich beobachtet.',
};
function strongestTrait(t) {
  const c = { feint: t.feint, aimSide: Math.abs(t.aimSide), back: t.back, healPunish: t.healPunish, greed: t.greed, behind: t.behind, far: t.far, rollSpam: t.rollSpam };
  let best = null, v = 0.15;
  for (const k in c) if (c[k] > v) { v = c[k]; best = k; }
  return best;
}

export function startRound() {
  G.startTraits = updateTraits();
  P = newPlayer(); B = newBoss();
  G.particles = []; G.projectiles = []; G.hazards = []; G.texts = []; G.ghosts = [];
  G.state = 'intro'; G.introT = 3.0; G.endTimer = 0; G.summaryShown = false; G.result = null; G.paused = false;
  G.round = mem.rounds + 1; G.hpLag = 1; G.bossLag = 1;
  const s = strongestTrait(T);
  G.quote = mem.rounds === 0 ? QUOTES.first : (s ? QUOTES[s] : QUOTES.none);
}

export function roundEnd(win) {
  if (G.state === 'ending') return;
  G.state = 'ending'; G.endTimer = 0; G.result = win;
  mem.rounds++; if (win) mem.wins++; else mem.losses++;
  if (win) sfx.win(); else { sfx.death(); rumble(1, 0.8, 600); }
}

/** Spieler gibt die Runde auf */
export function giveUp() {
  if (P.state !== 'dead') { P.hp = 0; P.state = 'dead'; P.t = 0; roundEnd(false); }
}

// ================================================================
//  Ein Simulationsschritt
// ================================================================
export function update(dt) {
  G.time += dt;
  if (G.state === 'intro') { G.introT -= dt; if (G.introT <= 0) G.state = 'play'; }
  const sim = G.state === 'ending' ? dt * 0.45 : dt;
  updatePlayer(sim); updateBoss(sim); separate(); updateWorld(sim);
  G.shake *= Math.exp(-dt * 9); if (G.shake < 0.05) G.shake = 0;
  if (G.state === 'ending') G.endTimer += dt;
}

/** Hauptmenü: Boss dreht sich langsam, Glut fliegt */
export function updateMenu(dt) {
  G.time += dt;
  updateWorld(dt);
  B.face += dt * 0.2; B.cape += dt; B.swordA = 1 + Math.sin(G.time) * 0.1;
}
