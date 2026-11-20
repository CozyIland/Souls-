// Spielkarten-Bilder (Canvas): Vorderseite mit Farbe, Rückseite dunkelrot mit Goldmuster.
import * as THREE from 'three';

export const CARD_W = 0.09, CARD_H = 0.13;

function canvasCard(draw) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96;
  draw(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const cache = {};
export function cardFront(suit) {
  if (cache[suit]) return cache[suit];
  if (suit.length > 1) return (cache[suit] = canvasCard((g) => { // Ass aus dem Inventar: angesengtes Papier, „A“ in den Ecken
    const pip = suit.slice(1), col = pip === '♥' || pip === '♦' ? '#b3141c' : '#15121a';
    const gr = g.createRadialGradient(32, 48, 10, 32, 48, 56); gr.addColorStop(0, '#f6ead2'); gr.addColorStop(0.7, '#d9bf92'); gr.addColorStop(1, '#3a1c0c');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 96);
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 34px serif'; g.fillText(pip, 32, 50);
    g.font = 'bold 13px serif'; g.fillText('A', 10, 11); g.fillText(pip, 10, 23);
    g.save(); g.translate(54, 85); g.rotate(Math.PI); g.fillText('A', 0, 0); g.fillText(pip, 0, 12); g.restore();
    g.strokeStyle = 'rgba(255,120,30,0.8)'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 94);
  }));
  const col = suit === '♥' || suit === '♦' ? '#a3161a' : '#15121a';
  return (cache[suit] = canvasCard((g) => {
    g.fillStyle = '#f1e6cc'; g.fillRect(0, 0, 64, 96);
    g.strokeStyle = '#b58a3a'; g.lineWidth = 2; g.strokeRect(4, 4, 56, 88);
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 40px serif'; g.fillText(suit, 32, 50);
    g.font = 'bold 16px serif'; g.fillText(suit, 13, 14); g.fillText(suit, 51, 82);
  }));
}
export const CARD_BACK = canvasCard((g) => {
  g.fillStyle = '#5a0f14'; g.fillRect(0, 0, 64, 96);
  g.strokeStyle = '#d4a548'; g.lineWidth = 3; g.strokeRect(5, 5, 54, 86);
  g.lineWidth = 1.2;
  for (let i = -96; i < 96; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 96, 96); g.moveTo(i + 96, 0); g.lineTo(i, 96); g.stroke(); }
  g.fillStyle = '#d4a548'; g.beginPath(); g.arc(32, 48, 9, 0, Math.PI * 2); g.fill();
});
