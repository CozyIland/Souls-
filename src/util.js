// Kleine Hilfsfunktionen, die überall gebraucht werden.

export const TAU = Math.PI * 2;
export const ARENA_R = 560;      // Arena-Radius in Spiel-Einheiten (Pixel des Originals)
export const PX = 40;            // 40 Spiel-Einheiten = 1 Meter in der 3D-Welt
export const isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const turnToward = (a, target, step) => a + clamp(angDiff(a, target), -step, step);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
export const easeOut = (k) => 1 - (1 - k) * (1 - k);
