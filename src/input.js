// Eingabe: Tastatur, Maus und Touch (Joystick + Knöpfe).
// Bewegung wird relativ zur Kamera umgerechnet: „vorwärts“ = in Blickrichtung.
import { norm } from './util.js';
import { initAudio } from './audio.js';

export const keys = {};
export const input = { mx: 0, my: 0, buf: null, bufT: 0, jx: 0, jy: 0 };

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
  x += input.jx; y += input.jy;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  // vorwärts = -y, rechts = x
  const rx = -fy, ry = fx;
  input.mx = fx * -y + rx * x;
  input.my = fy * -y + ry * x;
}
