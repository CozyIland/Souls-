// Bildfilter: Leuchten (Bloom) um Feuer und Glut, dann Farbstimmung, Vignette und leichtes Filmkorn.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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
      c = mix(c, c * vec3(1.04, 0.98, 0.92), smoothstep(0.5, 0.0, l) * 0.6); // Schatten leicht warm-braun
      c = (c - 0.5) * 1.06 + 0.5;                                 // Kontrast
      vec2 d = vUv - 0.5; d.x *= 1.3;
      c *= 1.0 - uVig * smoothstep(0.25, 0.85, length(d));         // Vignette
      c += (h(vUv * 913.0 + uTime) - 0.5) * 0.025;                 // Filmkorn
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const comp = new EffectComposer(renderer, rt);
  comp.addPass(new RenderPass(scene, camera));
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
