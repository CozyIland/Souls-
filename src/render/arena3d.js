// Die Arena: schwebende Steinplattform über dem Abgrund, Feuersäulen, Mondlicht, Ruinen im Nebel.
import * as THREE from 'three';
import { ARENA_R, PX, TAU, rand } from '../util.js';
import { G, B, addP } from '../game.js';
import { floorTexture, glowTexture, FLOOR_R } from './textures.js';

const PILLAR_R = ARENA_R + 34; // wie im Original
const PILLAR_H = 3.6;          // Meter

export class Arena {
  constructor(scene, renderer) {
    this.scene = scene;
    scene.background = new THREE.Color(0x040304);
    scene.fog = new THREE.FogExp2(0x060405, 0.03);

    // ---------- Licht ----------
    scene.add(new THREE.HemisphereLight(0x6a6688, 0x1c140e, 0.55));
    const moon = new THREE.DirectionalLight(0xa9b6dc, 1.15);
    moon.position.set(-9, 20, -7);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 2; sc.far = 50;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.02;
    scene.add(moon, moon.target);

    // ---------- Boden ----------
    const tex = floorTexture();
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(FLOOR_R / PX, 96),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Plattformkante, die in den Abgrund ragt
    const rock = new THREE.MeshStandardMaterial({ color: 0x241e19, roughness: 1 });
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(FLOOR_R / PX, FLOOR_R / PX * 0.55, 9, 48, 1, true), rock);
    edge.position.y = -4.5;
    scene.add(edge);

    // Niedrige Brüstung am Rand der Kampffläche (Lücken wie Ruinen)
    const blockGeo = new THREE.BoxGeometry(0.9, 0.55, 0.45);
    const stone = new THREE.MeshStandardMaterial({ color: 0x3d342b, roughness: 0.95 });
    const count = 56;
    const blocks = new THREE.InstancedMesh(blockGeo, stone, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.18) continue;
      const a = (i / count) * TAU;
      const r = (ARENA_R + 16) / PX;
      const h = rand(0.5, 1.15);
      p.set(Math.cos(a) * r, (0.55 * h) / 2, Math.sin(a) * r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2 + rand(-0.08, 0.08));
      s.set(1, h, 1);
      m.compose(p, q, s);
      blocks.setMatrixAt(n++, m);
    }
    blocks.count = n;
    blocks.castShadow = true; blocks.receiveShadow = true;
    scene.add(blocks);

    // ---------- Feuersäulen ----------
    this.glowTex = glowTexture();
    this.fires = [];
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4f463c, roughness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f1914, roughness: 0.8, metalness: 0.3 });
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 + TAU / 16;
      const x = Math.cos(a) * PILLAR_R, y = Math.sin(a) * PILLAR_R;
      const g = new THREE.Group();
      g.position.set(x / PX, 0, y / PX);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, PILLAR_H, 10), pillarMat);
      shaft.position.y = PILLAR_H / 2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.7), pillarMat);
      base.position.y = 0.2;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.45, 0.45, 12), darkMat);
      bowl.position.y = PILLAR_H + 0.2;
      for (const o of [shaft, base, bowl]) { o.castShadow = true; o.receiveShadow = true; g.add(o); }

      const flames = [];
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex, color: k === 0 ? 0xfff0c0 : 0xff8a30, blending: THREE.AdditiveBlending,
          transparent: true, depthWrite: false, fog: false,
        }));
        sp.position.y = PILLAR_H + 0.55 + k * 0.25;
        g.add(sp);
        flames.push(sp);
      }
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35, fog: false,
      }));
      halo.scale.setScalar(4.5);
      halo.position.y = PILLAR_H + 0.7;
      g.add(halo);

      const light = new THREE.PointLight(0xff8a3a, 22, 13, 1.6);
      light.position.y = PILLAR_H + 0.9;
      g.add(light);

      scene.add(g);
      this.fires.push({ x, y, ph: Math.random() * 10, flames, light, halo });
    }

    // Runenkreis glüht in Phase 2
    this.rune = new THREE.Mesh(
      new THREE.RingGeometry(236 / PX, 246 / PX, 96),
      new THREE.MeshBasicMaterial({ color: 0xc8321e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.rune.rotation.x = -Math.PI / 2;
    this.rune.position.y = 0.02;
    scene.add(this.rune);

    // Ferne Ruinen-Türme im Nebel (für Tiefe)
    const ruinMat = new THREE.MeshStandardMaterial({ color: 0x15110f, roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU), r = rand(28, 48), h = rand(8, 26);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(rand(2, 5), h, rand(2, 5)), ruinMat);
      tower.position.set(Math.cos(a) * r, h / 2 - rand(6, 12), Math.sin(a) * r);
      tower.rotation.y = rand(0, TAU);
      scene.add(tower);
    }
  }

  update(dt) {
    const t = G.time;
    for (const f of this.fires) {
      const flick = 0.85 + 0.15 * Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2);
      f.light.intensity = 20 * flick;
      f.halo.material.opacity = 0.28 + 0.1 * flick;
      f.flames.forEach((sp, k) => {
        const s = (1.3 - k * 0.3) * (0.9 + 0.2 * Math.sin(t * (9 + k * 3) + f.ph + k));
        sp.scale.set(s * 0.9, s * 1.3, 1);
        sp.position.x = Math.sin(t * 9 + k * 2 + f.ph) * 0.06;
      });
      if (Math.random() < 0.08) {
        addP({ x: f.x + rand(-6, 6), y: f.y + rand(-6, 6), vx: rand(-15, 15), vy: rand(-60, -25), life: 1.2, max: 1.2, size: rand(1, 2), col: '255,170,80', add: true, drag: 0, kind: 'ember', hStart: (PILLAR_H + 0.6) * PX });
      }
    }
    const on = B && B.phase2 && G.state !== 'menu';
    this.rune.material.opacity = on ? 0.35 + 0.2 * Math.sin(t * 3) : 0;
  }
}
