// Blut bei Treffern: Spritzer fliegen in Schlagrichtung, fallen zu Boden und hinterlassen Flecken (verblassen langsam).
import * as THREE from 'three';
import { canvasTex, glowTex } from './texturen.js';

let scene = null;
const drops = [], stains = [];
const MAX_STAINS = 50;
let dropMat = null, stainMats = null, stainGeo = null;

function stainTex(seed) {
  let s = seed;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(70,6,8,0.92)';
    g.beginPath(); g.ellipse(64, 64, 22 + r() * 10, 16 + r() * 10, r() * 3, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 20 + r() * 38, rr = 2 + r() * 6; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(30,2,4,0.5)'; g.beginPath(); g.ellipse(60, 66, 12, 9, 0, 0, Math.PI * 2); g.fill();
  }, { clamp: true });
}

export function setupBlood(sc) {
  scene = sc;
  dropMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0x5a0608, transparent: true, depthWrite: false });
  stainMats = [1, 2, 3].map((k) => new THREE.MeshBasicMaterial({ map: stainTex(k * 977), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  stainGeo = new THREE.PlaneGeometry(1, 1); stainGeo.rotateX(-Math.PI / 2);
}

/** Spritzer an Punkt p in Richtung dir (Länge egal); n = Menge */
export function spray(p, dir, n = 14) {
  if (!scene) return;
  const d = dir.clone().setY(0).normalize();
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(dropMat.clone());
    s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15));
    const sp = 1.5 + Math.random() * 3.5;
    const v = d.clone().multiplyScalar(sp).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random() * 2.2, (Math.random() - 0.5) * 2));
    const sc = 0.04 + Math.random() * 0.06; s.scale.setScalar(sc);
    scene.add(s);
    drops.push({ s, v, sc, life: 0, stain: i % 4 === 0 });
  }
}

function stain(x, z, size) {
  const m = new THREE.Mesh(stainGeo, stainMats[Math.floor(Math.random() * stainMats.length)].clone());
  m.position.set(x, 0.015 + stains.length * 0.0002, z); m.rotation.y = Math.random() * Math.PI * 2; m.scale.setScalar(size);
  m.renderOrder = 1;
  scene.add(m);
  stains.push({ m, t: 0 });
  if (stains.length > MAX_STAINS) { const o = stains.shift(); scene.remove(o.m); o.m.material.dispose(); }
}

export function updateBlood(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const q = drops[i];
    q.life += dt; q.v.y -= 9.8 * dt;
    q.s.position.addScaledVector(q.v, dt);
    q.s.scale.set(q.sc, q.sc * (1 + Math.min(2, q.v.length() * 0.15)), 1); // gestreckt im Flug
    if (q.s.position.y <= 0.03 || q.life > 1.5) {
      if (q.stain && q.s.position.y <= 0.05) stain(q.s.position.x, q.s.position.z, 0.25 + Math.random() * 0.35);
      scene.remove(q.s); q.s.material.dispose(); drops.splice(i, 1);
    }
  }
  for (const st of stains) { st.t += dt; if (st.t > 40) st.m.material.opacity = Math.max(0, 1 - (st.t - 40) / 10); }
}
