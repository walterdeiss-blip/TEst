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
- `game.js` – Spiellogik, Computergegner und Kartenanimationen

*Fan-Projekt ohne kommerziellen Zweck. Pokémon und alle zugehörigen Namen sind Marken von
Nintendo, Creatures Inc. und GAME FREAK inc.*
