// Boss: Garm, der Aschenhund – ein riesiger, gepanzerter Höllenhund (models/boss.glb von Meshy, Clips dog_idle/dog_walk/dog_run),
// etwa 3,5-mal so groß wie der Magier. Wartet liegend auf dem Ascheplatz hinter dem Nebeltor.
// Angriffsmuster: Biss, Prankenhieb links/rechts, Sprung mit Aufschlag, Ansturm, Drehung (wer hinter ihm steht), Aufbäumen und
// Stampfen. Bei der Hälfte der Leben heult er (Phase 2): schneller, Kombos, mehr Glut. Haltung: genug Treffer → er taumelt.
// Bewegung wie bei den Hunden: Drehtempo begrenzt, Schritte passend zum Tempo (Schrittlänge der Clips beim Laden gemessen).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toonFigur, skinOutline } from './toon.js';
import { ladeModell } from './modelle.js';
import { glowTex } from './texturen.js';
import { sfx } from './ton.js';
import { pool } from './blut.js';
import { clamp, lerp, damp, angDiff, TAU } from './util.js';
import { Beine, LEG_BONES, ccdAim } from './bossbeine.js';
import { Teile, hitsPlayer } from './bossteile.js';
import { Kopf } from './bosskopf.js';

const URL = 'models/boss.glb';
export const BOSS_NAME = 'Garm, der Aschenhund';
export const BOSS_HP = 640;
const S = 4.3;              // Größe (Modell ist 1,5 m hoch → Kopf ~5,4 m: gut 3× der Magier)
const K = S / 3.5;          // alle Reichweiten wachsen mit
const FOOT = 0.68;          // Füße bei y −0,68 im Modell
// ---------- Hitboxen (im Testmodus einstell- und sichtbar – hitboxen.js) ----------
// Treffer hängen an den Knochen (bossteile.js): der Magier trifft Kopf, Hals, Rumpf, Beine, Schwanz (Kapseln, Dicke aus dem Modell
// gemessen); der Boss trifft mit Schnauze, Pfote(n), Kopf/Hals, Schwanz. Hier nur noch FAKTOREN auf die gemessene Größe (1 = gemessen):
// body.dicke = alle Körper-Kapseln; je Angriff r = Größe der Trefferkugeln; bite.vor = Lage der Kugel auf der Linie Kopf → Schnauzenspitze.
// Sprung und Heulen bleiben Kreise am Boden (Meter): Sprung innen r = voller Schaden, außen r2 = Streifschaden, fwd vor der Brust.
const m2 = (x) => Math.round(x * K * 100) / 100;
export const HB_STD = {
  body: { dicke: 1 },
  bite: { r: 1, vor: 0.9 },
  swipe: { r: 1 },
  stomp: { r: 1 },
  charge: { r: 1 },
  spin: { r: 1 },
  leap: { fwd: m2(2), r: m2(3.4), r2: m2(5.4) },
  howl: { r: m2(8.5) },
};
// Kollision mit dem Boden-Körper (Magier wird herausgeschoben) – fest, nicht einstellbar
const COL = { f: m2(2.3), b: m2(2.4), r: m2(1.35) };
const HB_KEY = 'aschenblatt-hitbox2';
export const HB = JSON.parse(JSON.stringify(HB_STD));
try { // gespeicherte Einstellungen aus dem Testmodus übernehmen (nur bekannte Felder, nur gültige Zahlen)
  const d = JSON.parse(localStorage.getItem(HB_KEY) || 'null');
  if (d) for (const k in HB) for (const f in HB[k]) if (d[k] && Number.isFinite(d[k][f]) && d[k][f] >= 0) HB[k][f] = d[k][f];
} catch (e) { /* kein Speicher – Standard */ }
export function saveHB() { try { localStorage.setItem(HB_KEY, JSON.stringify(HB)); } catch (e) { /* egal */ } }
export function resetHB() { for (const k in HB) Object.assign(HB[k], HB_STD[k]); saveHB(); }
/** Treffer-Fenster je Angriff für die Anzeige: 1 = holt aus (Warnung), 2 = trifft gerade */
export function hitPhase(st, t) {
  const A = ATK[st]; if (!A) return 0;
  const at = A.hit || (A.land != null ? [A.land - 0.05, A.land + 0.15] : A.slam != null ? [A.slam - 0.05, A.slam + 0.15] : A.push != null ? [A.push - 0.05, A.push + 0.2] : null);
  if (!at) return 0;
  if (A.hit2) { if (t >= A.hit2[0] && t <= A.hit2[1]) return 2; if (t > at[1] && t < A.hit2[0]) return 1; }   // Doppelbiss
  return t >= at[0] && t <= at[1] ? 2 : t < at[0] ? 1 : 0;
}
const POISE_MAX = 150, POISE_WAIT = 3, POISE_REGEN = 30;
const TURN_MAX = 1.7, TURN_ACC = 7;               // rad/s, rad/s²
// Haltungen mit eingeknickten Beinen (gemessen: Pfoten bleiben am Boden): Ducken/Landen, Drehung, Taumeln, Tod
const LP = { cF: 0.8, cR: 0.3, lF: 0.7, lR: 0.2, sy: -0.15, sF: 0.2, sR: 0.1, gy: -0.65, gF: 1.05, gR: 0.15, dB: -0.45, dY: 1.05, dF: 0.6, dR: 0.6, tF: 0.8, bF: -0.2, tR: 0.75, bR: 0.3 };
const sm = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const bump = (t, a, b) => sm((t - a) / Math.max(1e-3, b - a));  // 0 → 1 zwischen a und b
const smoother = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * c * (c * (6 * c - 15) + 10); }; // langsam an, schnell, weich aus

// ---------- Federn statt einfacher Glättung ----------
// Jede Haltungsgröße hat Lage UND Tempo (gedämpfte Feder). Früher lief die Haltung dem Ziel nur hinterher: bei jedem Zustandswechsel
// (Lauern → Angriff, Angriff abgebrochen) sprang das Tempo schlagartig → ruckartig und hölzern. Die Feder beschleunigt und bremst weich.
// OM = Steifigkeit je Zustand (höher = folgt schneller), OMK = Faktor je Größe (Kopf/Hals hängen etwas nach → wirkt lebendig).
const OM = { sleep: 5, wake: 8, stalk: 7, bite: 17, biteQ: 20, bite2: 18, swipe: 15, leap: 18, charge: 10, spin: 15, stomp: 14, howl: 9, stagger: 10, dead: 20 };
const OMK = { neck: 0.85, head: 0.7, jaw: 1.6, hroll: 1.1, tail: 0.55, pawR: 1.35, pawO: 1.35, pawL: 1.35, air: 1.2, legF: 1.1, legR: 1.1 };
const ZETA = 0.88;           // knapp unter 1: kommt ohne Zappeln an, schwingt aber ganz leicht aus (wirkt schwer und organisch)
const POSE = ['y', 'pitch', 'roll', 'neck', 'head', 'jaw', 'hroll', 'legF', 'legR', 'tail', 'pawR', 'pawO', 'pawL', 'air'];
/** eine Feder-Größe k auf das Ziel zu bewegen (in kleinen Schritten, damit sie auch bei ruckelnden Bildraten stabil bleibt) */
function spring(F, k, target, om, dt) {
  if (!Number.isFinite(target)) target = 0;
  let x = Number.isFinite(F.x[k]) ? F.x[k] : target, v = Number.isFinite(F.v[k]) ? F.v[k] : 0;
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) { v += (om * om * (target - x) - 2 * ZETA * om * v) * h; x += v * h; }
  F.x[k] = x; F.v[k] = v;
}

// Feinabstimmung der Reichweiten (Meter zusätzlich zur gemessenen Lage von Schnauze/Schulter/Pfote) – per Treffer-Test bestimmt
const RE = { bite: 1.3, swipe: 1.8, stomp: 0.6 };
// Bisse – drei Varianten mit eigenem Ablauf (Zeiten in s): w = Ausholen bis, l = Vorstoß [von, bis], snap = Maul schnappt zu,
// sh = Kopfschütteln [von, bis] (Reißen wie bei Beute), rec = zurücknehmen [von, bis], max = längster Vorstoß (m);
// Doppelbiss: nach dem ersten Biss kurz zurück, neu zielen, zweiter Vorstoß l2 / snap2
const BITE = {
  bite: { w: 0.48, l: [0.5, 0.68], snap: 0.66, sh: [0.72, 1.15], rec: [1.12, 1.7], max: 5.5 },   // Reißbiss
  biteQ: { w: 0.26, l: [0.27, 0.41], snap: 0.39, sh: null, rec: [0.5, 1.05], max: 3.0 },         // Schnappbiss (schnell, nah)
  bite2: { w: 0.38, l: [0.39, 0.53], snap: 0.51, l2: [0.8, 0.95], snap2: 0.93, sh: null, rec: [1.05, 1.8], max: 3.5 }, // Doppelbiss
};
const isBite = (s) => s in BITE;
// Angriffe: Dauer T (Phase 2 läuft schneller), Treffer-Fenster hit (Doppelbiss: zweites hit2), Schaden dmg
const ATK = {
  bite: { T: 1.75, hit: [0.6, 0.8], dmg: 32 },
  biteQ: { T: 1.1, hit: [0.33, 0.5], dmg: 24 },
  bite2: { T: 1.85, hit: [0.44, 0.6], hit2: [0.86, 1.02], dmg: 22 },
  swipe: { T: 1.4, hit: [0.5, 0.7], dmg: 28 },
  leap: { T: 2.3, land: 1.22, dmg: 42, dmg2: 22 },
  charge: { T: 2.1, hit: [0.5, 1.55], dmg: 36 },
  spin: { T: 1.85, hit: [0.5, 1.02], dmg: 26 },
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
  bone.quaternion.copy(qP.invert().multiply(qR)).normalize();   // Länge 1 halten (siehe bossbeine.js rotW)
}

export class Boss {
  constructor(scene, home, arena) {
    this.scene = scene; this.home = home; this.arena = arena;
    this.name = BOSS_NAME; this.maxHp = BOSS_HP;
    this.root = new THREE.Group(); scene.add(this.root);
    this.node = this.root;                      // Karten bleiben hier stecken
    this.p = new THREE.Vector3(); this.v = new THREE.Vector2();
    this.pos = new THREE.Vector3();             // Treffer-/Zielpunkt: nächster Körperpunkt zum Magier
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
      // Anime-Material mit Randlicht und glühenden Augen/Glutrissen (toon.js toonFigur); Glut folgt der Hitze (animate)
      o.material = this.mat = toonFigur(o.material, { glow: 2.2 });
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
    const runC = clip(/run/);
    this.mm = { model, holder, mixer, B, idle: act(clip(/idle/)), walk: act(clip(/walk/)), run: act(runC), run2: act(runC && runC.clone()) };
    // Schrittlänge der Clips messen: wie weit wandert eine Pfote im Bodenkontakt pro Durchlauf zurück (Meter bei Größe S)
    const M = this.mm;
    // Der Lauf-Clip von Meshy ist keine saubere Schleife (Ende ≠ Anfang, Beine springen bis 13°). Kurz vor dem Ende wird darum
    // weich zum Anfangsbild übergeblendet (zweite Kopie run2 steht auf Zeit 0) – sonst ruckt er bei jedem Laufschritt.
    M.runSeam = this.seam(M.run) > 3 ? 0.14 : 0;
    M.walkL = this.stride(M.walk) || 4.8; M.runL = this.stride(M.run) || 15;
    M.phW = this.stancePhase(M.walk); M.phR = this.stancePhase(M.run);
    const ctl = ['head', 'neck1', 'neck_01', 'jaw', 'chest', 'spine1', 'spine2', 'hips', 'tail2', 'tail3', 'tail4', ...Kopf.BONES, ...LEG_BONES];
    M.ctl = [...new Set(ctl)].map((n) => B[n]).filter(Boolean);
    // Beine: Bodenhöhe der Pfoten messen (Fuß-IK, bossbeine.js); Tritt → Staub/Geräusch über onStep
    this.beine = new Beine(B); this.beine.measure(M, M.walk);
    this.beine.onStep = (x, z, k) => { if (this.onStep) this.onStep(x, z, k * (this.st === 'charge' ? 1.4 : 1)); };
    // Körperteile vermessen (Grundhaltung): Kapseln für Treffer in beide Richtungen (bossteile.js)
    for (const x of [M.idle, M.walk, M.run, M.run2]) if (x) x.setEffectiveWeight(0);
    M.mixer.update(0); this.root.updateMatrixWorld(true);
    this.teile = new Teile(model, B);
    // Kopf, Ohren, Schwanz: Blick, Verhalten, Nachschwingen (bosskopf.js)
    this.kopf = new Kopf(B, this.teile.ok ? this.teile.tip : null);
    this.kopf.onGrowl = () => sfx.growl(true);
    // Reichweiten in der Grundhaltung (Meter vor der Körpermitte): Schnauze, Schultern, Vorderpfoten, Hals-Ansatz
    if (this.teile.ok) {
      const fwd = (p) => this.root.worldToLocal(p.clone()).z, up = (p) => p.y;
      const tip = this.teile.snout(1, new THREE.Vector3()), sh = B.frontUprL.getWorldPosition(new THREE.Vector3());
      const neck = B.neck_01.getWorldPosition(new THREE.Vector3()), paw = B.frontFootL.getWorldPosition(new THREE.Vector3());
      this.reach = { snout: fwd(tip), snoutY: up(tip), neck: fwd(neck), neckY: up(neck), shoulder: fwd(sh), shoulderY: up(sh), paw: fwd(paw),
        headLen: tip.distanceTo(neck) };
      // Boden-Kollision aus der echten Lage der Beine (vorher fest: ragte 3,2 m vor die Vorderpfoten – der Magier kam nie nah genug,
      // damit Pfote oder Schnauze ihn erreichen): Kapsel von den Hinter- bis zu den Vorderpfoten, so breit wie die Beine stehen
      const by = this.teile.by, loc = (p) => this.root.worldToLocal(p.clone());
      const legs = ['vlu', 'vru', 'hlu', 'hru'].map((n) => by[n]).filter(Boolean);
      if (legs.length === 4) {
        const pts = legs.flatMap((h) => [loc(h.a), loc(h.b)]);
        const front = Math.max(...pts.map((p) => p.z)), back = Math.min(...pts.map((p) => p.z));
        const side = Math.max(...pts.map((p) => Math.abs(p.x))) + Math.max(...legs.map((h) => h.r));
        COL.r = Math.max(0.6, side); COL.f = Math.max(0.2, front - COL.r * 0.6); COL.b = Math.max(0.2, -back - COL.r * 0.6);
      }
    }
    for (const b of M.ctl) b.userData.base = b.quaternion.clone();
    this.place();
  }

  /** größter Knochen-Sprung (Grad) zwischen letztem und erstem Bild eines Clips – > 3° = keine saubere Schleife */
  seam(a) {
    if (!a) return 0;
    const M = this.mm, names = ['hips', 'chest', 'neck1', 'frontUprL', 'frontUprR', 'rearLegL_01', 'rearLegR_01'].filter((n) => M.B[n]);
    for (const x of [M.idle, M.walk, M.run, M.run2]) if (x) x.setEffectiveWeight(0);
    a.setEffectiveWeight(1);
    const grab = (tt) => { a.time = tt; M.mixer.update(0); return names.map((n) => M.B[n].quaternion.clone()); };
    const s = grab(0), e = grab(a.getClip().duration - 1e-4);
    a.setEffectiveWeight(0);
    return Math.max(...s.map((q, i) => 2 * Math.acos(Math.min(1, Math.abs(q.dot(e[i])))) * 180 / Math.PI));
  }
  /** Phase (0..1), in der das linke Hinterbein am tiefsten steht (Mitte der Standphase) – um Gehen und Rennen gleich zu takten */
  stancePhase(a) {
    if (!a || !this.mm.B.rearToeL) return 0;
    const M = this.mm, V = new THREE.Vector3(), N = 48; let best = 9, ph = 0;
    for (const x of [M.idle, M.walk, M.run]) if (x) x.setEffectiveWeight(0);
    a.setEffectiveWeight(1);
    for (let i = 0; i < N; i++) { a.time = i / N * a.getClip().duration; M.mixer.update(0); M.holder.updateMatrixWorld(true); M.B.rearToeL.getWorldPosition(V); if (V.y < best) { best = V.y; ph = i / N; } }
    a.setEffectiveWeight(0);
    return ph;
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
    this.F = null; this.kick = null; this.side = 1; this.leap = null; this.it = this.it || 0; // it = eigene Atem-Uhr (muss vor dem ersten Bild stehen)
    this.hitReq = null; this.prevShapes = null; this.va = 0; this.vAct = new THREE.Vector2(); this.hitR = COL.r;
    if (this.beine) this.beine.reset();
    this.place();
  }

  /** Kampf beginnt (Spieler ist durch den Nebel): aufstehen und heulen */
  start() { if (this.st === 'sleep') { this.active = true; this.go('wake'); } }

  go(st) { this.st = st; this.t = 0; this.hitDone = false; this.lunge = null; this.slamSet = false; this.spinP = null; }

  /** Ziel für Kopf/Pfote merken (Magier, Höhe h über dem Boden) – wird bis zum Zuschlagen nachgeführt, dann festgehalten */
  aimAt(pl, h) { (this.aimP ||= new THREE.Vector3()).set(pl.pos.x, h, pl.pos.z); }
  /** Reichweiten (Meter vor der Körpermitte), aus der Vermessung beim Laden; Feinabstimmung über die Treffer-Tests */
  R(k) {
    const r = this.reach || { snout: 5.2, shoulder: 3, paw: 3.4 };
    return { biteReach: r.snout + RE.bite, swipeReach: r.shoulder + RE.swipe, stompReach: r.paw + RE.stomp,
      pawMin: r.paw - 0.6, pawMax: r.paw + 1.4 }[k];
  }
  /**
   * Vorstoß als feste Strecke (wie „Root Motion“ in großen Spielen): zwischen t0 und t1 genau so weit nach vorn, dass der Magier
   * danach in Reichweite `reach` liegt – höchstens `max` Meter, nie rückwärts. Früher bremste die Trägheit jeden Vorstoß auf ~0,5 m.
   */
  planLunge(pl, t0, t1, reach, max) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), A = this.arena, m = 3.2 * K;
    const ax = (this.aimP ? this.aimP.x : pl.pos.x) - this.p.x, az = (this.aimP ? this.aimP.z : pl.pos.z) - this.p.z;
    const L = clamp(ax * fx + az * fz - reach, -1.5, max);   // zu nah: ein Stück zurückweichen (Platz zum Zuschnappen)
    this.lunge = { t0, t1, sx: this.p.x, sz: this.p.z, ex: clamp(this.p.x + fx * L, A.x0 + m, A.x1 - m), ez: clamp(this.p.z + fz * L, A.z0 + m, A.z1 - m) };
  }

  /** Treffer vom Magier */
  onHit(dmg, dir, heavy, poiseDmg) {
    if (this.dead || this.st === 'sleep') return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flinch = heavy ? 0.35 : 0.22; this.hitDir = dir.clone(); this.lagHold = 0.7; this.hbFlash = 1; // Hitbox blinkt (Testmodus)
    // Treffer-Reaktion: ein Stoß in die Haltungs-Federn (Kopf und Körper zucken weg und federn zurück – kein Zittern, kein Sprung)
    const k = heavy ? 1 : 0.6, side = dir && Number.isFinite(dir.x) ? Math.sign(dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw)) || 1 : 1;
    this.kick = { p: (this.kick ? this.kick.p : 0) + 0.9 * k, r: (this.kick ? this.kick.r : 0) + 0.55 * k * side, n: (this.kick ? this.kick.n : 0) + 1.6 * k };
    if (this.hp <= 0) { this.dead = true; this.go('dead'); this.deadSide = Math.random() < 0.5 ? 1 : -1; sfx.roar(true); if (this.onDeath) this.onDeath(this); return; }
    if (!this.phase2 && this.hp <= BOSS_HP * 0.5 && this.st !== 'stagger') { this.phase2 = true; this.go('howl'); sfx.roar(false); return; }
    this.poise += poiseDmg != null ? poiseDmg : (heavy ? 30 : dmg); this.poiseT = 0;
    if (this.poise >= POISE_MAX && this.st !== 'leap' && this.st !== 'howl') { this.poise = 0; this.go('stagger'); sfx.yelp(true); }
  }

  /** „Dicke“ für die Nahkampf-Reichweite des Magiers: so gewählt, dass (Abstand zu pos) − radius = Abstand zur nächsten Körper-Kapsel */
  get radius() { return this.hitR; }
  /** Boden-Körper (nur für das Wegschieben und den Zielpunkt): nächster Punkt auf der Längsachse zu (x, z) */
  axisPoint(x, z, out) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const k = clamp((x - this.p.x) * fx + (z - this.p.z) * fz, -COL.b, COL.f);
    return out.set(this.p.x + fx * k, 0, this.p.z + fz * k);
  }
  /** Trifft eine Karte (Punkt p) einen Körperteil? */
  hitTest(p) {
    let hit;
    if (this.teile && this.teile.ok) hit = this.teile.nearest(p, HB.body.dicke).s < 0.2;
    else { this.axisPoint(p.x, p.z, vT); hit = Math.hypot(p.x - vT.x, p.z - vT.z) < COL.r + 0.2 && p.y > 0.4 && p.y < 4.8; }
    if (hit) this.hbFlash = 1;
    return hit;
  }
  /** Angriff mit Körperteilen: in diesem Bild ist das Trefferfenster offen (geprüft nach der Haltung in applyHits) */
  req(k, dmg, push = 1.6) { this.hitReq = { k, dmg, push }; }
  /** nach animate(): Trefferformen des laufenden Angriffs gegen den Magier prüfen (auch zwischen den Bildern durchgezogen) */
  applyHits(pl) {
    const R = this.hitReq; this.hitReq = null;
    if (!R || !this.teile || !this.teile.ok) { this.prevShapes = null; return; }
    const shapes = this.teile.attack(R.k, HB, this.swSide || 1);
    const prev = this.prevShapes && this.prevKey === R.k && this.prevShapes.length === shapes.length ? this.prevShapes : null;
    this.prevShapes = shapes; this.prevKey = R.k;
    if (this.hitDone || pl.state === 'dead') return;
    for (let i = 0; i < shapes.length; i++) {
      const at = hitsPlayer(shapes[i], prev && prev[i], pl.pos.x, pl.pos.z);
      if (at) { this.strike(pl, at.x, at.z, Infinity, R.dmg, R.push); return; }
    }
  }

  /** Spieler treffen, wenn er in Reichweite ist (einmal pro Angriff) */
  strike(pl, cx, cz, r, dmg, push = 1) {
    if (this.hitDone || pl.state === 'dead') return false;
    let dx = pl.pos.x - cx, dz = pl.pos.z - cz;
    if (Math.hypot(dx, dz) > r) return false;
    if (Math.hypot(dx, dz) < 0.3) { dx = pl.pos.x - this.p.x; dz = pl.pos.z - this.p.z; } // Treffer direkt am Magier: vom Boss weg stoßen
    const l = Math.hypot(dx, dz) || 1;
    const ok = pl.damage(dmg, new THREE.Vector3(dx / l * push, 0, dz / l * push)); // in der Rolle (unverwundbar) geht er daneben
    if (ok) { this.hitDone = true; sfx.bite(); }
    return ok;
  }

  /**
   * Angriff passend zu Abstand (m) und Winkel (rad) – nur, was aus dieser Lage auch trifft (per Treffer-Test gemessen):
   * Biss 3–10 m bis ±30°, Prankenhieb 2–8 m bis ±60°, Stampfen 2–8 m bis ±30°, Ansturm 5–11 m bis ±40°, Drehung 2–4 m rundum
   * (vor allem hinter ihm), Sprung 6–18 m.
   */
  choose(d, a) {
    const r = Math.random(), A = Math.abs(a);
    if (A > 1.7) return d < 4.5 ? 'spin' : null;                  // hinter ihm: nur dicht dran die Drehung, sonst erst herumdrehen
    if (A > 1.05) return null;                                   // genau neben ihm: erst herumdrehen, dann zuschlagen
    // Bisse: nah meist der schnelle Schnappbiss, weiter weg Reißbiss oder (in Phase 2 öfter) Doppelbiss
    const bite = () => { const q = Math.random(); if (d < 5.5) return q < 0.6 && A < 0.35 ? 'biteQ' : 'bite'; return q < (this.phase2 ? 0.45 : 0.25) ? 'bite2' : 'bite'; };
    if (d < 3) return r < 0.4 ? 'stomp' : r < 0.75 ? 'swipe' : 'biteQ';
    if (d < 7.5) {
      if (A > 0.5) return 'swipe';                               // schräg vor ihm: Pranke
      return r < 0.4 ? bite() : r < 0.7 ? 'swipe' : 'stomp';
    }
    if (d < 10.5) return A < 0.5 ? (r < 0.55 ? bite() : r < 0.85 ? 'charge' : 'leap') : (r < 0.5 ? 'leap' : null);
    if (d < 13) return r < 0.45 ? 'charge' : r < 0.85 ? 'leap' : null;
    return r < 0.45 ? 'leap' : r < 0.7 ? 'charge' : null;
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
        if (d > 15 * K) { spd = 8; } else if (d > 8.5 * K) { spd = 3.8; } else if (d < 3) { spd = -1.8; }   // erst sehr dicht zurückweichen
        else { this.sideS = lerp(this.sideS ?? this.side, this.side, damp(1.2, dt)); want = toP + this.sideS * 0.9; spd = 2.2; if (Math.random() < dt * 0.25) this.side *= -1; }
        // steht der Magier weit seitlich/hinten: erst stehen bleiben und herumdrehen (mit Spielraum, sonst Stop-and-go)
        if (d < 9 * K) { if (Math.abs(a) > 1.3) this.turning = true; else if (Math.abs(a) < 0.7) this.turning = false; } else this.turning = false;
        if (this.turning) { want = toP; spd = 0; }
        if (this.cd <= 0 && !this.passive) { // passive = Testmodus „Boss greift nicht an“
          const k = this.choose(d, a);
          if (k) this.attack(k, a);
          else this.cd = 0.3;
        }
        break;
      }
      case 'bite': case 'biteQ': case 'bite2': {
        // ausholen (Kopf zurück, Lefzen hoch, zielt), dann Vorstoß genau so weit, dass die Schnauze dich erreicht; das Ziel wird
        // bis kurz vor dem Zuschnappen nachgeführt (danach kannst du noch ausweichen). Doppelbiss: zwischen den Bissen neu zielen.
        const P = BITE[this.st], A = ATK[this.st];
        want = toP; turn = t < P.w ? 1.7 : 0.15;
        if (P.l2 && t > P.snap + 0.08 && t < P.l2[0]) turn = 1.3;
        spd = t < P.w ? -0.6 : 0;
        // Ziel: Oberkörper/Kopf des Magiers (1,5 m) – tiefer zu zielen rollt den Kopf ein und zieht die Schnauze zurück
        if (t < P.snap - 0.1 || (P.l2 && t > P.snap + 0.06 && t < P.snap2 - 0.1)) this.aimAt(pl, 1.5);
        if (t >= P.l[0] && !this.lunge) this.planLunge(pl, P.l[0], P.l[1], this.R('biteReach'), P.max);
        if (P.l2 && t >= P.l2[0] - 0.02 && !this.second) {        // zweiter Biss: neuer Vorstoß, darf noch einmal treffen
          this.second = true; this.lunge = null; this.hitDone = false;
          this.planLunge(pl, P.l2[0], P.l2[1], this.R('biteReach'), P.max);
        }
        if ((t > A.hit[0] && t < A.hit[1]) || (A.hit2 && t > A.hit2[0] && t < A.hit2[1])) this.req('bite', A.dmg, 1.6);   // Schnauze
        if (t > A.T) this.after(this.st);
        break;
      }
      case 'swipe': {
        // ausholen und Ziel merken, dann kurzer Vorstoß und die Pfote fegt auf Körperhöhe durch die Stelle, an der du standest
        want = toP; turn = t < 0.45 ? 1.1 : 0.2;
        if (t < 0.44) this.aimAt(pl, 0.8);
        if (t >= 0.42 && !this.lunge) this.planLunge(pl, 0.42, 0.62, this.R('swipeReach'), 3.5);
        if (t > ATK.swipe.hit[0] && t < ATK.swipe.hit[1]) this.req('swipe', ATK.swipe.dmg, 2.0);   // Pfote und Unterarm
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
          L.landed = true; this.land = 0.6;
          const cx = this.p.x + fx * HB.leap.fwd, cz = this.p.z + fz * HB.leap.fwd;
          if (this.onSlam) this.onSlam(cx, cz, 1);
          if (!this.strike(pl, cx, cz, HB.leap.r, ATK.leap.dmg, 2.2)) this.strike(pl, cx, cz, HB.leap.r2, ATK.leap.dmg2, 2.6);
        }
        if (t > ATK.leap.T) this.after('leap');
        break;
      }
      case 'charge': {
        if (t < 0.5) { want = toP; turn = 1.5; spd = 0; this.chA = toP; }
        else if (t < 1.55) { if (t < 0.75) this.chA += angDiff(this.chA, toP) * damp(2.5, dt); want = this.chA; turn = 2.5; spd = 13;
          this.req('charge', ATK.charge.dmg, 2.4);   // Kopf und Hals
          if (this.wallHit) { this.t = Math.max(this.t, 1.55); } }
        else { want = this.chA; spd = 0; }
        if (t > ATK.charge.T) this.after('charge');
        break;
      }
      case 'spin': {
        // Schwanzfeger: dreht sich um die VORDERPFOTEN (die bleiben stehen), das Hinterteil springt herum. Richtung so, dass der Schwanz
        // durch den Magier fegt – der lange Weg herum (2π − Winkel zum Magier), am Ende schaut er ihn an.
        if (!this.spinP) {
          const D = angDiff(this.yaw, toP), s = Math.abs(D) > 3.0 ? (Math.random() < 0.5 ? 1 : -1) : (-Math.sign(D) || 1);
          const piv = this.reach ? this.reach.paw : 1.65;
          this.spinP = { s, y0: this.yaw, tot: clamp(TAU - Math.abs(D), 2.6, 4.4), piv, px: this.p.x + Math.sin(this.yaw) * piv, pz: this.p.z + Math.cos(this.yaw) * piv };
        }
        if (t > ATK.spin.hit[0] && t < ATK.spin.hit[1]) this.req('spin', ATK.spin.dmg, 2.4);   // Schwanz und Hinterläufe
        if (t > ATK.spin.T) this.after('spin');
        break;
      }
      case 'stomp': {
        // aufbäumen, auf den Hinterbeinen vorwärts, dann krachen beide Vorderpfoten genau dort, wo du standest (links/rechts von dir)
        want = toP; turn = t < 0.6 ? 1.2 : 0.1;
        if (t < 0.6) this.aimAt(pl, 0);
        if (t >= 0.5 && !this.lunge) this.planLunge(pl, 0.5, 0.88, this.R('stompReach'), 4.5);
        if (t >= 0.62 && !this.slamSet && this.beine && this.lunge) {
          this.slamSet = true;
          const L = this.lunge, ex = L.ex, ez = L.ez, lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);   // lx/lz = links
          const fx2 = Math.sin(this.yaw), fz2 = Math.cos(this.yaw);
          // Ziel relativ zur Endlage: vorn so weit wie möglich auf dich zu, seitlich höchstens 1,6 m neben der Mittellinie
          const rx = this.aimP.x - ex, rz = this.aimP.z - ez, along = clamp(rx * fx2 + rz * fz2 + 0.5, this.R('pawMin'), this.R('pawMax'));
          const side = clamp(rx * lx + rz * lz, -1.6, 1.6);
          for (const [i, s] of [[0, 1], [1, -1]]) {
            const o = side + s * 0.6;
            this.beine.slamAt(i, ex + fx2 * along + lx * o, ez + fz2 * along + lz * o);
          }
        }
        if (t > ATK.stomp.slam - 0.06 && t < ATK.stomp.slam + 0.12) this.req('stomp', ATK.stomp.dmg, 2.2);   // beide Vorderpfoten
        if (t > ATK.stomp.slam && !this.stomped) { // Aufschlag zwischen den Vorderpfoten: Staub, Beben
          this.stomped = true; const by = this.teile && this.teile.ok ? this.teile.by : null;
          const cx = by ? (by.vlu.b.x + by.vru.b.x) / 2 : this.p.x + fx * 4, cz = by ? (by.vlu.b.z + by.vru.b.z) / 2 : this.p.z + fz * 4;
          if (this.onSlam) this.onSlam(cx, cz, 0.8);
        }
        if (t > ATK.stomp.T) { this.stomped = false; this.slamSet = false; this.after('stomp'); }
        break;
      }
      case 'howl': {
        if (t > ATK.howl.push && !this.pushed) { this.pushed = true; if (this.onSlam) this.onSlam(this.p.x, this.p.z, 0.6, true);
          if (d < HB.howl.r && plOk) pl.damage(6, new THREE.Vector3(dx / (d || 1) * 2.4, 0, dz / (d || 1) * 2.4)); }
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
    if (this.st === 'spin' && this.spinP) { // Schwanzfeger: Hüfte holt zur Gegenseite aus, dann schneller Schwung, weich ausgebremst
      const P = this.spinP, PRE = 0.35;
      this.yaw = P.y0 + P.s * (-PRE * sm((t - 0.05) / 0.35) + (P.tot + PRE) * smoother((t - 0.42) / 0.62)); this.w = 0;
    } else if (want !== null && this.st !== 'dead' && this.st !== 'stagger') {
      // im Stand dreht der Riese langsamer (sonst kommen die Pfoten mit dem Umsetzen nicht nach und schleifen)
      // (nur beim Lauern – beim Ausholen eines Angriffs dreht er voll mit, die Beine trippeln dafür mit)
      const still = this.st === 'stalk' ? lerp(0.6, 1, clamp((this.va || 0) / 3, 0, 1)) : 1;
      const df = angDiff(this.yaw, want), wMax = TURN_MAX * turn * (this.phase2 ? 1.2 : 1) * still;
      const wT = Math.sign(df) * Math.min(wMax, Math.abs(df) * 3, Math.sqrt(2 * TURN_ACC * Math.abs(df)) * 0.9);
      this.w += clamp(wT - this.w, -TURN_ACC * dt, TURN_ACC * dt); this.yaw += this.w * dt;
    } else this.w *= Math.exp(-6 * dt);
    this.yawRate = dt > 0 ? angDiff(prevYaw, this.yaw) / dt : 0;
    // Tempo mit Trägheit wie bei den Hunden: ein Riese bremst nicht schlagartig – er rutscht ins Ausholen hinein.
    // Antreten (Vorstoß, Ansturm) darf kräftig sein, Abbremsen ist begrenzt. Im Sprung bestimmt die Flugbahn die Lage.
    const Lg = this.lunge;
    if (this.st === 'spin' && this.spinP && dt > 0) {   // Drehpunkt = Vorderpfoten: der Körper wandert so, dass sie stehen bleiben
      const P = this.spinP, nx = P.px - Math.sin(this.yaw) * P.piv, nz = P.pz - Math.cos(this.yaw) * P.piv;
      this.v.set((nx - this.p.x) / dt, (nz - this.p.z) / dt); this.sv = 0;
    } else if (Lg && t >= Lg.t0 && t <= Lg.t1 + 0.05 && dt > 0) {   // geplanter Vorstoß: Lage folgt der Kurve, Tempo ergibt sich daraus
      const u = clamp((t - Lg.t0) / (Lg.t1 - Lg.t0), 0, 1), e = u * u * (3 - 2 * u);
      const nx = lerp(Lg.sx, Lg.ex, e), nz = lerp(Lg.sz, Lg.ez, e);
      this.v.set((nx - this.p.x) / dt, (nz - this.p.z) / dt);
      this.sv = u >= 1 ? 0 : this.v.x * fx + this.v.y * fz;
    } else if (this.st !== 'dead' && !(this.st === 'leap' && t >= 0.6)) {
      const loco = this.st === 'stalk' || this.st === 'wake';
      if (loco && spd > 0) spd *= 1 - 0.7 * sm((Math.abs(angDiff(this.yaw, want ?? this.yaw)) - 0.3) / 1.0);
      const up = Math.abs(spd) > Math.abs(this.sv) && spd * this.sv >= 0;
      const acc = this.st === 'charge' ? (up ? 14 : 8) : loco ? (up ? 4.5 : 6) : (up ? 22 : 7.5);
      this.sv += clamp(spd - this.sv, -acc * dt, acc * dt);
      this.v.set(Math.sin(this.yaw) * this.sv, Math.cos(this.yaw) * this.sv);
    } else if (this.st === 'dead') this.v.multiplyScalar(Math.exp(-5 * dt));
    else this.sv = 0;
    const x0 = this.p.x, z0 = this.p.z;
    this.p.x += this.v.x * dt; this.p.z += this.v.y * dt;
    // in der Arena bleiben (Ansturm endet an der Wand)
    const A = this.arena, m = 3.2 * K;
    this.wallHit = this.p.x < A.x0 + m || this.p.x > A.x1 - m || this.p.z < A.z0 + m || this.p.z > A.z1 - m;
    this.p.x = clamp(this.p.x, A.x0 + m, A.x1 - m); this.p.z = clamp(this.p.z, A.z0 + m, A.z1 - m);
    // wirkliches Tempo (nach der Wand): danach richten sich die Beine – an der Wand läuft er nicht mehr auf der Stelle
    if (dt > 0) { this.vAct.set((this.p.x - x0) / dt, (this.p.z - z0) / dt); this.va = this.vAct.length(); }
    if (this.wallHit && this.sv > this.va) this.sv = this.va;
    // Magier wird aus dem Körper geschoben
    if (!this.dead || this.deadT < 2) {
      this.axisPoint(pl.pos.x, pl.pos.z, vT);
      const ex = pl.pos.x - vT.x, ez = pl.pos.z - vT.z, el = Math.hypot(ex, ez), min = COL.r + 0.4;
      if (el < min && this.st !== 'sleep') { const k = el > 1e-4 ? (min - el) / el : 1; pl.pos.x += (el > 1e-4 ? ex : -fz) * k; pl.pos.z += (el > 1e-4 ? ez : fx) * k; }
    }
    // Ziel- und Trefferpunkt: nächster Körperpunkt in Brusthöhe
    this.axisPoint(pl.pos.x, pl.pos.z, this.pos); this.pos.y = 2.4;
    this.lagHold = (this.lagHold || 0) - dt;  // helle Schadensanzeige der Bossleiste läuft kurz verzögert nach
    this.lag = this.lag > this.hp ? Math.max(this.hp, this.lag - BOSS_HP * 0.35 * dt * (this.lagHold > 0 ? 0 : 1)) : this.hp;
    this.animate(dt);
    // nach der Haltung: Körperteile aktualisieren, Angriffe prüfen, Reichweite für den Degen des Magiers
    if (this.teile && this.teile.ok) {
      this.teile.update();
      this.applyHits(pl);
      vT.set(pl.pos.x, 1.1, pl.pos.z);
      const n = this.teile.nearest(vT, HB.body.dicke), dh = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
      this.hitR = dh - n.s;   // Spieler rechnet (Abstand zu pos) − radius → genau der Abstand zur nächsten Kapsel
    } else this.hitR = COL.r;
  }

  /** nach einem Angriff: Kombo (Phase 2) oder kurz lauern */
  after(k) {
    if (this.phase2 && this.combo < 1 && Math.random() < 0.55 && (isBite(k) || k === 'swipe')) {
      // Phase 2: nachsetzen – nach einem Biss Pranke oder schneller Schnappbiss, nach der Pranke die andere Pranke
      this.combo++;
      const nx = k === 'swipe' ? 'swipe' : k !== 'biteQ' && Math.random() < 0.45 ? 'biteQ' : 'swipe';
      this.attack(nx, this.lookYaw, k === 'swipe' ? -this.swSide : null); return;
    }
    this.combo = 0; this.go('stalk');
    this.cd = (this.phase2 ? 0.5 : 0.9) + Math.random() * (this.phase2 ? 0.6 : 0.9);
    if (k === 'leap' || k === 'charge') this.cd += 0.3;
  }
  attack(k, a, forceSide) {
    this.go(k);
    if (k === 'swipe') this.swSide = forceSide ?? (a > 0 ? 1 : -1); // +1 = Spieler links → linke Pranke
    if (k === 'leap') this.leap = { go: false };
    // Kopf schräg passend zur Seite, auf der das Ziel steht (wie ein Hund beim Zupacken); gerade vor ihm zufällig
    if (isBite(k)) { this.biteTilt = a > 0.1 ? -1 : a < -0.1 ? 1 : (Math.random() < 0.5 ? 1 : -1); this.second = false; }
    if (k !== 'spin') sfx.growl(true);
  }

  place() { this.root.position.set(this.p.x, 0, this.p.z); this.root.rotation.y = this.yaw; }

  animate(dt) {
    this.place();
    const M = this.mm, B = M.B, t = this.t, st = this.st;
    // wirkliches Tempo (nach Wand/Sprung), nicht das gewollte – sonst laufen die Beine, obwohl er nicht vorankommt
    const VA = this.vAct || this.v, sp = Math.hypot(VA.x, VA.y), fwd = VA.x * Math.sin(this.yaw) + VA.y * Math.cos(this.yaw);
    // ---------- Ganzkörper-Haltung (Halter) ----------
    let y = 0, pitch = 0, roll = 0, neck = 0, head = 0, jaw = 0.05, legF = 0, legR = 0, tail = 0, rise = 0, drop = 0, curl = 0, hroll = 0;
    switch (st) {
      case 'sleep': neck = 0.75 + 0.08 * Math.sin(this.it * 3.1); head = 0.3; jaw = 0.12; pitch = 0.06; break; // schnüffelt am Boden (Kopf tief)
      case 'wake': { const u = sm(t / 0.9), h = bump(t, 1.25, 1.6) * (1 - bump(t, 2.6, 3.0)); // Kopf hoch, aufbäumen, heulen
        y = 0.25 * h; pitch = 0.06 * (1 - u) - 0.3 * h; neck = 0.75 * (1 - u) - 0.9 * h; head = 0.3 * (1 - u) - 0.4 * h; jaw = 0.1 + 0.6 * h; break; }
      case 'bite': case 'biteQ': case 'bite2': {
        // Biss wie bei einem echten Raubtier:
        // AUSHOLEN – Gewicht nach hinten, Kopf hoch und zurück, Lefzen gebleckt (Maul einen Spalt offen, bebt)
        // VORSTOSS – Vorderkörper taucht ab, Hals schießt vor, Kopf legt sich schräg, das Maul reißt weit auf
        // ZUSCHNAPPEN – Maul schlägt schlagartig zu (Kiefer-Feder hier besonders steif)
        // Reißbiss: danach Kopfschütteln wie beim Zerren (siehe unten) · Doppelbiss: kurz zurück, Maul wieder auf, zweiter Biss
        // ZURÜCK – Kopf hebt sich, Maul hängt kurz offen, Haltung entspannt sich
        const P = BITE[st], tl = this.biteTilt || 1;
        const W = bump(t, 0, P.w) * (1 - bump(t, P.l[0], P.l[0] + 0.08));
        const L1 = bump(t, P.l[0], P.l[1]) * (1 - (P.l2 ? bump(t, P.snap + 0.06, P.l2[0]) : bump(t, P.rec[0], P.rec[1])));
        const L2 = P.l2 ? bump(t, P.l2[0], P.l2[1]) * (1 - bump(t, P.rec[0], P.rec[1])) : 0;
        const mid = P.l2 ? bump(t, P.snap + 0.06, P.l2[0] - 0.06) * (1 - bump(t, P.l2[0], P.l2[0] + 0.06)) : 0;
        const L = Math.max(L1, L2);
        const op1 = bump(t, P.l[0] - 0.04, P.snap - 0.07) * (1 - bump(t, P.snap - 0.035, P.snap + 0.005));
        const op2 = P.l2 ? bump(t, P.snap + 0.1, P.snap2 - 0.07) * (1 - bump(t, P.snap2 - 0.035, P.snap2 + 0.005)) : 0;
        const shE = P.sh ? bump(t, P.sh[0], P.sh[0] + 0.06) * (1 - bump(t, P.sh[1] - 0.15, P.sh[1])) : 0;
        const rec = bump(t, P.rec[0], P.rec[0] + 0.15) * (1 - bump(t, P.rec[1] - 0.25, P.rec[1]));
        jaw = 0.1 + W * (0.16 + 0.04 * Math.sin(t * 47)) + 0.85 * op1 + 0.8 * op2 + 0.1 * shE + 0.14 * rec;
        pitch = -0.14 * W + 0.3 * L - 0.05 * mid; y = -0.12 * W - 0.45 * L - 0.1 * mid;
        neck = -0.5 * W + 0.8 * L - 0.15 * shE - 0.2 * mid; head = -0.3 * W + 0.35 * L - 0.1 * mid;
        hroll = tl * (0.28 * L - 0.08 * W); roll = tl * 0.04 * L;   // Kopf schräg wie ein Hund beim Zupacken
        break; }
      case 'swipe': { const r = bump(t, 0.05, 0.48) * (1 - bump(t, 0.5, 0.6)), s2 = bump(t, 0.5, 0.7) * (1 - bump(t, 0.9, 1.35));
        roll = -this.swSide * (0.12 * r - 0.1 * s2); pitch = -0.1 * r + 0.08 * s2; neck = 0.15 * s2; jaw = 0.25; y = 0.1 * r; break; }
      case 'leap': { const c = bump(t, 0, 0.55) * (1 - bump(t, 0.6, 0.7)), air = t > 0.6 && t < ATK.leap.land ? Math.sin((t - 0.6) / (ATK.leap.land - 0.6) * Math.PI) : 0;
        const ld = bump(t, ATK.leap.land - 0.04, ATK.leap.land + 0.06) * (1 - bump(t, 1.5, 2.2));
        const u = clamp((t - 0.6) / (ATK.leap.land - 0.6), 0, 1);
        y = -0.6 * c + 3.6 * air - 0.55 * ld; pitch = 0.18 * c + (-0.3 + 0.55 * u) * (air > 0 ? 1 : 0) + 0.12 * ld;
        neck = 0.25 * c - 0.2 * air + 0.3 * ld; jaw = 0.2 + 0.5 * air; legF = LP.cF * c + LP.lF * ld; legR = LP.cR * c + LP.lR * ld; rise = air; break; }
      case 'charge': { const c = bump(t, 0, 0.45) * (1 - bump(t, 1.5, 2.0));
        pitch = 0.16 * c; neck = 0.75 * c; head = 0.3 * c; jaw = 0.35 * c; y = -0.25 * c; break; }   // Kopf tief: rammt auf Körperhöhe
      case 'spin': {
        // Schwanzfeger in drei Teilen: AUSHOLEN (duckt sich, Gewicht auf die Vorderbeine, Hüfte und Schwanz zur Gegenseite, Blick über
        // die Schulter) → FEGEN (Hinterteil hoch und herum, Körper krümmt sich, Schwanz schleift hinterher und fegt tief) →
        // LANDEN (Hinterbeine schlagen auf, Schwanz peitscht nach)
        const s = this.spinP ? this.spinP.s : 1;
        const c = bump(t, 0, 0.25) * (1 - bump(t, 1.4, 1.85));
        const wind = bump(t, 0.05, 0.4) * (1 - bump(t, 0.42, 0.56));
        const sweep = bump(t, 0.4, 0.52) * (1 - bump(t, 0.96, 1.12));
        const land = bump(t, 1.0, 1.08) * (1 - bump(t, 1.16, 1.6));
        const whip = bump(t, 0.94, 1.04) * (1 - bump(t, 1.12, 1.55));
        y = -0.3 * wind - 0.1 * sweep - 0.22 * land;
        pitch = 0.08 * wind + 0.14 * sweep - 0.04 * land;              // Gewicht nach vorn, Hinterteil hoch
        roll = s * (0.1 * wind - 0.16 * sweep + 0.05 * land);
        neck = 0.2 * c - 0.15 * wind; head = 0.1 * c; jaw = 0.15 + 0.2 * wind + 0.35 * sweep;
        tail = s * (0.7 * wind - 1.1 * sweep + 0.9 * whip);             // erst zur Gegenseite, dann schleifend, dann peitschend
        drop = Math.max(sweep, 0.6 * whip);                             // Schwanz tief: fegt auf Körperhöhe des Magiers
        legF = 0.15 * wind; legR = 0.25 * wind + 0.35 * sweep;          // Hinterbeine ziehen sich im Sprung an
        curl = s * sweep; break; }
      case 'stomp': { const r = bump(t, 0.05, 0.7) * (1 - bump(t, 0.74, 0.9)), sl = bump(t, 0.75, 0.9) * (1 - bump(t, 1.2, 1.9));
        pitch = -0.62 * r + 0.18 * sl; y = 1.0 * r - 0.35 * sl; neck = -0.35 * r + 0.35 * sl; head = -0.25 * r + 0.15 * sl; jaw = 0.25 + 0.4 * r; legF = -0.9 * r + 0.3 * sl; break; }
      case 'howl': { const h = bump(t, 0.1, 0.5) * (1 - bump(t, 1.8, 2.3)); pitch = -0.32 * h; y = 0.35 * h; neck = -0.95 * h; head = -0.45 * h; jaw = 0.08 + 0.75 * h; break; }
      case 'stagger': { const s1 = bump(t, 0, 0.35) * (1 - bump(t, 1.8, 2.4)); pitch = 0.32 * s1; y = LP.gy * s1; roll = 0.12 * s1; neck = 0.5 * s1; head = 0.2 * s1; jaw = 0.5 * s1; legF = LP.gF * s1; legR = LP.gR * s1; break; }
      case 'dead': { const T = this.deadT, sd = this.deadSide, buck = sm(T / 0.5), f = clamp((T - 0.35) / 0.55, 0, 1), fall = f * f;
        const bounce = Math.sin(clamp((T - 0.9) / 0.35, 0, 1) * Math.PI) * 0.08 * (1 - sm((T - 0.9) / 0.5));
        y = LP.dB * buck * (1 - fall) + LP.dY * fall; roll = -sd * (fall * 1.45 - bounce); pitch = 0.2 * buck * (1 - fall); neck = 0.3; jaw = 0.4; legF = LP.dF * buck; legR = LP.dR * buck; break; }
    }
    // Lauern: Kopf tief, angespannt, schweres Atmen; beim Knurren duckt sich der Vorderkörper (bosskopf.js)
    if (st === 'stalk') { const low = this.kopf ? this.kopf.lower : 0; neck = 0.18 + 0.12 * low; jaw = 0.15; y = -0.1 - 0.12 * low; pitch = 0.05 * low; }
    // eigene Uhren, die bei Zustandswechseln NICHT auf 0 springen (früher hing z. B. der Schwanz an this.t → sprang bei jedem Angriff)
    this.clk = (this.clk || 0) + dt;
    const calm = st === 'sleep' || st === 'stalk' || st === 'wake', pant = st === 'stalk' ? 1 : 0;
    const breath = Math.sin(this.clk * (pant ? 3.4 : 1.7));
    if (calm && !this.dead) { y += 0.035 * breath; neck -= 0.03 * breath; jaw += 0.06 * pant * (0.5 + 0.5 * breath); }
    // Prankenhieb: Pranke hoch und nach außen, dann quer nach innen-unten (als Feder-Ziele – bricht der Hieb ab, blendet die Pranke weich aus)
    let pawR = 0, pawO = 0, pawL = 0;
    if (st === 'swipe') {
      const a1 = bump(t, 0.05, 0.45), b1 = bump(t, 0.5, 0.68), c1 = bump(t, 0.85, 1.3);
      pawR = (-1.25 * a1 + 1.0 * b1) * (1 - c1); pawO = (0.7 * a1 - 1.25 * b1) * (1 - c1); pawL = 0.5 * a1 * (1 - c1);
    }
    // Schwanz: hängt beim Liegen, fegt bei der Drehung, sonst langsames Pendeln (eigene Uhr)
    tail = st === 'sleep' ? 0.3 : st === 'spin' ? tail : 0;   // Pendeln und Nachschleppen macht jetzt die Schwanzkette (bosskopf.js)
    const tg = { y, pitch, roll, neck, head, jaw, hroll, legF, legR, tail, pawR, pawO, pawL, air: st === 'leap' ? rise : 0 };
    const F = this.F || (this.F = { x: { ...tg }, v: {} });
    // Treffer: Stoß in die Federn (Kopf zuckt zurück, Körper weicht seitlich aus) – wird über die nächsten Bilder weich ausgeschwungen
    if (this.kick && !this.dead) { F.v.pitch = (F.v.pitch || 0) + this.kick.p; F.v.roll = (F.v.roll || 0) + this.kick.r; F.v.neck = (F.v.neck || 0) - this.kick.n; }
    this.kick = null;
    const om = OM[st] || 7;
    // Kiefer in Bissen besonders steif: das Maul schlägt schlagartig zu (sonst wirkt das Zuschnappen weich wie Kauen)
    for (const k of POSE) spring(F, k, tg[k], om * (OMK[k] || 1) * (k === 'jaw' && isBite(st) ? 2.2 : 1), dt);
    // im Sprung bestimmt die Flugbahn die Höhe direkt (die Feder übernimmt danach mit dem passenden Tempo)
    if (rise) { F.v.y = dt > 0 ? (y - F.x.y) / dt : 0; F.x.y = y; }
    const S0 = F.x;
    // Gehen: leichtes Wiegen von Seite zu Seite und Auf und Ab im Schritt (macht den Gang schwer und lebendig)
    const walkW = this.aw.walk, runW = this.aw.run;
    const sway = Math.sin(this.gp * TAU) * (0.03 * walkW + 0.015 * runW), bob = (0.5 - 0.5 * Math.cos(this.gp * TAU * 2)) * (0.05 * walkW + 0.03 * runW);
    // in die Kurve legen – nur beim Laufen (Lauern/Aufstehen) und geglättet; beim Vorstoß eines Angriffs springt das Tempo sonst
    // für einen Moment auf über 20 m/s und der ganze Körper kippte schlagartig zur Seite
    const bankT = (st === 'stalk' || st === 'wake') ? clamp(-this.yawRate * Math.min(sp, 8) * 0.03, -0.15, 0.15) : 0;
    this.bank = lerp(this.bank || 0, bankT, damp(5, dt));
    let r2 = S0.roll + sway + this.bank, p2 = S0.pitch;
    // Gewicht vor beim Antreten, zurück beim Bremsen (wie bei den Hunden)
    const acF = dt > 0 ? (fwd - (this.fwd0 ?? fwd)) / dt : 0; this.fwd0 = fwd;
    const locoAcc = st === 'stalk' || st === 'wake' || st === 'charge';   // nur beim Laufen – Vorstöße haben ihre eigene Haltung
    this.accL = lerp(this.accL || 0, locoAcc ? clamp(acF * 0.01, -0.07, 0.06) : 0, damp(5, dt));
    p2 += this.accL;
    M.holder.position.y = (S0.y - bob) * K; M.holder.rotation.set(p2, 0, r2);
    // ---------- Beine: Clips nach Tempo (Schritte passen zur Strecke), beim Drehen auf der Stelle treten ----------
    // Drehen auf der Stelle = Gehschritte (die Pfoten sind ~2,6 m von der Mitte weg), nie Galopp; Rennen nur aus echtem Tempo
    // Drehen auf der Stelle spielt KEINEN Geh-Clip mehr (die Beine liefen sonst vorwärts, während der Körper sich dreht → Rutschen);
    // stattdessen setzen die Beine selbst um (Trippelschritte in bossbeine.js)
    const gsp = sp;
    const still = st === 'sleep' || st === 'dead' || st === 'leap' || st === 'stagger' || st === 'howl' || st === 'stomp' || st === 'wake';
    // solange er noch in Bewegung ist (ins Ausholen hineinrutschen, Ducken vor dem Sprung, Herumdrehen), laufen die Beine mit
    const legOk = !still || (st === 'leap' && t < 0.6) || (st === 'stomp' && t < 0.3) || (st === 'wake' && t > 0.9);
    const run = sm((sp - 4.5) / 2.5), walk = legOk ? sm((gsp - 0.25) / 0.6) * (1 - run) : 0;
    const idle = 1 - walk - (legOk ? run : 0);
    const L = lerp(M.walkL, M.runL, run);
    this.it = (this.it || 0) + dt * 0.62;     // eigene Uhr fürs Atmen im Stehen
    this.gdir = lerp(this.gdir ?? 1, fwd < -0.2 ? -1 : 1, damp(7, dt)); // vor/zurück: Beine bremsen ab und laufen weich andersherum
    this.gp = (this.gp + this.gdir * dt * gsp / Math.max(0.5, L) + 1) % 1;
    for (const [k, a2, w2] of [['idle', M.idle, idle], ['walk', M.walk, walk], ['run', M.run, legOk ? run : 0]]) {
      this.aw[k] = lerp(this.aw[k], w2, damp(8, dt));
      if (!a2) continue;
      // Rennen in derselben Schrittphase wie Gehen (linkes Hinterbein setzt gleichzeitig auf) → kein Beinsalat beim Übergang
      a2.time = (k === 'idle' ? (this.it % 1) : k === 'run' ? (this.gp - M.phW + M.phR + 2) % 1 : this.gp) * a2.getClip().duration;
    }
    for (const b of M.ctl) b.quaternion.copy(b.userData.base);
    if (M.idle) M.idle.setEffectiveWeight(this.aw.idle);
    if (M.walk) M.walk.setEffectiveWeight(this.aw.walk);
    // Lauf-Clip: kurz vor dem Schleifenende weich ins Anfangsbild (run2 steht auf 0) – der Clip selbst springt dort
    const ru = M.run ? M.run.time / M.run.getClip().duration : 0, seamW = M.runSeam && M.run2 ? sm((ru - (1 - M.runSeam)) / M.runSeam) : 0;
    if (M.run) M.run.setEffectiveWeight(this.aw.run * (1 - seamW));
    if (M.run2) { M.run2.time = 0; M.run2.setEffectiveWeight(this.aw.run * seamW); }
    M.mixer.update(0);
    for (const b of M.ctl) b.userData.base.copy(b.quaternion);
    // ---------- Knochen per Code ----------
    M.holder.updateMatrixWorld(true); M.holder.getWorldQuaternion(qH);
    const ax = (x, y2, z) => vX.set(x, y2, z).applyQuaternion(qH).clone();
    const X = ax(1, 0, 0), Y = ax(0, 1, 0), Z = ax(0, 0, 1);
    const alive = !this.dead && st !== 'sleep';
    // ---------- Kopf, Blick, Ohren (bosskopf.js): Kopf führt, Hals folgt; Verhalten beim Lauern; Ohren federn ----------
    // Blickstärke: beim Ansturm nicht (Kopf rammt), beim Schwanzfeger weit über die Schulter beim Ausholen, im Schwung kaum,
    // in Bissen nur bis zum Zuschnappen (danach führt das Zielen den Kopf)
    const atkNow = !!ATK[st] && st !== 'howl';
    const lookW = !alive || st === 'charge' ? 0 : st === 'spin' ? 1 - 0.8 * bump(t, 0.4, 0.5) * (1 - bump(t, 1.0, 1.15)) : isBite(st) ? 0.6 : atkNow ? 0.7 : 1;
    const down = alive ? clamp((9 * K - (this.lookD || 9)) / (9 * K), 0, 1) * 0.35 : 0;   // nahes Ziel: Kopf tiefer
    const nod = Math.sin(this.gp * TAU * 2 + 0.6) * 0.035 * this.aw.walk;                    // Kopf nickt mit jedem Schritt
    rotW(B.neck1, X, S0.neck + nod); rotW(B.head, X, S0.head);
    if (Math.abs(S0.hroll) > 1e-4) rotW(B.head, Z, S0.hroll);                               // Kopf schräg (Biss)
    const KC = this.kc || (this.kc = {});
    Object.assign(KC, { st, alive, calm, attack: atkNow, angry: st === 'stalk' && (this.lookD || 99) < 12, look: clamp(this.lookYaw || 0, -1.3, 1.3), lookW,
      down, far: (this.lookD || 0) > 11, bodyRoll: r2, yawRate: this.yawRate || 0, X, Y, clk: this.clk, onGrowl: () => sfx.growl(true) });
    if (this.kopf && alive) this.kopf.update(dt, KC);
    if (B.jaw) rotW(B.jaw, X, S0.jaw + (this.kopf && alive ? this.kopf.jaw : 0));
    // in die Kurve biegen
    this.tb = lerp(this.tb || 0, alive ? clamp(this.yawRate * 0.12, -0.25, 0.25) : 0, damp(6, dt));
    rotW(B.chest, Y, this.tb * 0.5); rotW(B.neck1, Y, this.tb * 0.5); rotW(B.hips, Y, -this.tb * 0.3);
    // Beine einknicken (liegen, ducken, landen) bzw. Vorderbeine heben (Aufbäumen)
    const fold = (up, lo, hl, a2, s) => { if (Math.abs(a2) < 1e-3) return; rotW(up, X, -a2 * 0.9 * s); rotW(lo, X, a2 * 1.3 * s); if (hl) rotW(hl, X, -a2 * 0.6 * s); };
    for (const s of ['L', 'R']) {
      fold(B['frontUpr' + s], B['frontLwr' + s], B['frontHorselink' + s], S0.legF, -1);
      fold(B['rearLeg' + s + '_01'], B['rearLwr' + s], B['rearHorselink' + s], S0.legR, 1);
    }
    // Prankenhieb (Werte aus den Federn: auch ein abgebrochener Hieb endet weich)
    if (Math.abs(S0.pawR) + Math.abs(S0.pawO) + Math.abs(S0.pawL) > 1e-3) {
      const s = this.swSide || 1, side = s > 0 ? 'L' : 'R', up = B['frontUpr' + side], lo = B['frontLwr' + side];
      rotW(up, Z, -s * S0.pawO); rotW(up, X, S0.pawR); rotW(lo, X, S0.pawL);
    }
    // Sprung: Vorderbeine vor, Hinterbeine zurück
    if (S0.air > 1e-3) for (const s of ['L', 'R']) { rotW(B['frontUpr' + s], X, -0.9 * S0.air); rotW(B['rearLeg' + s + '_01'], X, 0.8 * S0.air); }
    // Schwanz als Federkette (bosskopf.js): Haltung aus dem Körper + Nachschleppen bei Drehungen + Pendeln; schläft er, hängt er
    if (this.kopf && alive) this.kopf.tail(dt, KC, S0.tail, 0);
    else { rotW(B.tail2, Y, S0.tail * 0.5); rotW(B.tail3, Y, S0.tail * 0.4); rotW(B.tail4, Y, S0.tail * 0.3); }
    // Wirbelsäule biegt sich im Gang seitlich mit (Schultern und Becken gegeneinander) – schwerer, tierischer Gang
    if (alive && B.spine1) rotW(B.spine1, Y, Math.sin(this.gp * TAU + 0.4) * 0.05 * (this.aw.walk + 0.6 * this.aw.run));
    // Schwanzfeger: Vorderkörper bleibt zurück, das Hinterteil wirft sich voraus (Körper krümmt sich wie ein C)
    if (Math.abs(curl) > 1e-3 && B.spine1) rotW(B.spine1, Y, -0.32 * curl);
    // Drehung: Schwanzspitze tief auf Körperhöhe des Magiers führen (in die Richtung, in die der Schwanz gerade zeigt)
    // (läuft jedes Bild mit Gedächtnis: blendet nach der Drehung weich aus, springt nie)
    if (B.tail_05) {
      M.holder.updateMatrixWorld(true);
      const base = B.tail2.getWorldPosition(new THREE.Vector3()), tip = B.tail_05.getWorldPosition(new THREE.Vector3());
      const len = base.distanceTo(tip), hx = tip.x - base.x, hz = tip.z - base.z, hl = Math.hypot(hx, hz) || 1;
      const tg = new THREE.Vector3(base.x + hx / hl * len * 0.95, 0.7, base.z + hz / hl * len * 0.95);
      ccdAim([B.tail4, B.tail3, B.tail2], (v) => B.tail_05.getWorldPosition(v), tg, drop > 1e-3 ? drop : 0, [0.8, 0.8, 0.9], 5, this.memTail || (this.memTail = []), dt, 45);
    }
    if (calm && !this.dead && B.chest) rotW(B.chest, X, -0.025 * breath);
    if (this.dead) { const sd = this.deadSide, lie = sm((this.deadT - 0.6) / 0.6);
      rotW(B.neck1, Z, -sd * 0.3 * lie); rotW(B.tail2, Z, sd * 0.4 * lie);
      for (const s of ['L', 'R']) { const top = (sd > 0) === (s === 'R'); rotW(B['frontUpr' + s], Z, sd * (top ? LP.tF : LP.bF) * lie); rotW(B['rearLeg' + s + '_01'], Z, sd * (top ? LP.tR : LP.bR) * lie); }
    }
    M.holder.updateMatrixWorld(true);
    // ---------- Zielen: Angriffe treffen dort, wo der Magier ist (Kopf/Pfote werden zu ihm geführt) ----------
    const T = this.teile && this.teile.ok ? this.teile : null;
    // Biss: Kopf und Hals führen die Schnauze zu dir (auf Brusthöhe) – beim Ausholen schon, beim Zuschnappen voll
    // (läuft jedes Bild mit Gedächtnis: die Zielkorrektur gleitet statt zu springen und blendet nach dem Biss weich aus)
    if (T) {
      const P = isBite(st) && this.aimP ? BITE[st] : null;
      const wB = P ? bump(t, P.w - 0.2, P.l[0] + 0.08) * (1 - bump(t, P.rec[0], P.rec[0] + 0.35)) : 0;
      ccdAim([B.head, B.neck1, B.neck_01], (v) => T.snout(HB.bite.vor, v), this.aimP || vT, wB, [1.1, 1.1, 0.9], 6, this.memBite || (this.memBite = []), dt, 45);
      // Reißbiss: nach dem Zuschnappen schüttelt er den Kopf wie beim Zerren an Beute (schnell, klingt ab; Hals schwingt mit)
      if (P && P.sh) {
        const shE = bump(t, P.sh[0], P.sh[0] + 0.06) * (1 - bump(t, P.sh[1] - 0.15, P.sh[1]));
        if (shE > 1e-3) {
          const s = Math.sin(2 * Math.PI * 5.2 * (t - P.sh[0])) * 0.3 * shE * (1 - 0.4 * clamp((t - P.sh[0]) / (P.sh[1] - P.sh[0]), 0, 1));
          rotW(B.neck1, Y, 0.45 * s); rotW(B.head, Y, 0.55 * s); rotW(B.head, Z, 0.35 * s * (this.biteTilt || 1));
        }
      }
    }
    // Prankenhieb: die Pfote holt außen hoch aus und fegt dann auf Körperhöhe durch die gemerkte Stelle nach innen
    let wS = 0;
    // beide Vorderbeine jedes Bild mit Gedächtnis (die nicht schlagende Pfote mit Gewicht 0 → ihre alte Korrektur blendet aus)
    const memS = this.memSwipe || (this.memSwipe = { L: [], R: [] });
    const swingX = T && st === 'swipe' && this.aimP ? ((this.swSide || 1) > 0 ? 'L' : 'R') : null;
    for (const x of ['L', 'R']) if (x !== swingX && T) ccdAim([B['frontHorselink' + x], B['frontLwr' + x], B['frontUpr' + x]], (v) => B['frontFoot' + x].getWorldPosition(v), vT, 0, [1.2, 1.4, 1.3], 5, memS[x], dt, 30);
    if (swingX) {
      wS = bump(t, 0.08, 0.4) * (1 - bump(t, 0.78, 1.15));
      const s = this.swSide || 1, x = swingX, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const ox = Math.cos(this.yaw) * s, oz = -Math.sin(this.yaw) * s;          // nach außen (Seite der schlagenden Pfote)
      const sh = B['frontUpr' + x].getWorldPosition(new THREE.Vector3());
      const P1 = this.aimP.clone(); P1.y = 0.8;
      const reach = (this.beine ? this.beine.legs[s > 0 ? 0 : 1].len : 3.2) * 0.95, hd = Math.hypot(P1.x - sh.x, P1.z - sh.z);
      if (hd > reach) { P1.x = sh.x + (P1.x - sh.x) * reach / hd; P1.z = sh.z + (P1.z - sh.z) * reach / hd; }
      const P0 = new THREE.Vector3(P1.x + ox * 2.4 - fx * 0.6, 2.6, P1.z + oz * 2.4 - fz * 0.6);
      const P2 = new THREE.Vector3(P1.x - ox * 1.6 + fx * 0.3, 0.6, P1.z - oz * 1.6 + fz * 0.3);
      const u = clamp((t - 0.46) / 0.22, 0, 1), C = P1.clone().multiplyScalar(2).addScaledVector(P0, -0.5).addScaledVector(P2, -0.5);
      const tg = t < 0.46 ? P0 : P0.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(C, 2 * u * (1 - u)).addScaledVector(P2, u * u);
      ccdAim([B['frontHorselink' + x], B['frontLwr' + x], B['frontUpr' + x]], (v) => B['frontFoot' + x].getWorldPosition(v), tg, wS, [1.2, 1.4, 1.3], 5, memS[x], dt, 45);
    }
    // ---------- Pfoten fest auf den Boden (Fuß-IK + eigene Schritte, bossbeine.js) ----------
    // Gewicht 0 = das Bein gehört gerade der Animation: Liegen, Tod, Sprung in der Luft, Satz bei der Drehung,
    // die schlagende Pranke beim Prankenhieb, beide Vorderbeine beim Aufbäumen vor dem Stampfen.
    if (this.beine && this.beine.ok) {
      let wAll = st === 'sleep' || this.dead ? 0 : st === 'wake' ? sm((t - 1.0) / 0.7) : 1;
      if (st === 'leap') wAll *= 1 - clamp(S0.air * 3, 0, 1);
      const wv = [wAll, wAll, wAll, wAll];
      // Schwanzfeger: Vorderpfoten bleiben als Drehpunkt stehen, nur die Hinterbeine springen herum und landen wieder
      if (st === 'spin') { const air = bump(t, 0.42, 0.48) * (1 - bump(t, 0.96, 1.02)); wv[2] *= 1 - air; wv[3] *= 1 - air; }
      const paw = clamp(Math.max((Math.abs(S0.pawR) + Math.abs(S0.pawO)) * 2.5, wS * 1.5), 0, 1);
      wv[(this.swSide || 1) > 0 ? 0 : 1] *= 1 - paw;
      // Aufbäumen vor dem Stampfen: Vorderbeine in der Luft, ab 0,82 s kommen sie herunter (dann übernimmt die IK → Pfoten aufs Ziel)
      const rear = st === 'stomp' ? bump(t, 0.1, 0.35) * (1 - bump(t, 0.8, 0.88)) : clamp(-S0.legF / 0.3, 0, 1);
      wv[0] *= 1 - rear; wv[1] *= 1 - rear;
      M.holder.updateMatrixWorld(true);
      this.beine.solve(dt, wv, { vx: VA.x, vz: VA.y, wy: this.yawRate || 0, cx: this.p.x, cz: this.p.z, pivot: st === 'spin' && !!this.spinP }, X);
    }
    // ---------- Glut vom Rücken ----------
    const heat = this.dead ? Math.max(0, 1 - this.deadT / 6) * 0.5 : this.st === 'sleep' ? 0.35 : this.phase2 ? 1.6 : 0.75;
    B.chest && B.chest.getWorldPosition(vY);
    this.glow.position.set(vY.x, vY.y + 0.8, vY.z);
    this.glow.intensity = heat * (this.phase2 ? 10 : 5) * (0.85 + 0.15 * Math.sin(this.t * 11));
    if (this.mat) this.mat.userData.u.uGlow.value = heat * 2.9 * (0.9 + 0.1 * Math.sin(this.t * 7.3));   // Augen/Glutrisse glimmen mit
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
