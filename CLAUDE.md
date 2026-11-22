# Souls-like im Anime-Stil – Projektregeln für Claude

## Über das Projekt
- Neues Spiel (das alte „Der Lernende“ liegt in der Git-Geschichte, Commit `8862355`).
- Souls-like im **Anime-Stil**: Karten-Magier (Konzeptbild `konzept/hauptcharakter.png`) in einer postapokalyptischen Stadt.
  Fernkampf mit Karten, dazu Nahkampf. Gegner: verwahrloste Menschen, streunende Hunde; Bosse.
- Läuft **nur am PC** (entschieden) – Handy-Ansicht nicht mehr prüfen; die vorhandene Touch-Steuerung bleibt einfach drin.
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
  verkleinert; das Handgelenk der Faust `FIST_WRIST` sitzt am Hand-Knochen, Klingen-Raum X = Unterarm-Richtung ⟂ Klinge – dreht sich höchstens
  18 rad/s um den Griff, sonst kippt sie, wenn die Klinge die Unterarm-Linie kreuzt), Angriffe `ATTACKS` – **leichte Kombo wie ein Säbelfechter**
  (jeder Schlag vollständig: Gewicht zurück und über `LA_FWD` die linke Hand zum Gegner, ausholen, Hüfte → Schultern → Arm → Handgelenk, Schritt,
  Nachschwingen, hinteren Fuß nachziehen, zurück): l1 schräg von oben rechts nach unten links (über die rechte Schulter geladen, Klinge kommt
  über oben herein, 0,82 s), l2 Rückhand schräg von unten links nach oben rechts (startet dort, wo l1 endet, 0,78 s), l3 Ausfall mit Stoß
  (zurückziehen, tief nach vorn fallen, linker Arm `LA_FENCE` nach hinten, 1,0 s); geprüft mit Klingenspitzen-Tempo (kein Ruck) und Winkel
  Klinge/Unterarm (Klinge nie durch die Unterarm-Linie); h = **beidhändiger
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
  Nachschwingen ins Ausholen, ohne Umweg über die Grundhaltung; auch Knie, Gewicht, Hüfte und die Tiefe des Ausfallschritts `dy` werden
  übernommen (`wasAtk` gilt auch mit `prevAtk`, weil update() vorher kurz auf 'idle' schaltet); Kombo vormerken ab Trefferfenster, Rolle/Karte bricht nach dem Fenster ab), `drawn` (Klinge gezogen,
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
  gemessen an den Modell-Ecken: nichts schwebt, kaum etwas steckt im Boden; Rücken leicht rund, letztes Zucken, Blutlache `pool`; bleibt als Leiche liegen; neu erscheinen
  Hunde NUR beim Rasten am Seelenstein oder wenn der Magier stirbt – kein Zeitgeber). 60 Leben; Treffer über `onHit(dmg, dir, heavy)` – Ziele mit `onHit` sind Gegner (`targets` enthält
  Puppen und Hunde, `dead` wird überall übersprungen). Lebensleisten `.ebar`, roter Rand `#hurtFx`, Tod: `#death` „GESTORBEN“,
  nach 4 s am Spieltisch (`REST`) wieder aufstehen (`player.revive`), Hunde zurück.
- `src/ton.js` – erzeugte Geräusche `sfx` (Web Audio, ohne Dateien; erst nach Klick/Taste hörbar): swing, hit, thud, card,
  yelp, growl, bite.
- `src/blut.js` – `spray(p, dir, n)` Blutspritzer (fliegen, fallen, hinterlassen Flecken, max. 50), `updateBlood`.
  Treffer auf Lebewesen: Blut + `sfx.hit` + Kamerawackeln `cam.shake` – **kein Aufleuchten**. Puppen: Strohstaub + `sfx.thud`.
- `src/kollision.js` – `colliders`, `block`, `blockRot` (gedreht), `resolve`, `blockers`.
- **Erstes Gebiet = Schlauch** (`world.js`): Start und Rastpunkt am Spieltisch im Süden (`REST`), die Aschenallee nach Norden, Querstraße
  und Ruinenfeld verbarrikadiert (`barricades`: Zäune, Wracks, Schutt, Sandsäcke + Kollision), ein Hund kurz hinter dem Start, ein Rudel bei z −30,
  am Nordende das **Nebeltor** `GATE` (Hunde kommen nie darüber: Sperrlinie `FENCE` in hund.js, `fence()` nach jeder Bewegung und nach dem
  Auseinanderschieben; ist der Magier dahinter, verlieren sie ihn und trotten zurück) zwischen zwei Häusern (rostiger Träger mit Ketten), dahinter der **Ascheplatz** `ARENA` (≈ 38 × 37 m,
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
  Beinknick-Werte `LP` gemessen (Pfoten bleiben am Boden). **Alle Haltungsgrößen laufen über gedämpfte Federn** (`spring`, Zustand `this.F`
  mit Lage x und Tempo v; Steifigkeit `OM` je Zustand × `OMK` je Größe, `ZETA` 0,88; Kopf/Hals hängen etwas nach) – auch Pranke
  (`pawR/pawO/pawL`), Sprungbeine (`air`) und Schwanz: Zustandswechsel und abgebrochene Angriffe blenden weich, nichts springt.
  Treffer = Stoß in die Federn (`this.kick` aus `onHit`), kein Zittern. Eigene Uhr `clk` (springt nie auf 0) für Schwanz und Atmen
  (Lauern: schnelles Hecheln). Gehen: leichtes Wiegen/Auf-und-Ab (`sway`/`bob`). Vor/zurück weich (`gdir`). **Lauf-Clip ist keine saubere
  Schleife** (Meshy, Beine springen bis 13°): `seam()` misst das beim Laden, `run2` (Kopie auf Zeit 0) wird auf den letzten 14 % weich
  übergeblendet. Gemessen (40 s Kampf, Bild für Bild): stärkster Ruck ~4400 → ~450 rad/s². NaN wird in den Federn nie übernommen.
  **Hitboxen an den Knochen** (`src/bossteile.js`, Klasse `Teile`, beim Laden in der Grundhaltung vermessen): 16 Körper-Kapseln (Kopf
  head→Schnauzenspitze, Hals, Rumpf tail2→chest, je Bein oben/mitte/unten, Schwanz), Dicke = 70 %-Abstand der Hautpunkte, die vor allem
  an diesen Knochen hängen (`applyBoneTransform`), Schnauzenspitze `tip` = Kopf-Hautpunkt am weitesten vom Hals (im Kopf-Raum). Magier
  trifft: `nearest(p)` → `boss.hitR` so, dass (Abstand zu `pos`) − `radius` = Abstand zur nächsten Kapsel; Karten: `hitTest`. Boss trifft
  (`req(k, dmg, push)` im Trefferfenster → `applyHits` nach animate): `attack(k)` = Biss Schnauze, Prankenhieb Pfote+Unterarm der
  Schlagseite, Stampfen beide Vorderpfoten, Ansturm Kopf+Hals, Drehung Schwanz+Hinterläufe; Magier = stehende Kapsel (0,15–1,7 m, r 0,4);
  `hitsPlayer` zieht die Form vom letzten zum jetzigen Bild durch (kein Durchtunneln). Sprung/Heulen bleiben Kreise (`HB.leap`/`HB.howl`, m).
  `HB` = Faktoren auf die Messung (`body.dicke`, je Angriff `r`, `bite.vor`), gespeichert unter `aschenblatt-hitbox2`. Boden-Kollision
  (Wegschieben, Zielpunkt `pos`) fest über `COL`. `hitPhase(st, t)` → 1 holt aus / 2 trifft. `passive` = greift nicht an.
  **Fuß-IK** (`src/bossbeine.js`, Klasse `Beine`): je Bein Zustand frei → steht (Punkt P fest in der Welt, Höhe `h0` aus dem Geh-Clip
  gemessen) → Schritt (Clip hebt den Fuß: 0,16 s weich hinterher; Körper > `maxDev` (0,85 m + 0,15 × Tempo) entfernt: eigener Schritt
  0,3 s im Bogen, Ziel vorausberechnet; Nachbarn vorn/hinten und quer schreiten nie gleichzeitig) → steht. IK: planares CCD um die
  Querachse (Schulter/Hüfte, Ellbogen/Knie, Handgelenk/Sprunggelenk; Grenzen `lim`), seitlicher Rest NUR um die Längsachse, Pfote behält
  ihre Weltlage, nie unter den Boden. Gewicht je Bein (boss.js animate): 0 bei Liegen/Tod/Sprung in der Luft/Satz bei der Drehung/
  schlagender Pranke/Aufbäumen; schnell zupacken (22), weich loslassen (10). Tritt → `onStep` → main.js: Staub, `sfx.tritt`, Beben nach
  Abstand. Beine laufen nach dem **wirklichen** Tempo (`vAct`/`va` nach der Wand; an der Wand bremst `sv`). Drehung = kleiner Satz (`hop`).
  Gemessen (40 s Kampf): aufgesetzte Pfote rutschte im Mittel 1,4–2,7 m/s → 0,01–0,09 m/s (Ansturm 3,7 → 0,4, Drehung 16 → 0,7).
  **Drehen auf der Stelle**: KEIN Geh-Clip mehr (`gsp` = nur echtes Tempo), sondern Trippelschritte der IK (`turning`: kleinere Schritt-
  grenze 0,55 m, Schritt 0,26 s, Ziel mit Pfotentempo inkl. Drehung `mot.wy` vorausberechnet); im Stand dreht er langsamer (×0,6).
  Gemessen bei 1 rad/s: fest stehende Pfoten 0,06 m/s. **Angriffe zielen** (alle per Treffer-Test geprüft, Magier still): `planLunge` =
  Vorstoß als feste Strecke (Root Motion, −1,5 … max m, `RE` = Reichweiten-Feinabstimmung zur Vermessung `this.reach`); `aimAt` merkt das
  Ziel bis kurz vor dem Zuschlagen; `ccdAim` (bossbeine.js) führt Ketten: Biss = Kopf/Hals zur Brust des Magiers (Vorderkörper taucht ab),
  Prankenhieb = Pfote auf Bahn außen-oben → durch das Ziel (0,8 m hoch) → innen-unten, Drehung = Schwanzspitze auf 0,7 m; Stampfen =
  `beine.slamAt` (Pfoten landen links/rechts vom Ziel, 0,45 s festgehalten `hold`); Ansturm trifft mit Kopf, Hals und Vorderbeinen.
  Boden-Kollision `COL` beim Laden aus den Beinen berechnet (vorher ragte sie 3,2 m vor die Pfoten – nichts konnte treffen).
  Reichweiten (Treffer-Test): Biss 3–10 m bis ±30°, Prankenhieb 2–8 m bis ±60°, Stampfen 2–8 m bis ±30°, Ansturm 5–11 m, Drehung 2–4 m
  rundum, Sprung 6–18 m → danach wählt `choose(d, a)`.
  **Schwanzfeger** (`spin`, ersetzt den 360°-Kreisel um die Mitte): `spinP` = Richtung `s` (der LANGE Weg herum, damit der Schwanz durch
  den Magier fegt; danach schaut er ihn an), Gesamtwinkel `tot` = 2π − Winkel zum Magier (2,6 … 4,4 rad), Drehpunkt `piv` = Vorderpfoten
  (Körper wandert so, dass sie stehen bleiben; `mot.pivot` → Vorderpfoten trippeln mit). Ablauf: Ausholen 0,05–0,4 s (Hüfte −0,35 rad zur
  Gegenseite, duckt sich, Blick über die Schulter) → Schwung 0,42–1,04 s (`smoother`, höchstens ~665°/s, Hinterteil hoch, Hinterbeine in
  der Luft, Körper krümmt sich `curl` über spine1, Schwanz schleift `tail` und wird per `ccdAim` tief geführt) → Landung ~1,0 s (Hinter-
  beine schlagen auf, Schwanz peitscht nach `whip`). Treffer 0,5–1,02 s: Schwanz + Hinterläufe; Reichweite 2–4 m hinten, bis 5 m seitlich.
  **Anzeige** `src/hitboxen.js` (`HitboxView`, depthTest aus): Körper-Kapseln türkis als Gitter (blinken bei Treffer `hbFlash`),
  Angriffsformen in ihrer Farbe `ZCOL` (schwach beim Ausholen, kräftig im Treffermoment), Sprung/Heulen als Kreise am Boss, gelbe Kapsel
  = Magier; Ansicht `hbState.view` 0 aus / 1 Körper + laufender Angriff / 2 alles. Testmenü „Boss-Hitboxen“ (`HBROWS`, `hitboxHtml`/
  `hitboxWire` in menue.js): Ansicht, „Boss greift an“, Faktoren −/+ 0,1 bzw. Meter −/+ 0,25, Angriff vorführen (`o.bossAttack`),
  Kopieren, Standard. Glut steigt vom Rücken (`embers`), Licht `glow`. `onSlam` → Staub, Rütteln.
  Bossleiste unten (`#bossBar`, helle Schadensanzeige `lag` läuft nach), Sieg: `#victory` „FEIND GEFÄLLT“. Kamera beim Erfassen weiter weg
  (`camDist`/`camPitch` in camera.js). Tod des Spielers → Boss `reset()`, Nebel offen.
- **Heiltränke** (player.js): 3 pro Leben (`POTIONS`), Y / H / Handy 🧪 (`inp.heal`) → Zustand `heal` (`HEAL_T` 1,35 s, heilt `HEAL_HP` 45 bei
  `HEAL_AT`): linke Hand holt das Fläschchen (`flask`, Glut-Essenz) vom Gürtel zum Mund (`armIK`), Kopf in den Nacken; langsam gehen geht,
  angreifen/rollen nicht; leer → Kopfschütteln. Auffüllen nach Tod (`revive`) und nach dem Sieg. Anzeige `#potions`, Funken `onHeal` (main.js).
- **Stufen-System** (`src/stufe.js`, Klasse `Werte`): Seelen `souls` (Hund 10, Boss 1500 – `SOULS`, über `onDeath` von Hund/Boss →
  `gainSouls` in main.js, „+n“ am Zähler `#souls`), Stufe 1 … `MAX_LV` 20 = 1 + verteilte (`spent`) + **freie Punkte** `frei`
  (NIE automatisch verteilen – der Spieler wählt selbst; `levelUp(k)` nimmt erst einen freien Punkt, sonst kauft es am Stein eine Stufe;
  Testmodus `setLevel` gibt/nimmt freie Punkte; +1-Knöpfe auf der Charakterseite überall, solange Punkte frei sind). Leben-/Ausdauer-Leiste
  wachsen mit: Länge = Wert × `BAR_PX` 2,4 px (main.js `applyStats`, höchstens 60 vw). Oben links davor das **Porträt** `#portrait`
  (`bilder/portrait.jpg` = Gesicht aus `konzept/hauptcharakter.png`, 192 px; per `bildUrl` gesetzt) mit Stufe `#lvBadge` unten rechts. Kosten `cost(lv)`: 50 → 100 → 200, danach
  je +50 % (auf 10 gerundet; Stufe 20 ≈ 131.000). Werte (Start je `BASE` 10): **Ausdauer** (+6 Leben, +5 Ausdauer je Punkt), **Stärke**
  (Degen, vor allem schwer; Haltungsschaden), **Trickreich** (leichte Schläge, Rolle und Schläge kosten weniger Ausdauer), **Magie**
  (Kartenschaden `cardMods` in karten.js, Karte kostet weniger). `mods()` → `player.applyStats` (Leben/Ausdauer, `player.mods` für Schaden und
  Kosten). Speichert in `localStorage` (`aschenblatt-stufe`, mit try/catch). Seelen bleiben beim Tod erhalten. **Truhe und Waffen werden
  beim Laden NICHT übernommen** – jeder Start: Truhe zu, nur Stockdegen. Kampfwerte in `mods()` (Charakterseite, Prozent über `pc`):
  `atkSpeed` (Trickreich, ≤ 130 %, multipliziert `at.t` im Angriff), `critC` 5 % + 0,5 %/Trickreich (≤ 30 %), `critD` 150 % + 2 %/Stärke
  (Degen in player.js und Karten über `cardMods`; Krit wirkt im Treffer-Effekt wie schwer), `resPhys` 1 %/Ausdauer, `resMag` 1,5 %/Magie
  (je ≤ 40 %; `player.damage(n, dir, art)` mit art 'phys' Standard / 'mag' – noch macht kein Gegner Magie-Schaden).
- **Seelenstein** (`world.js` `soulStone`, Lage `STONE` am Start): schiefer Stein mit glimmenden Runen + Licht. In der Nähe Hinweis `#prompt`
  („A / Enter / 🪨“, Handy-Knopf `#tUse`), `inp.use` (A, Enter/G) → `useStone`: Leben/Ausdauer/Tränke voll, Hunde zurück, Menü „Charakter“
  mit +1-Knöpfen je Wert (`levelUp`).
- **Menü** (`src/menue.js`, Klasse `Menue`, im `#pause`-Overlay): Reiter Charakter · Inventar · Steuerung · Test (`#tabs`, `.page`),
  Controller: LB/RB bzw. Q/E Seite (`inp.tab`), Steuerkreuz/Stick/Pfeile auswählen (`inp.nav`/`navX`, Klasse `padFocus`), A/Enter bestätigen,
  B/Esc/Start zu. Charakter: Stufe, Seelen, nächste Kosten, Werte mit Beschreibung, abgeleitete Zahlen (Leben, Ausdauer, Degen leicht/schwer,
  Karte, Rolle). Inventar: siehe `inventar.js` (ohne WebGL einfache Liste `renderInvList`). **Test**: Stufe −/+ bzw. 1/20 (`setLevel`, Punkte reihum), jeder Wert
  −/+ (`bump`), **Unverwundbar** an/aus (`werte.god` → `player.god`, `invulnerable` ist dann immer wahr, Hinweis `#godTag` unter der
  Lebensleiste, wird mitgespeichert), Seelen +100/+1000/0, Sprünge zum Stein / vors Nebeltor / in die Arena, alles zurücksetzen. Start/Esc öffnet „Charakter“.
- **3D-Inventar** (`src/inventar.js`, Klasse `Inventar`, von `Menue.renderInv` einmal angelegt, gezeichnet über `menue.frame(dt, inp)` nur solange
  der Reiter offen ist; eigener `WebGLRenderer` auf `.invCv`): Sechseck-Bild `bilder/inventar.jpg` (Konzept, rostiger Rahmen, Kristall, 7 Fassungen)
  als Fläche mit Shader `HFS` – Kristall (Maske aus Sättigung/Farbton) schillert (`hueRot`), Adern flackern, Lichtstreifen wandert, Lichtwelle
  beim Ausrüsten (`uPulse`), goldenes Leuchten um die gewählte Fassung (`uFoc`), Rand per Helligkeit freigestellt. Fassungen `SOCK` (Pixel im
  Bild), Gegenstände `SLOT_ITEM` (oben Stockdegen, rechts unten Heiltrank, links unten Seelen; Bilder `iconTex`, Zahlen `.sq`), Knöpfe `.sock`
  liegen über den Fassungen (`placeSockets`, folgen der Neigung) → Menü-Fokus/Controller wie überall. **Obere Fassung = Waffe in der Hand**
  (Bild je Waffe `wIcon`): antippen/A → `openChoice('waffe')`: die Karte macht Platz, die Waffe dreht sich in 3D in der Mitte (`loadWeapon`,
  `prepWeapon`: senkrecht, schräg `W_TILT`, `W_LEN` lang, Schein dahinter; Stockdegen = gezogene Klinge `caneShow`), ungefundene als „?“;
  wählen → steigt auf, bleibt `holdT` stehen, dann kehrt die Karte zurück. **Mitte = ausgerüstete Karte** in 3D
  (`KARTEN`: `herzass` → `models/herzass.glb`, Meshy, mit gltfpack auf 12 % vereinfacht + `KHR_mesh_quantization`; eigene Rückseite
  `backTex`, weil das Modell hinten die Vorderseite gespiegelt zeigt; Glutschein `halo`). Gruppen `root` (Lage, rückt bei der Wahl vor) →
  `anim` (Abläufe `an`: rise = aus dem Kristall wirbeln, sink, flip = Vorschau tauschen, shake) → `spin` (Schweben, Wiegen, alle ~10 s einmal
  herum, Ziehen mit Maus/Finger bzw. rechter Stick `dragA`, rastet vorn ein). Funken `Funken` (Glut von den Kartenrändern, Lichtsplitter
  `burst`, Kristallstaub). Mitte antippen/A → `openChoice` (Kartenwahl `.kwahl`, gefundene + `UNBEKANNT` verborgene „?“ – Vorschau dreht sich
  mit), wählen → `choose` (speichert `werte.karte`, `onEquip` → `wurf.karte` in karten.js: geworfene Karten zeigen das Ass), B schließt erst
  die Wahl. `werte.karte`/`werte.karten` in stufe.js gespeichert. Klänge `sfx.karte`/`huschen`/`ui`/`nein`. Kartenmodelle liest `karteLaden(id)`
  schon 1,5 s nach dem Start im Hintergrund (main.js); lädt es noch, zeigt die Mitte die Rückseite (`models.back`) und dreht sich dann um.
  Neue Karte: Eintrag in `KARTEN` (+ GLB in `models/`, `mini` fürs Auswahl-Kärtchen, CSS `.kmini.<id>`), finden = `werte.karten` ergänzen.
- **Waffen** (`src/waffen.js`): `WAFFEN` = Stockdegen (Anfang) und **Kristallklinge** (`models/kristallschwert.glb`, Meshy, gltfpack 20 %;
  Modell senkrecht, Klinge +y, Parierstange unten bei y −0,47 → `buildSchwert` legt sie in den Klingen-Raum: Griff entlang +Z, Maßstab
  `SCHWERT_K` 0,66 = 1,25 m, Griff 0,22 m wie beim Degen). Je Waffe Faktoren light/heavy/poise/cost, `range` (+m), Klingenspitze `bladeL`,
  Faustgröße `fist` (Kristallgriff dicker → Faust und Handgelenk-Punkt `player.wrist` ×1,18). Werte wirken über `Werte.mods()`; im Spieler
  `setWeapon(id)` (aus `applyStats`). Anzeige überall gleich über `waffenInfo(W, m, cur)`: Name · kurze Beschreibung `d` · Angriff von–bis
  (`angriff`: leichter Schlag 12 … schwerer 32, mit Werten und Waffenfaktor) · Effekt `fx` nur wenn vorhanden. Menü-Fenster
  (`.panel.menu`) hat für alle Reiter dieselbe feste Größe, nur die Seite rollt. Degen-Teile `caneParts` + Stock aus, Kristallklinge (`swordAlt`, Toon + `hullOutline`) an. Ohne Degen
  hängt beim Kartenwurf die Klinge selbst an der Hüfte. `werte.waffe`/`waffen` gespeichert.
- **Truhe** (`src/truhe.js`, Klasse `Truhe`, `models/truhe.glb` – ein Mesh ohne Animation): beim Laden wird der **Deckel abgetrennt**
  (alle Dreiecke über der Fuge `SEAM` 0,22 – dort läuft rundherum eine Rille), dreht sich um das Scharnier hinten (`HINGE_Z`); innen dunkle
  Kästen (`BackSide`), Licht + Schein. `canOpen(p)` (vor dem Schloss, `front()`), `open(player, onGot)`: Schloss zuckt, Deckel federt auf,
  Kristallklinge steigt drehend heraus, schwebt, fliegt zum Magier → `werte.findWeapon('schwert')`, Banner `#found`; `setOpen()` (Spielstand
  `werte.truhe`), `close()` (Testmodus). main.js: Hinweis „Truhe öffnen“ (A/Enter/✋ `#tUse`), Steuerung ruht 1,3 s (`chestT`), Magier schaut hin.
- **Seitenstraße** = Kartenstraße Ost (Sackgasse von der Kreuzung bis x ≈ 36, Sperre wie an der Westseite nur verschoben, dahinter
  Sandsäcke/Kiste/Feuertonne), Truhe `TRUHE` (33,4 / 0,8, Schloss nach Westen), drei Hunde davor (hund.js Startliste).
- `src/world.js` – Straßen der toten Stadt: Boden, Gehwege mit Bordstein, Markierungen, Häuserzeilen (`rows`), Ruinenfeld,
  Requisiten, Zeltstadt, Unkraut (`InstancedMesh`, Wind im Shader), ferner Skyline-Ring + Rauchsäulen (`horizon`), Asche & Glut.
  **Alle festen Teile werden am Ende nach Material zusammengefasst** (`mergeStatic`, behält Vertex-Farben; `userData.noMerge` = auslassen).
- `src/gebaeude.js` – `building(scene, x, z, w, d, Stockwerke, Straßenseite)` (Stufe 2): Stile `STYLES` (Ziegel, Klinker, Putz, Gelb,
  Beton, Grün; reihum gemischt), Mauern mit Relief (`wallMaterialTex`: Farbe + Normal-Map, 1 Kachel = 2 m), **Fenster als echte
  Nischen** (`Face.hole`: Laibung 0,22 m, innen dunkler, dahinter Bild aus `windowAtlasTex`), Rahmen + Sprossen, Fensterbank,
  Sturz oder Putzfaschen mit Schlussstein, Ladenfronten (Nischen mit `shopAtlasTex`, Pfeiler, Schildband), Sockel, Gesimse,
  Ecksteine. Geometrie wird je Material in `Acc` gesammelt (wenige Meshes). Dazu Schilder, Markisen, Balkone, Feuerleitern,
  Efeu, Kabel, Dachaufbauten oder abgebrochene Kante; Umriss als Kasten, Kollision + Kamera-Blocker.
- **Autowracks** (`src/wracks.js`): alle `P.car(...)` merken nur die Stelle (`carSpot`) + Kollision (`CAR_L` 4,6 × `CAR_W` 2 m);
  `buildWracks` (aus `buildWorld` nach `mergeStatic`) zeichnet sie als EIN `InstancedMesh` aus `models/autowrack.glb` (Meshy-Muscle-Car, rostig
  und bemoost, mit `glb_lod.py` auf 16.000 Dreiecke; Modell: Länge entlang x, vorn bei −x) + Umriss-Instanzen (teilen `instanceMatrix`).
  Je Auto aus der Lage gewürfelt (`hash`): Lackfarbe `PAINT` (Shader dreht nur den Farbton des roten Lacks – Moos, Rost, Glas bleiben),
  Sättigung/Helligkeit, ausgebrannt (Ruß), Schieflage, eingesunken, Größe ±5 %, ausgebrannte teils auf dem Dach. Keine Matratze mehr auf dem Dach (`roof` wird bei den Meshy-Autos ignoriert – steckte im Blech).
  Fehlt das Modell → `P.carBox` (alte Kasten-Autos).
- **Hochhäuser im Hintergrund** (`src/hochhaeuser.js`): verlassene, überwucherte Plattenbauten (Meshy) statt der beiden nahen
  Skyline-Ringe (nur der ferne Ring bleibt). `plan()`: Raster um die Stadt (33 m, verschoben, Lücken), nicht auf Straßen/Häuserzeilen/Arena
  (`KEEP`); nahe Reihe `models/plattenbau.glb` (30.000 Dreiecke), ferne `models/plattenbau_fern.glb` (nur die Form, 8.000 Dreiecke,
  Beton-Farbe – unter ~30.000 Dreiecken geht das Bild dieses Modells kaputt) – je ein `InstancedMesh`, keine Schatten, Dunst nur zu 55/75 % (sonst nur graue Flächen). Je Haus: Höhe ×0,85…1,5, Breite/Tiefe, Drehung (4 Seiten + schief), Farbton `TINT`,
  manche geneigt oder eingesunken (nicht spiegeln – sonst stimmt das Licht nicht). `fixNormals` beim Laden: das ferne Modell hat
  Punkte mit Normale der Länge 0 → NaN im Shader → Bloom verschmiert das zu großen schwarzen Flächen (betrifft jedes Modell nach `glb_lod.py`).
- `tools/glb_lod.py quelle_klein.glb ziel.glb Dreiecke [ohnebild]` – verkleinert die FORM riesiger Meshy-Modelle, ohne dass das Bild auf
  der Oberfläche kaputtgeht (MeshLab-Vereinfachung mit Textur; braucht `pip install pymeshlab` und unter Linux `libopengl0`).
  gltfpack `-sa` zerstört bei Meshy die Bildkoordinaten; zweimal hintereinander vereinfachen auch – immer vom Original ausgehen.
  Originale von Auto (45 MB) und Plattenbau (195 MB) liegen nur auf dem Google Drive des Entwicklers (zu groß fürs Repo).
- `src/requisiten.js` – Autos (Stelle + Kollision, siehe wracks.js; `carBox` als Ersatz), Bus, Laternen, Strommasten + `wire`, Ampeln, Schilder, Container, Fässer,
  Reifen, Kisten, Sandsäcke, Zäune, Zelte, Einkaufswagen, Haltestelle, Pfützen (spiegeln den Himmel), Papier, Schutt, Platten,
  Feuertonnen (`fires`), Spieltisch (Rastpunkt), Übungspuppen (`targets`).
- `src/kleinkram.js` – Schutthaufen `rubbleHeap` (Kieshügel, kantige Brocken `rockGeo`, Betonstücke, Ziegel, Eisen), verstreute
  Steinchen `scatter` (InstancedMesh), Müllsäcke, kahle Bäume in Baumscheiben `deadTree`, Gestrüpp `bush`.
- `src/texturen.js` – alle Canvas-Texturen (dazu `fbm`-Rauschen, `normalTex` Höhe→Relief, Asphalt-/Gehweg-Relief) (Asphalt, Gehweg, Fassaden-Atlas `FACADES`, Rost, Holz, Unkraut, Efeu, Schilder, Himmel, Skyline).
- `src/toon.js` – Anime-Look: `toon(farbe)` (3 harte Lichtstufen), `outline(mesh)` (Umriss als vergrößerte Rückseite),
  `part(geo, farbe, linie)`, `skinOutline(skinnedMesh)` (Umriss für Figuren mit Skelett). Geometrien zentriert lassen.
- `src/modelle.js` – `ladeModell(loader, url, …)`: in der Offline-Datei kommen alle `models/*.glb` eingebettet (Base64);
  Bilder aus `bilder/` über `bildUrl(url)` (in der Offline-Datei als data-URL in `BILDER`).
- `tools/einzeldatei.mjs` – Offline-Datei `Aschenblatt.html`; `tools/glb_klein.py quelle ziel Name` – Meshy-Texturen verkleinern
  (Farbe 2048, sonst wird das Gesicht matschig). Original-GLBs liegen in `models/quelle/`.

## Arbeitsweise
- Klare deutsche Commit-Nachrichten.
- Nach jeder fertigen Änderung eine spielbare Offline-Datei bauen und direkt mitschicken.
  Am Windows-PC zusätzlich hochladen: `powershell -ExecutionPolicy Bypass -File tools\veroeffentlichen.ps1` → Release „stand“,
  fester Download-Link (auch fürs Handy): https://github.com/CozyIland/Souls-/releases/download/stand/Aschenblatt.html
- Erfahrungen aus „Der Lernende“ (in der Git-Geschichte nachlesbar): Mixamo-Skelett mit Three.js
  (`player3d.js`: Animationszeit selbst setzen, Haltung per Knochen, Mixer schreibt nur bei Änderungen),
  Controller über die Gamepad-API (`input.js`), Offline-Einzeldatei (`tools/einzeldatei.mjs`),
  Meshy-Texturen verkleinern (`tools/glb_klein.py`).
