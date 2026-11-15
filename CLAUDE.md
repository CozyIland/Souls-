# Der Lernende – Projektregeln für Claude

## Über das Projekt
- 3D-Souls-like-Bosskampf mit **Three.js**, Third-Person-Kamera mit fester Zielerfassung (Lock-on).
- Kernidee: Boss **Vargoth** lernt zwischen den Runden aus dem Verhalten der Spielerin
  (Rollzeitpunkt, Rollrichtung, Heilen, Gier, Abstand …) und passt seine Taktik an.
  Das Gedächtnis liegt im `localStorage` (Schlüssel `der-lernende-boss-v1`).
- Ziel für später: grafisch aufwändiger werden und als Anwendung auf **Steam** erscheinen
  (dann z. B. mit Electron oder Tauri verpackt).
- Läuft im Browser auf PC **und** Handy. Die Touch-Steuerung (und am PC Tastatur und Xbox-Controller) muss bei jeder Änderung weiter funktionieren.

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
  - `src/input.js` – Tastatur, Maus, Touch, Controller; Bewegung relativ zur Kamera
    - Controller (Xbox/Gamepad-API, Belegung „standard“): `pollPad(dt)` läuft jedes Bild aus `main.js` (auch Menü/Pause).
      Spiel: linker Stick/Steuerkreuz → `input.gx/gy`, B oder A Rolle, RB leicht, RT schwer, X Heilen, Start Pause.
      Menüs (`.overlay.show`): Knöpfe `.btn` mit `.padFocus` wählen, A/Start drücken, B/Start schließt die Pause,
      rechter Stick blättert; auf der Zusammenfassung 0,8 s Sperre gegen Hämmern. Menü zeigt `#ctrlPad` statt Tastatur.
      Rütteln über `rumble(stark, schwach, ms)` (Treffer, eigener Treffer, Sprungschlag, Tod) in `game.js`.
  - `src/audio.js` – synthetische Soundeffekte
  - `src/render/arena3d.js` – Arena, Licht, Feuersäulen
  - `src/render/boss3d.js` – Vargoth-Modell (Grundformen) + Animation
  - `src/render/player3d.js` – Heldin (`models/heldin.glb`) mit Skelett, Schwert, Trank, Begleitlicht
  - `src/render/fx3d.js` – Partikel, Ringe, Bodenwarnungen, Flammenkugeln
  - `src/render/camera3d.js` – Lock-on-Kamera
  - `src/render/hud.js` – 2D-HUD über dem 3D-Bild
- `models/heldin.glb`: Meshy-Modell (Chibi-Mädchen, braune Jacke, Jeans, lange schwarze Haare),
  ~10k Dreiecke, 1,7 m groß, schaut nach +Z, **mit Farben** (Texturen 1024 px JPEG, Metall aus)
  und **Mixamo-Skelett** (44 Knochen; Three.js macht aus `mixamorig:Hips` → `mixamorigHips`).
  Animationen in der Datei: nur `Walking` (passt zu 0,94 m/s) und `Running` (2,94 m/s), beide auf der Stelle.
  Original (12,5 MB, Texturen 2048 px PNG): `models/quelle/heldin-meshy.glb`;
  `python3 tools/glb_klein.py models/quelle/heldin-meshy.glb models/heldin.glb` erzeugt daraus genau die Spiel-Datei.
- Heldin-Animation in `player3d.js` (`poseRig`):
  - Laufen/Rennen: der Code setzt die Zeit der Animationen selbst (`phase`), Schrittlänge passend zum Tempo
    (`WALK_V`/`RUN_V`), Mischung über das Tempo. Beim Laufen dreht sie sich in Laufrichtung, sonst zum Boss.
  - Alles andere per Code über Knochen: `aim(knochen, kind, richtung, anteil)` richtet einen Knochen aus,
    `bend(knochen, achse, winkel)` beugt ihn; Richtungen „im Körper“ über `bodyDir` (x = links, y = oben, z = vorn).
    Schwertarm folgt der Klinge (`swordA`/`tilt`), linker Arm hängt bzw. führt den Trank zum Mund,
    Rücken beugt/dreht sich beim Schlag, Rolle = einrollen (`tuck`), Tod = Arme zur Seite.
  - **Wichtig:** Der Mixer schreibt Knochen nur, wenn sich die Animation ändert. Deshalb wird die reine
    Animationshaltung in `animQ`/`animP` gemerkt und jedes Bild zuerst zurückgesetzt – sonst addieren sich Drehungen.
  - Schwert und Trank sitzen an der Faust (`RightHand`/`LeftHand` → `RightHandMiddle1`), Nachbilder der Rolle
    sind eigene Kopien mit eingefrorener Haltung (`snapshot`).
  - Begleitlicht `fill` (Punktlicht von der Kameraseite), weil die dunkle Heldin sonst im Kampfplatz verschwindet.
  - Modelle ohne Skelett laufen weiter wie früher (Bewegung als Ganzes, Schwert an `HAND`).
- Offline-Datei zum Antippen: `node tools/einzeldatei.mjs` (einmalig `cd tools && npm i --no-save esbuild@0.24.0 three@0.170.0`)
  baut `Der-Lernende.html` mit Three.js, Code und Modell (Modell wird ohne fetch aus Base64 gelesen,
  weil manche Handy-Vorschauen Ladeanfragen sperren). Nicht committen – an die Nutzerin schicken.

## Arbeitsweise
- Nach Änderungen alle Dateien mit `node --check src/*.js src/render/*.js` prüfen.
- Klare deutsche Commit-Nachrichten.
- Gespielt wird über GitHub Pages (siehe README) oder über die Offline-Datei:
  nach jeder fertigen Änderung `Der-Lernende.html` neu bauen und direkt mitschicken (zum Antippen am Handy).
