# Projektplan – Souls-like im Anime-Stil (Arbeitstitel: „Aschenblatt“)

> Das alte Spiel „Der Lernende“ liegt in der Git-Geschichte (Commit `8862355`) und kann jederzeit zurückgeholt werden.

## 1. Die Idee in drei Sätzen
Ein **Karten-Magier** (Konzeptbild: `konzept/hauptcharakter.png` – schwarze Robe mit Goldsaum, Bart, Kartenfächer)
streift durch eine **postapokalyptische Stadt**, in der nur noch verwahrloste Menschen und verwilderte Hunde leben.
Gekämpft wird wie in Souls-Spielen (Ausdauer, Ausweichrolle, Zielerfassung, Rastpunkte, schwere Bosse),
im **Anime-Look** mit Cel-Shading; Zwischensequenzen sind **Manga-Seiten**.

## 2. Spielmechanik (Vorschlag)

### Kampf
| | Idee |
|---|---|
| **Fernkampf: Karten** | Einzelwurf (schnell, wenig Schaden), Fächerwurf (3–5 Karten, kostet mehr Ausdauer), aufgeladener Wurf (halten → durchschlagende Karte). Karten kommen zurück in den „Stapel“ (Munition lädt nach, kein Sammeln nötig). |
| **Farben = Effekte** | ♠ Pik: durchschlagen · ♥ Herz: heilt dich ein wenig · ♦ Karo: explodiert · ♣ Kreuz: bringt Gegner ins Taumeln. Man rüstet ein „Deck“ aus 2 Farben aus. |
| **Joker** | Seltene Spezialkarte (wie ein Zauber), z. B. Kartensturm um dich herum. |
| **Nahkampf (wählbar)** | 1) **Bloße Hände** mit leuchtenden Arkan-Fäusten (schnell, Kombo). 2) **Stockdegen** – Spazierstock mit verborgener Klinge (klassisch für Zauberer/Gentleman). 3) **Kartenklinge** – Karten verschmelzen zu einem Schwert (stärker, langsam). 4) **Kriegsfächer** aus Metallkarten (Paraden möglich). |
| **Grundlagen** | Ausdauer, Rolle mit Unverwundbarkeit, Zielerfassung, Heilmittel („Teebeutel“/„Elixier“, x pro Rast aufgefüllt), Haltung (Gegner taumeln). |
| **Tod & Währung** | Währung = **Jetons**. Beim Tod liegen sie dort, wo du gestorben bist – einmal zurückholen, sonst weg. |
| **Rastpunkte** | Ein **Spieltisch** im Lagerfeuer-Stil (alte Kerze auf einem Kartentisch): heilen, aufleveln, Gegner kehren zurück. |

### Gegner (erstes Gebiet)
- **Streunende Hunde** – schnell, im Rudel, springen an; schwach einzeln. Gut zum Lernen von Ausweichen.
- **Plünderer** – verwahrloste Menschen mit Rohr/Brett, langsam, harte Schläge.
- **Lumpen-Bettler** – schleichen, packen dich (Griff → mit Taste losreißen).
- später: **Steinwerfer** auf Dächern (Fernkampf-Gegner), **Hundeführer** (pfeift das Rudel zusammen).

### Boss-Ideen (Entscheidung offen)
1. **„Die Rudelmutter“** – riesige, mutierte Hündin im eingestürzten Stadtpark; ruft Welpen-Rudel, Sprungangriffe, wird in Phase 2 blind vor Wut. *Passt perfekt zu den Hunden im ersten Gebiet.*
2. **„Der Bankhalter“** – aufgedunsener Croupier im Ruinen-Casino; Würfel-Wurfangriffe, Arena ist ein Roulettekessel, der sich dreht. *Passt zum Karten-Thema, toller Endboss.*
3. **„Der Meister“** – der frühere Lehrer des Helden, ebenfalls Kartenmagier, aber verfallen; spiegelt deine Angriffe. *Am meisten Story.*

**Empfehlung:** Rudelmutter als **erster** Boss (Ende Gebiet 1), Bankhalter später als großer Boss, der Meister als Finale.

### Karte & Inventar (alles für Controller)
- **Karte**: von oben gezeichnete Stadtkarte, **Nebel** über unentdeckten Straßen, Rastpunkte und Wegmarken; mit Stick verschieben, Schultertasten zoomen.
- **Inventar**: Raster mit großen Feldern (Steuerkreuz), Reiter mit LB/RB (Waffen · Karten-Deck · Heilmittel · Schlüssel/Notizen). Schnellplätze auf dem Steuerkreuz wie in Dark Souls.
- **Steuerung (Xbox)**: linker Stick laufen · rechter Stick Kamera · R3 Zielerfassung · B Rolle (halten = rennen) · RB Nahkampf · RT schwerer Nahkampf · LB Karte werfen · LT Karte aufladen · X Heilen · Y Waffe wechseln · Steuerkreuz Schnellplätze · Start Menü · View Karte.

### Zwischensequenzen als Manga
Bilder im Manga-Stil (schwarz-weiß oder farbig) mit Panel-Layout. Das Spiel zeigt sie Panel für Panel:
Panel fliegt ein, leichter Zoom/Schwenk, Sprechblasen erscheinen, Lautschrift („KRACH!“) wackelt, Weiter mit A.
Die **Bilder** kommen von dir (z. B. aus demselben Bild-Generator wie das Konzeptbild); ich baue den Abspieler
und setze Texte und Sprechblasen per Code darüber (dann kann man Texte jederzeit ändern).

## 3. Technik (Vorschlag)
- **Three.js im Browser**, wie bei „Der Lernende“ – das kenne ich jetzt gut (Mixamo-Skelett, Controller, Offline-Datei).
  Du kannst jeden Zwischenstand sofort am PC (oder Handy) antippen, ohne etwas zu installieren.
- **Anime-Look**: Toon-Shader (2–3 harte Lichtstufen), dunkle Umrisslinien, kräftige Akzentfarben (Gold, Glut), Bildfilter (Bloom).
- **Für Steam später**: Verpacken mit Electron oder Tauri; Spielstände dann als Datei statt im Browser.
- **Stadt**: aus Bausteinen gebaut (Häuserblöcke, Autowracks, Schutt, Zäune) – teils Meshy-Modelle, teils per Code.

## 4. Roadmap – in dieser Reihenfolge (jeder Schritt endet mit einer spielbaren Datei)
| # | Meilenstein | Inhalt | Brauche von dir |
|---|---|---|---|
| 0 ✅ | **Fundament** (erledigt) | Projektgerüst, Toon-Shader, Controller-Steuerung, Kamera mit Zielerfassung, Testgelände, Offline-Datei | Spielname, Name des Helden |
| 1 ✅ | **Held bewegt sich** (erledigt) | Dein Magier mit Skelett: laufen, rennen, rollen, seitwärts/rückwärts erfasst, Kartenfächer; Stadt detailreich (Fassaden, Läden, Feuerleitern, Strommasten, Zeltstadt, Unkraut, Skyline, Leuchten) | ✔ Modell bekommen (nur Walk/Run – Rest per Code) |
| 2 | **Kampf-Prototyp** (begonnen: einfacher Kartenwurf aus dem Mantel ✅) | Kartenwurf (3 Arten), Nahkampf-Kombo, Treffer, Heilen; ein Übungsgegner | Entscheidung Nahkampf-Waffe(n) |
| 3 | **Erste Gegner** | Hunde (Rudel) + Plünderer mit eigener KI, Rastpunkt, Tod & Jetons | Gegner-Modelle (oder ich baue Platzhalter) |
| 4 | **Erstes Gebiet** | Kleine Ruinenstadt (3–4 Straßen, Abkürzung zum Rastpunkt), Gegenstände finden | Stimmungsbilder der Stadt (optional) |
| 5 | **Karte & Inventar** | Stadtkarte mit Nebel, Inventar, Schnellplätze, Deck ausrüsten | – |
| 6 | **Erster Boss** | z. B. Rudelmutter mit 2 Phasen, Nebeltor, Boss-Leiste | Boss-Entscheidung + Modell |
| 7 | **Manga-Sequenzen** | Abspieler + Intro und Boss-Sequenz | Manga-Bilder |
| 8 | **Feinschliff** | Musik/Geräusche, Hauptmenü, Speichern, Einstellungen, Leistung | – |
| 9 | **Steam-Vorbereitung** | Als PC-Programm verpacken, Spielstände als Datei | Steam-Konto (später) |

Danach: weitere Gebiete, mehr Karten-Farben/Joker, Bankhalter, Meister.

## 5. Was ich von dir brauche
1. **Hauptcharakter aus Meshy** (wie bei der Heldin): GLB · Skelett **Mixamo** · **Mit Haut** · **Alle hinzugefügt**.
   Gerade stehend in **A-Pose**, Arme etwas vom Körper weg. Die weiten Ärmel und der lange Mantel sind schwierig fürs Skelett –
   wenn die Robe beim Laufen komisch verzerrt, lieber eine Version mit etwas kürzerem/engerem Mantel erzeugen.
   Animationen (soweit verfügbar): **Idle, Walk, Run, Roll Dodge, Throw (Wurf), Punch/Combo, Sword Slash, Hit Reaction, Death, Block**.
   Was fehlt, baue ich per Code.
2. **Entscheidungen** (siehe offene Fragen unten).
3. Später: **Gegner-Modelle** (Hund – Meshy kann auch Vierbeiner riggen –, Plünderer, Boss) und **Manga-Bilder**.

## 6. Offene Fragen
- Name des Helden? (Spiel vorerst „Aschenblatt“ – Asche der Stadt + Kartenblatt)
- Nur **PC mit Controller**, oder soll es auch am **Handy** spielbar bleiben? (Nur PC erlaubt schönere Grafik.)
- Welche **Nahkampf-Waffe(n)**: Hände, Stockdegen, Kartenklinge, Kriegsfächer – eine oder mehrere zum Wechseln?
- Welcher **erste Boss**?
- Manga-Sequenzen **schwarz-weiß** (klassisch Manga) oder **farbig**?
- Kamera: freie Kamera mit rechtem Stick + Zielerfassung auf R3 (wie Dark Souls) – einverstanden?
