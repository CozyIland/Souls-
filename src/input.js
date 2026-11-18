// Eingabe: Xbox-Controller (Hauptsteuerung), dazu Tastatur + Maus.
// Jedes Bild poll(dt) aufrufen; danach stehen Bewegung, Kamera und „gerade gedrückt“-Ereignisse in `inp`.
//
// Controller (Belegung „standard“): A 0 · B 1 · X 2 · Y 3 · LB 4 · RB 5 · LT 6 · RT 7 · View 8 · Start 9 · L3 10 · R3 11 · Steuerkreuz 12–15
// B tippen = Rolle, B halten = Rennen (wie in Dark Souls).

export const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export const inp = {
  mx: 0, my: 0,        // Bewegung (Stick-Richtung, oben = my negativ)
  cx: 0, cy: 0,        // Kamera (Stick bzw. Maus)
  run: false,          // Rennen gehalten
  roll: false,         // Rolle (gerade ausgelöst)
  lock: false,         // Zielerfassung umschalten
  flick: 0,            // Ziel wechseln (−1 links / +1 rechts)
  pause: false, confirm: false, back: false,
  nav: 0,              // Menü hoch/runter
  pad: false,          // Controller zuletzt benutzt?
};

const keys = {};
const kHit = {};
let mdx = 0, mdy = 0;
let prev = [];
let bHeld = 0, bRun = false, flickReady = true, navT = 0;
const ROLL_TAP = 0.28; // B kürzer als das = Rolle, länger = Rennen

export function setupInput(canvas, wantPointerLock) {
  window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) kHit[e.code] = true;
    keys[e.code] = true;
    inp.pad = false;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; inp.pad = false; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (wantPointerLock() && document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (err) { /* egal */ } }
    if (e.button === 1) { kHit.Mouse1 = true; e.preventDefault(); }
  });
}

function firstPad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of list) if (g && g.connected) return g;
  return null;
}

/** Controller rütteln lassen (stark/schwach 0..1, Dauer ms) */
export function rumble(strong, weak, ms) {
  const g = firstPad(), a = g && g.vibrationActuator;
  if (!a || !a.playEffect) return;
  try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {}); } catch (e) { /* egal */ }
}

const dz = (v, d = 0.16) => (Math.abs(v || 0) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

export function poll(dt) {
  inp.roll = inp.lock = inp.pause = inp.confirm = inp.back = false;
  inp.flick = 0; inp.nav = 0;
  let mx = 0, my = 0, cx = 0, cy = 0, run = false;

  // ---------- Tastatur & Maus ----------
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.ShiftLeft || keys.ShiftRight) run = true;
  if (kHit.Space) inp.roll = true;
  if (kHit.KeyQ || kHit.Mouse1) inp.lock = true;
  if (kHit.Escape || kHit.KeyP) inp.pause = true;
  if (kHit.Enter || kHit.Space) inp.confirm = true;
  if (kHit.Escape) inp.back = true;
  if (kHit.ArrowUp || kHit.KeyW) inp.nav = -1;
  if (kHit.ArrowDown || kHit.KeyS) inp.nav = 1;
  cx += mdx * 0.0035; cy += mdy * 0.0035; // Maus: direkt als Winkel
  mdx = mdy = 0;
  for (const k in kHit) delete kHit[k];

  // ---------- Controller ----------
  const g = firstPad();
  if (g) {
    const now = g.buttons.map((b) => b.pressed || b.value > 0.4);
    const was = prev;
    const hit = (i) => now[i] && !was[i];
    prev = now;
    if (now.some(Boolean) || g.axes.some((a) => Math.abs(a) > 0.3)) inp.pad = true;
    const lx = dz(g.axes[0]), ly = dz(g.axes[1]), rx = dz(g.axes[2], 0.2), ry = dz(g.axes[3], 0.2);
    mx += lx; my += ly;
    if (now[PB.LEFT]) mx -= 1;
    if (now[PB.RIGHT]) mx += 1;
    // Kamera: Stick ist eine Geschwindigkeit (rad/s)
    cx += rx * 3.2 * dt; cy += ry * 2.2 * dt;
    inp.rx = rx;
    // B: tippen = Rolle, halten = Rennen
    if (now[PB.B]) { bHeld += dt; if (bHeld > ROLL_TAP) bRun = true; }
    else { if (bHeld > 0 && !bRun) inp.roll = true; bHeld = 0; bRun = false; }
    if (bRun) run = true;
    if (hit(PB.R3)) inp.lock = true;
    if (hit(PB.START)) inp.pause = true;
    if (hit(PB.A)) inp.confirm = true;
    if (hit(PB.B)) inp.back = true;
    // Ziel wechseln: rechten Stick zur Seite schnippen
    if (Math.abs(rx) > 0.75 && flickReady) { inp.flick = Math.sign(rx); flickReady = false; }
    if (Math.abs(rx) < 0.3) flickReady = true;
    // Menü-Navigation
    navT -= dt;
    if (hit(PB.UP)) inp.nav = -1;
    else if (hit(PB.DOWN)) inp.nav = 1;
    else if (Math.abs(ly) > 0.6 && navT <= 0) { inp.nav = Math.sign(ly); navT = 0.3; }
    if (Math.abs(ly) < 0.3) navT = 0;
  } else { prev = []; bHeld = 0; bRun = false; }

  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  inp.mx = mx; inp.my = my; inp.cx = cx; inp.cy = cy; inp.run = run;
}
