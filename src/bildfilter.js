// Bildfilter: Leuchten (Bloom) um Feuer und Glut, dann Schärfen, Farbstimmung, Vignette und ein Hauch Filmkorn.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const Grade = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.36 },
    uPx: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uSharp: { value: 0.45 }, uSat: { value: 0.96 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform vec2 uPx; uniform float uSharp; uniform float uSat; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // Nachschärfen (kontrastabhängig wie AMD-CAS): Kanten und Texturen klarer, ohne helle Säume an harten Kanten
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uPx.y)).rgb, s = texture2D(tDiffuse, vUv - vec2(0.0, uPx.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(uPx.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(uPx.x, 0.0)).rgb;
      vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
      float amt = uSharp * clamp(1.0 - (mx.g - mn.g) * 2.2, 0.15, 1.0);   // starke Kanten weniger (sonst Ringe)
      c = clamp(c + (c * 4.0 - (n + s + e + w)) * amt * 0.25, mn, mx);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);                                  // Sättigung (die neutrale Farbumrechnung ist schon kräftig)
      c = mix(c, c * vec3(0.93, 0.96, 1.08), smoothstep(0.45, 0.0, l) * 0.4); // Schatten leicht kühl (Anime-Kontrast)
      c = mix(c, c * vec3(1.05, 1.0, 0.93), smoothstep(0.45, 0.9, l) * 0.45); // Licht warm
      c = (c - 0.5) * 1.04 + 0.5;                                 // Kontrast
      vec2 d = vUv - 0.5; d.x *= 1.3;
      c *= 1.0 - uVig * smoothstep(0.3, 0.9, length(d));          // Vignette
      c += (h(vUv * 913.0 + uTime) - 0.5) * 0.01;                 // Filmkorn (nur ein Hauch – sonst wirkt alles unsauber)
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera, opt = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const comp = new EffectComposer(renderer, rt);
  comp.addPass(new RenderPass(scene, camera));
  // Umgebungsverdeckung: dunkelt Ecken, Fugen, Nischen und Kontaktstellen ab (am PC; am Handy zu teuer).
  // Kleiner Radius: nur echte Ecken/Kontakte – mit großem Radius wurden ganze Flächen großer Figuren (Boss) schwarz.
  let ao = null;
  if (opt.ao) {
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.75;
    ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.2, thickness: 0.8, scale: 1.1, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    // nur feste, undurchsichtige Teile zählen (Sprites, Durchsichtiges und Anime-Umrisse würden schwarze Flecken machen)
    const base = ao.overrideVisibility.bind(ao);
    ao.overrideVisibility = () => {
      base();
      scene.traverse((o) => {
        const m = o.material;
        if (o.isSprite || (m && !Array.isArray(m) && (m.transparent || (m.isMeshBasicMaterial && m.side === THREE.BackSide)))) o.visible = false;
      });
    };
    comp.addPass(ao);
  }
  // Leuchten: enger Schein um Feuer/Glut (großer Radius legte einen Schleier über das ganze Bild)
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.38, 0.85);
  comp.addPass(bloom);
  comp.addPass(new OutputPass());
  const grade = new ShaderPass(Grade);
  comp.addPass(grade);
  const px = () => { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); grade.uniforms.uPx.value.set(1 / Math.max(1, s.x), 1 / Math.max(1, s.y)); };
  px();
  return {
    comp, ao, bloom, grade,
    render(t) { grade.uniforms.uTime.value = t % 10; comp.render(); },
    setSize(w, h) { comp.setSize(w, h); px(); },
    setPixelRatio(r) { comp.setPixelRatio(r); px(); },
  };
}
