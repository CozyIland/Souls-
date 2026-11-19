// Bildfilter: Leuchten (Bloom) um Feuer und Glut, dann Farbstimmung, Vignette und leichtes Filmkorn.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const Grade = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.42 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.08);                                  // etwas kräftiger
      c = mix(c, c * vec3(0.9, 0.95, 1.12), smoothstep(0.45, 0.0, l) * 0.55); // Schatten leicht kühl (Anime-Kontrast)
      c = mix(c, c * vec3(1.06, 1.0, 0.92), smoothstep(0.45, 0.9, l) * 0.5);  // Licht warm
      c = (c - 0.5) * 1.06 + 0.5;                                 // Kontrast
      vec2 d = vUv - 0.5; d.x *= 1.3;
      c *= 1.0 - uVig * smoothstep(0.25, 0.85, length(d));         // Vignette
      c += (h(vUv * 913.0 + uTime) - 0.5) * 0.025;                 // Filmkorn
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera, opt = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const comp = new EffectComposer(renderer, rt);
  comp.addPass(new RenderPass(scene, camera));
  // Umgebungsverdeckung: dunkelt Ecken, Fugen, Nischen und Kontaktstellen ab (am PC; am Handy zu teuer)
  let ao = null;
  if (opt.ao) {
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.85;
    ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.2, thickness: 1.5, scale: 1.2, samples: 12 });
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.6, 0.82);
  comp.addPass(bloom);
  comp.addPass(new OutputPass());
  const grade = new ShaderPass(Grade);
  comp.addPass(grade);
  return {
    render(t) { grade.uniforms.uTime.value = t % 10; comp.render(); },
    setSize(w, h) { comp.setSize(w, h); },
    setPixelRatio(r) { comp.setPixelRatio(r); },
  };
}
