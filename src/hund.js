// Streunende Hunde: abgemagert, struppig, gelbe Augen. Aus Grundformen gebaut, Bewegung per Code (Trab, Sprung, Sterben).
// Verhalten: herumstreunen → Magier entdecken (knurren) → hinrennen → umkreisen → ducken und anspringen (Biss) → kurz Pause.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { toon, outline, GRADIENT, skinOutline } from './toon.js';
import { ladeModell } from './modelle.js';
import { sfx } from './ton.js';
import { resolve } from './kollision.js';
import { clamp, lerp, damp, angDiff, TAU } from './util.js';

const HP = 60;
const SEE = 13;                       // Entdecken (m) – wer dich einmal gesehen hat, bleibt an dir dran
const RUN_V = 4.4, WALK_V = 1.2, PACE_V = 1.5;
const LEAP_RANGE = 2.8, LEAP_V = 9.5;
const T_WIND = 0.38, T_LEAP = 0.34, T_REC = 0.7;
const BITE = 28;                      // Schaden pro Sprung-Biss
const SNAP = 18;                      // Schaden pro schnellem Schnapper aus der Nähe
// Haltung (unsichtbare Leiste): jeder Treffer füllt sie; erst wenn sie voll ist, wird der Hund zurückgestoßen
// (schwerer Schlag: umgeworfen). Sonst zuckt er nur kurz und macht weiter – auch mitten im Angriff.
const POISE_MAX = 40, POISE_REGEN = 18, POISE_WAIT = 2.2;
const RADIUS = 0.42;
const DOWN_T = 1.5; // so lange liegt ein umgeworfener Hund
const smooth01 = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
// Meshy-Hund (models/hund.glb): nur der Clip „dog_walk“ (0,67 s); schaut nach +Z, Füße bei y −0,67, ~1,3 m hoch
const DOG_URL = 'models/hund.glb', DOG_S = 0.72, DOG_FOOT = 0.67, DOG_STRIDE = 1.3, DOG_C = 0.42;
let DOG_GLTF = null;

export const dogs = [];

// ---------- Modell ----------
function mk(geo, mat, parent, x, y, z, line = 0.012) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (line) outline(m, line);
  parent.add(m); return m;
}
function buildDog(fur, dark, belly) {
  const M = { fur: toon(fur, {}), dark: toon(dark, {}), belly: toon(belly, {}), nose: toon(0x120c0a, {}), eye: new THREE.MeshBasicMaterial({ color: 0xffd040 }), tooth: toon(0xe8e0c8, {}) };
  const root = new THREE.Group(); root.scale.setScalar(1.15);
  const body = new THREE.Group(); body.position.y = 0.56; root.add(body);       // Rumpf (wippt, kippt)
  // Brustkorb vorn kräftig, Bauch eingefallen, Rücken dunkler
  const chest = mk(new THREE.SphereGeometry(0.2, 12, 10), M.fur, body, 0, 0.02, 0.2); chest.scale.set(0.9, 1.05, 1.05);
  const waist = mk(new THREE.CylinderGeometry(0.12, 0.17, 0.42, 10), M.fur, body, 0, 0.03, -0.05); waist.rotation.x = Math.PI / 2;
  const hips = mk(new THREE.SphereGeometry(0.15, 10, 8), M.fur, body, 0, 0.04, -0.28); hips.scale.set(1, 1, 1.1);
  const back = mk(new THREE.BoxGeometry(0.16, 0.06, 0.6), M.dark, body, 0, 0.17, -0.02, 0.008); back.rotation.x = 0.05;
  for (let i = 0; i < 4; i++) { const r = mk(new THREE.TorusGeometry(0.17, 0.008, 4, 10, Math.PI), M.dark, body, 0, 0.02, 0.12 - i * 0.07, 0); r.rotation.set(0, Math.PI / 2, Math.PI); } // Rippen
  const belly2 = mk(new THREE.SphereGeometry(0.12, 8, 6), M.belly, body, 0, -0.1, 0.18, 0.006); belly2.scale.set(0.9, 0.6, 1.2);
  // Hals + Kopf
  const neck = new THREE.Group(); neck.position.set(0, 0.1, 0.33); body.add(neck);
  mk(new THREE.CylinderGeometry(0.08, 0.11, 0.24, 8), M.fur, neck, 0, 0.06, 0.06).rotation.x = 0.9;
  const head = new THREE.Group(); head.position.set(0, 0.16, 0.16); neck.add(head);
  const skull = mk(new THREE.SphereGeometry(0.12, 12, 10), M.fur, head, 0, 0, 0); skull.scale.set(0.95, 0.9, 1.05);
  const snout = mk(new THREE.CylinderGeometry(0.045, 0.07, 0.17, 8), M.dark, head, 0, -0.03, 0.15); snout.rotation.x = Math.PI / 2;
  mk(new THREE.SphereGeometry(0.03, 8, 6), M.nose, head, 0, -0.01, 0.24, 0);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.06, 0.06); head.add(jaw);
  mk(new THREE.BoxGeometry(0.07, 0.025, 0.15), M.dark, jaw, 0, -0.01, 0.07, 0.006);
  for (const s of [-1, 1]) {
    mk(new THREE.ConeGeometry(0.008, 0.035, 4), M.tooth, jaw, s * 0.025, 0.015, 0.13, 0);
    mk(new THREE.ConeGeometry(0.008, 0.035, 4), M.tooth, head, s * 0.03, -0.075, 0.2, 0).rotation.x = Math.PI;
    const eye = mk(new THREE.SphereGeometry(0.018, 8, 6), M.eye, head, s * 0.06, 0.03, 0.09, 0); eye.scale.set(1, 0.6, 0.6);
    const ear = mk(new THREE.ConeGeometry(0.045, 0.13, 4), M.dark, head, s * 0.07, 0.11, -0.03, 0.008);
    ear.rotation.set(-0.2, 0, s * -0.35);
    if (s > 0) ear.rotation.z += 0.5; // ein Ohr abgeknickt
  }
  // Schwanz (zwei Glieder)
  const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.4); body.add(tail);
  mk(new THREE.CylinderGeometry(0.025, 0.04, 0.22, 6), M.fur, tail, 0, 0, -0.1).rotation.x = Math.PI / 2 + 0.4;
  const tail2 = new THREE.Group(); tail2.position.set(0, -0.08, -0.2); tail.add(tail2);
  mk(new THREE.CylinderGeometry(0.012, 0.025, 0.2, 6), M.dark, tail2, 0, 0, -0.09).rotation.x = Math.PI / 2 + 0.3;
  // Beine: Hüft-/Schulterdrehpunkt, Knie
  const legs = [];
  for (const [x, z, front] of [[0.1, 0.22, 1], [-0.1, 0.22, 1], [0.09, -0.3, 0], [-0.09, -0.3, 0]]) {
    const hip = new THREE.Group(); hip.position.set(x, -0.02, z); body.add(hip);
    mk(new THREE.CylinderGeometry(0.04, 0.035, 0.28, 6), M.fur, hip, 0, -0.14, 0);
    const knee = new THREE.Group(); knee.position.set(0, -0.28, 0); hip.add(knee);
    mk(new THREE.CylinderGeometry(0.028, 0.022, 0.26, 6), front ? M.fur : M.dark, knee, 0, -0.13, 0);
    mk(new THREE.SphereGeometry(0.035, 6, 5), M.dark, knee, 0, -0.26, 0.02, 0.006).scale.set(1, 0.6, 1.4);
    legs.push({ hip, knee, front, side: x > 0 ? 1 : -1 });
  }
  // Fellbüschel (struppig)
  for (let i = 0; i < 9; i++) {
    const t = mk(new THREE.ConeGeometry(0.03, 0.09, 4), i % 2 ? M.fur : M.dark, body, (Math.random() - 0.5) * 0.24, 0.12 + Math.random() * 0.06, -0.3 + i * 0.07, 0);
    t.rotation.set(-1 + Math.random() * 0.5, 0, (Math.random() - 0.5) * 0.8);
  }
  return { root, body, neck, head, jaw, tail, tail2, legs, mats: Object.values(M).filter((m) => m.emissive) };
}

// ---------- Hund ----------
const COLORS = [[0x6b5a48, 0x3e3228, 0xa89074], [0x5a5550, 0x2e2c2a, 0x9a9488], [0x8a6a44, 0x4a3420, 0xc8a878]];
let nextId = 0;
class Dog {
  constructor(scene, x, z, yaw) {
    const c = COLORS[nextId++ % COLORS.length];
    this.m = buildDog(...c);
    scene.add(this.m.root);
    this.home = new THREE.Vector3(x, 0, z); this.homeYaw = yaw;
    this.p = new THREE.Vector3();
    this.pos = new THREE.Vector3();      // Ziel-Punkt für Kamera/Karten (Körpermitte)
    this.node = this.m.root;
    this.name = 'Streunender Hund';
    this.mm = null; this.gp = Math.random();
    this.reset();
    if (DOG_GLTF) this.useModel();
  }
  /** Meshy-Modell statt der Grundformen einsetzen */
  useModel() {
    if (this.mm) return;
    const model = cloneSkinned(DOG_GLTF.scene), mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material;
      o.material = new THREE.MeshToonMaterial({ map: m.map, normalMap: m.normalMap, gradientMap: GRADIENT, side: THREE.DoubleSide });
      if (o.material.normalMap) o.material.normalScale.set(0.7, 0.7);
      mats.push(o.material);
    });
    const sk = []; model.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); });
    for (const o of sk) skinOutline(o, 0.012);
    model.scale.setScalar(DOG_S);
    const holder = new THREE.Group(); holder.add(model);
    model.position.y = DOG_FOOT * DOG_S - DOG_C;
    this.m.root.add(holder);
    this.m.body.visible = false;
    const mixer = new THREE.AnimationMixer(model);
    const clip = DOG_GLTF.animations[0];
    const act = clip ? mixer.clipAction(clip) : null;
    if (act) { act.play(); act.timeScale = 0; }
    this.mm = { model, holder, mixer, act, dur: clip ? clip.duration : 1, mats };
  }
  reset() {
    this.p.copy(this.home); this.yaw = this.homeYaw;
    this.hp = HP; this.dead = false; this.st = 'idle'; this.t = 0; this.v = new THREE.Vector2();
    this.cool = 1 + Math.random(); this.phase = Math.random() * TAU; this.flash = 0; this.circ = Math.random() < 0.5 ? 1 : -1;
    this.wander = null; this.bit = false; this.deadT = 0; this.alert = 0; this.aggro = false;
    this.poise = 0; this.poiseT = 0; this.flinch = 0; this.paceT = 0; this.paceSide = Math.random() < 0.5 ? 1 : -1; this.snapCool = 1;
    this.sm = null; // geglättete Körperhaltung
    this.m.root.visible = true; this.m.root.rotation.set(0, this.yaw, 0);
    this.m.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.isOutline) o.visible = true; else if (o.material.transparent) { o.material.transparent = false; o.material.opacity = 1; } });
    this.pos.set(this.p.x, 0.55, this.p.z);
  }
  /** Treffer vom Magier (Degen oder Karte) */
  onHit(dmg, dir, heavy, poiseDmg) {
    if (this.dead) return;
    this.hp -= dmg; this.alert = 1; this.aggro = true;
    // Trefferrichtung im Hund-Raum (x seitlich, z vorn): danach richtet sich das Zurückzucken
    const rel = angDiff(this.yaw, Math.atan2(dir.x, dir.z));
    this.hx = Math.sin(rel); this.hz = Math.cos(rel);
    sfx.yelp(heavy || this.hp <= 0);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.st = 'dead'; this.t = 0; this.deadSide = this.hx >= 0 ? 1 : -1; this.v.set(dir.x * 5, dir.z * 5); return; }
    // Haltung: erst wenn die Leiste voll ist, wird er zurückgestoßen bzw. umgeworfen
    this.poise += poiseDmg != null ? poiseDmg : (heavy ? 28 : dmg); this.poiseT = 0;
    if (this.poise >= POISE_MAX) {
      this.poise = 0;
      if (heavy) { this.st = 'down'; this.t = 0; this.downSide = this.hx >= 0 ? 1 : -1; this.v.set(dir.x * 6, dir.z * 6); }
      else { this.st = 'hurt'; this.t = 0; this.hurtT = 0.6; this.v.set(dir.x * 4.5, dir.z * 4.5); }
    } else {
      this.flinch = 0.28; // nur kurz zusammenzucken, Angriff läuft weiter
      if (this.st !== 'leap') { this.v.x += dir.x * 1.2; this.v.y += dir.z * 1.2; }
    }
  }

  /** Spieler tot: zurück zum Streunen */
  calm() { this.st = 'idle'; this.t = 0; this.alert = 0; this.aggro = false; }

  update(dt, pl, attackers = 0) {
    this.t += dt;
    this.snapCool -= dt; this.flinch = Math.max(0, this.flinch - dt);
    // Haltung erholt sich, wenn eine Weile kein Treffer kam
    this.poiseT += dt; if (this.poiseT > POISE_WAIT) this.poise = Math.max(0, this.poise - POISE_REGEN * dt);
    const dx = pl.pos.x - this.p.x, dz = pl.pos.z - this.p.z, d = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const plOk = pl.state !== 'dead';
    let want = null, spd = 0, turn = 8;
    switch (this.st) {
      case 'idle': // streunen
        if (!this.wander || this.t > this.wander.t) this.wander = { a: Math.random() * TAU, t: this.t + 1.5 + Math.random() * 2.5, go: Math.random() < 0.6 };
        if (this.wander.go) { want = this.wander.a; spd = WALK_V; if (this.p.distanceTo(this.home) > 5) want = Math.atan2(this.home.x - this.p.x, this.home.z - this.p.z); }
        if (plOk && (d < SEE || this.alert)) { this.st = 'growl'; this.t = 0; this.aggro = true; sfx.growl(false); }
        break;
      case 'growl': // knurren: Kopf runter, Blick zum Magier
        want = toP; turn = 10;
        if (this.t > 0.6) { this.st = 'chase'; this.t = 0; }
        break;
      case 'chase': // hinrennen – gibt nie auf, solange du lebst
        want = toP; spd = RUN_V * clamp((d - 1.2) / 1.5, 0.35, 1); turn = 9;
        if (!plOk) { this.calm(); break; }
        this.cool -= dt;
        if (d < 1.5 && this.snapCool <= 0 && attackers < 2) { this.st = 'snap'; this.t = 0; this.bit = false; sfx.growl(true); }
        else if (d < LEAP_RANGE && this.cool <= 0 && attackers < 2) { this.st = 'wind'; this.t = 0; sfx.growl(true); }
        else if (d < 3.4 && (this.cool > 0 || attackers >= 2)) { this.st = 'circle'; this.t = 0; this.paceT = 0; }
        break;
      case 'circle': { // lauern: Blick immer auf dich, ein paar Schritte hin und her, Abstand halten
        this.cool -= dt;
        if (!plOk) { this.calm(); break; }
        this.paceT += dt;
        const pacing = (this.paceT % 1.6) < 0.9;           // 0,9 s gehen, 0,7 s stehen und fixieren
        if (pacing) { want = toP + this.paceSide * (1.25 - clamp((d - 3) * 0.6, -0.5, 0.5)); spd = PACE_V; turn = 6; }
        else { want = toP; spd = d > 3.6 ? PACE_V : 0; turn = 9; }
        if (this.paceT > 1.6) { this.paceT -= 1.6; if (Math.random() < 0.6) this.paceSide *= -1; }
        if (d < 1.5 && this.snapCool <= 0 && attackers < 2) { this.st = 'snap'; this.t = 0; this.bit = false; sfx.growl(true); }
        else if ((this.cool <= 0 && attackers < 2) || d > 4.8) { this.st = 'chase'; this.t = 0; }
        break;
      }
      case 'snap': { // schneller Schnapper aus der Nähe
        want = toP; turn = this.t < 0.2 ? 12 : 2;
        spd = this.t > 0.2 && this.t < 0.34 ? 3.5 : 0;
        const hx = this.p.x + Math.sin(this.yaw) * 0.55, hz = this.p.z + Math.cos(this.yaw) * 0.55;
        if (!this.bit && this.t > 0.24 && this.t < 0.36 && plOk && Math.hypot(pl.pos.x - hx, pl.pos.z - hz) < 0.8) {
          this.bit = true; sfx.bite();
          pl.damage(SNAP, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
        }
        if (this.t > 0.75) { this.st = 'chase'; this.t = 0; this.snapCool = 1.6 + Math.random(); this.cool = Math.max(this.cool, 0.5); }
        break;
      }
      case 'wind': // ducken und Anlauf nehmen
        want = toP; turn = 14;
        if (this.t > T_WIND) { this.st = 'leap'; this.t = 0; this.bit = false; this.leapA = this.yaw; }
        break;
      case 'leap': { // Sprung mit Biss
        spd = LEAP_V * (1 - this.t / T_LEAP * 0.5);
        this.yaw = this.leapA;
        const hx = this.p.x + Math.sin(this.yaw) * 0.55, hz = this.p.z + Math.cos(this.yaw) * 0.55;
        if (!this.bit && plOk && Math.hypot(pl.pos.x - hx, pl.pos.z - hz) < 0.75) {
          this.bit = true; sfx.bite();
          pl.damage(BITE, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
        }
        if (this.t > T_LEAP) { this.st = 'rec'; this.t = 0; }
        break;
      }
      case 'rec': // landen, kurz verwundbar
        if (this.t > T_REC) { this.st = 'chase'; this.t = 0; this.cool = 0.7 + Math.random() * 1.1; }
        break;
      case 'hurt':
        if (this.t > this.hurtT) { this.st = 'chase'; this.t = 0; this.cool = Math.max(this.cool, 0.6); }
        break;
      case 'down': // umgeworfen: fällt auf die Seite, zappelt, rappelt sich auf
        if (this.t > DOWN_T) { this.st = 'chase'; this.t = 0; this.cool = Math.max(this.cool, 0.9); }
        break;
      case 'dead':
        this.deadT += dt;
        if (this.deadT > 25 && d > 18) this.reset(); // kommt irgendwann wieder (zum Üben)
        break;
    }
    // Bewegen
    if (want !== null && this.st !== 'leap') this.yaw += angDiff(this.yaw, want) * damp(turn, dt);
    if (this.st === 'hurt' || this.st === 'dead' || this.st === 'down' || (this.flinch > 0 && spd === 0)) this.v.multiplyScalar(Math.exp(-6 * dt));
    else { const tv = spd; this.v.x = lerp(this.v.x, Math.sin(this.yaw) * tv, damp(this.st === 'leap' ? 30 : 8, dt)); this.v.y = lerp(this.v.y, Math.cos(this.yaw) * tv, damp(this.st === 'leap' ? 30 : 8, dt)); }
    this.p.x += this.v.x * dt; this.p.z += this.v.y * dt;
    resolve(this.p, RADIUS);
    this.pos.set(this.p.x, 0.55, this.p.z);
    this.animate(dt);
  }

  animate(dt) {
    const m = this.m, sp = Math.hypot(this.v.x, this.v.y);
    m.root.position.set(this.p.x, 0, this.p.z);
    m.root.rotation.y = this.yaw;
    this.phase += dt * (3 + sp * 2.6);
    const gait = clamp(sp / 2, 0, 1), ph = this.phase;
    let yawOff = 0, pitch = 0, by = 0.56 + Math.abs(Math.sin(ph)) * 0.035 * gait, headX = 0, jaw = 0.05, tailX = -0.3, tailW = Math.sin(this.t * 3) * 0.2, roll = 0;
    let legAmp = 0.55 * gait, legBase = 0, frontBase = 0;
    switch (this.st) {
      case 'growl': headX = 0.35; jaw = 0.25 + Math.sin(this.t * 40) * 0.05; tailX = -0.8; by = 0.5; break;
      case 'chase': headX = 0.15; jaw = 0.18; tailX = -0.6; pitch = 0.05; break;
      case 'circle': headX = 0.3; jaw = 0.22; tailX = -0.8; break;
      case 'wind': { const k = clamp(this.t / T_WIND, 0, 1); by = 0.56 - 0.16 * k; pitch = 0.18 * k; headX = 0.45 * k; jaw = 0.3; tailX = -0.9; legBase = -0.5 * k; frontBase = 0.5 * k; legAmp = 0; break; }
      case 'leap': { const k = clamp(this.t / T_LEAP, 0, 1); by = 0.56 + Math.sin(k * Math.PI) * 0.45; pitch = -0.35 + k * 0.6; headX = -0.2; jaw = k < 0.7 ? 0.7 : 0.1; frontBase = -1.0; legBase = 0.9; legAmp = 0; tailX = 0.2; break; }
      case 'snap': { // Kopf zurück, dann nach vorn schnappen
        const a = smooth01(this.t / 0.2), b = smooth01((this.t - 0.2) / 0.12), c = smooth01((this.t - 0.38) / 0.35);
        pitch = (-0.12 * a + 0.32 * b) * (1 - c); headX = (-0.3 * a + 0.75 * b) * (1 - c); jaw = 0.3 + 0.6 * b * (1 - c); by = 0.56 - 0.05 * a; tailX = -0.9; break; }
      case 'rec': { const k = clamp(this.t / T_REC, 0, 1); by = 0.5 + 0.06 * k; pitch = 0.1 * (1 - k); headX = 0.1; jaw = 0.1; tailX = -0.5; break; }
      case 'hurt': { // zurückzucken: weg von der Trefferrichtung, Kopf reißt zurück, kurzes Zittern
        const k = clamp(this.t / this.hurtT, 0, 1), e = (1 - k) * (1 - k);
        pitch = 0.32 * this.hz * e; roll = -0.4 * this.hx * e + Math.sin(this.t * 45) * 0.05 * e; yawOff = 0.55 * this.hx * e;
        headX = -0.45 * e; jaw = 0.6; tailX = -1.2; by = 0.56 - 0.06 * e; break; }
      case 'down': { // auf die Seite geworfen, Beine zappeln, dann aufrappeln
        const f = smooth01(this.t / 0.22), u = smooth01((this.t - (DOWN_T - 0.45)) / 0.45), lie = f * (1 - u);
        roll = this.downSide * -1.45 * lie; by = lerp(0.56, 0.24, lie); pitch = -0.15 * lie; headX = 0.2 * lie; jaw = 0.5; tailX = -0.3; break; }
      case 'dead': { const k = smooth01(this.deadT / 0.45); roll = -(this.deadSide || 1) * k * Math.PI / 2; by = lerp(0.56, 0.22, k); headX = 0.3 * k; jaw = 0.4; legAmp = 0; legBase = 0.3 * k; frontBase = -0.3 * k; tailX = -0.2; break; }
    }
    // Haltung weich nachführen (keine Sprünge zwischen den Zuständen) – Sprung und Treffer schneller
    const S = this.sm || (this.sm = { by, pitch, roll, yawOff, headX });
    const k = damp({ leap: 16, wind: 14, snap: 18, hurt: 22, down: 11, dead: 10 }[this.st] || 8, dt);
    S.by += (by - S.by) * k; S.pitch += (pitch - S.pitch) * k; S.roll += (roll - S.roll) * k; S.yawOff += (yawOff - S.yawOff) * k; S.headX += (headX - S.headX) * k;
    by = S.by; pitch = S.pitch; roll = S.roll; yawOff = S.yawOff; headX = S.headX;
    // kurzes Zusammenzucken bei Treffern, die die Haltung nicht brechen (läuft über alles drüber)
    if (this.flinch > 0) {
      const e = (this.flinch / 0.28) ** 2;
      pitch += 0.16 * (this.hz || 0) * e; yawOff += 0.28 * (this.hx || 0) * e; roll -= 0.16 * (this.hx || 0) * e; headX -= 0.25 * e;
    }
    m.body.position.y = by;
    m.body.rotation.set(pitch, 0, roll);
    m.neck.rotation.x = headX;
    m.jaw.rotation.x = jaw;
    m.tail.rotation.set(tailX, tailW, 0);
    m.tail2.rotation.x = -0.3;
    for (const L of m.legs) {
      // Trab: diagonale Beinpaare gleichzeitig
      const off = (L.front ? 0 : Math.PI) + (L.side > 0 ? 0 : Math.PI);
      const s = Math.sin(ph + off);
      L.hip.rotation.x = s * legAmp + (L.front ? frontBase : legBase);
      L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(ph + off)) * 0.7 * gait + (L.front ? 0 : 0.2);
    }
    // Meshy-Modell: gleiche Körperhaltung, Beine aus dem Lauf-Clip (Schritte passend zum Tempo)
    const M = this.mm;
    if (M) {
      M.holder.position.y = DOG_C + (by - 0.56) * 0.9;
      M.holder.rotation.set(pitch + headX * 0.15, yawOff, roll);
      // Gewicht weich nachführen (sonst flackert es zwischen Stehen und Laufen)
      let wt = clamp((sp - 0.15) / 0.5, 0, 1), tt;
      if (this.st === 'leap') { wt = 1; this.gp = 0.55; tt = 0.55; }
      else if (this.st === 'down') { wt = 1; this.gp = (this.gp + dt * 2.6) % 1; tt = this.gp; } // Beine zappeln
      else if (this.st === 'wind') { wt = 0.8; this.gp += (0.55 - this.gp) * damp(8, dt); tt = this.gp; } // Beine gehen in die Sprunghaltung
      else {
        // Schrittlänge wächst mit dem Tempo (beim Rennen weitere Sprünge statt Trippeln)
        const cyc = DOG_STRIDE * DOG_S * (1 + clamp((sp - 1.5) / 2.5, 0, 1) * 0.7);
        this.gp = (this.gp + dt * sp / cyc) % 1; tt = this.gp;
      }
      if (this.dead) wt = 0;
      this.aw = lerp(this.aw || 0, wt, damp(this.st === 'leap' ? 20 : 7, dt));
      // Rennen: Körper wippt im Galopp-Takt (2× pro Schrittfolge) und neigt sich leicht
      const run = clamp((sp - 2) / 2, 0, 1) * this.aw;
      if (run > 0) {
        M.holder.position.y += Math.abs(Math.sin(this.gp * TAU)) * 0.05 * run;
        M.holder.rotation.x += Math.sin(this.gp * TAU * 2) * 0.05 * run + 0.04 * run;
      }
      if (M.act) { M.act.time = tt * M.dur; M.act.setEffectiveWeight(this.aw); M.mixer.update(0); }
    }
    // tot: nach einer Weile ausblenden
    if (this.dead && this.deadT > 3) {
      const a = clamp(1 - (this.deadT - 3) / 1.2, 0, 1);
      m.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.isOutline) o.visible = false; else { o.material.transparent = true; o.material.opacity = a; } });
      if (a <= 0) m.root.visible = false;
    }
  }
}

/** Hunde aufstellen: ein Rudel im Norden, einer an der Querstraße */
export function spawnDogs(scene) {
  ladeModell(new GLTFLoader(), DOG_URL, (g) => { DOG_GLTF = g; for (const d of dogs) d.useModel(); }, (e) => console.warn('Hunde-Modell fehlt – Grundformen bleiben.', e));
  for (const [x, z, y] of [[-2, -30, 0.4], [2.5, -33, -0.6], [-1, -36, 2.8], [24, 2, -1.5]]) dogs.push(new Dog(scene, x, z, y));
  return dogs;
}

/** Hunde bewegen; Hunde und Magier schieben sich gegenseitig weg */
export function updateDogs(dt, pl) {
  // höchstens zwei Hunde greifen gleichzeitig an, die anderen lauern
  let attackers = 0;
  for (const d of dogs) if (d.st === 'wind' || d.st === 'leap' || d.st === 'snap') attackers++;
  for (const d of dogs) d.update(dt, pl, attackers);
  for (const d of dogs) {
    if (d.dead) continue;
    const dx = pl.pos.x - d.p.x, dz = pl.pos.z - d.p.z, l = Math.hypot(dx, dz), min = RADIUS + 0.4;
    if (l < min && l > 1e-4 && pl.state !== 'roll') { const k = (min - l) / l; pl.pos.x += dx * k * 0.5; pl.pos.z += dz * k * 0.5; d.p.x -= dx * k * 0.5; d.p.z -= dz * k * 0.5; }
    for (const e of dogs) {
      if (e === d || e.dead) continue;
      const ex = e.p.x - d.p.x, ez = e.p.z - d.p.z, el = Math.hypot(ex, ez);
      if (el < 0.95 && el > 1e-4) { const k = (0.95 - el) / el * 0.5; e.p.x += ex * k; e.p.z += ez * k; }
    }
  }
}

export function resetDogs() { for (const d of dogs) d.reset(); }
export const DOG_HP = HP;
