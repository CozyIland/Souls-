// Modelle und Bilder laden. In der Offline-Datei füllt tools/einzeldatei.mjs die Listen unten mit den
// Modellen aus models/ (Base64) und den Bildern aus bilder/ (data-URL) – dann wird ohne Ladeanfrage gelesen
// (manche Vorschauen sperren das).
export const EINGEBETTET = {};
export const BILDER = {};

/** Adresse eines Bilds aus bilder/: eingebettet (Offline-Datei) oder die normale Datei */
export function bildUrl(url) { return BILDER[url] || url; }

export function ladeModell(loader, url, onLoad, onError) {
  const b64 = EINGEBETTET[url];
  if (!b64) { loader.load(url, onLoad, undefined, onError); return; }
  try {
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    loader.parse(buf.buffer, '', onLoad, onError);
  } catch (e) { if (onError) onError(e); }
}
