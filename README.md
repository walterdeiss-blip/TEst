# PokéDurak

Das russische Kartenspiel **Durak** als Handy-Spiel – statt normaler Spielkarten
mit Pokémon der ersten Generation. Die Karten werden animiert ausgeteilt, gelegt,
aufgenommen und auf den Ablagestapel geworfen.

## Spielen

Es ist eine reine Web-App ohne Build-Schritt:

- `index.html` direkt im Browser öffnen, **oder**
- den Ordner über einen Webserver bereitstellen (z. B. GitHub Pages:
  *Settings → Pages → Branch auswählen*) und die Seite auf dem Handy öffnen.
  Über „Zum Startbildschirm hinzufügen“ läuft das Spiel dann wie eine App im Vollbild.

## Online mit Freunden spielen

1. Beide öffnen die Seite (am besten über GitHub Pages, siehe oben).
2. **Online mit Freunden → Neues Spiel erstellen**: Es erscheint ein 5-stelliger Spielcode.
   Mit **Einladung teilen** lässt sich ein Link per WhatsApp & Co. verschicken.
3. Der Freund öffnet den Link (oder tippt den Code bei **Beitreten** ein) – das Spiel startet sofort.

Die Handys verbinden sich direkt miteinander (Peer-to-Peer über WebRTC mit
[PeerJS](https://peerjs.com/)); zum Verbindungsaufbau wird der kostenlose öffentliche PeerJS-Server genutzt,
ein eigener Server ist nicht nötig. Der Spieler, der das Spiel erstellt, ist Gastgeber: Auf seinem Gerät läuft
die Spiellogik, der Gast schickt seine Züge und bekommt den Spielstand zurück.
Online wird zu zweit gespielt (1 gegen 1).

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

## Regeln (Podkidnoy Durak, 2 Spieler)

- Jeder erhält 6 Karten. Die unterste Stapelkarte liegt offen und bestimmt den **Trumpf**.
- Wer den niedrigsten Trumpf hat, greift zuerst an.
- Angegriffene Karten werden mit einer höheren Karte desselben Typs oder mit einem Trumpf geschlagen.
- Der Angreifer darf Karten nachlegen, deren Wert bereits auf dem Tisch liegt
  (max. 6 pro Runde, in der ersten Runde 5, und nie mehr als der Verteidiger Karten hat).
- **Bito**: alles geschlagen → Karten auf den Ablagestapel, der Verteidiger greift als Nächstes an.
- **Nehmen**: der Verteidiger nimmt alle Karten auf (der Angreifer darf vorher noch nachlegen)
  und setzt aus – der Angreifer greift erneut an.
- Nach jeder Runde wird auf 6 Karten aufgefüllt (Angreifer zuerst).
- Ist der Stapel leer, gewinnt, wer zuerst keine Karten mehr hat. Wer übrig bleibt, ist der **Durak**.

## Dateien

- `index.html` – Aufbau der Seite
- `style.css` – Spielfeld, Kartendesign und Animationen
- `game.js` – Spiellogik, Computergegner, Kartenanimationen und Online-Modus
- `vendor/peerjs.min.js` – PeerJS 1.5.5 (MIT-Lizenz, siehe `vendor/peerjs-LICENSE`)

*Fan-Projekt ohne kommerziellen Zweck. Pokémon und alle zugehörigen Namen sind Marken von
Nintendo, Creatures Inc. und GAME FREAK inc.*
