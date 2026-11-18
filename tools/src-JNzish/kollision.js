// Kollision über einfache Rechtecke (AABB) und Strahl-Blocker für die Kamera.
export const colliders = []; // {x0, x1, z0, z1}
export const blockers = [];  // unsichtbare Kästen der Häuser: die Kamera fährt nicht hindurch

export function block(x, z, w, d) { colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); }

/** Gedrehtes Rechteck grob als Kette von Quadraten eintragen */
export function blockRot(x, z, w, len, rot) {
  const c = Math.cos(rot), s = Math.sin(rot), n = Math.max(1, Math.round(len / w));
  for (let i = 0; i < n; i++) { const k = (i + 0.5) / n * len - len / 2; block(x + s * k, z + c * k, w, w); }
}

/** Kreis (x, z, r) aus allen Hindernissen herausschieben */
export function resolve(p, r) {
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else {
      const m = [p.x - c.x0, c.x1 - p.x, p.z - c.z0, c.z1 - p.z], i = m.indexOf(Math.min(...m));
      if (i === 0) p.x = c.x0 - r; else if (i === 1) p.x = c.x1 + r; else if (i === 2) p.z = c.z0 - r; else p.z = c.z1 + r;
    }
  }
}
