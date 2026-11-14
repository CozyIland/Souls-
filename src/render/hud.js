// HUD als 2D-Ebene über dem 3D-Bild: Balken, Heiltränke, Boss-Leiste, Banner, schwebende Texte.
import * as THREE from 'three';
import { PX, TAU, clamp, isTouch } from '../util.js';
import { G, P, B } from '../game.js';

export class Hud {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.safeEl = document.getElementById('safe');
    this.safe = { t: 0, r: 0, b: 0, l: 0 };
    this.v = new THREE.Vector3();
    this.resize();
  }

  resize() {
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = Math.round(this.W * this.DPR);
    this.cv.height = Math.round(this.H * this.DPR);
    const s = getComputedStyle(this.safeEl);
    this.safe.t = parseFloat(s.paddingTop) || 0; this.safe.r = parseFloat(s.paddingRight) || 0;
    this.safe.b = parseFloat(s.paddingBottom) || 0; this.safe.l = parseFloat(s.paddingLeft) || 0;
  }

  draw(camera) {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);

    // Vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (G.state === 'menu' || !P) return;

    // Wenig Leben: roter Puls am Rand
    if (P.hp < 35 && P.state !== 'dead') {
      const pulse = ((35 - P.hp) / 35) * (0.25 + 0.15 * Math.sin(G.time * 6));
      const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      rg.addColorStop(0, 'rgba(120,0,0,0)'); rg.addColorStop(1, `rgba(140,0,0,${pulse})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }

    this.drawTexts(camera);
    this.drawBars();
    this.drawBanners();
  }

  /** Schwebende Texte (Schaden, „Verzögerter Schlag“ …) an ihrer 3D-Position */
  drawTexts(camera) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const t of G.texts) {
      this.v.set(t.x / PX, t.h / PX, t.y / PX).project(camera);
      if (this.v.z > 1 || this.v.z < -1) continue;
      const sx = (this.v.x + 1) / 2 * this.W, sy = (1 - this.v.y) / 2 * this.H;
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2.5);
      ctx.font = `italic ${Math.round(t.size * 1.15)}px Georgia, serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(t.txt, sx + 1.5, sy + 1.5);
      ctx.fillStyle = `rgb(${t.col})`; ctx.fillText(t.txt, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  bar(x, y, w, h, frac, lag, col, lagCol) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#1a1210'; ctx.fillRect(x, y, w, h);
    if (lag > frac) { ctx.fillStyle = lagCol; ctx.fillRect(x, y, w * lag, h); }
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w * Math.max(0, frac), h);
    ctx.strokeStyle = 'rgba(217,181,108,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  }

  drawBars() {
    const ctx = this.ctx, p = P, b = B, W = this.W, H = this.H, safe = this.safe;
    const x = 16 + safe.l, y = 16 + safe.t;
    const bw = Math.min(250, W * 0.42);
    G.hpLag = Math.max(p.hp / p.maxHp, G.hpLag - 0.004);
    this.bar(x, y, bw, 11, p.hp / p.maxHp, G.hpLag, ['#c83a2c', '#7a1810'], '#d9b56c');
    this.bar(x, y + 18, bw * 0.85, 7, p.st / p.maxSt, 0, ['#5fa05a', '#2c5a28'], '#000');
    // Heiltränke
    for (let i = 0; i < 3; i++) {
      const fx = x + 8 + i * 22, fy = y + 44, full = i < p.flasks;
      ctx.fillStyle = full ? '#e6a33a' : 'rgba(80,60,40,0.6)';
      ctx.beginPath(); ctx.arc(fx, fy, 7, 0, TAU); ctx.fill();
      ctx.fillRect(fx - 2.5, fy - 13, 5, 7);
      if (full) { ctx.fillStyle = 'rgba(255,240,200,0.7)'; ctx.beginPath(); ctx.arc(fx - 2, fy - 2, 2, 0, TAU); ctx.fill(); }
    }
    // Runde
    ctx.textAlign = 'right'; ctx.font = '14px Georgia, serif'; ctx.fillStyle = 'rgba(217,181,108,0.85)';
    ctx.fillText(`Runde ${G.round}`, W - 64 - safe.r, 28 + safe.t);
    // Boss-Leiste
    const bbw = Math.min(W * 0.62, 620);
    const bx = (W - bbw) / 2, by = isTouch ? 92 + safe.t : H - 46 - safe.b;
    G.bossLag = Math.max(b.hp / b.maxHp, G.bossLag - 0.003);
    ctx.textAlign = 'left'; ctx.font = `${isTouch ? 13 : 16}px Georgia, serif`; ctx.fillStyle = '#e8dcc0';
    ctx.fillText('Vargoth, der Lernende', bx, by - 7);
    this.bar(bx, by, bbw, isTouch ? 8 : 10, b.hp / b.maxHp, G.bossLag, b.phase2 ? ['#d8401f', '#7a1608'] : ['#a8281c', '#5c1009'], '#d9b56c');
  }

  drawBanners() {
    const ctx = this.ctx, W = this.W, H = this.H;
    if (G.state === 'intro') {
      const k = G.introT, a = clamp(Math.min((3 - k) * 2, k * 1.5), 0, 1);
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, H * 0.4, 0, H * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.38, W, H * 0.24);
      ctx.textAlign = 'center'; ctx.fillStyle = '#d9b56c'; ctx.font = `${Math.min(40, W / 12)}px Georgia, serif`;
      ctx.fillText(`R U N D E   ${G.round}`, W / 2, H * 0.48);
      ctx.font = `italic ${Math.min(18, W / 26)}px Georgia, serif`; ctx.fillStyle = '#d2a679';
      ctx.fillText(`„${G.quote}"`, W / 2, H * 0.48 + 34);
      ctx.globalAlpha = 1;
    }
    if (G.state === 'ending') {
      const a = Math.min(1, G.endTimer / 1.2);
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, H * 0.4, 0, H * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.4, W, H * 0.2);
      ctx.textAlign = 'center';
      const fs = Math.min(56, W / 11);
      ctx.font = `${fs}px Georgia, serif`;
      ctx.fillStyle = G.result ? '#e2c27a' : '#a3201a';
      ctx.save(); ctx.translate(W / 2, H / 2 + fs * 0.35); ctx.scale(1 + G.endTimer * 0.02, 1 + G.endTimer * 0.02);
      ctx.fillText(G.result ? 'FEIND BEZWUNGEN' : 'DU BIST GESTORBEN', 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
}
