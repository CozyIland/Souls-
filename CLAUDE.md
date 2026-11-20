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
  verkleinert; das Handgelenk der Faust `FIST_WRIST` sitzt am Hand-Knochen, Klingen-Raum X = Unterarm-Richtung ⟂ Klinge), Angriffe `ATTACKS` (l1 waagerecht rechts→links, l2 Rückhand schräg nach oben, l3 Stoß = leichte Kombo; h = **beidhändiger
  Spalt-Hieb**: über die rechte Schulter laden, kurz halten, mit Ausfallschritt senkrecht bis zum Boden, `slam` = Aufschlag → `onSlam`/`onDust`):
  je `T`, Trefferfenster `act`, Ausdauer `cost`, Reichweite `range`, Winkel `arc`, Ausfallschritt `lunge`, Schlüsselhaltungen
  `K(t, {h, b, el, tw, hip, ln, cr, sh, th, la, lf, e})`: **h = Lage der Hand** (m ab der rechten Schulter, Körperachsen x links/y oben/z vorn),
  b Klinge, el Ellbogen-Richtung, tw Schultern/hip Hüfte drehen (+ = nach links), ln vorbeugen, cr in die Knie, sh Gewicht vor/zurück,
  th beidhändig, la/lf linker Arm, Kurve `e` 'out'/'in'/'lin'/'io'; `R0` = Grundhaltung (`READY_HAND` aus den echten Armlängen).
  Prinzip: Hand wandert wenig, Klinge viel; Hüfte und Schultern drehen voraus. Über `attackPose`
  – **fließende Kurve**: Handlage per Hermite mit stetigem Tempo (`samplePos`/`velAt`), Richtungen auf dem Kugelbogen (`sample`/`speedAt`/`prog`,
  `slerp3`, gleichmäßiges Winkeltempo), Stillstand nur bei Umkehr, 'out' am Schlüssel oder 'in' am nächsten; Rumpf führt
  (`twLead`/`twMid` = Drehung 45/22 ms voraus → Peitsche: Hüfte, dann Schultern, dann Arm), Ausholen bremst ab, Schlag beschleunigt, linker Arm schwingt gegen, Kopf bleibt beim Gegner; Schwungspur `Trail` (dezent). In `player.js`: Zustand
  `attack` (`startAttack` merkt die Haltung beim Start in `atk.from` – der neue Schlag blendet aus ihr heraus, bei Kombos direkt aus dem
  Nachschwingen ins Ausholen, ohne Umweg über die Grundhaltung; Kombo vormerken ab Trefferfenster, Rolle/Karte bricht nach dem Fenster ab), `drawn` (Klinge gezogen,
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
  aus der Lauf-Animation, die Klinge liegt fest in der Faust und folgt dem Unterarm (Abschnitt 4, nach dem Glätten: schräg nach vorn,
  fester Handgelenk-Winkel `WRIST_WALK` zum Unterarm; **Rennen hält sie genauso wie Gehen**, der Arm schwingt nur schneller und etwas
  vom Körper weg). Die Klinge selbst wird wie die Knochen weich nachgeführt (`bladeB` im Körper-Raum, gleiche Rate `kq`) – kein Sprung bei Übergängen. **Kombo fließend**: vorgemerkter Schlag startet schon im Nachschwingen (`act[1]` + 0,11 s,
  schwer + 0,2 s), Laufen bricht spätes Nachschwingen ab; Füße stellen nach (`atk.pre`, IK). Treffer: `cam.punch` (Blickwinkel-Ruck). **Ruhe**: Gewicht verlagern, tiefer atmen, ab und zu umschauen (`lookA`),
  **Angriffs-Körper** (player.js, `animateRig`): Haltung wird früh bestimmt (`atP`, Knie `cr` und Gewicht `sh` über `pivot`),
  Hüfte dreht (`bend(Hips)`), Schulterblatt hebt sich mit der Hand (`RightShoulder`/`LeftShoulder`), rechter Arm per **`armIK`**
  (Zwei-Knochen-Lösung zur Handlage, Ellbogen nach `el`, Längen `this.arm`); Füße von Anfang an per IK: erst in die **Fechtstellung**
  `STANCE` treten (aus dem Gehen/der Kombo mit kleinem Schritt), dann Ausfallschritt. Beidhändig: linke Faust `fistL` (gespiegeltes
  `buildFist`, am Griff bei `GRIP_L`, Griff dafür 0,22 m lang), linker Arm per `armIK` zum Faust-Handgelenk (Ellbogen bei hohen Händen
  nach außen oben – Arme rahmen den Kopf), Meshy-Hand auf 2 %. Handgelenk: Klinge höchstens 160° zum Unterarm; Faust-Lage um den Griff
  gleitet weiter (`fistX`), wenn die Klinge fast in Armverlängerung liegt (sonst Sprung). Glättung im Angriff schwächer (`kq` 34).
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
  Tatze; Kurvenlage aus `yawRate`. **Lenkung** (Abschnitt „Bewegen“ in `update`): kein Hinschnappen mehr – Drehtempo `w` mit Grenze
  (`TURN_STAND` 5,2 rad/s im Stand … `TURN_RUN` 2,3 im Galopp, × Zustands-`turn`/9) und Dreh-Beschleunigung `TURN_ACC`, bremst rechtzeitig
  vor der Zielrichtung ab; große Richtungswechsel bremsen das Tempo (Bogen statt Drehen auf der Stelle); Fortbewegungs-Zustände `LOCO`
  ändern das Tempo `sv` nur mit `ACC_UP`/`ACC_DOWN`. Beim Drehen auf der Stelle treten die Beine (`gsp` = Tempo oder Drehtempo × 0,32),
  ohne Ziel schaut der Kopf schon in die neue Richtung (`turnD`), Brust/Hals biegen sich in die Kurve, Hüfte gegen (`tb`), Gewicht vor beim
  Antreten/zurück beim Bremsen (`accL`), Kopf nickt beim Gehen (`nod`). Sprungweite nach Abstand (`leapD`). Hunde schieben sich weich auseinander. **Schritt passt zur Strecke**: Beine laufen nach der wirklich zurückgelegten
  Strecke (`va` aus der Positionsänderung – an Wand/Spieler hängend treten sie nicht ins Leere). **Gangarten** in EINEM Takt: Gehen (Clip,
  Schritt `DOG_STRIDE`·`DOG_S`·`WALK.k`, wächst um `WALK.grow`) → ab `TROT.from` 1,75 m/s **Trab** per Code (diagonale Paare, `gw`) → ab
  `GALO.from` 2,8 m/s gleiten Beinphasen (`off`), Schwungweite und Anwinkeln stufenlos zum Galopp (`gm`); Schwungweite je Meter Schritt
  (`kr`/`kf`) so abgestimmt, dass aufgesetzte Pfoten stillstehen (gemessen 3–6 % Rutschen bei allen Tempi 1,2–7,5 m/s); der Code-Gang ist
  am Clip ausgerichtet (`RL0` = Standmitte linkes Hinterbein im Clip, beim Laden gemessen), gemischte Schrittlänge `Le`. **Galopp** per Code (`gph`, `GT`): Lauf-Clip ist ausgeblendet,
  Beine schwingen als Rotationsgalopp (Hinterbeine fast zusammen, Vorderbeine halbe Phase später, beim Vorschwingen angewinkelt),
  Rücken beugt/streckt sich, Kopf hält dagegen, Schwanz weht; Schweben/Schaukeln am Halter. Ruhe: schnüffeln, Schwanz wedeln;
  Lauern: schweres Atmen. Alle per Code bewegten Knochen stehen in `ctl` (werden vor dem Mixer zurückgesetzt).
  **Haltung** (unsichtbare Leiste `poise`, `POISE_MAX` 40, erholt sich nach `POISE_WAIT`): nur wenn sie voll ist → hurt/down,
  sonst kurzes Zucken `flinch` und der Angriff läuft weiter; Haltungsschaden je Angriff `ATTACKS[k].poise`, Karte 5.
  Körperhaltung wird weich nachgeführt (`sm`) · hurt (zuckt weg von der Trefferrichtung `hx`/`hz`, Kopf reißt zurück) · down (schwerer
  Schlag wirft ihn auf die Seite, Beine zappeln, nach `DOWN_T` 1,5 s rappelt er sich auf) · dead (Beine knicken ein, kippt wie ein Sack auf die Seite, federt
  nach; untere Beine liegen gestreckt auf, die oberen fallen um die Längsachse auf sie herab, Schwanz sinkt zum Boden – Werte in `D`,
  gemessen an den Modell-Ecken: nichts schwebt, kaum etwas steckt im Boden; Rücken leicht rund, letztes Zucken, Blutlache `pool`; bleibt als Leiche liegen, kommt nach 25 s
  wieder, wenn man weit weg ist). 60 Leben; Treffer über `onHit(dmg, dir, heavy)` – Ziele mit `onHit` sind Gegner (`targets` enthält
  Puppen und Hunde, `dead` wird überall übersprungen). Lebensleisten `.ebar`, roter Rand `#hurtFx`, Tod: `#death` „GESTORBEN“,
  nach 4 s am Spieltisch (`REST`) wieder aufstehen (`player.revive`), Hunde zurück.
- `src/ton.js` – erzeugte Geräusche `sfx` (Web Audio, ohne Dateien; erst nach Klick/Taste hörbar): swing, hit, thud, card,
  yelp, growl, bite.
- `src/blut.js` – `spray(p, dir, n)` Blutspritzer (fliegen, fallen, hinterlassen Flecken, max. 50), `updateBlood`.
  Treffer auf Lebewesen: Blut + `sfx.hit` + Kamerawackeln `cam.shake` – **kein Aufleuchten**. Puppen: Strohstaub + `sfx.thud`.
- `src/kollision.js` – `colliders`, `block`, `blockRot` (gedreht), `resolve`, `blockers`.
- **Erstes Gebiet = Schlauch** (`world.js`): Start und Rastpunkt am Spieltisch im Süden (`REST`), die Aschenallee nach Norden, Querstraße
  und Ruinenfeld verbarrikadiert (`barricades`: Zäune, Wracks, Schutt, Sandsäcke + Kollision), ein Hund kurz hinter dem Start, ein Rudel bei z −30,
  am Nordende das **Nebeltor** `GATE` zwischen zwei Häusern (rostiger Träger mit Ketten), dahinter der **Ascheplatz** `ARENA` (≈ 38 × 37 m,
  Häuser ringsum, Pflaster, weicher Aschekreis, Feuertonnen in den Ecken, Schutt/Wracks am Rand – Mitte frei) (`arena`).
- `src/nebel.js` – `FogGate`: drei Shader-Lagen wabernder Nebel (fbm, weiche Ränder, am Boden dichter) + Licht; `touches(p)` → main.js lässt
  den Magier langsam hindurchgehen (`passT`, Steuerung ruht), danach `seal()` (Wand von innen, Kollision) und `boss.start()`; wer hindurchrollt,
  löst es auch aus. Tod: `reset()` (offen); Sieg: `vanish()` (löst sich auf).
- `src/boss.js` – **Boss „Garm, der Aschenhund“** (`models/boss.glb`, Meshy, Clips dog_idle/dog_walk/dog_run), Größe `S` 4,3 (Kopf ≈ 5,4 m,
  gut 3× der Magier), alle Reichweiten × `K`. 640 Leben (`BOSS_HP`). Clips nach Tempo gemischt, Schrittlänge beim Laden aus den Hinterpfoten
  gemessen (`stride` – die Vorderzehen krümmen sich im Schwung nach unten), Gehen und Rennen in derselben Schrittphase (`stancePhase`,
  `phW`/`phR`). **Bewegung wie bei den Hunden**: Drehtempo/-beschleunigung begrenzt; Drehen auf der Stelle = Gehschritte (`gsp` ≤ 3 m/s,
  Rennen nur aus echtem Tempo – kein Galopp auf der Stelle); Tempo mit Trägheit (Lauern 4,5/6 m/s², Angriffe antreten 22, bremsen nur 7,5 –
  er rutscht ins Ausholen hinein, die Beine laufen dabei mit `legOk`); Gewicht vor/zurück `accL`, Kopf nickt beim Gehen, Lauern mit weichem
  Seitenwechsel (`sideS`) und Stehenbleiben zum Herumdrehen mit Spielraum (`turning`, 1,3/0,7 rad).
  Zustände: sleep (schnüffelt) → wake (Kopf hoch, heulen) → stalk (herankommen/umkreisen/zurückweichen, Abklingzeit `cd`) → Angriffe `ATK`
  (`choose(d, a)` nach Abstand/Winkel): bite (zurückziehen, vorstoßen), swipe (Pranke links/rechts holt aus und fegt), leap (ducken, Sprung
  zur Stelle des Spielers, Aufschlag mit Flächenschaden), charge (Ansturm, endet an der Wand), spin (wer hinter ihm steht: einmal herum),
  stomp (aufbäumen, Vorderpfoten aufschlagen); Phase 2 bei 50 % (`howl`: Druckwelle, schneller ×1,22, Kombos, mehr Glut). Haltung
  `POISE_MAX` → stagger. Treffer: Kapsel-Körper (`axisPoint`, `hitTest` für Karten, `radius` für den Degen, `pos` = nächster Körperpunkt für
  Zielerfassung), schiebt den Magier aus dem Körper, bleibt in der Arena. `strike` trifft nur, wenn `player.damage` greift (Rolle weicht aus).
  Haltungen über den Halter (`y`, Neigung) + Knochen (`rotW`: Kopf/Hals schauen zum Magier, Kiefer, Beine einknicken `fold`, Pranke);
  Beinknick-Werte `LP` gemessen (Pfoten bleiben am Boden). Glut steigt vom Rücken (`embers`), Licht `glow`. `onSlam` → Staub, Rütteln.
  Bossleiste unten (`#bossBar`, helle Schadensanzeige `lag` läuft nach), Sieg: `#victory` „FEIND GEFÄLLT“. Kamera beim Erfassen weiter weg
  (`camDist`/`camPitch` in camera.js). Tod des Spielers → Boss `reset()`, Nebel offen.
- **Heiltränke** (player.js): 3 pro Leben (`POTIONS`), Y / H / Handy 🧪 (`inp.heal`) → Zustand `heal` (`HEAL_T` 1,35 s, heilt `HEAL_HP` 45 bei
  `HEAL_AT`): linke Hand holt das Fläschchen (`flask`, Glut-Essenz) vom Gürtel zum Mund (`armIK`), Kopf in den Nacken; langsam gehen geht,
  angreifen/rollen nicht; leer → Kopfschütteln. Auffüllen nach Tod (`revive`) und nach dem Sieg. Anzeige `#potions`, Funken `onHeal` (main.js).
- **Stufen-System** (`src/stufe.js`, Klasse `Werte`): Seelen `souls` (Hund 10, Boss 1500 – `SOULS`, über `onDeath` von Hund/Boss →
  `gainSouls` in main.js, „+n“ am Zähler `#souls`), Stufe 1 … `MAX_LV` 20 = 1 + verteilte Punkte, Kosten `cost(lv)`: 50 → 100 → 200, danach
  je +50 % (auf 10 gerundet; Stufe 20 ≈ 131.000). Werte (Start je `BASE` 10): **Ausdauer** (+6 Leben, +5 Ausdauer je Punkt), **Stärke**
  (Degen, vor allem schwer; Haltungsschaden), **Trickreich** (leichte Schläge, Rolle und Schläge kosten weniger Ausdauer), **Magie**
  (Kartenschaden `cardMods` in karten.js, Karte kostet weniger). `mods()` → `player.applyStats` (Leben/Ausdauer, `player.mods` für Schaden und
  Kosten). Speichert in `localStorage` (`aschenblatt-stufe`, mit try/catch). Seelen bleiben beim Tod erhalten.
- **Seelenstein** (`world.js` `soulStone`, Lage `STONE` am Start): schiefer Stein mit glimmenden Runen + Licht. In der Nähe Hinweis `#prompt`
  („A / Enter / 🪨“, Handy-Knopf `#tUse`), `inp.use` (A, Enter/G) → `useStone`: Leben/Ausdauer/Tränke voll, Hunde zurück, Menü „Charakter“
  mit +1-Knöpfen je Wert (`levelUp`).
- **Menü** (`src/menue.js`, Klasse `Menue`, im `#pause`-Overlay): Reiter Charakter · Inventar · Steuerung · Test (`#tabs`, `.page`),
  Controller: LB/RB bzw. Q/E Seite (`inp.tab`), Steuerkreuz/Stick/Pfeile auswählen (`inp.nav`/`navX`, Klasse `padFocus`), A/Enter bestätigen,
  B/Esc/Start zu. Charakter: Stufe, Seelen, nächste Kosten, Werte mit Beschreibung, abgeleitete Zahlen (Leben, Ausdauer, Degen leicht/schwer,
  Karte, Rolle). Inventar: Stockdegen, Spielkarten, Heiltrank, Seelen. **Test**: Stufe −/+ bzw. 1/20 (`setLevel`, Punkte reihum), jeder Wert
  −/+ (`bump`), **Unverwundbar** an/aus (`werte.god` → `player.god`, `invulnerable` ist dann immer wahr, Hinweis `#godTag` unter der
  Lebensleiste, wird mitgespeichert), Seelen +100/+1000/0, Sprünge zum Stein / vors Nebeltor / in die Arena, alles zurücksetzen. Start/Esc öffnet „Charakter“.
- `src/world.js` – Straßen der toten Stadt: Boden, Gehwege mit Bordstein, Markierungen, Häuserzeilen (`rows`), Ruinenfeld,
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
