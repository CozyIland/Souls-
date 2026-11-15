# Der Lernende

Ein Souls-like-Bosskampf in 3D. **Vargoth** beobachtet jede deiner Bewegungen und kommt jede Runde
mit einer neuen Taktik zurück: Er verzögert Schläge, wenn du zu früh rollst, zielt dorthin, wohin du
ausweichst, bestraft Heilen und kontert, wenn du zu gierig angreifst.

## Spielen (GitHub Pages einschalten – einmalig)
1. Im Repo auf **Settings → Pages**
2. Bei „Branch“ **main** und **/ (root)** wählen → **Save**
3. Nach ca. 1 Minute läuft das Spiel unter **https://cozyiland.github.io/Souls-/**

## Steuerung
| | PC | Xbox-Controller | Handy |
|---|---|---|---|
| Bewegen | WASD / Pfeile | linker Stick / Steuerkreuz | linke Bildschirmhälfte wischen |
| Rolle | Leertaste / Shift | B (oder A) | „Rolle“ |
| Leichter Angriff (3er-Kombo) | J / Linksklick | RB | „Angriff“ |
| Schwerer Angriff | K / Rechtsklick | RT | „Schwer“ |
| Heiltrank (3 pro Runde) | E | X | „Heilen“ |
| Pause | Esc / P | Start | ☰ |

Controller: In Menüs mit Steuerkreuz/Stick wählen, A bestätigen, B zurück, rechter Stick blättert.
Der Browser erkennt den Controller erst, wenn du auf der Seite einmal eine Taste drückst.

Die Kamera bleibt immer hinter dir und auf Vargoth gerichtet (Lock-on).

## Die Heldin
Das Modell `models/heldin.glb` stammt aus Meshy AI: mit Farben, Mixamo-Skelett und den
Animationen **Walking** und **Running**. Fürs Handy sind die Texturen verkleinert
(Original: `models/quelle/heldin-meshy.glb`).
Stehen, Schwertarm, Rolle, Heiltrank, Treffer und Fallen bewegt der Code über das Skelett.
Wenn du in Meshy weitere Animationen hinzufügst (z. B. Idle, Angriff, Roll Dodge, Treffer, Tod)
und wieder als **GLB** mit **Mixamo**-Skelett, **Mit Haut** und **Alle hinzugefügt** exportierst,
können sie eingebaut werden.

## Offline spielen (eine Datei zum Antippen)
`node tools/einzeldatei.mjs` baut `Der-Lernende.html`: Three.js, Code und Modell stecken darin,
die Datei läuft ohne Internet und ohne Server (Einrichtung siehe Kopf von `tools/einzeldatei.mjs`).
