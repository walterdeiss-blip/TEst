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
- **Faire Teams:** verteilt vier Spieler nach Elo auf zwei möglichst gleich starke Teams
  (mit Siegchance); **Zufällig** lost die Teams aus.
- **Spielstand ansagen:** Das Handy sagt nach jedem Punkt den Stand an (Aufschläger zuerst,
  „Einstand“, „Vorteil …“, „Spiel …“, Seitenwechsel). Während des Spiels mit dem Lautsprecher-Knopf an/aus.
- **Spieldauer** läuft auf der Anzeigetafel mit und wird mit dem Ergebnis gespeichert.
- Ergebnis per **Teilen** an WhatsApp & Co. schicken.
- Am Ende kann das Ergebnis in die Rangliste übernommen werden.

### 🏆 Rangliste
- **Elo-Wertung** (Start 1000): Wer gegen stärkere Gegner gewinnt, bekommt mehr Punkte.
  Die Teamstärke ist der Schnitt beider Spieler.
- Siege, Niederlagen, Siegquote und die letzten 5 Ergebnisse jedes Spielers.
- **Spielerprofil** (Spieler antippen): Elo-Verlauf als Kurve (antippen/ziehen zeigt den Wert nach
  jedem Spiel), aktuelle und beste Siegesserie, bester Partner, Angstgegner und Bilanz mit jedem Partner.
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
- Den Endstand per **Teilen** in die WhatsApp-Gruppe schicken.

### 📍 Plätze in der Nähe
- **Meinen Standort verwenden** oder einen Ort, eine PLZ oder Adresse eingeben.
- Umkreis 5 / 10 / 25 / 50 km, sortieren nach Entfernung (und je nach Quelle nach Bewertung oder Anzahl Courts).
- Jede Anlage mit Entfernung, Adresse, **Route** (Google Maps), Website, Telefon und **Termin hier**:
  Damit legst du direkt einen Termin mit dieser Anlage als Ort an.
- Karte mit allen Treffern; Antippen einer Anlage zeigt sie auf der Karte.
- **Ohne Google-Schlüssel** sucht die App in OpenStreetMap (kostenlos; zeigt Anzahl Courts und Halle,
  aber nicht jede Anlage ist dort eingetragen). Über **„Weitere in Google Maps“** öffnet sich die
  Google-Suche für denselben Ort.
- **Mit Google-Schlüssel** kommen die Ergebnisse von Google: mit Bewertungen, **„Jetzt geöffnet“**-Filter,
  Website, Telefon und Google-Karte.

#### Google-Suche einschalten
1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen und ein
   Abrechnungskonto verknüpfen (Google verlangt das auch für das kostenlose Kontingent).
2. Unter *APIs & Dienste → Bibliothek* **„Places API (New)“** und **„Maps Embed API“** aktivieren.
3. Unter *Anmeldedaten* einen **API-Schlüssel** erstellen und unbedingt einschränken:
   - *Website-Einschränkung:* `https://walterdeiss-blip.github.io/*`
   - *API-Einschränkung:* nur „Places API (New)“ und „Maps Embed API“
4. Den Schlüssel in `padel/config.js` bei `googleApiKey` eintragen.

Der Schlüssel steht danach öffentlich im Quelltext. Das ist bei Browser-Schlüsseln normal, deshalb ist
die Einschränkung auf die eigene Website so wichtig. Die Maps Embed API (Karte) ist kostenlos. Für die
Places-Suche gibt es ein monatliches Freikontingent, darüber hinaus wird sie berechnet
([aktuelle Preise](https://mapsplatform.google.com/pricing/)). Am besten in der Cloud Console unter
*Kontingente* ein Tageslimit und unter *Abrechnung* eine Budgetwarnung setzen.

### 📅 Termine
- Termin anlegen (Datum, Uhrzeit, Club, Anzahl Plätze) und per **WhatsApp & Co.** einladen.
- Die Eingeladenen tippen auf den Link und sagen zu, vielleicht oder ab. Ihre Antwort wird als Link
  zurückgeschickt. Sobald der Organisator diesen Link antippt, steht die Zu- oder Absage in seiner App.
  So funktioniert das ganz ohne Server.
- Teilnehmer lassen sich auch von Hand hinzufügen; Antippen wechselt dabei → vielleicht → abgesagt → entfernen.
- Ab 4 Zusagen startet **Spiel starten** direkt die Anzeigetafel mit den Namen.
- Das **Kalender-Symbol** speichert den Termin im Handy-Kalender (.ics).

> **Hinweis iPhone:** Eine App auf dem Home-Bildschirm hat einen eigenen Speicher. Öffnet sich ein Link aus
> WhatsApp in Safari statt in der App, kopiere ihn und füge ihn unter **Termine → „Link aus WhatsApp einfügen“** ein.

## Dateien

- `index.html`, `style.css` – Aufbau und Glas-Design (Symbole als SVG-Sprite in `index.html`)
- `img/` – Padel-Illustrationen (Schläger, Pokal, Turnier-Platz, Kalender) und Platzlinien für den Hintergrund
- `courts.js` – Court-Suche: Google Places / OpenStreetMap, Entfernungen, Zusammenfassen von Courts zu Anlagen
- `config.js` – Einstellungen (Google-API-Schlüssel)
- `vendor/leaflet.*` – Leaflet 1.9.4 für die OpenStreetMap-Karte (BSD-2-Lizenz, siehe `vendor/leaflet-LICENSE`)
- `logic.js` – Zählregeln, Elo-Rangliste, Turnier-Paarungen, Einladungslinks (ohne Oberfläche, getestet)
- `app.js` – Oberfläche und Speicherung (localStorage)
- `sw.js`, `manifest.webmanifest`, `icon.svg`, `icons/` – installierbare, offline nutzbare Web-App
- `test/` – Tests: `node --test padel/test/*.test.js`
