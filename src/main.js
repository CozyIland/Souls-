// Einstiegspunkt: baut die 3D-Welt auf und startet die Spielschleife.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { isTouch } from './util.js';
import { setupInput, readMove, pollPad } from './input.js';
import { G, update, updateMenu } from './game.js';
import { setupUi, showMenu, showSummary, togglePause } from './ui.js';
import { Arena } from './render/arena3d.js';
import { BossView } from './render/boss3d.js';
import { PlayerView } from './render/player3d.js';
import { Effects } from './render/fx3d.js';
import { LockOnCamera } from './render/camera3d.js';
import { Hud } from './render/hud.js';

// ---------- Renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);

// ---------- Welt ----------
const arena = new Arena(scene, renderer);
const boss = new BossView(scene);
const player = new PlayerView(scene, new GLTFLoader());
const fx = new Effects(scene);
const camCtl = new LockOnCamera(camera);
const hud = new Hud(document.getElementById('hud'));

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  hud.resize();
}
window.addEventListener('resize', resize);
resize();

// ---------- Eingabe & Menüs ----------
setupInput(canvas, {
  isTouch,
  isMenu: () => G.state === 'menu',
  isPaused: () => G.paused,
  togglePause,
});
setupUi();
showMenu();

// ---------- Spielschleife ----------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  pollPad(dt);

  if (G.state === 'menu') {
    updateMenu(dt);
  } else if (!G.paused) {
    if (G.hitstop > 0) { G.hitstop -= dt; G.time += dt; }
    else { readMove(camCtl.fx, camCtl.fy); update(dt); }
  }
  if (G.state === 'ending' && G.endTimer > 3.4 && !G.summaryShown) showSummary();

  camCtl.update(dt);
  arena.update(dt);
  boss.update(dt);
  player.update(dt, camera);
  fx.update(camera, renderer);
  renderer.render(scene, camera);
  hud.draw(camera);
}
requestAnimationFrame(frame);
