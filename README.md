# PokéDurak

Das russische Kartenspiel **Durak** als Handy-Spiel – statt normaler Spielkarten
mit Pokémon der ersten Generation. Die Karten werden animiert ausgeteilt, gelegt,
aufgenommen und auf den Ablagestapel geworfen.

## Als App aufs Handy

**Web-Adresse:** https://walterdeiss-blip.github.io/TEst/
(einmalig GitHub Pages einschalten: *Settings → Pages → Source: „Deploy from a branch“ →
Branch `claude/pokemon-durak-card-game-d4rjae`, Ordner `/ (root)` → Save*)

- **iPhone (Safari):** Seite öffnen → *Teilen* → **„Zum Home-Bildschirm“**.
- **Android (Chrome):** Seite öffnen → Knopf **„📲 App installieren“** (oder Menü ⋮ → *App installieren*).
- **Android als APK:** Unter [Releases](https://github.com/walterdeiss-blip/TEst/releases/tag/android-app)
  die Datei `PokeDurak.apk` herunterladen und öffnen (einmalig „Installation aus dieser Quelle erlauben“).
  Die APK wird bei jeder Änderung automatisch von GitHub Actions neu gebaut.

Nach der Installation startet das Spiel im Vollbild mit eigenem Icon. Gegen den Computer
funktioniert es auch offline; die Pokémon-Bilder werden beim ersten Laden gespeichert.

Zum Ausprobieren am Computer genügt es auch, `index.html` im Browser zu öffnen.

## Online mit Freunden spielen

1. Alle öffnen die Seite (am besten über GitHub Pages, siehe oben).
2. **Online mit Freunden → Neues Spiel erstellen**: Es erscheint ein 5-stelliger Spielcode.
   Mit **Einladung teilen** lässt sich ein Link per WhatsApp & Co. verschicken.
3. Die Freunde öffnen den Link (oder tippen den Code bei **Beitreten** ein) und erscheinen in der Lobby.
4. Der Gastgeber kann Computer-Spieler dazunehmen, Schieben/Schummeln einschalten und startet das Spiel.

Die Handys verbinden sich direkt miteinander (Peer-to-Peer über WebRTC mit
[PeerJS](https://peerjs.com/)); zum Verbindungsaufbau wird der kostenlose öffentliche PeerJS-Server genutzt,
ein eigener Server ist nicht nötig. Der Spieler, der das Spiel erstellt, ist Gastgeber: Auf seinem Gerät läuft
die Spiellogik, der Gast schickt seine Züge und bekommt den Spielstand zurück.
Es spielen 2 bis 6 Spieler; verlässt jemand das Spiel, übernimmt ein Computer seinen Platz.

## Russischer Stil & Musik

Gespielt wird auf einer roten Tischdecke mit Goldrand und Stickerei-Borte auf einem Holztisch.
Im Hintergrund läuft **„Kalinka“** (russisches Volkslied, Iwan Larionow 1860, gemeinfrei) im Stil
der alten Pokémon-Game-Boy-Spiele: Rechteck-Melodie, Akkord-Arpeggios, 8-Bit-Bass und -Schlagzeug.
Nach einer ruhigen Strophe wird der Refrain – wie in Russland üblich – mit jeder Wiederholung
schneller. Alles wird live im Browser erzeugt, ohne Audiodateien. Der 🎵-Knopf oben links schaltet die Musik aus und wieder an (wird gespeichert).
Wer **Bljat** sagt und aufnehmen muss, wird von einer wütenden Männerstimme angebrüllt: „Блять!“
(sechs Varianten in `audio/`, erzeugt mit den freien russischen [Piper](https://github.com/rhasspy/piper)-Stimmen
und per sox tiefer, rauer und lauter gemacht – Workflow `.github/workflows/stimme.yml`).

Die Pokémon-Bilder werden aus dem [PokéAPI-Sprites-Repository](https://github.com/PokeAPI/sprites)
geladen. Ohne Internet zeigen die Karten stattdessen das Typ-Symbol.

## Karten

36 Karten, 4 Typen statt 4 Farben, 9 Stärken (6 – Ass):

| Wert | 🔥 Feuer | 💧 Wasser | 🍃 Pflanze | ⚡ Elektro |
|------|----------|-----------|------------|-----------|
| 6    | Glumanda | Karpador  | Raupy      | Voltobal  |
| 7    | Vulpix   | Schiggy   | Hornliu    | Pikachu   |
| 8    | Fukano   | Quapsel   | Bisasam    | Magnetilo |
| 9    | Ponita   | Jurob     | Safcon     | Elektek   |
| 10   | Glutexo  | Schillok  | Bisaknosp  | Lektrobal |
| B    | Magmar   | Jugong    | Bibor      | Magneton  |
| D    | Vulnona  | Quappo    | Sichlor    | Blitza    |
| K    | Arkani   | Garados   | Nidoking   | Raichu    |
| A    | Glurak   | Turtok    | Bisaflor   | Zapdos    |

## Bedienung

- **Karte antippen** → sie hebt sich an und die möglichen Ziele auf dem Tisch leuchten auf.
- **Ziel antippen:** beim Angreifen/Nachlegen „＋ hier legen“, beim Verteidigen die Karte, die du schlagen
  willst, zum Schieben „➡️ schieben“. Nochmal auf die Karte tippen hebt die Auswahl auf.
- Oder die Karte einfach **mit dem Finger aufs Ziel ziehen**.
- **Dawai**, **Bljat** und **Fertig** sagst du selbst über den Knopf rechts – nichts passiert automatisch.

## Regeln (Podkidnoy Durak, 2–6 Spieler)

- Jeder erhält 6 Karten. Die unterste Stapelkarte liegt offen und bestimmt den **Trumpf**.
- Wer den niedrigsten Trumpf hat, greift zuerst an.
- Angegriffene Karten werden mit einer höheren Karte desselben Typs oder mit einem Trumpf geschlagen.
- Der Angreifer darf Karten nachlegen, deren Wert bereits auf dem Tisch liegt
  (max. 6 pro Runde, in der ersten Runde 5, und nie mehr als der Verteidiger Karten hat).
- **Dawai**: alles geschlagen → Karten auf den Ablagestapel, der Verteidiger greift als Nächstes an.
- **Bljat**: der Verteidiger nimmt alle Karten auf (der Angreifer darf vorher noch nachlegen)
  und setzt aus – der Angreifer greift erneut an.
- Angegriffen wird immer der nächste Spieler. Nachlegen dürfen alle außer dem Verteidiger –
  zuerst der Angreifer, dann die anderen der Reihe nach.
- Nach jeder Runde wird auf 6 Karten aufgefüllt (Angreifer zuerst, Verteidiger zuletzt).
- Wer bei leerem Stapel keine Karten mehr hat, ist raus. Wer als Letzter übrig bleibt, ist der **Durak**.

### Zusatzregeln (im Menü einschaltbar)

- **➡️ Schieben (Perevodnoy):** Solange noch nichts geschlagen ist, darf der Verteidiger eine Karte
  gleichen Werts dazulegen und den ganzen Angriff an den nächsten Spieler weitergeben
  (wenn dieser genug Karten hat).
- **🤫 Schummeln:** Man darf auch regelwidrige Karten legen. Mit **🕵️ Erwischt!** kann jeder petzen:
  Wurde geschummelt, geht die Karte zurück und der Schummler bekommt eine Strafkarte –
  war alles korrekt, bekommt der Petzer die Strafkarte. Die Computer schummeln und petzen auch.

## Dateien

- `index.html` – Aufbau der Seite
- `style.css` – Spielfeld, Kartendesign und Animationen
- `game.js` – Spiellogik, Computergegner, Kartenanimationen und Online-Modus
- `music.js` – Hintergrundmusik und Soundeffekte (Web Audio)
- `audio/` – die gesprochenen „Блять!“-Rufe
- `sw.js`, `manifest.webmanifest`, `icons/` – installierbare Web-App (PWA), offline spielbar
- `assets/` – Ausgangsbilder für die Icons der Android-App
- `.github/workflows/android-app.yml` – baut die Android-APK (Capacitor) und veröffentlicht sie als Release
- `vendor/peerjs.min.js` – PeerJS 1.5.5 (MIT-Lizenz, siehe `vendor/peerjs-LICENSE`)

*Fan-Projekt ohne kommerziellen Zweck. Pokémon und alle zugehörigen Namen sind Marken von
Nintendo, Creatures Inc. und GAME FREAK inc.*
