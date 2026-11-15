// Eingabe: Tastatur, Maus, Touch (Joystick + Knöpfe) und Controller (Xbox / Gamepad).
// Bewegung wird relativ zur Kamera umgerechnet: „vorwärts“ = in Blickrichtung.
import { norm } from './util.js';
import { initAudio } from './audio.js';

export const keys = {};
export const input = { mx: 0, my: 0, buf: null, bufT: 0, jx: 0, jy: 0, gx: 0, gy: 0 };

export function press(a) {
  input.buf = a;
  input.bufT = 0.25;
  initAudio();
}

/**
 * hooks.canAct()  -> darf gerade gespielt werden?
 * hooks.isPaused() / hooks.togglePause()
 * hooks.isMenu()
 */
export function setupInput(canvas, hooks) {
  padHooks = hooks;
  window.addEventListener('gamepadconnected', () => padUi(true));
  window.addEventListener('gamepaddisconnected', () => { if (!firstPad()) padUi(false); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (hooks.isMenu()) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { hooks.togglePause(); return; }
    if (hooks.isPaused()) return;
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { press('roll'); e.preventDefault(); }
    else if (e.code === 'KeyJ') press('light');
    else if (e.code === 'KeyK') press('heavy');
    else if (e.code === 'KeyE' || e.code === 'KeyR') press('heal');
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (hooks.isMenu() || hooks.isPaused() || hooks.isTouch) return;
    if (e.button === 0) press('light');
    else if (e.button === 2) press('heavy');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch: Joystick erscheint dort, wo der Daumen aufsetzt
  const stickZone = document.getElementById('stickZone');
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  let stickId = null, sx0 = 0, sy0 = 0;
  stickZone.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId; sx0 = e.clientX; sy0 = e.clientY;
    stick.style.left = sx0 + 'px'; stick.style.top = sy0 + 'px'; stick.style.display = 'block';
    knob.style.transform = 'translate(0,0)';
    initAudio();
    try { stickZone.setPointerCapture(e.pointerId); } catch (err) { /* ignorieren */ }
  });
  stickZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx0, dy = e.clientY - sy0;
    const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx *= m / l; dy *= m / l; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const k = Math.min(1, l / m), n = norm(dx, dy);
    input.jx = l > 6 ? n.x * k : 0;
    input.jy = l > 6 ? n.y * k : 0;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; input.jx = 0; input.jy = 0; stick.style.display = 'none';
  };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);

  document.querySelectorAll('.tb').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (hooks.isPaused()) return;
      btn.classList.add('on');
      press(btn.dataset.a);
    });
    const off = () => btn.classList.remove('on');
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });
}

/**
 * Liest die Bewegung und dreht sie in Kamerarichtung.
 * (fx, fy) = Blickrichtung der Kamera auf dem Boden (normiert).
 * Ergebnis input.mx / input.my ist eine Richtung in der Spielwelt.
 */
export function readMove(fx, fy) {
  let x = 0, y = 0;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyW || keys.ArrowUp) y -= 1;
  if (keys.KeyS || keys.ArrowDown) y += 1;
  x += input.jx + input.gx; y += input.jy + input.gy;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  // vorwärts = -y, rechts = x
  const rx = -fy, ry = fx;
  input.mx = fx * -y + rx * x;
  input.my = fy * -y + ry * x;
}

// ---------- Controller (Xbox / Gamepad) ----------
// Belegung wie in Souls-Spielen: linker Stick / Steuerkreuz laufen, B (oder A) Rolle, RB leichter Angriff,
// RT schwerer Angriff, X Heiltrank, Start Pause. In Menüs: Steuerkreuz / Stick wählen, A bestätigen, B zurück,
// rechter Stick blättert. Browser zeigen einen Controller erst nach dem ersten Tastendruck.
const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const pad = { prev: [], focus: 0, ov: null, navT: 0, guard: 0, on: false };
let padHooks = null;

function firstPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of list) if (g && g.connected) return g;
  return null;
}

/** Steuerungs-Hinweis im Hauptmenü: Controller-Belegung statt Tastatur/Touch */
function padUi(on) {
  pad.on = on;
  const c = document.getElementById('ctrlPad'), k = document.getElementById('ctrlKeys'), t = document.getElementById('ctrlTouch');
  if (!c) return;
  c.style.display = on ? 'grid' : 'none';
  if (on) { k.style.display = 'none'; t.style.display = 'none'; }
  else if (padHooks && padHooks.isTouch) t.style.display = 'grid';
  else k.style.display = 'grid';
}

/** Rütteln (wenn der Controller das kann); stark/schwach 0..1, Dauer in ms */
export function rumble(strong, weak, ms) {
  const g = pad.on ? firstPad() : null, a = g && g.vibrationActuator;
  if (!a || !a.playEffect) return;
  try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {}); } catch (e) { /* ignorieren */ }
}

/** Jedes Bild aufrufen (auch im Menü und in der Pause) */
export function pollPad(dt) {
  input.gx = 0; input.gy = 0;
  const gp = firstPad();
  if (!gp) { pad.prev = []; return; }
  if (!pad.on) padUi(true);
  const now = gp.buttons.map((b) => b.pressed || b.value > 0.4);
  const prev = pad.prev;
  const hit = (i) => now[i] && !prev[i];
  pad.prev = now;
  const dz = (v) => (Math.abs(v || 0) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
  const lx = dz(gp.axes[0]), ly = dz(gp.axes[1]), ry = dz(gp.axes[3]);
  if (now.some(Boolean)) initAudio();

  const ov = document.querySelector('.overlay.show');
  if (ov) { padMenu(ov, now, hit, ly, ry, dt); return; }
  if (pad.ov) { pad.ov.querySelectorAll('.padFocus').forEach((b) => b.classList.remove('padFocus')); pad.ov = null; }
  if (!padHooks || padHooks.isMenu()) return;
  if (hit(PB.START)) { padHooks.togglePause(); return; }
  if (padHooks.isPaused()) return;

  let x = lx, y = ly;
  if (now[PB.LEFT]) x -= 1;
  if (now[PB.RIGHT]) x += 1;
  if (now[PB.UP]) y -= 1;
  if (now[PB.DOWN]) y += 1;
  input.gx = x; input.gy = y;
  if (hit(PB.B) || hit(PB.A)) press('roll');
  else if (hit(PB.RB)) press('light');
  else if (hit(PB.RT)) press('heavy');
  else if (hit(PB.X)) press('heal');
}

/** Menüs mit dem Controller: Knopf wählen und drücken */
function padMenu(ov, now, hit, ly, ry, dt) {
  const btns = [...ov.querySelectorAll('.btn')].filter((b) => b.offsetParent !== null);
  // Nach einer Runde kurz warten, damit Hämmern auf A die Zusammenfassung nicht überspringt
  if (pad.ov !== ov) { pad.ov = ov; pad.focus = 0; pad.navT = 0; pad.guard = performance.now() + (ov.id === 'summary' ? 800 : 0); }
  pad.navT -= dt;
  if (ry) ov.scrollTop += ry * dt * 700;
  if (!btns.length) return;
  pad.focus = Math.min(pad.focus, btns.length - 1);
  let dir = 0;
  if (hit(PB.UP) || hit(PB.LEFT)) dir = -1;
  else if (hit(PB.DOWN) || hit(PB.RIGHT)) dir = 1;
  else if (Math.abs(ly) > 0.6 && pad.navT <= 0) { dir = Math.sign(ly); pad.navT = 0.3; }
  if (Math.abs(ly) < 0.3) pad.navT = 0;
  if (dir) pad.focus = (pad.focus + dir + btns.length) % btns.length;
  btns.forEach((b, i) => b.classList.toggle('padFocus', i === pad.focus));
  if (dir) btns[pad.focus].scrollIntoView({ block: 'nearest' });
  if (performance.now() < pad.guard) return;
  if (ov.id === 'pause' && (hit(PB.B) || hit(PB.START))) { padHooks.togglePause(); return; }
  if (hit(PB.A) || hit(PB.START)) btns[pad.focus].click();
}
