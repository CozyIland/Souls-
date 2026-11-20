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
- `src/bildfilter.js` – `makeComposer(…, {ao})`: Umgebungsverdeckung GTAO (nur PC; Sprites, Durchsichtiges und Umrisse werden dafür
  ausgeblendet), Bloom (Feuer, Glut), Farbstimmung (Schatten kühl, Licht warm), Vignette, Filmkorn (HalfFloat + 4× MSAA).
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
- `src/degen.js` – **Stockdegen**: `buildCane` (Stock = Scheide `sheath`, hängt links am Mantel-Gürtel an `Hips`; Klinge `sword`
  mit Griff; beide zeigen entlang +Z; **Faust** `fist` (eigenes Modell im Klingen-Raum: Handteller, 4 Finger als
  Halbringe um den Griff, Daumen oben) – solange er den Degen hält, wird die Meshy-Hand (`RightHand`, keine Fingerknochen) auf 2 %
  verkleinert; das Handgelenk der Faust `FIST_WRIST` sitzt am Hand-Knochen, Klingen-Raum X = Unterarm-Richtung ⟂ Klinge), Angriffe `ATTACKS` (l1 waagerecht, l2 schräg zurück, l3 Stoß = leichte Kombo; h = schwerer Überkopf-Schlag):
  je `T`, Trefferfenster `act`, Ausdauer `cost`, Reichweite `range`, Winkel `arc`, Ausfallschritt `lunge`, Schlüsselhaltungen
  (Oberarm, Unterarm, Klinge, Schulterdrehung, Vorbeugen, Kurve `e` 'out'/'in'/'lin'/'io', linker Arm `la`/`lf`) über `attackPose`
  – Richtungen werden auf dem Kugelbogen überblendet (`slerp3`, Klinge fliegt im Bogen; Schlüssel höchstens ~90° auseinander),
  Ausholen bremst ab, Schlag beschleunigt, linker Arm schwingt gegen, Kopf bleibt beim Gegner; Schwungspur `Trail` (dezent). In `player.js`: Zustand
  `attack` (`startAttack`, Kombo vormerken ab Trefferfenster, Rolle/Karte bricht nach dem Fenster ab), `drawn` (Klinge gezogen,
  nach 3 s Ruhe zurück in den Stock; Kartenwurf steckt sie sofort weg), Treffer über `targets`/`onHit`, `hitStop` (0,05 / schwer 0,1 s; main.js
  verlangsamt dann kurz), `onSwing` (Schwung-Geräusch). **Degen ist immer gezogen** (nur beim Kartenwurf kurz im Stock). Schaden: `damage(n, dir)` → `hurt`
  (0,42 s, danach 0,5 s unverwundbar `iframe`) oder `dead`; `revive`. Ohne Ziel dreht ein Schlag zum nächsten Gegner vorn.
  **Beinarbeit beim Angriff** (`stepK`, `legIK`): rechter Fuß tritt (1 + `STEP_X`) × `lunge` vor, linker bleibt stehen und wird
  danach nachgezogen; der Körper bewegt sich genau mit (kein Rutschen), Hüfte sinkt um `drop`. Beine per Zwei-Knochen-IK.
  **Weich nachführen** (`smQ`): jede Knochendrehung läuft der berechneten Haltung leicht hinterher (vor der Bein-IK) – glättet alle
  Übergänge. Kein Aufleuchten bei Schaden (nur dezenter roter Bildrand).
  **Rolle** (`ROLL_T` 0,66): abtauchen (Hände voraus) → über die Schulter rollen (Rollachse geneigt, `pivot.rotation.order` 'ZXY',
  `rollSide`) → aus der Hocke aufstehen (`rec`), Staub `onDust` beim Abrollen und Aufkommen. Kurvenlage `bank` aus `yawRate`,
  Gewicht vor/zurück beim Anlaufen/Bremsen `accLean`.
  **Degen in Bewegung** (`carry` = Anteile Stehen/Gehen/Rennen): im Stehen Bereitschaftshaltung; beim Gehen/Rennen schwingt der Arm
  aus der Lauf-Animation, die Klinge liegt fest in der Faust und folgt dem Unterarm (Abschnitt 4, nach dem Glätten: Gehen schräg
  vorn-unten, Rennen `runPose` nach hinten). **Kombo fließend**: vorgemerkter Schlag startet schon im Nachschwingen (`act[1]` + 0,11 s,
  schwer + 0,2 s), Laufen bricht spätes Nachschwingen ab; Füße stellen nach (`atk.pre`, IK). Treffer: `cam.punch` (Blickwinkel-Ruck). **Ruhe**: Gewicht verlagern, tiefer atmen, ab und zu umschauen (`lookA`),
  Kunststück `flourish` (Klinge wirbelt einmal um die Hand, `FLOURISH_T`). Scheide pendelt beim Gehen. Eingabe `inp.light`/`inp.heavy`: RB/RT, Links-/Rechtsklick oder E/R, Handy `#tAtk` (tippen/halten).
- `src/karten.js` – fliegende Karten (`throwCard`, `updateCards`): drehen sich flach, Leuchtspur, lenken leicht zum Ziel,
  bleiben in Puppen (wackeln, `hitT`) und Wänden stecken, Funken, Rütteln. Bilder in `src/kartenbild.js`.
  Eingabe `inp.card`: LB oder F, Handy-Knopf `#tCard` 🃏.
- `src/hund.js` – **Streunende Hunde** (`spawnDogs`, `updateDogs`, `resetDogs`, `dogs`): **Meshy-Modell `models/hund.glb`**
  (Pitbull mit Geschirr, nur Clip „dog_walk“; `DOG_S` 0,72, Füße bei y −0,67, schaut nach +Z) – je Hund geklont (`useModel`,
  eigene Toon-Materialien), Clip-Zeit passend zum Tempo (`DOG_STRIDE` 1,3, Schritt wächst beim Rennen), Clip-Gewicht `aw` weich nachgeführt, Galopp-Wippen, Haltungen (ducken, Sprung, taumeln,
  umfallen) über den Halter `mm.holder`. Ohne Modell: Grundformen (`buildDog`). Zustände idle (streunen) →
  growl (knurren, ab 13 m; danach `aggro` – sie geben nie auf, nur wenn du stirbst `calm`) → chase → circle (lauern: Blick auf dich,
  ein paar Schritte hin und her, Abstand halten) → wind (ducken) → leap (Sprung + Biss `BITE` 28, `player.damage`) → rec (verwundbar);
  **Angriffsmuster** (`attack(d)` nach Entfernung): Doppelschnapper/Schnapper (`snap`, `SNAP` 18), Tatzenschlag (`swipe`: aufrichten,
  rechte Vorderpfote holt aus und schlägt seitlich, `SWIPE` 22), Sprungbiss (`wind`→`leap`), Täuschung (`feint`: duckt sich, weicht
  zurück), Sprintbiss aus 4–7 m (`charge`, `CHARGE` 26, beißt im Vorbeirennen). Danach `after`: Blick auf dich, dann sofort
  nachsetzen, 1–2 Schritte rückwärts (`back`, Clip läuft rückwärts) oder lauern. Höchstens zwei greifen gleichzeitig an (`attackers`).
  Knochen per Code (`bones`, `rotW`, Rücksetzen über `userData.base` – Mixer schreibt nur Änderungen): Kopf/Hals schauen zu dir,
  Tatze; Kurvenlage aus `yawRate`. **Galopp** ab ~2,6 m/s per Code (`gw`, `gph`, `GALLOP_LEN`): Lauf-Clip wird ausgeblendet,
  Beine schwingen als Rotationsgalopp (Hinterbeine fast zusammen, Vorderbeine halbe Phase später, beim Vorschwingen angewinkelt),
  Rücken beugt/streckt sich, Kopf hält dagegen, Schwanz weht; Schweben/Schaukeln am Halter. Ruhe: schnüffeln, Schwanz wedeln;
  Lauern: schweres Atmen. Alle per Code bewegten Knochen stehen in `ctl` (werden vor dem Mixer zurückgesetzt).
  **Haltung** (unsichtbare Leiste `poise`, `POISE_MAX` 40, erholt sich nach `POISE_WAIT`): nur wenn sie voll ist → hurt/down,
  sonst kurzes Zucken `flinch` und der Angriff läuft weiter; Haltungsschaden je Angriff `ATTACKS[k].poise`, Karte 5.
  Körperhaltung wird weich nachgeführt (`sm`) · hurt (zuckt weg von der Trefferrichtung `hx`/`hz`, Kopf reißt zurück) · down (schwerer
  Schlag wirft ihn auf die Seite, Beine zappeln, nach `DOWN_T` 1,5 s rappelt er sich auf) · dead (zur Seite umfallen, ausblenden, kommt nach 25 s wieder,
  wenn man weit weg ist). 60 Leben; Treffer über `onHit(dmg, dir, heavy)` – Ziele mit `onHit` sind Gegner (`targets` enthält
  Puppen und Hunde, `dead` wird überall übersprungen). Lebensleisten `.ebar`, roter Rand `#hurtFx`, Tod: `#death` „GESTORBEN“,
  nach 4 s am Spieltisch (`REST`) wieder aufstehen (`player.revive`), Hunde zurück.
- `src/ton.js` – erzeugte Geräusche `sfx` (Web Audio, ohne Dateien; erst nach Klick/Taste hörbar): swing, hit, thud, card,
  yelp, growl, bite.
- `src/blut.js` – `spray(p, dir, n)` Blutspritzer (fliegen, fallen, hinterlassen Flecken, max. 50), `updateBlood`.
  Treffer auf Lebewesen: Blut + `sfx.hit` + Kamerawackeln `cam.shake` – **kein Aufleuchten**. Puppen: Strohstaub + `sfx.thud`.
- `src/kollision.js` – `colliders`, `block`, `blockRot` (gedreht), `resolve`, `blockers`.
- `src/world.js` – Kreuzung der toten Stadt: Boden, Gehwege mit Bordstein, Markierungen, Häuserzeilen (`rows`), Ruinenfeld,
  Requisiten, Zeltstadt, Unkraut (`InstancedMesh`, Wind im Shader), Skyline-Ringe + ferne Rauchsäulen (`horizon`), Asche & Glut.
  **Alle festen Teile werden am Ende nach Material zusammengefasst** (`mergeStatic`, behält Vertex-Farben; `userData.noMerge` = auslassen).
- `src/gebaeude.js` – `building(scene, x, z, w, d, Stockwerke, Straßenseite)` (Stufe 2): Stile `STYLES` (Ziegel, Klinker, Putz, Gelb,
  Beton, Grün; reihum gemischt), Mauern mit Relief (`wallMaterialTex`: Farbe + Normal-Map, 1 Kachel = 2 m), **Fenster als echte
  Nischen** (`Face.hole`: Laibung 0,22 m, innen dunkler, dahinter Bild aus `windowAtlasTex`), Rahmen + Sprossen, Fensterbank,
  Sturz oder Putzfaschen mit Schlussstein, Ladenfronten (Nischen mit `shopAtlasTex`, Pfeiler, Schildband), Sockel, Gesimse,
  Ecksteine. Geometrie wird je Material in `Acc` gesammelt (wenige Meshes). Dazu Schilder, Markisen, Balkone, Feuerleitern,
  Efeu, Kabel, Dachaufbauten oder abgebrochene Kante; Umriss als Kasten, Kollision + Kamera-Blocker.
- `src/requisiten.js` – Autos (Profil ausgestanzt), Bus, Laternen, Strommasten + `wire`, Ampeln, Schilder, Container, Fässer,
  Reifen, Kisten, Sandsäcke, Zäune, Zelte, Einkaufswagen, Haltestelle, Pfützen (spiegeln den Himmel), Papier, Schutt, Platten,
  Feuertonnen (`fires`), Spieltisch (Rastpunkt), Übungspuppen (`targets`).
- `src/kleinkram.js` – Schutthaufen `rubbleHeap` (Kieshügel, kantige Brocken `rockGeo`, Betonstücke, Ziegel, Eisen), verstreute
  Steinchen `scatter` (InstancedMesh), Müllsäcke, kahle Bäume in Baumscheiben `deadTree`, Gestrüpp `bush`.
- `src/texturen.js` – alle Canvas-Texturen (dazu `fbm`-Rauschen, `normalTex` Höhe→Relief, Asphalt-/Gehweg-Relief) (Asphalt, Gehweg, Fassaden-Atlas `FACADES`, Rost, Holz, Unkraut, Efeu, Schilder, Himmel, Skyline).
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
