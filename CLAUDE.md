# Souls-like im Anime-Stil – Projektregeln für Claude

## Über das Projekt
- Neues Spiel (das alte „Der Lernende“ liegt in der Git-Geschichte, Commit `8862355`).
- Souls-like im **Anime-Stil**: Karten-Magier (Konzeptbild `konzept/hauptcharakter.png`) in einer postapokalyptischen Stadt.
  Fernkampf mit Karten, dazu Nahkampf. Gegner: verwahrloste Menschen, streunende Hunde; Bosse.
- Alles für **Xbox-Controller** auslegen. Karte zum Orientieren, Inventar. Zwischensequenzen als **Manga-Seiten**.
- Ziel später: Veröffentlichung auf **Steam** (Electron oder Tauri).
- Plan, Roadmap und offene Fragen: **`PROJEKTPLAN.md`** – bei Fortschritt dort abhaken und aktuell halten.

## Über den Entwickler
- Kann selbst nicht programmieren und arbeitet meist **vom Handy** über Claude Code.
- Deshalb immer **vollständigen, sofort lauffähigen Code** liefern, keine Platzhalter.
- Erklärungen kurz, auf **Deutsch** und ohne Fachchinesisch. Spieltexte auf Deutsch.

## Technik (Stand Schritt 1)
- Three.js 0.170 per Import-Map vom CDN, Code als ES-Module in `src/`, kein Build-Schritt fürs Spielen.
- `src/main.js` – Renderer, Zustände (title/play/pause), HUD, Begleitlicht `fill` (Kameraseite), Spielschleife; gezeichnet wird über `bildfilter.js`.
- `src/bildfilter.js` – `makeComposer`: Bloom (Feuer, Glut), Farbstimmung, Vignette, Filmkorn (HalfFloat + 4× MSAA).
- `src/input.js` – `poll(dt)` jedes Bild → `inp` (Bewegung, Kamera, Ereignisse). Controller: B tippen = Rolle,
  B halten (> 0,28 s) = Rennen, R3 Ziel, rechten Stick schnippen = Ziel wechseln, Start Pause. Tastatur/Maus als Ersatz.
  Achtung bei Tasten-Flanken: alten Stand merken, bevor `prev` überschrieben wird.
  **Handy** (`setupTouch`, Zustand `T`, `body.touch` nach der ersten Berührung): linke Bildhälfte = Stick an der Daumenstelle
  (`#joyBase`), rechte Hälfte wischen = Kamera, schnell zur Seite wischen = Ziel wechseln; Knöpfe `#tRoll` (tippen Rolle,
  halten Rennen – Haltezeit über die echte Uhr), `#tLock`, `#tPause`. Am Handy Pixelverhältnis höchstens 1,5.
- `src/camera.js` – `OrbitCam`: freie Kamera (yaw/pitch), Zielerfassung (Kamera hinter der Figur, Ziel im Bild),
  `forward()` für die Bewegung relativ zur Kamera, Strahl gegen Hauswände (`blockers`, unsichtbare Kästen).
- `src/player.js` – Bewegung (Joggen 3,4 · erfasst 2,5 · Rennen 5,8 m/s), Rolle (Unverwundbarkeit 0,05–0,42 s), Ausdauer.
  **Magier aus `models/magier.glb`** (Meshy, Mixamo-Skelett, nur Clips „Walking“/„Running“): Toon-Material mit Meshy-Textur,
  Umriss `skinOutline`. Schrittlänge der Clips wird beim Laden aus der Fußbewegung gemessen (`strideOf`), Animationszeit
  setzt der Code passend zum Tempo. Stehen (Arme aus der A-Pose herunter), Rolle (Einrollen + Salto um `pivot`), Seitwärts-/
  Rückwärtsschritte (Unterkörper `legs` dreht in Laufrichtung, Wirbelsäule zurück; rückwärts = Clip rückwärts) per Knochen
  (`aim`/`bend`). Vorher jedes Bild die reine Animationshaltung (`animQ/animP`) zurückschreiben. Kein Kartenfächer: beim **Kartenwurf**
  (Zustand `throw`, `THROW_T` 0,62 s, Loslassen bei `RELEASE` 0,39 s, 12 Ausdauer) greift die rechte Hand in den Mantel, zieht
  eine Karte (`handCard`) und schleudert sie nach vorn – Schlüsselhaltungen `THROW_K` (Arm, Unterarm, Schulterdrehung), linke Hand
  zieht den Mantel auf. Ohne Ziel wirft er in Kamerarichtung, mit Ziel aufs Ziel. Nach dem Loslassen: Rolle bricht ab, erneutes
  Drücken wird vorgemerkt. `palmTo` (Hand um die Unterarm-Achse drehen) ist noch da. Ohne Modell: Platzhalter aus Grundformen. Modell schaut bei yaw 0 nach +Z.
- `src/degen.js` – **Stockdegen**: `buildCane` (Stock = Scheide `sheath` in der linken Hand, Klinge `sword` mit Griff; beide
  zeigen entlang +Z), Angriffe `ATTACKS` (l1 waagerecht, l2 schräg zurück, l3 Stoß = leichte Kombo; h = schwerer Überkopf-Schlag):
  je `T`, Trefferfenster `act`, Ausdauer `cost`, Reichweite `range`, Winkel `arc`, Ausfallschritt `lunge`, Schlüsselhaltungen
  (Oberarm, Unterarm, Klinge, Schulterdrehung, Vorbeugen) über `attackPose`; Schwungspur `Trail`. In `player.js`: Zustand
  `attack` (`startAttack`, Kombo vormerken ab Trefferfenster, Rolle/Karte bricht nach dem Fenster ab), `drawn` (Klinge gezogen,
  nach 3 s Ruhe zurück in den Stock; Kartenwurf steckt sie sofort weg), Treffer über `targets`/`onHit`, `hitStop` (main.js
  verlangsamt dann kurz). **Degen ist immer gezogen** (nur beim Kartenwurf kurz im Stock). Schaden: `damage(n, dir)` → `hurt`
  (0,42 s, danach 0,5 s unverwundbar `iframe`) oder `dead`; `revive`. Ohne Ziel dreht ein Schlag zum nächsten Gegner vorn. Eingabe `inp.light`/`inp.heavy`: RB/RT, Links-/Rechtsklick oder E/R, Handy `#tAtk` (tippen/halten).
- `src/karten.js` – fliegende Karten (`throwCard`, `updateCards`): drehen sich flach, Leuchtspur, lenken leicht zum Ziel,
  bleiben in Puppen (wackeln, `hitT`) und Wänden stecken, Funken, Rütteln. Bilder in `src/kartenbild.js`.
  Eingabe `inp.card`: LB oder F, Handy-Knopf `#tCard` 🃏.
- `src/hund.js` – **Streunende Hunde** (`spawnDogs`, `updateDogs`, `resetDogs`, `dogs`): Modell aus Grundformen (`buildDog`:
  Rumpf mit Rippen, Kopf mit Kiefer `jaw`, Ohren, Schwanz, 4 Beine mit Knie), Trab per Code. Zustände idle (streunen) →
  growl (knurren, ab 13 m) → chase → circle (umkreisen, solange `cool` läuft) → wind (ducken) → leap (Sprung + Biss 15 Schaden,
  `player.damage`) → rec (verwundbar) · hurt (Treffer, schwer = länger) · dead (umfallen, ausblenden, kommt nach 25 s wieder,
  wenn man weit weg ist). 60 Leben; Treffer über `onHit(dmg, dir, heavy)` – Ziele mit `onHit` sind Gegner (`targets` enthält
  Puppen und Hunde, `dead` wird überall übersprungen). Lebensleisten `.ebar`, roter Rand `#hurtFx`, Tod: `#death` „GESTORBEN“,
  nach 4 s am Spieltisch (`REST`) wieder aufstehen (`player.revive`), Hunde zurück.
- `src/kollision.js` – `colliders`, `block`, `blockRot` (gedreht), `resolve`, `blockers`.
- `src/world.js` – Kreuzung der toten Stadt: Boden, Gehwege mit Bordstein, Markierungen, Häuserzeilen (`rows`), Ruinenfeld,
  Requisiten, Zeltstadt, Unkraut (`InstancedMesh`, Wind im Shader), Skyline-Ringe + ferne Rauchsäulen (`horizon`), Asche & Glut.
  **Alle festen Teile werden am Ende nach Material zusammengefasst** (`mergeStatic`, behält Vertex-Farben; `userData.noMerge` = auslassen).
- `src/gebaeude.js` – `building(scene, x, z, w, d, Stockwerke, Straßenseite)`: Fassaden aus Fensterfeldern eines Atlas (4×4,
  Reihe 3 = Erdgeschoss), Helligkeit per Vertex-Farbe, Gesimse, Fensterbänke, Ladenschilder, Markisen, Balkone, Feuerleitern,
  Efeu, Kabel, Dachaufbauten oder abgebrochene Kante; Umriss als Kasten, Kollision + Kamera-Blocker.
- `src/requisiten.js` – Autos (Profil ausgestanzt), Bus, Laternen, Strommasten + `wire`, Ampeln, Schilder, Container, Fässer,
  Reifen, Kisten, Sandsäcke, Zäune, Zelte, Einkaufswagen, Haltestelle, Pfützen (spiegeln den Himmel), Papier, Schutt, Platten,
  Feuertonnen (`fires`), Spieltisch (Rastpunkt), Übungspuppen (`targets`).
- `src/texturen.js` – alle Canvas-Texturen (Asphalt, Gehweg, Fassaden-Atlas `FACADES`, Rost, Holz, Unkraut, Efeu, Schilder, Himmel, Skyline).
- `src/toon.js` – Anime-Look: `toon(farbe)` (3 harte Lichtstufen), `outline(mesh)` (Umriss als vergrößerte Rückseite),
  `part(geo, farbe, linie)`, `skinOutline(skinnedMesh)` (Umriss für Figuren mit Skelett). Geometrien zentriert lassen.
- `src/modelle.js` – `ladeModell(loader, url, …)`: in der Offline-Datei kommen alle `models/*.glb` eingebettet (Base64).
- `tools/einzeldatei.mjs` – Offline-Datei `Aschenblatt.html`; `tools/glb_klein.py quelle ziel Name` – Meshy-Texturen verkleinern
  (Farbe 2048, sonst wird das Gesicht matschig). Original-GLBs liegen in `models/quelle/`.

## Arbeitsweise
- Klare deutsche Commit-Nachrichten.
- Nach jeder fertigen Änderung eine spielbare Offline-Datei bauen und direkt mitschicken.
- Erfahrungen aus „Der Lernende“ (in der Git-Geschichte nachlesbar): Mixamo-Skelett mit Three.js
  (`player3d.js`: Animationszeit selbst setzen, Haltung per Knochen, Mixer schreibt nur bei Änderungen),
  Controller über die Gamepad-API (`input.js`), Offline-Einzeldatei (`tools/einzeldatei.mjs`),
  Meshy-Texturen verkleinern (`tools/glb_klein.py`).
