// Effekte in 3D: Funken, Blut, Staub, Glut, Ringe, Flammenkugeln, Nachbeben und Bodenwarnungen.
import * as THREE from 'three';
import { PX } from '../util.js';
import { G, B } from '../game.js';
import { glowTexture, fadeTexture } from './textures.js';

const MAX_P = 700;

// ---------- Partikel (eigener kleiner Shader: Größe in Metern, weicher Rand) ----------
const P_VERT = `
attribute float alpha;
attribute float size;
attribute vec3 pcolor;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  vA = alpha; vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, size * uScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const P_FRAG = `
varying float vA;
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, d));
}`;

function makePoints(additive) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAX_P), 1));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_P), 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: P_VERT, fragmentShader: P_FRAG,
    uniforms: { uScale: { value: 800 } },
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// Farb-Cache für '255,200,120'-Strings
const colCache = new Map();
function rgb(str) {
  let c = colCache.get(str);
  if (!c) { const [r, g, b] = str.split(',').map((v) => Number(v) / 255); c = [r, g, b]; colCache.set(str, c); }
  return c;
}

// ---------- Flache Formen auf dem Boden (Ringe, Scheiben, gestrichelte Kreise) ----------
const F_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const F_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uInner;
uniform float uDash;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0 || r < uInner) discard;
  float edge = uInner > 0.0 ? min(1.0 - r, r - uInner) : 1.0 - r;
  float a = uOpacity * smoothstep(0.0, 0.02, edge);
  if (uDash > 0.0) {
    float ang = atan(p.y, p.x) / 6.2831853;
    if (fract(ang * uDash) > 0.55) discard;
  }
  gl_FragColor = vec4(uColor, a);
}`;

class FlatPool {
  constructor(scene, size) {
    this.items = [];
    const geo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < size; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: F_VERT, fragmentShader: F_FRAG, transparent: true, depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 }, uInner: { value: 0.9 }, uDash: { value: 0 } },
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.items.push(m);
    }
    this.n = 0;
  }
  begin() { this.n = 0; }
  /** x, y, h in Spiel-Einheiten; r = Außenradius; w = Breite (0 = volle Scheibe) */
  draw(x, y, h, r, w, color, opacity, additive, dash = 0) {
    if (this.n >= this.items.length || r <= 0.5 || opacity <= 0.003) return;
    const m = this.items[this.n++];
    m.visible = true;
    m.position.set(x / PX, h / PX, y / PX);
    m.scale.setScalar(r / PX);
    const u = m.material.uniforms;
    if (typeof color === 'string') { const c = rgb(color); u.uColor.value.setRGB(c[0], c[1], c[2]); }
    else u.uColor.value.setHex(color);
    u.uOpacity.value = opacity;
    u.uInner.value = w > 0 ? Math.max(0, 1 - w / r) : 0;
    u.uDash.value = dash;
    m.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  }
  end() { for (let i = this.n; i < this.items.length; i++) this.items[i].visible = false; }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.addPts = makePoints(true);
    this.normPts = makePoints(false);
    scene.add(this.addPts, this.normPts);
    this.flat = new FlatPool(scene, 40);

    // Flammenkugeln
    const glow = glowTexture();
    this.orbs = [];
    for (let i = 0; i < 20; i++) {
      const outer = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff6a32, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff0c8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      outer.scale.setScalar(1.0); inner.scale.setScalar(0.4);
      outer.visible = inner.visible = false;
      scene.add(outer, inner);
      this.orbs.push([outer, inner]);
    }

    // Warnstreifen für den Ansturm
    this.chargeLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: fadeTexture(), color: 0xc82814, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.chargeLine.rotation.order = 'YXZ';
    this.chargeLine.renderOrder = 2;
    scene.add(this.chargeLine);
  }

  update(camera, renderer) {
    // Partikelgröße an Bildschirmhöhe anpassen
    const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.addPts.material.uniforms.uScale.value = scale;
    this.normPts.material.uniforms.uScale.value = scale;

    this.updateParticles();
    this.flat.begin();
    this.drawGround();
    this.flat.end();
    this.updateOrbs();
  }

  updateParticles() {
    const fill = (pts, additive) => {
      const geo = pts.geometry;
      const pos = geo.attributes.position.array, col = geo.attributes.pcolor.array;
      const al = geo.attributes.alpha.array, sz = geo.attributes.size.array;
      let n = 0;
      for (const q of G.particles) {
        if (q.add !== additive || q.kind === 'ring') continue;
        const a = q.life / q.max;
        let alpha = a, size = q.size;
        if (q.kind === 'smoke') { alpha = a * 0.35; size = q.size * (1.6 - a); }
        else if (q.kind === 'ember') alpha = Math.min(1, a * 2) * 0.8;
        pos[n * 3] = q.x / PX; pos[n * 3 + 1] = q.h / PX; pos[n * 3 + 2] = q.y / PX;
        const c = rgb(q.col);
        col[n * 3] = c[0]; col[n * 3 + 1] = c[1]; col[n * 3 + 2] = c[2];
        al[n] = alpha;
        sz[n] = (size / PX) * 1.6;
        n++;
        if (n >= MAX_P) break;
      }
      geo.setDrawRange(0, n);
      for (const k of ['position', 'pcolor', 'alpha', 'size']) geo.attributes[k].needsUpdate = true;
    };
    fill(this.addPts, true);
    fill(this.normPts, false);
  }

  drawGround() {
    const f = this.flat;
    // Ring-Partikel (Druckwellen, Heilring, Brüllen)
    for (const q of G.particles) {
      if (q.kind !== 'ring') continue;
      const a = q.life / q.max;
      f.draw(q.x, q.y, 4, q.size * (1.15 - a * 0.6), 6 * a + 2, q.col, a, true);
    }
    // Nachbeben
    for (const h of G.hazards) {
      if (h.t < 0) { f.draw(h.x, h.y, 3, h.rMax, 3, '230,70,30', 0.5 * (1 + h.t / 0.32), false); continue; }
      const r = h.rMax * (h.t / h.dur);
      f.draw(h.x, h.y, 5, r + 8, 16, '150,120,90', 0.75 * (1 - h.t / h.dur), false);
    }
    // Schatten unter dem springenden Boss + Bodenwarnungen
    const b = B;
    this.chargeLine.material.opacity = 0;
    if (!b || G.state === 'menu') return;
    if (b.z > 0) f.draw(b.x, b.y, 2, 45 * (1 - b.z / 500), 0, 0x000000, 0.45, false);
    if (b.state !== 'attack' || !b.atk) return;
    const ph = b.atk.phases[b.atk.i];
    const k = Math.min(1, ph.t / ph.d);
    if (ph.k === 'wind' && ph.chargeAim) {
      const len = 520 / PX;
      const L = this.chargeLine;
      L.material.opacity = 0.55 * k;
      L.scale.set(len, 52 / PX, 1);
      L.rotation.set(-Math.PI / 2, -b.face, 0);
      L.position.set(b.x / PX + Math.cos(b.face) * len / 2, 0.04, b.y / PX + Math.sin(b.face) * len / 2);
    }
    if (ph.k === 'wind' && ph.spinPrep) f.draw(b.x, b.y, 4, 152, 4, '220,60,30', 0.5 * k, false, 18);
    if (ph.k === 'leap') {
      f.draw(ph.tx, ph.ty, 2, 50 * k + 10, 0, 0x000000, 0.25 + 0.35 * k, false);
      f.draw(ph.tx, ph.ty, 4, 118 * (0.4 + 0.6 * k), 4, '230,70,30', 0.2 + 0.55 * k, false);
    }
  }

  updateOrbs() {
    this.orbs.forEach(([outer, inner], i) => {
      const o = G.projectiles[i];
      outer.visible = inner.visible = !!o;
      if (!o) return;
      const x = o.x / PX, z = o.y / PX, y = 45 / PX;
      outer.position.set(x, y, z); inner.position.set(x, y, z);
      const s = 1 + Math.sin(G.time * 20 + i) * 0.1;
      outer.scale.setScalar((o.r * 6 / PX) * s);
      inner.scale.setScalar((o.r * 2 / PX) * s);
    });
  }
}

