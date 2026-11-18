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
  touch: false,        // Touchscreen zuletzt benutzt?
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
    inp.pad = false; inp.touch = false;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; inp.pad = false; inp.touch = false; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (inp.touch || performance.now() - lastTouch < 1500) return; // Touch löst auch Maus-Ereignisse aus
    if (wantPointerLock() && document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (err) { /* egal */ } }
    if (e.button === 1) { kHit.Mouse1 = true; e.preventDefault(); }
  });
  setupTouch(canvas);
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
    if (now.some(Boolean) || g.axes.some((a) => Math.abs(a) > 0.3)) { inp.pad = true; inp.touch = false; }
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

  // ---------- Touch ----------
  if (T.joy) { mx += T.jx; my += T.jy; }
  cx += T.dx * 0.0065; cy += T.dy * 0.0055; T.dx = T.dy = 0;
  if (T.flick) { inp.flick = T.flick; T.flick = 0; }
  if (T.roll && performance.now() - T.rollT0 > ROLL_TAP * 1000) T.run = true;
  if (T.rollTap) { inp.roll = true; T.rollTap = false; }
  if (T.run) run = true;
  if (T.lock) { inp.lock = true; T.lock = false; }
  if (T.pause) { inp.pause = true; T.pause = false; }

  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  inp.mx = mx; inp.my = my; inp.cx = cx; inp.cy = cy; inp.run = run;
}

// ---------- Handy-Steuerung ----------
// Linke Bildhälfte: Stick erscheint dort, wo der Daumen aufsetzt. Rechte Hälfte: wischen = Kamera drehen,
// (mit erfasstem Ziel: kurz zur Seite wischen = Ziel wechseln). Knöpfe: Rolle (tippen) / Rennen (halten), Ziel, Pause.
const T = { joy: null, jx: 0, jy: 0, cam: null, dx: 0, dy: 0, flick: 0, roll: false, rollT0: 0, rollTap: false, run: false, lock: false, pause: false };
let lastTouch = 0;
const JOY_R = 60;

function setupTouch(canvas) {
  const $ = (id) => document.getElementById(id);
  const base = $('joyBase'), knob = $('joyKnob');
  const mark = () => { inp.touch = true; inp.pad = false; lastTouch = performance.now(); document.body.classList.add('touch'); };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    mark();
    if (e.clientX < window.innerWidth * 0.45) {
      if (T.joy) return;
      T.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      T.jx = T.jy = 0;
      if (base) { base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)'; }
    } else {
      if (T.cam) return;
      T.cam = { id: e.pointerId, lx: e.clientX, ly: e.clientY, sx: e.clientX, t0: performance.now() };
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') return;
    if (T.joy && e.pointerId === T.joy.id) {
      let dx = e.clientX - T.joy.ox, dy = e.clientY - T.joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > JOY_R) { // Stick wandert mit, wenn der Daumen weiter rutscht
        T.joy.ox += dx * (1 - JOY_R / l); T.joy.oy += dy * (1 - JOY_R / l);
        dx *= JOY_R / l; dy *= JOY_R / l;
        if (base) { base.style.left = T.joy.ox + 'px'; base.style.top = T.joy.oy + 'px'; }
      }
      const k = Math.hypot(dx, dy) / JOY_R, dead = 0.12;
      const s = k < dead ? 0 : (k - dead) / (1 - dead) / k; // Totzone in der Mitte
      T.jx = (dx / JOY_R) * s; T.jy = (dy / JOY_R) * s;
      if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (T.cam && e.pointerId === T.cam.id) {
      T.dx += e.clientX - T.cam.lx; T.dy += e.clientY - T.cam.ly;
      T.cam.lx = e.clientX; T.cam.ly = e.clientY;
    }
  });
  const up = (e) => {
    if (T.joy && e.pointerId === T.joy.id) { T.joy = null; T.jx = T.jy = 0; if (base) base.classList.remove('on'); }
    if (T.cam && e.pointerId === T.cam.id) {
      const dx = e.clientX - T.cam.sx, dt = performance.now() - T.cam.t0;
      if (Math.abs(dx) > 50 && dt < 280) T.flick = Math.sign(dx); // schnelles Wischen = Ziel wechseln
      T.cam = null;
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // Knöpfe
  const btn = (id, down, upFn) => {
    const el = $(id); if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); mark(); el.classList.add('down'); down(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* egal */ } });
    const end = (e) => { if (!el.classList.contains('down')) return; e.preventDefault(); el.classList.remove('down'); if (upFn) upFn(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  btn('tRoll', () => { T.roll = true; T.rollT0 = performance.now(); }, () => { if (!T.run) T.rollTap = true; T.roll = false; T.run = false; });
  btn('tLock', () => { T.lock = true; });
  btn('tPause', () => { T.pause = true; });
  // Erste Berührung irgendwo: Handy-Modus an (auch im Titelbild)
  window.addEventListener('touchstart', mark, { passive: true });
}
