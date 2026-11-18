// Modelle laden. In der Offline-Datei füllt tools/einzeldatei.mjs die Liste unten mit den
// Modellen aus models/ (Base64) – dann wird ohne Ladeanfrage gelesen (manche Vorschauen sperren das).
export const EINGEBETTET = {};

export function ladeModell(loader, url, onLoad, onError) {
  const b64 = EINGEBETTET[url];
  if (!b64) { loader.load(url, onLoad, undefined, onError); return; }
  try {
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    loader.parse(buf.buffer, '', onLoad, onError);
  } catch (e) { if (onError) onError(e); }
}
