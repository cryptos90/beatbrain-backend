# BeatBrain Change Log (Codex)

## 2026-02-24

### Bereits umgesetzt in den vorherigen Schritten
- Singleplayer: Spotify-Login-Button im Menü ergänzt (unter `Create Quiz`), Login-Pflicht vor den anderen Aktionen.
- Playlists nach Login über API geladen und im Runtime-Speicher gehalten (bis App-Prozess endet).
- Backend `/choose`: Playlists des eingeloggten Users geladen.
- Host Session/Quiz UI überarbeitet:
  - Timer bleibt sichtbar in `question` und `reveal`.
  - Host-Reihenfolge im Quizscreen angepasst (Timer, Frage, Antwortboxen, Songinfos).
  - Falsche Antworten gruppiert, Titel dynamisch (`Falsche Antwort`/`Falsche Antworten`).
- Multiplayer Mobile: Antwortbuttons im Reveal farblich markiert (grün/rot).
- Host außerhalb Quiz: Logo vergrößert.
- Host Choose-Carousel: Fokuszustand verbessert (zentrierte Auswahl mit Zoom/Highlight).
- Backend Playlist-Filter verschärft: nur Playlists mit `host account = owner`.

### Aktueller Schritt
- Host Quizscreen:
  - Reihenfolge geändert auf `Songinfos` und darunter `Nächste Frage` mit Fortschrittsbalken.
  - Block mit Timer/Frage/Antworten weiter nach unten verschoben (`paddingTop` erhöht), damit er nicht am Logo klebt.
  - Songinfo-Block weiter nach unten gesetzt (`marginTop` erhöht).
- Mobile Client:
  - Quizfrage wird als tatsächlicher Fragetext angezeigt (`questionObject.questionText`) statt Hilfstexten wie „Wähle deine Antwort“.
- Texte:
  - Umlaute in UI-Texten an mehreren Stellen korrigiert (`ä`, `ö`, `ü` statt `ae`, `oe`, `ue`).

### Verifikation
- Frontend Typecheck erfolgreich: `npx tsc -p tsconfig.json --noEmit`

### Neuer Schritt
- Choose-Quiz Playlist Filter erweitert:
  - Im Backend werden in `/choose` nur Playlists zurueckgegeben, die
    - dem Host gehoeren (`owner.id === host user id`) und
    - mindestens `50` Songs haben (`tracks.total >= 50`).
  - Dadurch erscheinen Playlists mit weniger als 50 Songs nicht mehr im Choose-Carousel.
- Backend Typecheck erfolgreich: `npx tsc -p tsconfig.json --noEmit`

### Hotfix
- `/choose` Playlist-Fix nach leeren Ergebnissen:
  - Owner-Abgleich nutzt jetzt bevorzugt die User-ID aus dem JWT (`sub`) und vergleicht case-insensitive.
  - Falls `tracks.total` in der Listenantwort fehlt, wird der Track-Count fuer die Playlist nachgeladen.
  - Leere Choose-Ergebnisse werden nicht mehr dauerhaft gecached (damit spaetere Requests wieder laden koennen).
- Backend Typecheck erneut erfolgreich: `npx tsc -p tsconfig.json --noEmit`
