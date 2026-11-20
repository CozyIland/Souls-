// Boss: Garm, der Aschenhund – ein riesiger, gepanzerter Höllenhund (models/boss.glb von Meshy, Clips dog_idle/dog_walk/dog_run),
// etwa 3,5-mal so groß wie der Magier. Wartet liegend auf dem Ascheplatz hinter dem Nebeltor.
// Angriffsmuster: Biss, Prankenhieb links/rechts, Sprung mit Aufschlag, Ansturm, Drehung (wer hinter ihm steht), Aufbäumen und
// Stampfen. Bei der Hälfte der Leben heult er (Phase 2): schneller, Kombos, mehr Glut. Haltung: genug Treffer → er taumelt.
// Bewegung wie bei den Hunden: Drehtempo begrenzt, Schritte passend zum Tempo (Schrittlänge der Clips beim Laden gemessen).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GRADIENT, skinOutline } from './toon.js';
import { ladeModell } from './modelle.js';
import { glowTex } from './texturen.js';
import { sfx } from './ton.js';
import { pool } from './blut.js';
import { clamp, lerp, damp, angDiff, TAU } from './util.js';

const URL = 'models/boss.glb';
export const BOSS_NAME = 'Garm, der Aschenhund';
export const BOSS_HP = 640;
const S = 4.3;              // Größe (Modell ist 1,5 m hoch → Kopf ~5,4 m: gut 3× der Magier)
const K = S / 3.5;          // alle Reichweiten wachsen mit
const FOOT = 0.68;          // Füße bei y −0,68 im Modell
const BODY_F = 2.3 * K, BODY_B = 2.4 * K, BODY_R = 1.35 * K; // Körper als Kapsel: vorn/hinten ab der Mitte, Radius
const POISE_MAX = 150, POISE_WAIT = 3, POISE_REGEN = 30;
const TURN_MAX = 1.7, TURN_ACC = 7;               // rad/s, rad/s²
// Haltungen mit eingeknickten Beinen (gemessen: Pfoten bleiben am Boden): Ducken/Landen, Drehung, Taumeln, Tod
const LP = { cF: 0.8, cR: 0.3, lF: 0.7, lR: 0.2, sy: -0.15, sF: 0.2, sR: 0.1, gy: -0.65, gF: 1.05, gR: 0.15, dB: -0.45, dY: 1.05, dF: 0.6, dR: 0.6, tF: 0.8, bF: -0.2, tR: 0.75, bR: 0.3 };
const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const bump = (t, a, b) => sm((t - a) / Math.max(1e-3, b - a));  // 0 → 1 zwischen a und b

// Angriffe: Dauer T (Phase 2 läuft schneller), Treffer-Fenster hit, Schaden dmg
const ATK = {
  bite: { T: 1.45, hit: [0.6, 0.76], dmg: 32 },
  swipe: { T: 1.4, hit: [0.54, 0.72], dmg: 28 },
  leap: { T: 2.3, land: 1.22, dmg: 42, dmg2: 22 },
  charge: { T: 2.1, hit: [0.5, 1.55], dmg: 36 },
  spin: { T: 1.55, hit: [0.45, 0.92], dmg: 26 },
  stomp: { T: 1.95, slam: 0.9, dmg: 38 },
  howl: { T: 2.3, push: 0.6 },
};

const qP = new THREE.Quaternion(), qR = new THREE.Quaternion(), qH = new THREE.Quaternion();
const vX = new THREE.Vector3(), vY = new THREE.Vector3(), vT = new THREE.Vector3();
/** Knochen um eine Achse in Weltrichtung drehen */
function rotW(bone, axisW, ang) {
  if (!bone || Math.abs(ang) < 1e-4) return;
  bone.parent.getWorldQuaternion(qP);
  const wq = qP.clone().multiply(bone.quaternion);
  qR.setFromAxisAngle(axisW, ang).multiply(wq);
  bone.quaternion.copy(qP.invert().multiply(qR));
}

export class Boss {
  constructor(scene, home, arena) {
    this.scene = scene; this.home = home; this.arena = arena;
    this.name = BOSS_NAME; this.maxHp = BOSS_HP;
    this.root = new THREE.Group(); scene.add(this.root);
    this.node = this.root;                      // Karten bleiben hier stecken
    this.p = new THREE.Vector3(); this.v = new THREE.Vector2();
    this.pos = new THREE.Vector3();             // Treffer-/Zielpunkt: nächster Körperpunkt zum Magier
    this.radius = BODY_R;                       // für die Nahkampf-Reichweite
    this.camDist = 6.8; this.camPitch = 0.22;   // Kamera beim Erfassen weiter weg (er ist riesig)
    this.mm = null;
    // Glut, die vom Rücken aufsteigt
    this.embers = []; const tex = glowTex();
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff6a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.visible = false; scene.add(s); this.embers.push({ s, life: 0, v: new THREE.Vector3() });
    }
    this.glow = new THREE.PointLight(0xff5a1a, 0, 12, 1.6); scene.add(this.glow);
    this.reset();
    ladeModell(new GLTFLoader(), URL, (g) => this.onModel(g), (e) => console.warn('Boss-Modell fehlt.', e));
  }

  onModel(g) {
    const model = g.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material;
      o.material = new THREE.MeshToonMaterial({ map: m.map, normalMap: m.normalMap, gradientMap: GRADIENT, side: THREE.DoubleSide });
      if (o.material.normalMap) o.material.normalScale.set(0.8, 0.8);
    });
    const sk = []; model.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); });
    for (const o of sk) skinOutline(o, 0.022);
    model.scale.setScalar(S);
    const holder = new THREE.Group(); holder.add(model); this.root.add(holder);
    model.position.y = FOOT * S;
    const mixer = new THREE.AnimationMixer(model);
    const clip = (re) => g.animations.find((a) => re.test(a.name));
    const act = (c) => { if (!c) return null; const a = mixer.clipAction(c); a.play(); a.timeScale = 0; a.setEffectiveWeight(0); return a; };
    const B = {}; model.traverse((o) => { if (o.isBone) B[o.name] = o; });
    this.mm = { model, holder, mixer, B, idle: act(clip(/idle/)), walk: act(clip(/walk/)), run: act(clip(/run/)) };
    // Schrittlänge der Clips messen: wie weit wandert eine Pfote im Bodenkontakt pro Durchlauf zurück (Meter bei Größe S)
    const M = this.mm;
    M.walkL = this.stride(M.walk) || 4.8; M.runL = this.stride(M.run) || 15;
    const ctl = ['head', 'neck1', 'neck_01', 'jaw', 'chest', 'spine1', 'spine2', 'hips', 'frontUprL', 'frontUprR', 'frontLwrL', 'frontLwrR',
      'frontHorselinkL', 'frontHorselinkR', 'rearLegL_01', 'rearLegR_01', 'rearLwrL', 'rearLwrR', 'rearHorselinkL', 'rearHorselinkR', 'tail2', 'tail3', 'tail4'];
    M.ctl = ctl.map((n) => B[n]).filter(Boolean);
    for (const b of M.ctl) b.userData.base = b.quaternion.clone();
    this.place();
  }

  /** Schrittlänge eines Clips (Meter pro Durchlauf), aus der Bewegung der Pfoten in der Standphase */
  stride(a) {
    if (!a) return 0;
    const M = this.mm, V = new THREE.Vector3(), feet = ['rearToeL', 'rearToeR'].map((n) => M.B[n]).filter(Boolean); // Vorderzehen krümmen sich im Schwung nach unten → nur hinten messen
    const N = 48, tr = feet.map(() => []), inv = new THREE.Matrix4();
    for (const x of [M.idle, M.walk, M.run]) if (x) x.setEffectiveWeight(0);
    a.setEffectiveWeight(1);
    for (let i = 0; i < N; i++) {
      a.time = i / N * a.getClip().duration; M.mixer.update(0); M.holder.updateMatrixWorld(true); inv.copy(M.holder.matrixWorld).invert();
      feet.forEach((f, j) => { f.getWorldPosition(V).applyMatrix4(inv); tr[j].push([V.y, V.z]); });
    }
    a.setEffectiveWeight(0);
    let sum = 0, n = 0;
    for (const t of tr) {
      const ys = t.map((q) => q[0]), mn = Math.min(...ys), mx = Math.max(...ys), thr = mn + 0.25 * (mx - mn);
      let dz = 0, k = 0;
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (t[i][0] < thr && t[j][0] < thr) { dz += t[j][1] - t[i][1]; k++; } }
      if (k > 2) { sum += -dz / k * N; n++; }
    }
    return n ? sum / n : 0;
  }

  reset() {
    this.p.set(this.home.x, 0, this.home.z); this.yaw = this.home.yaw;
    this.hp = BOSS_HP; this.dead = false; this.active = false; this.phase2 = false;
    this.st = 'sleep'; this.t = 0; this.v.set(0, 0); this.sv = 0; this.w = 0; this.yawRate = 0;
    this.cd = 1.2; this.poise = 0; this.poiseT = 0; this.flinch = 0; this.hitDone = false; this.combo = 0;
    this.deadT = 0; this.pooled = false; this.gp = 0; this.aw = { idle: 1, walk: 0, run: 0 }; this.lag = BOSS_HP;
    this.sm = null; this.side = 1; this.leap = null;
    this.place();
  }

  /** Kampf beginnt (Spieler ist durch den Nebel): aufstehen und heulen */
  start() { if (this.st === 'sleep') { this.active = true; this.go('wake'); } }

  go(st) { this.st = st; this.t = 0; this.hitDone = false; }

  /** Treffer vom Magier */
  onHit(dmg, dir, heavy, poiseDmg) {
    if (this.dead || this.st === 'sleep') return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flinch = heavy ? 0.35 : 0.22; this.hitDir = dir.clone(); this.lagHold = 0.7;
    if (this.hp <= 0) { this.dead = true; this.go('dead'); this.deadSide = Math.random() < 0.5 ? 1 : -1; sfx.roar(true); return; }
    if (!this.phase2 && this.hp <= BOSS_HP * 0.5 && this.st !== 'stagger') { this.phase2 = true; this.go('howl'); sfx.roar(false); return; }
    this.poise += poiseDmg != null ? poiseDmg : (heavy ? 30 : dmg); this.poiseT = 0;
    if (this.poise >= POISE_MAX && this.st !== 'leap' && this.st !== 'howl') { this.poise = 0; this.go('stagger'); sfx.yelp(true); }
  }

  /** Körper-Kapsel: nächster Punkt auf der Achse zu (x, z) */
  axisPoint(x, z, out) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const k = clamp((x - this.p.x) * fx + (z - this.p.z) * fz, -BODY_B, BODY_F);
    return out.set(this.p.x + fx * k, 0, this.p.z + fz * k);
  }
  /** Trifft eine Karte (Punkt p) den Körper? */
  hitTest(p) { this.axisPoint(p.x, p.z, vT); return Math.hypot(p.x - vT.x, p.z - vT.z) < BODY_R + 0.2 && p.y > 0.4 && p.y < 4.8; }

  /** Spieler treffen, wenn er in Reichweite ist (einmal pro Angriff) */
  strike(pl, cx, cz, r, dmg, push = 1) {
    if (this.hitDone || pl.state === 'dead') return false;
    const dx = pl.pos.x - cx, dz = pl.pos.z - cz;
    if (Math.hypot(dx, dz) > r) return false;
    const l = Math.hypot(dx, dz) || 1;
    const ok = pl.damage(dmg, new THREE.Vector3(dx / l * push, 0, dz / l * push)); // in der Rolle (unverwundbar) geht er daneben
    if (ok) { this.hitDone = true; sfx.bite(); }
    return ok;
  }

  /** Angriff passend zu Abstand und Winkel auswählen */
  choose(d, a) {
    const r = Math.random(), back = Math.abs(a) > 2.0, side = Math.abs(a) > 0.75;
    if (back && d < 8 * K) return 'spin';
    if (d < 6.2 * K) {
      if (side) return r < 0.75 ? 'swipe' : 'spin';
      if (r < 0.36) return 'bite';
      if (r < 0.72) return 'swipe';
      return this.phase2 || r < 0.9 ? 'stomp' : 'bite';
    }
    if (d < 13 * K) return r < 0.5 ? 'leap' : r < 0.8 ? 'charge' : null;
    return r < 0.55 ? 'charge' : r < 0.75 ? 'leap' : null;
  }

  update(dt, pl) {
    if (!this.mm) return;
    const k2 = this.phase2 ? 1.22 : 1;                 // Phase 2: alles etwas schneller
    this.t += dt * (ATK[this.st] ? k2 : 1);
    this.flinch = Math.max(0, this.flinch - dt);
    this.poiseT += dt; if (this.poiseT > POISE_WAIT) this.poise = Math.max(0, this.poise - POISE_REGEN * dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z, d = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
    const a = angDiff(this.yaw, toP), plOk = pl.state !== 'dead';
    this.lookYaw = a; this.lookD = d;
    let want = null, spd = 0, turn = 1, t = this.t;
    switch (this.st) {
      case 'sleep': break;
      case 'wake': // aufstehen, Kopf hoch, heulen
        if (t > 1.0) { want = toP; turn = 0.6; }
        if (t > 1.35 && !this.roared) { this.roared = true; sfx.roar(false); }
        if (t > 3.0) { this.go('stalk'); this.cd = 0.6; this.roared = false; }
        break;
      case 'stalk': { // lauern/herankommen: Blick auf dich, dann angreifen
        if (!plOk) { spd = 0; break; }
        this.cd -= dt * k2;
        want = toP;
        if (d > 15 * K) { spd = 8; } else if (d > 8.5 * K) { spd = 3.8; } else if (d < 4.2 * K) { spd = -1.8; }
        else { want = toP + this.side * 0.9; spd = 2.2; if (Math.random() < dt * 0.25) this.side *= -1; }
        if (Math.abs(a) > 1.2 && d < 9 * K) { want = toP; spd = 0; }
        if (this.cd <= 0) {
          const k = this.choose(d, a);
          if (k) this.attack(k, a);
          else this.cd = 0.3;
        }
        break;
      }
      case 'bite': {
        want = toP; turn = t < 0.5 ? 1.3 : 0.15;
        spd = t > 0.52 && t < 0.74 ? 7.5 : t < 0.5 ? -0.6 : 0;
        if (t > ATK.bite.hit[0] && t < ATK.bite.hit[1]) this.strike(pl, this.p.x + fx * 4.4 * K, this.p.z + fz * 4.4 * K, 2.3 * K, ATK.bite.dmg);
        if (t > ATK.bite.T) this.after('bite');
        break;
      }
      case 'swipe': {
        want = toP; turn = t < 0.45 ? 1.1 : 0.2;
        spd = t > 0.45 && t < 0.7 ? 2.5 : 0;
        if (t > ATK.swipe.hit[0] && t < ATK.swipe.hit[1]) {
          const cx = this.p.x + fx * 2.8 * K, cz = this.p.z + fz * 2.8 * K;
          const rel = angDiff(this.yaw, Math.atan2(pl.pos.x - cx, pl.pos.z - cz));
          if (Math.abs(rel) < 1.35) this.strike(pl, cx, cz, 4.6 * K, ATK.swipe.dmg, 1.6);
        }
        if (t > ATK.swipe.T) this.after('swipe');
        break;
      }
      case 'leap': {
        const L = this.leap;
        if (t < 0.6) { want = toP; turn = 1.4; L.tx = pl.pos.x; L.tz = pl.pos.z; L.x0 = this.p.x; L.z0 = this.p.z; }
        else if (t < ATK.leap.land) {
          if (!L.go) { L.go = true; sfx.growl(true); const dd = Math.min(15, Math.hypot(L.tx - L.x0, L.tz - L.z0)); const ux = (L.tx - L.x0) / (dd || 1), uz = (L.tz - L.z0) / (dd || 1);
            const land = Math.max(2, dd - 2.6 * K); L.ex = L.x0 + ux * land; L.ez = L.z0 + uz * land; }
          const u = sm((t - 0.6) / (ATK.leap.land - 0.6));
          this.p.x = lerp(L.x0, L.ex, u); this.p.z = lerp(L.z0, L.ez, u); this.v.set(0, 0);
        } else if (!this.hitDone && !L.landed) {
          L.landed = true; this.land = 0.6; if (this.onSlam) this.onSlam(this.p.x + fx * 2 * K, this.p.z + fz * 2 * K, 1);
          const cx = this.p.x + fx * 2 * K, cz = this.p.z + fz * 2 * K;
          if (!this.strike(pl, cx, cz, 3.4 * K, ATK.leap.dmg, 2.2)) this.strike(pl, cx, cz, 5.4 * K, ATK.leap.dmg2, 2.6);
        }
        if (t > ATK.leap.T) this.after('leap');
        break;
      }
      case 'charge': {
        if (t < 0.5) { want = toP; turn = 1.5; spd = 0; this.chA = toP; }
        else if (t < 1.55) { if (t < 0.75) this.chA += angDiff(this.chA, toP) * damp(2.5, dt); want = this.chA; turn = 2.5; spd = 13;
          this.strike(pl, this.p.x + fx * 3.4 * K, this.p.z + fz * 3.4 * K, 2.6 * K, ATK.charge.dmg, 2.4);
          if (this.wallHit) { this.t = Math.max(this.t, 1.55); } }
        else { want = this.chA; spd = 0; }
        if (t > ATK.charge.T) this.after('charge');
        break;
      }
      case 'spin': {
        if (t < 0.35) { want = toP; turn = 0.4; }
        if (t > ATK.spin.hit[0] && t < ATK.spin.hit[1]) this.strike(pl, this.p.x, this.p.z, 6.2 * K, ATK.spin.dmg, 2.4);
        if (t > ATK.spin.T) this.after('spin');
        break;
      }
      case 'stomp': {
        want = toP; turn = t < 0.6 ? 1.2 : 0.1;
        spd = t > 0.55 && t < 0.88 ? 2.8 : 0;
        if (t > ATK.stomp.slam && !this.stomped) { this.stomped = true; const cx = this.p.x + fx * 3.3 * K, cz = this.p.z + fz * 3.3 * K; if (this.onSlam) this.onSlam(cx, cz, 0.8); this.strike(pl, cx, cz, 3.8 * K, ATK.stomp.dmg, 2.2); }
        if (t > ATK.stomp.T) { this.stomped = false; this.after('stomp'); }
        break;
      }
      case 'howl': {
        if (t > ATK.howl.push && !this.pushed) { this.pushed = true; if (this.onSlam) this.onSlam(this.p.x, this.p.z, 0.6, true);
          if (d < 8.5 * K && plOk) pl.damage(6, new THREE.Vector3(dx / (d || 1) * 2.4, 0, dz / (d || 1) * 2.4)); }
        if (t > ATK.howl.T) { this.pushed = false; this.go('stalk'); this.cd = 0.4; }
        break;
      }
      case 'stagger': if (t > 2.4) { this.go('stalk'); this.cd = 0.5; } break;
      case 'dead':
        this.deadT += dt;
        if (this.deadT > 1.6 && !this.pooled) { this.pooled = true; pool(this.p.x - fz * 1.2 * (this.deadSide || 1), this.p.z + fx * 1.2 * (this.deadSide || 1), 3.2); }
        break;
    }
    // Drehen mit begrenztem Tempo (riesig und schwer)
    const prevYaw = this.yaw;
    if (this.st === 'spin' && t > 0.35 && t < 0.95) { // Drehung: einmal herum (Tempo-Bogen)
      const u = (t - 0.35) / 0.6, wv = TAU / 0.6 * 1.5 * Math.sin(Math.PI * u) * Math.PI / 3; this.yaw += wv * dt * k2; this.w = 0;
    } else if (want !== null && this.st !== 'dead' && this.st !== 'stagger') {
      const df = angDiff(this.yaw, want), wMax = TURN_MAX * turn * (this.phase2 ? 1.2 : 1);
      const wT = Math.sign(df) * Math.min(wMax, Math.abs(df) * 3, Math.sqrt(2 * TURN_ACC * Math.abs(df)) * 0.9);
      this.w += clamp(wT - this.w, -TURN_ACC * dt, TURN_ACC * dt); this.yaw += this.w * dt;
    } else this.w *= Math.exp(-6 * dt);
    this.yawRate = dt > 0 ? angDiff(prevYaw, this.yaw) / dt : 0;
    // Tempo mit Trägheit (Ansturm beschleunigt schnell, bremst rutschend)
    if (this.st !== 'leap' && this.st !== 'dead') {
      const loco = this.st === 'stalk';
      if (loco && spd > 0) spd *= 1 - 0.7 * sm((Math.abs(angDiff(this.yaw, want ?? this.yaw)) - 0.3) / 1.0);
      const acc = this.st === 'charge' ? (spd > this.sv ? 16 : 9) : loco ? 4 : 20;
      this.sv += clamp(spd - this.sv, -acc * dt, acc * dt);
      this.v.set(Math.sin(this.yaw) * this.sv, Math.cos(this.yaw) * this.sv);
    } else if (this.st === 'dead') this.v.multiplyScalar(Math.exp(-5 * dt));
    this.p.x += this.v.x * dt; this.p.z += this.v.y * dt;
    // in der Arena bleiben (Ansturm endet an der Wand)
    const A = this.arena, m = 3.2 * K;
    this.wallHit = this.p.x < A.x0 + m || this.p.x > A.x1 - m || this.p.z < A.z0 + m || this.p.z > A.z1 - m;
    this.p.x = clamp(this.p.x, A.x0 + m, A.x1 - m); this.p.z = clamp(this.p.z, A.z0 + m, A.z1 - m);
    // Magier wird aus dem Körper geschoben
    if (!this.dead || this.deadT < 2) {
      this.axisPoint(pl.pos.x, pl.pos.z, vT);
      const ex = pl.pos.x - vT.x, ez = pl.pos.z - vT.z, el = Math.hypot(ex, ez), min = BODY_R + 0.4;
      if (el < min && this.st !== 'sleep') { const k = el > 1e-4 ? (min - el) / el : 1; pl.pos.x += (el > 1e-4 ? ex : -fz) * k; pl.pos.z += (el > 1e-4 ? ez : fx) * k; }
    }
    // Ziel- und Trefferpunkt: nächster Körperpunkt in Brusthöhe
    this.axisPoint(pl.pos.x, pl.pos.z, this.pos); this.pos.y = 2.4;
    this.lagHold = (this.lagHold || 0) - dt;  // helle Schadensanzeige der Bossleiste läuft kurz verzögert nach
    this.lag = this.lag > this.hp ? Math.max(this.hp, this.lag - BOSS_HP * 0.35 * dt * (this.lagHold > 0 ? 0 : 1)) : this.hp;
    this.animate(dt);
  }

  /** nach einem Angriff: Kombo (Phase 2) oder kurz lauern */
  after(k) {
    if (this.phase2 && this.combo < 1 && Math.random() < 0.55 && (k === 'bite' || k === 'swipe')) {
      this.combo++; this.attack(k === 'bite' ? 'swipe' : 'swipe', this.lookYaw, k === 'swipe' ? -this.swSide : null); return;
    }
    this.combo = 0; this.go('stalk');
    this.cd = (this.phase2 ? 0.5 : 0.9) + Math.random() * (this.phase2 ? 0.6 : 0.9);
    if (k === 'leap' || k === 'charge') this.cd += 0.3;
  }
  attack(k, a, forceSide) {
    this.go(k);
    if (k === 'swipe') this.swSide = forceSide ?? (a > 0 ? 1 : -1); // +1 = Spieler links → linke Pranke
    if (k === 'leap') this.leap = { go: false };
    if (k !== 'spin') sfx.growl(true);
  }

  place() { this.root.position.set(this.p.x, 0, this.p.z); this.root.rotation.y = this.yaw; }

  animate(dt) {
    this.place();
    const M = this.mm, B = M.B, t = this.t, st = this.st;
    const sp = Math.hypot(this.v.x, this.v.y), fwd = this.v.x * Math.sin(this.yaw) + this.v.y * Math.cos(this.yaw);
    // ---------- Ganzkörper-Haltung (Halter) ----------
    let y = 0, pitch = 0, roll = 0, neck = 0, head = 0, jaw = 0.05, legF = 0, legR = 0, tail = 0, rise = 0;
    switch (st) {
      case 'sleep': neck = 0.75 + 0.08 * Math.sin(this.it * 3.1); head = 0.3; jaw = 0.12; pitch = 0.06; break; // schnüffelt am Boden (Kopf tief)
      case 'wake': { const u = sm(t / 0.9), h = bump(t, 1.25, 1.6) * (1 - bump(t, 2.6, 3.0)); // Kopf hoch, aufbäumen, heulen
        y = 0.25 * h; pitch = 0.06 * (1 - u) - 0.3 * h; neck = 0.75 * (1 - u) - 0.9 * h; head = 0.3 * (1 - u) - 0.4 * h; jaw = 0.1 + 0.6 * h; break; }
      case 'bite': { const w = bump(t, 0, 0.5) * (1 - bump(t, 0.55, 0.66)), l = bump(t, 0.55, 0.68) * (1 - bump(t, 0.95, 1.4));
        pitch = -0.12 * w + 0.16 * l; neck = -0.45 * w + 0.6 * l; head = -0.3 * w + 0.25 * l; jaw = 0.1 + 0.65 * w * (1 - l) + 0.2 * (1 - bump(t, 0.66, 0.72)) * l; y = -0.15 * w - 0.25 * l; break; }
      case 'swipe': { const r = bump(t, 0.05, 0.48) * (1 - bump(t, 0.5, 0.6)), s2 = bump(t, 0.5, 0.7) * (1 - bump(t, 0.9, 1.35));
        roll = -this.swSide * (0.12 * r - 0.1 * s2); pitch = -0.1 * r + 0.08 * s2; neck = 0.15 * s2; jaw = 0.25; y = 0.1 * r; break; }
      case 'leap': { const c = bump(t, 0, 0.55) * (1 - bump(t, 0.6, 0.7)), air = t > 0.6 && t < ATK.leap.land ? Math.sin((t - 0.6) / (ATK.leap.land - 0.6) * Math.PI) : 0;
        const ld = bump(t, ATK.leap.land - 0.04, ATK.leap.land + 0.06) * (1 - bump(t, 1.5, 2.2));
        const u = clamp((t - 0.6) / (ATK.leap.land - 0.6), 0, 1);
        y = -0.6 * c + 3.6 * air - 0.55 * ld; pitch = 0.18 * c + (-0.3 + 0.55 * u) * (air > 0 ? 1 : 0) + 0.12 * ld;
        neck = 0.25 * c - 0.2 * air + 0.3 * ld; jaw = 0.2 + 0.5 * air; legF = LP.cF * c + LP.lF * ld; legR = LP.cR * c + LP.lR * ld; rise = air; break; }
      case 'charge': { const c = bump(t, 0, 0.45) * (1 - bump(t, 1.5, 2.0));
        pitch = 0.12 * c; neck = 0.4 * c; head = 0.15 * c; jaw = 0.35 * c; y = -0.15 * c; break; }
      case 'spin': { const c = bump(t, 0, 0.3) * (1 - bump(t, 1.0, 1.4)); y = LP.sy * c; pitch = 0.06 * c; neck = 0.2 * c; jaw = 0.3; tail = 1.2 * c; legF = LP.sF * c; legR = LP.sR * c; break; }
      case 'stomp': { const r = bump(t, 0.05, 0.7) * (1 - bump(t, 0.74, 0.9)), sl = bump(t, 0.75, 0.9) * (1 - bump(t, 1.2, 1.9));
        pitch = -0.62 * r + 0.18 * sl; y = 1.0 * r - 0.35 * sl; neck = -0.35 * r + 0.35 * sl; head = -0.25 * r + 0.15 * sl; jaw = 0.25 + 0.4 * r; legF = -0.9 * r + 0.3 * sl; break; }
      case 'howl': { const h = bump(t, 0.1, 0.5) * (1 - bump(t, 1.8, 2.3)); pitch = -0.32 * h; y = 0.35 * h; neck = -0.95 * h; head = -0.45 * h; jaw = 0.08 + 0.75 * h; break; }
      case 'stagger': { const s1 = bump(t, 0, 0.35) * (1 - bump(t, 1.8, 2.4)); pitch = 0.32 * s1; y = LP.gy * s1; roll = 0.12 * s1; neck = 0.5 * s1; head = 0.2 * s1; jaw = 0.5 * s1; legF = LP.gF * s1; legR = LP.gR * s1; break; }
      case 'dead': { const T = this.deadT, sd = this.deadSide, buck = sm(T / 0.5), f = clamp((T - 0.35) / 0.55, 0, 1), fall = f * f;
        const bounce = Math.sin(clamp((T - 0.9) / 0.35, 0, 1) * Math.PI) * 0.08 * (1 - sm((T - 0.9) / 0.5));
        y = LP.dB * buck * (1 - fall) + LP.dY * fall; roll = -sd * (fall * 1.45 - bounce); pitch = 0.2 * buck * (1 - fall); neck = 0.3; jaw = 0.4; legF = LP.dF * buck; legR = LP.dR * buck; break; }
    }
    // Lauern: Kopf tief, angespannt; Gewicht vor/zurück beim Antreten/Bremsen
    if (st === 'stalk') { neck = 0.18; jaw = 0.15; y = -0.1; }
    const S0 = this.sm || (this.sm = { y, pitch, roll, neck, head, jaw, legF, legR, tail });
    const kq = damp({ bite: 16, swipe: 14, leap: 20, stomp: 14, howl: 9, stagger: 10, dead: 30, charge: 10, spin: 16 }[st] || 6, dt);
    for (const k of ['y', 'pitch', 'roll', 'neck', 'head', 'jaw', 'legF', 'legR', 'tail']) S0[k] += (({ y, pitch, roll, neck, head, jaw, legF, legR, tail })[k] - S0[k]) * (k === 'y' && rise ? 1 : kq);
    if (rise) S0.y = y;
    // in die Kurve legen, beim Treffer kurz zucken
    let r2 = S0.roll + (st !== 'dead' ? clamp(-this.yawRate * sp * 0.03, -0.15, 0.15) : 0), p2 = S0.pitch;
    if (this.flinch > 0) { const e = (this.flinch / 0.35) ** 2; p2 += 0.05 * e; r2 += 0.04 * e * Math.sin(this.t * 40); }
    M.holder.position.y = S0.y * K; M.holder.rotation.set(p2, 0, r2);
    // ---------- Beine: Clips nach Tempo (Schritte passen zur Strecke), beim Drehen auf der Stelle treten ----------
    const gsp = Math.min(st === 'spin' ? 3.5 : 99, Math.max(sp, Math.abs(this.yawRate) * 2.2 * K));
    const still = st === 'sleep' || st === 'dead' || st === 'leap' || st === 'stagger' || st === 'howl' || st === 'stomp' || st === 'wake';
    const run = sm((gsp - 4.5) / 2.5), walk = still ? 0 : sm((gsp - 0.25) / 0.6) * (1 - run);
    const idle = 1 - walk - run * (still ? 0 : 1);
    const L = lerp(M.walkL, M.runL, run);
    this.it = (this.it || 0) + dt * 0.62;     // eigene Uhr fürs Atmen im Stehen
    this.gp = (this.gp + (fwd < -0.2 ? -1 : 1) * dt * gsp / Math.max(0.5, L) + 1) % 1;
    for (const [k, a2, w2] of [['idle', M.idle, idle], ['walk', M.walk, walk], ['run', M.run, still ? 0 : run]]) {
      this.aw[k] = lerp(this.aw[k], w2, damp(8, dt));
      if (!a2) continue;
      a2.time = (k === 'idle' ? (this.it % 1) : this.gp) * a2.getClip().duration;
    }
    for (const b of M.ctl) b.quaternion.copy(b.userData.base);
    if (M.idle) M.idle.setEffectiveWeight(this.aw.idle);
    if (M.walk) M.walk.setEffectiveWeight(this.aw.walk);
    if (M.run) M.run.setEffectiveWeight(this.aw.run);
    M.mixer.update(0);
    for (const b of M.ctl) b.userData.base.copy(b.quaternion);
    // ---------- Knochen per Code ----------
    M.holder.updateMatrixWorld(true); M.holder.getWorldQuaternion(qH);
    const ax = (x, y2, z) => vX.set(x, y2, z).applyQuaternion(qH).clone();
    const X = ax(1, 0, 0), Y = ax(0, 1, 0), Z = ax(0, 0, 1);
    const alive = !this.dead && st !== 'sleep';
    // Kopf schaut zum Magier (der ist klein → Kopf etwas nach unten, wenn er nah ist)
    const lt = alive && st !== 'spin' && st !== 'charge' ? clamp(this.lookYaw || 0, -0.9, 0.9) : 0;
    this.lk = lerp(this.lk || 0, lt, damp(5, dt));
    const down = alive ? clamp((9 * K - (this.lookD || 9)) / (9 * K), 0, 1) * 0.35 : 0;
    rotW(B.neck1, Y, this.lk * 0.5); rotW(B.head, Y, this.lk * 0.35);
    rotW(B.neck1, X, S0.neck + down); rotW(B.head, X, S0.head + down * 0.4);
    if (B.jaw) rotW(B.jaw, X, S0.jaw);
    // in die Kurve biegen
    this.tb = lerp(this.tb || 0, alive ? clamp(this.yawRate * 0.12, -0.25, 0.25) : 0, damp(6, dt));
    rotW(B.chest, Y, this.tb * 0.5); rotW(B.neck1, Y, this.tb * 0.5); rotW(B.hips, Y, -this.tb * 0.3);
    // Beine einknicken (liegen, ducken, landen) bzw. Vorderbeine heben (Aufbäumen)
    const fold = (up, lo, hl, a2, s) => { if (Math.abs(a2) < 1e-3) return; rotW(up, X, -a2 * 0.9 * s); rotW(lo, X, a2 * 1.3 * s); if (hl) rotW(hl, X, -a2 * 0.6 * s); };
    for (const s of ['L', 'R']) {
      fold(B['frontUpr' + s], B['frontLwr' + s], B['frontHorselink' + s], S0.legF, -1);
      fold(B['rearLeg' + s + '_01'], B['rearLwr' + s], B['rearHorselink' + s], S0.legR, 1);
    }
    // Prankenhieb: Pranke hoch und nach außen, dann quer nach innen-unten
    if (st === 'swipe') {
      const s = this.swSide, side = s > 0 ? 'L' : 'R', up = B['frontUpr' + side], lo = B['frontLwr' + side];
      const a1 = bump(t, 0.05, 0.45), b1 = bump(t, 0.5, 0.68), c1 = bump(t, 0.85, 1.3);
      const raise = (-1.25 * a1 + 1.0 * b1) * (1 - c1), out = (0.7 * a1 - 1.25 * b1) * (1 - c1);
      rotW(up, Z, -s * out); rotW(up, X, raise); rotW(lo, X, 0.5 * a1 * (1 - c1));
    }
    // Sprung: Vorderbeine vor, Hinterbeine zurück
    if (st === 'leap' && rise > 0) for (const s of ['L', 'R']) { rotW(B['frontUpr' + s], X, -0.9 * rise); rotW(B['rearLeg' + s + '_01'], X, 0.8 * rise); }
    // Schwanz: steif im Kampf, fegt bei der Drehung, hängt beim Liegen
    const tw = st === 'sleep' ? 0.3 : st === 'spin' ? S0.tail : 0.15 * Math.sin(this.t * 1.7);
    rotW(B.tail2, Y, tw * 0.5); rotW(B.tail3, Y, tw * 0.4);
    if (this.dead) { const sd = this.deadSide, lie = sm((this.deadT - 0.6) / 0.6);
      rotW(B.neck1, Z, -sd * 0.3 * lie); rotW(B.tail2, Z, sd * 0.4 * lie);
      for (const s of ['L', 'R']) { const top = (sd > 0) === (s === 'R'); rotW(B['frontUpr' + s], Z, sd * (top ? LP.tF : LP.bF) * lie); rotW(B['rearLeg' + s + '_01'], Z, sd * (top ? LP.tR : LP.bR) * lie); }
    }
    // ---------- Glut vom Rücken ----------
    const heat = this.dead ? Math.max(0, 1 - this.deadT / 6) * 0.5 : this.st === 'sleep' ? 0.35 : this.phase2 ? 1.6 : 0.75;
    B.chest && B.chest.getWorldPosition(vY);
    this.glow.position.set(vY.x, vY.y + 0.8, vY.z);
    this.glow.intensity = heat * (this.phase2 ? 10 : 5) * (0.85 + 0.15 * Math.sin(this.t * 11));
    for (const e of this.embers) {
      if (e.life <= 0) {
        if (Math.random() < dt * 16 * heat) {
          const src = [B.chest, B.spine2, B.spine1, B.hips, B.neck1][Math.floor(Math.random() * 5)];
          if (!src) continue;
          src.getWorldPosition(e.s.position); e.s.position.x += (Math.random() - 0.5) * 1.6; e.s.position.y += 0.9 + Math.random() * 0.6; e.s.position.z += (Math.random() - 0.5) * 1.6;
          e.v.set((Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6); e.life = 1.2 + Math.random() * 1.2; e.max = e.life;
          e.s.scale.setScalar(0.12 + Math.random() * 0.14); e.s.visible = true;
        } else { e.s.visible = false; continue; }
      }
      e.life -= dt; e.s.position.addScaledVector(e.v, dt); e.v.x += Math.sin(this.t * 3 + e.max * 9) * dt * 0.8;
      e.s.material.opacity = Math.sin(Math.PI * clamp(1 - e.life / e.max, 0, 1)) * 0.9;
    }
  }
}
