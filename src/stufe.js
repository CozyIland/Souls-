// Stufen-System wie in Souls-Spielen: Gegner geben Seelen, am Seelenstein steigt man mit Seelen eine Stufe auf und
// erhöht dabei einen Wert um 1. Stufe 1 … 20. Kosten: 50 → 100 → 200, danach je +50 % (gerundet auf 10).
// Werte: Ausdauer (Leben + Ausdauer), Stärke (Degen, vor allem schwer), Trickreich (leichte Schläge, Rolle), Magie (Karten).
// Dazu: ausgerüstete Karte (karte) und gefundene Karten (karten), Waffe in der Hand (waffe) und gefundene Waffen (waffen),
// Truhe in der Kartenstraße schon geöffnet (truhe). Der Stand wird im Browser gespeichert (falls erlaubt) – Truhe und Waffen aber
// nicht: bei jedem Start ist die Truhe zu und man hat nur den Stockdegen.
import { WAFFEN } from './waffen.js';

export const MAX_LV = 20;
export const BASE = 10;                       // Startwert jedes Werts
export const SOULS = { hund: 10, boss: 1500 };
export const STATS = [
  { k: 'aus', n: 'Ausdauer', icon: '❤', d: 'Mehr Leben und Ausdauer, mehr physischer Widerstand' },
  { k: 'str', n: 'Stärke', icon: '⚔', d: 'Mehr Waffenschaden (vor allem schwer) und Krit-Schaden' },
  { k: 'tri', n: 'Trickreich', icon: '✦', d: 'Schnellere Angriffe, höhere Krit-Chance, Rolle kostet weniger' },
  { k: 'mag', n: 'Magie', icon: '♠', d: 'Karten treffen härter, mehr Magie-Widerstand' },
];

/** Seelen, die man für den Aufstieg AUF Stufe lv braucht (lv 2 … 20) */
export function cost(lv) {
  if (lv <= 1 || lv > MAX_LV) return Infinity;
  if (lv === 2) return 50;
  if (lv === 3) return 100;
  if (lv === 4) return 200;
  return Math.round(200 * Math.pow(1.5, lv - 4) / 10) * 10;
}

const KEY = 'aschenblatt-stufe';
export class Werte {
  constructor() { this.reset(); this.load(); }
  reset() { this.souls = 0; this.s = { aus: BASE, str: BASE, tri: BASE, mag: BASE }; this.god = false; this.karte = 'herzass'; this.karten = ['herzass']; this.waffe = 'degen'; this.waffen = ['degen']; this.truhe = false; }
  /** Stufe = 1 + alle verteilten Punkte */
  get lv() { return 1 + STATS.reduce((n, x) => n + this.s[x.k] - BASE, 0); }
  get next() { return cost(this.lv + 1); }
  canUp() { return this.lv < MAX_LV && this.souls >= this.next; }
  /** am Seelenstein: einen Wert erhöhen (kostet Seelen) */
  levelUp(k) {
    if (!this.canUp() || !(k in this.s)) return false;
    this.souls -= this.next; this.s[k]++; this.save(); return true;
  }
  addSouls(n) { this.souls = Math.max(0, Math.round(this.souls + n)); this.save(); }
  /** Testmodus: Stufe direkt setzen – Punkte reihum auf die vier Werte verteilt */
  setLevel(lv) {
    lv = Math.max(1, Math.min(MAX_LV, lv));
    for (const x of STATS) this.s[x.k] = BASE;
    for (let i = 0; i < lv - 1; i++) this.s[STATS[i % STATS.length].k]++;
    this.save();
  }
  /** Testmodus: einen Wert frei verändern (Stufe bleibt im Rahmen 1 … 20) */
  bump(k, d) {
    const v = this.s[k] + d;
    if (v < BASE || (d > 0 && this.lv >= MAX_LV)) return false;
    this.s[k] = v; this.save(); return true;
  }
  /** Truhe geöffnet: Waffe gefunden */
  findWeapon(id) { if (!this.waffen.includes(id)) this.waffen.push(id); this.truhe = true; this.save(); }
  /** abgeleitete Werte für Spieler, Waffe und Karten (die Waffe in der Hand wirkt mit) */
  mods() {
    const a = this.s.aus - BASE, st = this.s.str - BASE, t = this.s.tri - BASE, m = this.s.mag - BASE, W = WAFFEN[this.waffe] || WAFFEN.degen;
    return {
      maxHp: 100 + 6 * a, maxSt: 100 + 5 * a,
      light: (1 + 0.035 * st + 0.05 * t) * W.light, heavy: (1 + 0.07 * st + 0.02 * t) * W.heavy, poise: (1 + 0.04 * st) * W.poise,
      roll: Math.max(0.6, 1 - 0.02 * t), atkCost: Math.max(0.7, 1 - 0.015 * t) * W.cost, range: W.range,
      card: 1 + 0.08 * m, cardCost: Math.max(0.55, 1 - 0.025 * m),
      // Kampfwerte (Charakterseite): Angriffstempo (Faktor auf die Schlag-Zeit), Krit-Chance/-Schaden, Widerstände (Anteil weniger Schaden)
      atkSpeed: Math.min(1.3, 1 + 0.015 * t), critC: Math.min(0.3, 0.05 + 0.005 * t), critD: 1.5 + 0.02 * st,
      resPhys: Math.min(0.4, 0.01 * a), resMag: Math.min(0.4, 0.015 * m),
    };
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ souls: this.souls, s: this.s, god: this.god, karte: this.karte, karten: this.karten, waffe: this.waffe, waffen: this.waffen, truhe: this.truhe })); } catch (e) { /* kein Speicher – egal */ } }
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.s) { this.souls = d.souls | 0; for (const x of STATS) this.s[x.k] = Math.max(BASE, d.s[x.k] | 0); this.god = !!d.god; }
      if (d && Array.isArray(d.karten)) this.karten = [...new Set(['herzass', ...d.karten.filter((k) => typeof k === 'string')])];
      if (d && typeof d.karte === 'string' && this.karten.includes(d.karte)) this.karte = d.karte;
      // Truhe und Waffen NICHT übernehmen: jedes Spiel beginnt mit geschlossener Truhe und nur dem Stockdegen
    } catch (e) { /* kaputter oder fehlender Speicher – neu anfangen */ }
  }
}
