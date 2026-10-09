# 🎾 Padel

Web-App fürs Padel-Spielen mit Freunden. Sie läuft auf dem Handy wie eine echte App, funktioniert offline
und speichert alles nur auf dem eigenen Gerät. Ein Konto oder Server ist nicht nötig.

**Web-Adresse:** https://walterdeiss-blip.github.io/TEst/padel/
(gleiche GitHub-Pages-Einstellung wie PokéDurak; der Ordner `padel/` muss auf dem Pages-Branch liegen)

- **iPhone (Safari):** Seite öffnen → *Teilen* → **„Zum Home-Bildschirm“**.
- **Android (Chrome):** Knopf **„📲 Installieren“** oben rechts (oder Menü ⋮ → *App installieren*).

## Funktionen

### 🎾 Zählen
- Große Anzeigetafel: Team-Feld antippen = Punkt für dieses Team, **↶ Rückgängig** bei Vertippern.
- Padel-Zählweise 0 – 15 – 30 – 40, Einstand/Vorteil oder **Golden Point**.
- Sätze bis 6 mit 2 Spielen Vorsprung, **Tiebreak** bei 6:6, wahlweise **Match-Tiebreak bis 10** statt 3. Satz.
- 🎾 zeigt, wer aufschlägt (Reihenfolge A1 → B1 → A2 → B2, im Tiebreak nach jedem 2. Punkt).
- Hinweis bei **Seitenwechsel**, der Bildschirm bleibt während des Spiels an.
- Am Ende kann das Ergebnis in die Rangliste übernommen werden.

### 🏆 Rangliste
- **Elo-Wertung** (Start 1000): Wer gegen stärkere Gegner gewinnt, bekommt mehr Punkte.
  Die Teamstärke ist der Schnitt beider Spieler.
- Siege, Niederlagen, Siegquote und die letzten 5 Ergebnisse jedes Spielers.
- Ergebnisse auch nachträglich eintragen und löschen; Spieler umbenennen.
- **Sicherung** als Datei speichern und auf einem anderen Handy laden.

### 🔄 Americano / Mexicano
- Spieler hinzufügen, Punkte pro Spiel (16/21/24/32) und Anzahl Plätze wählen.
- **Americano:** Jede Runde neue Partner. Die App sucht Paarungen mit möglichst wenig Wiederholungen
  (bei 8 Spielern spielt nach 7 Runden jeder einmal mit jedem).
- **Mexicano:** Ab Runde 2 wird nach Tabelle gemischt (1. + 4. gegen 2. + 3.).
- Bei Spielerzahlen, die nicht durch 4 teilbar sind, wird das Aussetzen gleichmäßig verteilt.
- Punkte eintippen; die Punkte des Gegners werden automatisch ergänzt. Die Tabelle aktualisiert sich live.
- Auf Wunsch fließen alle Turnierspiele in die Rangliste ein.

### 📅 Termine
- Termin anlegen (Datum, Uhrzeit, Club, Anzahl Plätze) und per **WhatsApp & Co.** einladen.
- Die Eingeladenen tippen auf den Link und sagen zu, vielleicht oder ab. Ihre Antwort wird als Link
  zurückgeschickt. Sobald der Organisator diesen Link antippt, steht die Zu- oder Absage in seiner App.
  So funktioniert das ganz ohne Server.
- Teilnehmer lassen sich auch von Hand hinzufügen; Antippen wechselt dabei → vielleicht → abgesagt → entfernen.
- Ab 4 Zusagen startet **🎾 Spiel starten** direkt die Anzeigetafel mit den Namen.
- **📆** speichert den Termin im Handy-Kalender (.ics).

> **Hinweis iPhone:** Eine App auf dem Home-Bildschirm hat einen eigenen Speicher. Öffnet sich ein Link aus
> WhatsApp in Safari statt in der App, kopiere ihn und füge ihn unter **Termine → „Link aus WhatsApp einfügen“** ein.

## Dateien

- `index.html`, `style.css` – Aufbau und Design
- `logic.js` – Zählregeln, Elo-Rangliste, Turnier-Paarungen, Einladungslinks (ohne Oberfläche, getestet)
- `app.js` – Oberfläche und Speicherung (localStorage)
- `sw.js`, `manifest.webmanifest`, `icon.svg`, `icons/` – installierbare, offline nutzbare Web-App
- `test/logic.test.js` – Tests: `node --test padel/test/*.test.js`
