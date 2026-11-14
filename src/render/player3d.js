// Die Heldin: dein 3D-Modell (models/heldin.glb) mit Schwert und Animationen per Code.
// Das Modell hat kein Skelett – deshalb bewegt sich die Figur als Ganzes
// (wippen, rollen, kippen), und das Schwert schwingt um die rechte Hand.
import * as THREE from 'three';
import { PX, TAU, lerp, damp, clamp, angDiff } from '../util.js';
import { G, P } from '../game.js';

export const MODEL_URL = 'models/heldin.glb';
const HAND = new THREE.Vector3(-0.36, 0.55, 0.1); // rechte Hand (Modell schaut nach +Z)
const CENTER = 0.75;                               // Drehpunkt für Rolle und Fallen

const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * (3 - 2 * c); };

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

    // Schwert
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

    loader.load(MODEL_URL, (gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) return;
      mesh.material = this.mat;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(0, 0, 0);
      this.body.remove(this.placeholder);
      this.body.add(mesh);
      this.geometry = mesh.geometry;
      for (let i = 0; i < 4; i++) {
        const g = new THREE.Mesh(this.geometry, this.ghostMat.clone());
        g.visible = false;
        scene.add(g);
        this.ghosts.push(g);
      }
    }, undefined, (err) => { console.warn('Modell konnte nicht geladen werden – Platzhalter bleibt.', err); });
  }

  update(dt) {
    const p = P;
    const visible = G.state !== 'menu' && p;
    this.root.visible = !!visible;
    this.trail.visible = !!visible;
    if (!visible) { this.ghosts.forEach((g) => { g.visible = false; }); return; }

    this.root.position.set(p.x / PX, 0, p.y / PX);

    // Blickrichtung: beim Rollen in Rollrichtung, sonst zum Boss
    let faceT = p.face;
    if (p.state === 'roll') faceT = Math.atan2(p.rollDir.y, p.rollDir.x);
    this.yaw += angDiff(this.yaw, faceT) * damp(p.state === 'roll' ? 30 : 14, dt);
    this.root.rotation.y = Math.PI / 2 - this.yaw;

    // Grundhaltung
    let rotX = 0, rotZ = 0, twist = 0, y = CENTER, squash = 1;
    const speed = Math.hypot(p.vx, p.vy) / PX;
    if (p.state === 'idle') {
      const k = clamp(speed / 4, 0, 1);
      y += Math.abs(Math.sin(p.walk)) * 0.06 * k;
      rotZ = Math.sin(p.walk) * 0.07 * k;
      rotX = 0.08 * k;
      y += Math.sin(G.time * 2) * 0.01; // Atmen
    } else if (p.state === 'roll') {
      const k = p.t / 0.5;
      rotX = smooth(k / 0.8) * TAU;
      y = CENTER - Math.sin(clamp(k, 0, 1) * Math.PI) * 0.35;
      squash = 1 - Math.sin(clamp(k, 0, 1) * Math.PI) * 0.15;
    } else if (p.state === 'attack' && p.atk) {
      const a = p.atk;
      twist = -p.swordA * 0.3;
      rotX = a.phase === 'act' ? 0.22 : a.phase === 'wind' ? -0.08 : 0.1;
    } else if (p.state === 'heal') {
      rotX = 0.12;
    } else if (p.state === 'hurt') {
      rotX = -0.35 * (1 - clamp(p.t / 0.38, 0, 1));
    } else if (p.state === 'dead') {
      const k = smooth(p.t / 0.8);
      rotX = -k * Math.PI / 2;
      y = lerp(CENTER, 0.2, k);
    }
    this.pivot.rotation.set(rotX, twist, rotZ);
    this.pivot.position.y = y;
    this.pivot.scale.set(1, squash, 1);

    // Treffer: rot aufblitzen
    const hf = clamp(p.hurtFlash * 5, 0, 1);
    this.mat.emissive.setRGB(hf * 0.8, hf * 0.08, hf * 0.05);

    // Schwert
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

    this.updateTrail(p);
    this.updateGhosts();
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
    this.trail.position.set((p.x + hx) / PX, HAND.y + 0.05, (p.y + hy) / PX);
    this.trail.scale.setScalar(1.1); // ungefähr Schwertlänge in Metern
    this.trail.material.color.setHex(a.type === 'heavy' ? 0xffe6aa : 0xc8e1ff);
    this.trail.material.opacity = (1 - k) * 0.75;
  }

  updateGhosts() {
    const list = G.ghosts.slice(-this.ghosts.length);
    this.ghosts.forEach((g, i) => {
      const gh = list[i];
      if (!gh) { g.visible = false; return; }
      g.visible = true;
      g.position.set(gh.x / PX, 0, gh.y / PX);
      g.rotation.y = this.root.rotation.y;
      g.material.opacity = gh.life * 1.2;
    });
  }
}
