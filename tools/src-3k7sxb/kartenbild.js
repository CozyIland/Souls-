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
