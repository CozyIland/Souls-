// Feuer für den brennenden Boss (Phase 2): echte Flammenzungen statt runder Leuchtflecken.
// Jede Flamme ist ein aufrecht stehendes Blatt (dreht sich nur um die Hochachse zur Kamera), im Shader geformt:
//  · Form: unten breit und rund, nach oben spitz zulaufend; wabert mit Rauschen, das nach oben wandert (züngelt), oben zerfasert
//  · Farbe nach Hitze: Kern weiß-gelb → orange → dunkelrot am Rand; heller als 1 → der Leuchtschein (Bloom) greift
//  · Leben: wächst nach oben, wird schmaler und verglüht
// Dazu dunkler Rauch (weiche Schwaden, steigen langsamer und werden größer). Alles in zwei InstancedMeshes (je ein Zeichenaufruf).
import * as THREE from 'three';

const NOISE = `
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }`;

const VERT = `
  attribute vec3 iPos; attribute vec4 iD;   // iD: Alter 0…1, Größe, Zufall, Breite
  varying vec2 vUv; varying float vAge; varying float vSeed;
  uniform float uStretch;
  void main(){
    vUv = uv; vAge = iD.x; vSeed = iD.z;
    vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);   // Kamera-rechts
    vec3 right = normalize(vec3(cr.x, 0.0, cr.z) + 1e-5);                  // nur um die Hochachse drehen: Flammen stehen aufrecht
    float h = iD.y * (0.8 + uStretch * iD.x), w = iD.y * iD.w * (1.0 - 0.35 * iD.x);
    vec3 p = iPos + right * (position.x * w) + vec3(0.0, (position.y + 0.35) * h, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const FLAME_FRAG = `
  uniform float uTime; varying vec2 vUv; varying float vAge; varying float vSeed;
  ${NOISE}
  void main(){
    float y = vUv.y, s = vSeed * 17.0;
    float n = fbm(vec2(vUv.x * 3.0 + s, y * 2.6 - uTime * 3.2 + s));            // wandert nach oben → züngelt
    float n2 = fbm(vec2(vUv.x * 7.0 - s, y * 5.0 - uTime * 5.5));
    float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * y + (n2 - 0.5) * 0.25 * y; // oben stärker gewellt
    float width = mix(0.85, 0.04, pow(y, 0.75));                                  // unten breit, oben spitz
    float body = 1.0 - smoothstep(width * 0.45, width, abs(x));
    float top = 1.0 - smoothstep(0.45 + 0.35 * n, 0.98, y);                       // oben zerfasert
    float bottom = smoothstep(0.0, 0.18, y);
    float shape = body * top * bottom;
    float heat = shape * (1.15 - 0.85 * y) * (1.0 - 0.55 * vAge) * (0.75 + 0.5 * n2);
    vec3 c = mix(vec3(0.45, 0.04, 0.0), vec3(1.0, 0.32, 0.02), smoothstep(0.08, 0.4, heat));
    c = mix(c, vec3(1.0, 0.75, 0.25), smoothstep(0.4, 0.75, heat));
    c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.75, 1.05, heat));
    float life = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
    float a = shape * life;
    if (a < 0.003) discard;
    gl_FragColor = vec4(c * a * (1.3 + 1.2 * heat), a);   // additiv; Kern > 1 → Leuchtschein
  }`;

const SMOKE_FRAG = `
  uniform float uTime; varying vec2 vUv; varying float vAge; varying float vSeed;
  ${NOISE}
  void main(){
    vec2 p = vUv * 2.0 - 1.0; float s = vSeed * 13.0;
    float n = fbm(vec2(vUv.x * 2.5 + s, vUv.y * 2.5 - uTime * 0.8 + s));
    float d = length(p * vec2(1.0, 0.8)) + (n - 0.5) * 0.7;
    float puff = 1.0 - smoothstep(0.25, 0.95, d);
    float life = smoothstep(0.0, 0.25, vAge) * (1.0 - smoothstep(0.4, 1.0, vAge));
    float a = puff * life * 0.42;
    if (a < 0.003) discard;
    gl_FragColor = vec4(mix(vec3(0.07, 0.05, 0.05), vec3(0.22, 0.17, 0.15), n), a);
  }`;

function pool(scene, n, frag, blending, stretch) {
  const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), d = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  pos.setUsage(THREE.DynamicDrawUsage); d.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iPos', pos); g.setAttribute('iD', d); g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { uTime: { value: 0 }, uStretch: { value: stretch } },
    transparent: true, depthWrite: false, blending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
  return { g, pos, d, m, mesh, n, p: [] };
}

export class Feuer {
  constructor(scene) {
    this.fl = pool(scene, 140, FLAME_FRAG, THREE.AdditiveBlending, 0.9);
    this.sm = pool(scene, 40, SMOKE_FRAG, THREE.NormalBlending, 1.6);
    this.t = 0;
  }

  /**
   * burn = 0 … 1 (wie stark er brennt), quellen = Weltpunkte am Körper (Knochen), groesse = Grundgröße der Flammen (m),
   * vel = Bewegung des Körpers (Vector2 x/z) – Flammen werden etwas mitgezogen und wehen nach hinten.
   */
  update(dt, burn, quellen, groesse, vel) {
    this.t += dt;
    const spawn = (P, rate, mk) => {
      P.acc = (P.acc || 0) + dt * rate;
      while (P.acc >= 1 && P.p.length < P.n) { P.acc -= 1; P.p.push(mk()); }
      if (P.acc > 1) P.acc = 1;
    };
    const src = () => quellen[Math.floor(Math.random() * quellen.length)];
    const vx = vel ? vel.x : 0, vz = vel ? vel.y : 0;
    if (burn > 0.02 && quellen.length) {
      spawn(this.fl, 95 * burn, () => { const q = src();
        return { x: q.x + (Math.random() - 0.5) * 1.1, y: q.y + (Math.random() - 0.3) * 0.6, z: q.z + (Math.random() - 0.5) * 1.1,
          vx: vx * 0.55 + (Math.random() - 0.5) * 0.4, vy: 1.3 + Math.random() * 1.6, vz: vz * 0.55 + (Math.random() - 0.5) * 0.4,
          age: 0, life: 0.45 + Math.random() * 0.4, size: groesse * (0.7 + Math.random() * 0.7) * (0.55 + 0.45 * burn), seed: Math.random(), w: 0.55 + Math.random() * 0.25 }; });
      spawn(this.sm, 14 * burn, () => { const q = src();
        return { x: q.x + (Math.random() - 0.5) * 0.8, y: q.y + 1.2 + Math.random() * 0.8, z: q.z + (Math.random() - 0.5) * 0.8,
          vx: vx * 0.3 + (Math.random() - 0.5) * 0.3, vy: 1.0 + Math.random() * 0.7, vz: vz * 0.3 + (Math.random() - 0.5) * 0.3,
          age: 0, life: 1.6 + Math.random() * 1.2, size: groesse * (1.1 + Math.random() * 0.8), seed: Math.random(), w: 1.0 }; });
    }
    for (const P of [this.fl, this.sm]) {
      let k = 0;
      for (const f of P.p) {
        f.age += dt / f.life; if (f.age >= 1) continue;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vx += Math.sin(this.t * 4 + f.seed * 30) * dt * 0.8;
        P.pos.setXYZ(k, f.x, f.y, f.z); P.d.setXYZW(k, f.age, f.size, f.seed, f.w); P.p[k++] = f;
      }
      P.p.length = k; P.g.instanceCount = k;
      P.pos.needsUpdate = true; P.d.needsUpdate = true; P.m.uniforms.uTime.value = this.t;
    }
  }
}
