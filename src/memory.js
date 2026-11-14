// Das Gedächtnis des Bosses: bleibt zwischen Runden und Besuchen erhalten (localStorage).
import { clamp } from './util.js';

const MEM_KEY = 'der-lernende-boss-v1';

export function freshMem() {
  return {
    rounds: 0, wins: 0, losses: 0,
    atk: { slash: { u: 0, h: 0 }, combo: { u: 0, h: 0 }, sweep: { u: 0, h: 0 }, charge: { u: 0, h: 0 }, slam: { u: 0, h: 0 }, orbs: { u: 0, h: 0 } },
    react: { sum: 0, n: 0 },
    dir: { left: 0, right: 0, back: 0, toward: 0 },
    distSum: 0, distN: 0, behind: 0, time: 0,
    heals: 0, healsClose: 0, greedOpp: 0, greedHit: 0, rolls: 0,
  };
}

function deepMerge(base, m) {
  for (const k in base) {
    if (m && typeof m === 'object' && k in m) {
      if (typeof base[k] === 'object' && base[k] !== null) deepMerge(base[k], m[k]);
      else if (typeof m[k] === 'number' && isFinite(m[k])) base[k] = m[k];
    }
  }
  return base;
}

function loadMem() {
  try {
    const s = localStorage.getItem(MEM_KEY);
    if (s) return deepMerge(freshMem(), JSON.parse(s));
  } catch (e) { /* kein Speicher verfügbar */ }
  return freshMem();
}

export function saveMem() {
  try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) { /* ignorieren */ }
}

// Live-Bindungen: andere Module sehen immer den aktuellen Stand
export let mem = loadMem();
export let T = null;

// Gleitendes Fenster: alte Gewohnheiten verblassen, neue zählen mehr
export function capMem() {
  const scale = (obj, keys, cap, total) => { if (total > cap) { const f = cap / total; keys.forEach((k) => { obj[k] *= f; }); } };
  scale(mem.react, ['sum', 'n'], 40, mem.react.n);
  const dt = mem.dir.left + mem.dir.right + mem.dir.back + mem.dir.toward;
  scale(mem.dir, ['left', 'right', 'back', 'toward'], 50, dt);
  scale(mem, ['distSum', 'distN'], 300, mem.distN);
  scale(mem, ['time', 'behind', 'heals', 'healsClose', 'rolls'], 360, mem.time);
  scale(mem, ['greedOpp', 'greedHit'], 30, mem.greedOpp);
  for (const k in mem.atk) scale(mem.atk[k], ['u', 'h'], 25, mem.atk[k].u);
}

const conf = (n, k) => n / (n + k);

// Aus den Rohdaten werden "Erkenntnisse" (0..1)
export function traits() {
  const t = {};
  t.avgFrac = mem.react.n ? mem.react.sum / mem.react.n : 1;
  t.feint = clamp((0.82 - t.avgFrac) * 2.4, 0, 0.75) * conf(mem.react.n, 5);
  const d = mem.dir, lr = d.left + d.right, tot = lr + d.back + d.toward;
  t.lrBias = lr ? (d.right - d.left) / lr : 0;
  t.aimSide = clamp(Math.abs(t.lrBias) * 1.4, 0, 1) * conf(lr, 6) * Math.sign(t.lrBias);
  t.backShare = tot ? d.back / tot : 0;
  t.back = tot ? clamp((t.backShare - 0.25) * 1.7, 0, 1) * conf(tot, 6) : 0;
  const mins = Math.max(mem.time / 60, 0.3);
  t.healRate = mem.heals / mins;
  t.healPunish = clamp(t.healRate / 2.2, 0, 1) * conf(mem.heals, 3) * 0.85;
  t.greedShare = mem.greedOpp ? mem.greedHit / mem.greedOpp : 0;
  t.greed = clamp(t.greedShare * 1.4, 0, 0.85) * conf(mem.greedOpp, 6);
  t.behindShare = mem.time ? mem.behind / mem.time : 0;
  t.behind = clamp(t.behindShare * 2.8, 0, 1) * conf(mem.time, 30);
  t.avgDist = mem.distN ? mem.distSum / mem.distN : 200;
  t.far = clamp((t.avgDist - 190) / 180, 0, 1) * conf(mem.distN, 20);
  t.rollRate = mem.rolls / mins;
  t.rollSpam = clamp((t.rollRate - 12) / 18, 0, 1) * conf(mem.rolls, 10);
  t.eff = {};
  for (const k in mem.atk) {
    const s = mem.atk[k];
    t.eff[k] = { e: (s.h + 1) / (s.u + 3), c: conf(s.u, 4), u: s.u, h: s.h };
  }
  return t;
}

export function updateTraits() { T = traits(); return T; }

export function resetMemory() {
  mem = freshMem();
  saveMem();
  updateTraits();
}

updateTraits();
