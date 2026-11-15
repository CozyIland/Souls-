// Die Heldin: dein Meshy-Modell (models/heldin.glb) mit Farben, Skelett (Mixamo) und Schwert.
// Aus der Datei kommen nur die Animationen „Walking“ und „Running“ – Stehen, Schwertarm,
// Rolle, Heiltrank und Fallen bewegt der Code direkt über die Knochen.
// Hat ein Modell kein Skelett, bewegt sich die Figur wie früher als Ganzes.
import * as THREE from 'three';
import { clone as cloneScene } from 'three/addons/utils/SkeletonUtils.js';
import { PX, TAU, lerp, damp, clamp, angDiff } from '../util.js';
import { G, P } from '../game.js';

export const MODEL_URL = 'models/heldin.glb';
const HAND = new THREE.Vector3(-0.36, 0.55, 0.1); // rechte Hand für Modelle ohne Skelett (Modell schaut nach +Z)
const CENTER = 0.8;                                // Drehpunkt für Rolle und Fallen
const WALK_V = 0.94, RUN_V = 2.94;                 // Tempo (m/s), zu dem die Schritte von „Walking“ / „Running“ passen

const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

// ---------- Knochen-Werkzeuge ----------
// Richtungen „im Körper“: x = links, y = oben, z = vorn (die Heldin schaut nach +Z).
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion(), qBody = new THREE.Quaternion();
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);

/** Richtung im Körper → Welt (qBody muss vorher gesetzt sein) */
function bodyDir(x, y, z, out) { return out.set(x, y, z).normalize().applyQuaternion(qBody); }

/** Knochen so drehen, dass er zu seinem Kind-Knochen hin nach `dirW` (Welt) zeigt. k = Anteil 0..1 */
function aim(bone, child, dirW, k) {
  if (!bone || !child || k <= 0.001) return;
  const pq = bone.parent.getWorldQuaternion(qA);
  const wq = qB.copy(pq).multiply(bone.quaternion);
  const cur = vA.copy(child.position).normalize().applyQuaternion(wq);
  const target = qC.setFromUnitVectors(cur, dirW).multiply(wq);
  bone.quaternion.slerp(pq.invert().multiply(target), Math.min(1, k));
}

/** Knochen um eine Achse im Körper drehen (Rücken beugen, Oberkörper drehen) */
function bend(bone, axisBody, ang) {
  if (!bone || Math.abs(ang) < 1e-4) return;
  const pq = bone.parent.getWorldQuaternion(qA);
  const wq = qB.copy(pq).multiply(bone.quaternion);
  qC.setFromAxisAngle(vA.copy(axisBody).applyQuaternion(qBody), ang).multiply(wq);
  bone.quaternion.copy(pq.invert().multiply(qC));
}

export class PlayerView {
  constructor(scene, loader) {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = CENTER;
    this.body = new THREE.Group();
    this.body.position.y = -CENTER;
    this.pivot.add(this.body);
    this.root.add(this.pivot);
    scene.add(this.root);

    this.mat = new THREE.MeshStandardMaterial({ color: 0xf2e4d8, roughness: 0.55, metalness: 0.05 });

    // Platzhalter, bis das Modell geladen ist
    this.placeholder = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 10), this.mat);
    this.placeholder.position.y = 0.75;
    this.placeholder.castShadow = true;
    this.body.add(this.placeholder);

    // Schwert (sitzt in der rechten Hand; ohne Skelett an der festen Stelle HAND)
    this.sword = new THREE.Group();
    this.sword.rotation.order = 'YXZ';
    this.sword.position.copy(HAND);
    this.body.add(this.sword);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.9 }));
    grip.rotation.x = Math.PI / 2;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a6d3b, metalness: 0.9, roughness: 0.35 }));
    guard.position.z = 0.11;
    this.bladeMat = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, metalness: 0.95, roughness: 0.2, emissive: 0x000000 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.95), this.bladeMat);
    blade.position.z = 0.13 + 0.475;
    for (const m of [grip, guard, blade]) { m.castShadow = true; this.sword.add(m); }
    this.tilt = 0.5;

    // Heiltrank in der linken Hand
    this.flask = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe6a33a, emissive: 0xff9a30, emissiveIntensity: 1.5 }));
    this.flask.position.set(0.2, 0.95, 0.22);
    this.flask.visible = false;
    this.body.add(this.flask);
    this.healLight = new THREE.PointLight(0xffc870, 0, 4, 2); // bleibt immer da (Lichtanzahl ändern ist teuer)
    this.healLight.position.set(0, 1, 0.3);
    this.root.add(this.healLight);
    // Begleitlicht: scheint von der Kameraseite auf die Heldin, damit man sie im dunklen Kampfplatz sieht
    this.fill = new THREE.PointLight(0xffe6cc, 7, 7, 1.6);
    scene.add(this.fill);

    // Schwungspur
    this.trail = new THREE.Mesh(new THREE.RingGeometry(0.35, 1, 24, 1, 0, 1), new THREE.MeshBasicMaterial({
      color: 0xc8e1ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    scene.add(this.trail);
    this.trailKey = '';

    // Nachbilder beim Rollen
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x7896dc, transparent: true, opacity: 0.3, depthWrite: false });
    this.ghosts = [];
    this.yaw = 0;

    // Skelett & Animationen (nach dem Laden)
    this.rig = null; this.bones = null; this.mixer = null; this.walk = null; this.run = null;
    this.phase = 0; this.moveW = 0; this.handY = HAND.y;

    loader.load(MODEL_URL, (gltf) => this.onModel(scene, gltf), undefined, (err) => { console.warn('Modell konnte nicht geladen werden – Platzhalter bleibt.', err); });
  }

  onModel(scene, gltf) {
    const model = gltf.scene;
    let skinned = null, any = null;
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (!any) any = o;
      if (o.isSkinnedMesh && !skinned) skinned = o;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    });
    if (!any) return;
    this.body.remove(this.placeholder);
    this.body.add(model);

    if (skinned) {
      this.mat = skinned.material; // Farben aus Meshy behalten
      const B = {};
      model.traverse((o) => { if (o.isBone) B[o.name.replace(/^mixamorig[:_]?/, '')] = o; });
      if (B.Hips && B.Spine && B.RightArm && B.RightForeArm && B.RightHand && B.LeftArm && B.LeftForeArm && B.LeftHand) {
        this.rig = B;
        this.bones = [];
        model.traverse((o) => { if (o.isBone) this.bones.push(o); });
        // Reine Animationshaltung des letzten Bildes (ohne die Haltung per Code)
        this.animQ = this.bones.map((b) => b.quaternion.clone());
        this.animP = this.bones.map((b) => b.position.clone());
        this.mixer = new THREE.AnimationMixer(model);
        const mk = (re) => {
          const c = gltf.animations.find((a) => re.test(a.name));
          if (!c) return null;
          const a = this.mixer.clipAction(c);
          a.play(); a.timeScale = 0; a.setEffectiveWeight(0); // Zeit setzt der Code selbst (Schritte passend zum Tempo)
          return a;
        };
        this.walk = mk(/walk/i);
        this.run = mk(/run/i);
      }
    } else {
      any.material = this.mat; // altes Modell ohne Farben
    }

    // Nachbilder: eigene Kopien mit eigenem Skelett, Haltung wird beim Entstehen eingefroren
    for (let i = 0; i < 4; i++) {
      const g = { root: new THREE.Group(), pivot: new THREE.Group(), body: new THREE.Group(), bones: [], mat: this.ghostMat.clone() };
      g.pivot.position.y = CENTER; g.body.position.y = -CENTER;
      g.root.add(g.pivot); g.pivot.add(g.body);
      const c = cloneScene(model);
      c.traverse((o) => {
        if (o.isMesh) { o.material = g.mat; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; }
        if (o.isBone) g.bones.push(o);
      });
      g.body.add(c);
      g.root.visible = false;
      scene.add(g.root);
      this.ghosts.push(g);
    }
  }

  update(dt, camera) {
    const p = P;
    const visible = G.state !== 'menu' && p;
    this.root.visible = !!visible;
    this.trail.visible = !!visible;
    this.fill.intensity = visible ? 7 : 0;
    if (!visible) { this.ghosts.forEach((g) => { g.root.visible = false; }); return; }
    const rig = this.rig;

    this.root.position.set(p.x / PX, 0, p.y / PX);
    if (camera) { // 1,6 m Richtung Kamera, 1,9 m hoch
      const dx = camera.position.x - this.root.position.x, dz = camera.position.z - this.root.position.z, l = Math.hypot(dx, dz) || 1;
      this.fill.position.set(this.root.position.x + (dx / l) * 1.6, 1.9, this.root.position.z + (dz / l) * 1.6);
    }
    const sp = Math.hypot(p.vx, p.vy) / PX; // Tempo in m/s
    const walking = !!rig && (p.state === 'idle' || p.state === 'heal') && sp > 0.35;

    // Blickrichtung: beim Rollen in Rollrichtung, beim Laufen (mit Skelett) in Laufrichtung, sonst zum Boss
    let faceT = p.face, turn = 14;
    if (p.state === 'roll') { faceT = Math.atan2(p.rollDir.y, p.rollDir.x); turn = 30; }
    else if (walking) { faceT = Math.atan2(p.vy, p.vx); turn = 11; }
    this.yaw += angDiff(this.yaw, faceT) * damp(turn, dt);
    this.root.rotation.y = Math.PI / 2 - this.yaw;

    // Grundhaltung
    let rotX = 0, rotZ = 0, twist = 0, y = CENTER, squash = 1, lean = 0, tuck = 0, fall = 0;
    if (p.state === 'idle') {
      if (!rig) {
        const k = clamp(sp / 4, 0, 1);
        y += Math.abs(Math.sin(p.walk)) * 0.06 * k;
        rotZ = Math.sin(p.walk) * 0.07 * k;
        rotX = 0.08 * k;
        y += Math.sin(G.time * 2) * 0.01; // Atmen
      }
    } else if (p.state === 'roll') {
      const k = p.t / 0.5;
      rotX = smooth(k / 0.8) * TAU;
      y = CENTER - Math.sin(clamp(k, 0, 1) * Math.PI) * 0.35;
      if (rig) tuck = Math.sin(clamp(k / 0.85, 0, 1) * Math.PI); // zusammenrollen
      else squash = 1 - Math.sin(clamp(k, 0, 1) * Math.PI) * 0.15;
    } else if (p.state === 'attack' && p.atk) {
      const a = p.atk;
      twist = -p.swordA * 0.3;
      lean = a.phase === 'act' ? 0.22 : a.phase === 'wind' ? -0.08 : 0.1;
      if (!rig) rotX = lean;
    } else if (p.state === 'heal') {
      if (!rig) rotX = 0.12;
    } else if (p.state === 'hurt') {
      rotX = -0.35 * (1 - clamp(p.t / 0.38, 0, 1));
    } else if (p.state === 'dead') {
      fall = smooth(p.t / 0.8);
      rotX = -fall * Math.PI / 2;
      y = lerp(CENTER, rig ? 0.3 : 0.2, fall);
    }
    // Mit Skelett drehen und beugen sich Oberkörper und Rücken selbst (Füße bleiben am Boden)
    this.pivot.rotation.set(rotX, rig ? 0 : twist, rotZ);
    this.pivot.position.y = y;
    this.pivot.scale.set(1, squash, 1);

    // Treffer: rot aufblitzen
    const hf = clamp(p.hurtFlash * 5, 0, 1);
    this.mat.emissive.setRGB(hf * 0.8, hf * 0.08, hf * 0.05);

    // Schwert: Neigung (die Drehung um die Hand kommt aus der Kampflogik: swordA)
    const act = p.atk && p.atk.phase === 'act';
    let tiltT = 0.55;
    if (p.atk) tiltT = p.atk.phase === 'wind' ? -0.2 : act ? 0.06 : 0.35;
    if (p.state === 'roll' || p.state === 'dead') tiltT = 0.9;
    this.tilt = lerp(this.tilt, tiltT, damp(act ? 40 : 14, dt));
    this.sword.rotation.set(this.tilt, -p.swordA, 0);
    this.sword.visible = p.state !== 'dead';
    const heavyGlow = p.atk && p.atk.type === 'heavy' && p.atk.phase === 'wind' ? clamp(p.atk.t / p.atk.wind, 0, 1) : 0;
    this.bladeMat.emissive.setRGB(heavyGlow * 0.9 + (act ? 0.3 : 0), heavyGlow * 0.7 + (act ? 0.35 : 0), heavyGlow * 0.4 + (act ? 0.45 : 0));

    // Heiltrank
    this.flask.visible = p.state === 'heal';
    this.healLight.intensity = p.state === 'heal' ? 3 + Math.sin(G.time * 20) * 0.5 : 0;

    if (rig) this.poseRig(p, dt, sp, walking, lean, twist, tuck, fall);

    this.updateTrail(p);
    this.updateGhosts();
  }

  /** Bewegung über das Skelett: Laufen/Rennen aus der Datei, alles andere per Code */
  poseRig(p, dt, sp, walking, lean, twist, tuck, fall) {
    const R = this.rig;

    // 0) Haltung per Code vom letzten Bild entfernen. Nötig, weil der Mixer Knochen nur neu
    //    schreibt, wenn sich die Animation geändert hat – sonst würden sich Drehungen aufaddieren.
    const bones = this.bones;
    for (let i = 0; i < bones.length; i++) { bones[i].quaternion.copy(this.animQ[i]); bones[i].position.copy(this.animP[i]); }

    // 1) Laufen und Rennen – Schritte passend zum Tempo, damit die Füße nicht rutschen
    this.moveW = lerp(this.moveW, walking ? clamp((sp - 0.35) / 0.6, 0, 1) : 0, damp(12, dt));
    const runK = this.run ? (this.walk ? clamp((sp - 1.4) / 1.4, 0, 1) : 1) : 0;
    const dw = this.walk ? this.walk.getClip().duration : 1;
    const dr = this.run ? this.run.getClip().duration : 1;
    if (walking) this.phase = (this.phase + (dt * sp) / lerp(WALK_V * dw, RUN_V * dr, runK)) % 1;
    if (this.walk) { this.walk.time = this.phase * dw; this.walk.setEffectiveWeight(this.moveW * (1 - runK)); }
    if (this.run) { this.run.time = this.phase * dr; this.run.setEffectiveWeight(this.moveW * runK); }
    this.mixer.update(0);
    for (let i = 0; i < bones.length; i++) { this.animQ[i].copy(bones[i].quaternion); this.animP[i].copy(bones[i].position); }

    // 2) Haltung per Code
    this.body.getWorldQuaternion(qBody);
    const still = 1 - this.moveW;
    const dead = p.state === 'dead';
    let heal = 0;
    if (p.state === 'heal') heal = smooth(p.t / 0.25) * (1 - smooth((p.t - 0.8) / 0.2));

    // Rücken: atmen, beim Schlag vorbeugen, beim Rollen einrollen; Oberkörper dreht mit dem Schwung
    bend(R.Spine, AX, tuck * 0.35);
    bend(R.Spine1, AX, Math.sin(G.time * 2) * 0.025 * still + lean * 0.5 + tuck * 0.4);
    bend(R.Spine2, AX, lean * 0.5 + tuck * 0.35);
    bend(R.Spine, AY, twist * 0.55);
    bend(R.Spine2, AY, twist * 0.45);
    bend(R.Neck, AX, tuck * 0.45 - heal * 0.3);

    // Schwertarm (rechts): folgt der Klinge, beim Kreuzen vor dem Körper vorbei
    const sa = p.swordA, tl = this.tilt;
    const bx = -Math.cos(tl) * Math.sin(sa), by = -Math.sin(tl), bz = Math.cos(tl) * Math.cos(sa);
    const armK = dead ? 0 : 1 - tuck * 0.85;
    aim(R.RightArm, R.RightForeArm, bodyDir(bx, by * 0.6 - 0.45, bz + 0.9, vB), armK);
    aim(R.RightForeArm, R.RightHand, bodyDir(bx * 1.2, by * 0.8 - 0.2, bz + 0.5, vB), armK);

    // Freier Arm (links): hängt locker (beim Laufen schwingt er aus der Animation); beim Trinken zum Mund
    const lk = still * (1 - heal) * (dead ? 0 : 1);
    aim(R.LeftArm, R.LeftForeArm, bodyDir(0.32, -1, 0.06, vB), lk);
    aim(R.LeftForeArm, R.LeftHand, bodyDir(0.12, -1, 0.4, vB), lk);
    aim(R.LeftArm, R.LeftForeArm, bodyDir(-0.25, -0.1, 1, vB), heal);
    aim(R.LeftForeArm, R.LeftHand, bodyDir(-0.5, 0.85, 0.15, vB), heal);

    // Rolle: Knie zur Brust, Arme an den Körper
    if (tuck > 0.001) {
      aim(R.LeftUpLeg, R.LeftLeg, bodyDir(0.15, 0.2, 1, vB), tuck);
      aim(R.RightUpLeg, R.RightLeg, bodyDir(-0.15, 0.2, 1, vB), tuck);
      aim(R.LeftLeg, R.LeftFoot, bodyDir(0.05, -0.75, -0.65, vB), tuck);
      aim(R.RightLeg, R.RightFoot, bodyDir(-0.05, -0.75, -0.65, vB), tuck);
      aim(R.LeftArm, R.LeftForeArm, bodyDir(0.35, -0.35, 1, vB), tuck);
      aim(R.LeftForeArm, R.LeftHand, bodyDir(-0.4, 0.1, 1, vB), tuck);
      aim(R.RightArm, R.RightForeArm, bodyDir(-0.35, -0.35, 1, vB), tuck * 0.85);
      aim(R.RightForeArm, R.RightHand, bodyDir(0.4, 0.1, 1, vB), tuck * 0.85);
    }

    // Gestorben: Arme fallen zur Seite
    if (dead) {
      aim(R.LeftArm, R.LeftForeArm, bodyDir(1, 0.25, -0.1, vB), fall);
      aim(R.RightArm, R.RightForeArm, bodyDir(-1, 0.25, -0.1, vB), fall);
      aim(R.LeftForeArm, R.LeftHand, bodyDir(1, 0.4, 0, vB), fall);
      aim(R.RightForeArm, R.RightHand, bodyDir(-1, 0.4, 0, vB), fall);
    }

    // 3) Schwert und Trank in die Hände (Mitte der Faust)
    R.RightHand.getWorldPosition(vB);
    if (R.RightHandMiddle1) vB.lerp(R.RightHandMiddle1.getWorldPosition(vC), 0.7);
    this.handY = vB.y;
    this.sword.position.copy(this.body.worldToLocal(vB));
    R.LeftHand.getWorldPosition(vB);
    if (R.LeftHandMiddle1) vB.lerp(R.LeftHandMiddle1.getWorldPosition(vC), 0.7);
    this.flask.position.copy(this.body.worldToLocal(vB));
  }

  updateTrail(p) {
    const a = p.atk;
    if (!a || a.phase !== 'act') { this.trail.material.opacity = 0; return; }
    const k = Math.min(1, a.t / a.act);
    const a0 = p.face + a.from, a1 = p.face + p.swordA;
    const lo = Math.min(a0, a1), span = Math.max(0.05, Math.abs(a1 - a0));
    const key = span.toFixed(2);
    if (key !== this.trailKey) {
      this.trail.geometry.dispose();
      this.trail.geometry = new THREE.RingGeometry(0.35, 1, 24, 1, 0, span);
      this.trailKey = key;
    }
    this.trail.rotation.set(-Math.PI / 2, 0, -(lo + span));
    const hx = Math.cos(p.face) * 4 - Math.sin(p.face) * 12, hy = Math.sin(p.face) * 4 + Math.cos(p.face) * 12;
    this.trail.position.set((p.x + hx) / PX, this.handY + 0.05, (p.y + hy) / PX);
    this.trail.scale.setScalar(1.1); // ungefähr Schwertlänge in Metern
    this.trail.material.color.setHex(a.type === 'heavy' ? 0xffe6aa : 0xc8e1ff);
    this.trail.material.opacity = (1 - k) * 0.75;
  }

  /** Haltung für ein Nachbild festhalten */
  snapshot() {
    return {
      yaw: this.root.rotation.y, rot: this.pivot.rotation.clone(), y: this.pivot.position.y,
      q: this.bones ? this.bones.map((b) => b.quaternion.clone()) : [],
    };
  }

  updateGhosts() {
    const list = G.ghosts.slice(-this.ghosts.length);
    this.ghosts.forEach((g, i) => {
      const gh = list[i];
      if (!gh) { g.root.visible = false; return; }
      if (!gh.pose) gh.pose = this.snapshot();
      const s = gh.pose;
      g.root.visible = true;
      g.root.position.set(gh.x / PX, 0, gh.y / PX);
      g.root.rotation.y = s.yaw;
      g.pivot.rotation.copy(s.rot);
      g.pivot.position.y = s.y;
      for (let k = 0; k < g.bones.length && k < s.q.length; k++) g.bones[k].quaternion.copy(s.q[k]);
      g.mat.opacity = gh.life * 1.2;
    });
  }
}
