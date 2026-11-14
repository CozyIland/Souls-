# Der Lernende – Projektregeln für Claude

## Über das Projekt
- 3D-Souls-like-Bosskampf mit **Three.js**, Third-Person-Kamera mit fester Zielerfassung (Lock-on).
- Kernidee: Boss **Vargoth** lernt zwischen den Runden aus dem Verhalten der Spielerin
  (Rollzeitpunkt, Rollrichtung, Heilen, Gier, Abstand …) und passt seine Taktik an.
  Das Gedächtnis liegt im `localStorage` (Schlüssel `der-lernende-boss-v1`).
- Ziel für später: grafisch aufwändiger werden und als Anwendung auf **Steam** erscheinen
  (dann z. B. mit Electron oder Tauri verpackt).
- Läuft im Browser auf PC **und** Handy. Die Touch-Steuerung muss bei jeder Änderung weiter funktionieren.

## Über den Entwickler
- Kann selbst nicht programmieren und arbeitet meist **vom Handy** über Claude Code.
- Deshalb immer **vollständigen, sofort lauffähigen Code** liefern, keine Platzhalter.
- Erklärungen kurz, auf **Deutsch** und ohne Fachchinesisch. Spieltexte auf Deutsch.

## Technik
- Kein Build-Schritt: `index.html` lädt Three.js per Import-Map vom CDN, Code liegt als ES-Module in `src/`.
- Die Kampflogik rechnet auf einer flachen Ebene in „Spiel-Einheiten“ (wie das 2D-Original);
  die 3D-Darstellung rechnet um: **40 Einheiten = 1 Meter** (`PX` in `src/util.js`).
  Spiel-`x/y` → Welt-`x/z`, Spiel-Winkel `a` → Modell-Drehung `rotation.y = π/2 − a`.
- Struktur:
  - `src/game.js` – Kampflogik: Spielerin, Vargoth, Angriffe, Lernen, Runden, Effekt-Daten
  - `src/memory.js` – Gedächtnis des Bosses + „Erkenntnisse“ (traits)
  - `src/ui.js` – Hauptmenü, Pause, Zusammenfassung „Was Vargoth gelernt hat“
  - `src/input.js` – Tastatur, Maus, Touch; Bewegung relativ zur Kamera
  - `src/audio.js` – synthetische Soundeffekte
  - `src/render/arena3d.js` – Arena, Licht, Feuersäulen
  - `src/render/boss3d.js` – Vargoth-Modell (Grundformen) + Animation
  - `src/render/player3d.js` – Heldin (`models/heldin.glb`) + Schwert + Animation per Code
  - `src/render/fx3d.js` – Partikel, Ringe, Bodenwarnungen, Flammenkugeln
  - `src/render/camera3d.js` – Lock-on-Kamera
  - `src/render/hud.js` – 2D-HUD über dem 3D-Bild
- `models/heldin.glb`: aus einem Meshy-FBX auf ~50k Dreiecke verkleinert, 1,6 m groß,
  schaut nach +Z, **ohne Texturen und ohne Skelett** (Animation nur als Ganzes + Schwert).

## Arbeitsweise
- Nach Änderungen alle Dateien mit `node --check src/*.js src/render/*.js` prüfen.
- Klare deutsche Commit-Nachrichten.
- Gespielt wird über GitHub Pages (siehe README).
