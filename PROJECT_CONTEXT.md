> Bei jeder Änderung an Architektur, Frameworks, Ports, Env-Variablen, Auth-Flow, Build/Run-Commands, Ordnerstruktur oder Systemverhalten MUSS PROJECT_CONTEXT.md im selben Schritt aktualisiert werden. Diese Datei muss immer aktuell sein.

# 1) Projektüberblick
- Was ist BeatBrain?
  - Lokales Musik-Quiz-System mit Spotify-Integration, bestehend aus Expo-Frontend und NestJS-Backend.
- Kernfeatures (Singleplayer/Host/Player, Spotify-Quiz, etc.)
  - Singleplayer mit Spotify-Playlists und serverseitig generierten Quizfragen.
  - Multiplayer (lokal) mit Host/Player-Rollen, Lobby, Join-Code, QR-Join-Link und Live-Spielstatus via Socket.IO.
  - Spotify OAuth Login mit PKCE, Host-JWT, Spotify-Token-Refresh.
- Non-goals (z.B. kein Online Multiplayer)
  - Kein dediziertes Online-Matchmaking/Internet-Multiplayer-System gefunden; Fokus auf lokalem Host/Player-Flow.

# 2) Repository Struktur
- Kurzer Tree der wichtigsten Ordner (frontend, backend, shared falls vorhanden)
  - `beatbrain-frontend/`
    - `src/{components,constants,data,host,hooks,mobile,navigation,screens,services,shared,types}`
    - `assets/` (UI-Assets wie Logo/Icon/Splash)
    - `app.json`, `package.json`, `tsconfig.json`, `.env.example`
  - `beatbrain-backend/`
    - `src/{auth,spotify,quiz,multiplayer,common,config}`
    - `main.ts`, `app.module.ts`
    - `package.json`, `tsconfig*.json`, `eslint.config.mjs`, `.env.example`, `nest-cli.json`
  - Root: `README.md`, `project-log.md`, `start-all.bat`
- Wichtige Dateien (env examples, configs)
  - Backend: `beatbrain-backend/.env.example`, `beatbrain-backend/src/main.ts`, `beatbrain-backend/src/auth/auth.service.ts`
  - Frontend: `beatbrain-frontend/.env.example`, `beatbrain-frontend/app.json`, `beatbrain-frontend/App.tsx`, `beatbrain-frontend/src/host/components/HostLayout.tsx`, `beatbrain-frontend/src/host/components/HostPage.tsx`, `beatbrain-frontend/src/host/hooks/useHostController.ts`

# 3) Tech Stack
- Frontend:
  - Framework (Expo/React Native/Web target)
    - Expo + React Native + React 19, Web-Target via `expo start --web`.
  - UI libs
    - React Native Core + Expo StatusBar; keine zusätzliche UI-Komponentenbibliothek gefunden.
  - State management
    - Lokaler React State in zentralem Controller-Hook `useBeatBrainController`.
  - Networking
    - `fetch` via `services/apiClient.ts` mit zentralem JWT-Header-Handling, 401-Refresh-Retry und expliziten API-Fehlern (inkl. Statuscode/429 sowie `status=0` bei nicht erreichbarem Backend), HTTP-API zum Backend, Socket.IO-Client für Realtime.
- Backend:
  - Framework (Express/Nest/etc.)
    - NestJS (`@nestjs/core`, `@nestjs/platform-express`).
  - Realtime (WS/Socket.IO)
    - Nest WebSocket Gateway mit Socket.IO (`@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`).
  - DB/ORM (falls vorhanden)
    - Unklar / nicht gefunden. Suche in `beatbrain-backend/package.json` und `beatbrain-backend/src` nach Prisma/TypeORM/Mongoose/Sequelize ergab keine Treffer.
- Tooling:
  - TypeScript, Lint/Format, Testing
    - TypeScript in Frontend+Backend.
    - Backend ESLint + Prettier konfiguriert (`eslint.config.mjs`, `npm run lint`, `npm run format`).
    - Backend Tests mit Jest (`npm run test`, `test:e2e` vorhanden).
    - Frontend: kein separates Lint/Test-Script in `package.json` gefunden.

# 4) Lokales Setup
- Voraussetzungen (Node-Version, package manager)
  - Node.js + npm erforderlich.
  - `start-all.bat` empfiehlt Node 20 LTS (warn bei >=23).
  - Exakte verpflichtende Node-Version: Unklar / nicht gefunden (keine `engines`-Angabe in `package.json`).
- Install Commands (frontend/backend)
  - Backend: `cd beatbrain-backend && npm install`
  - Frontend: `cd beatbrain-frontend && npm install`
- Start Commands (frontend/backend)
  - Backend: `cd beatbrain-backend && npm run start:dev`
  - Backend robust local start (kills listener on 3000, then fixed start): `cd beatbrain-backend && start-backend.bat`
  - Frontend: `cd beatbrain-frontend && npm run start` (alternativ `android`, `ios`, `web`)
  - Frontend LAN (stabiler für Device im selben Netz): `cd beatbrain-frontend && start-frontend-lan.bat` oder `npm run start:lan`
  - Frontend Tunnel (Default für Expo Go/Firewall-Probleme): `cd beatbrain-frontend && start-frontend.bat` oder `start-frontend-tunnel.bat`
  - Frontend Web/Host: `cd beatbrain-frontend && npm run start:web`; `http://localhost:8081/` oeffnet den Host-Flow und kanonisiert auf `/host/start`.
  - Optional kombiniert: `start-all.bat`
  - Host-Web Layout-Test lokal: `cd beatbrain-frontend && npm run start:web`, dann `http://localhost:8081/host/start` im Browser oeffnen.
- Standard-Ports (Frontend-Port, Backend-Port, WS-Port)
  - Backend HTTP-Port: `3000` (deterministisch via `start-backend.bat`, inkl. Port-Freigabe vor Start).
  - Optionaler Fallback in `main.ts` nur mit `ALLOW_PORT_FALLBACK=1` (`3000` -> `3001` -> `3002`).
  - WebSocket-Port: kein separater Port; Socket.IO läuft auf demselben Backend-Server.
  - Frontend-Port: `8081` in den lokalen BAT-Startskripten (`--port 8081`), damit QR/Host stabil bleibt.
- LAN/Host Hinweise (z.B. was muss auf welchem Gerät laufen)
  - Frontend `EXPO_PUBLIC_API_BASE_URL` muss vom Client erreichbar sein (z.B. LAN-IP bei mobilem Device).
  - Frontend-BAT-Skripte setzen `REACT_NATIVE_PACKAGER_HOSTNAME` automatisch auf eine private IPv4 (bevorzugt `192.168.*`, dann `10.*`, dann `172.16-31.*`) und räumen Port `8081` vor dem Start frei.
  - Für Web-OAuth lokal ist Loopback-Redirect nötig (127.0.0.1/[::1]), nicht 192.168.*.
  - Backend-CORS erlaubt konfigurierte Origins (`HOST_WEB_ORIGIN`, `PLAYER_APP_ORIGIN`) plus Dev-Origins für Loopback und private LAN-IPv4-Hosts auf Ports `8081`, `19006` und `19000`.
  - Empfohlene konsistente Web-Dev-Kombination: Frontend `http://127.0.0.1:8081`, Backend `http://127.0.0.1:3000`, `HOST_WEB_ORIGIN=http://127.0.0.1:8081`.
  - Host-Web Layout-Aenderungen gelten nur fuer den Host-Flow unter `src/host/*`; mobile Screens/Navigation bleiben unveraendert.

# 5) Environment Variablen
- Backend:
  - `SPOTIFY_CLIENT_ID` - Spotify App Client ID.
  - `SPOTIFY_REDIRECT_URI` - Mobile OAuth Redirect (`beatbrain-login://callback`).
  - `SPOTIFY_REDIRECT_URI_WEB` - Web OAuth Redirect (z.B. `http://127.0.0.1:3000/auth/spotify/callback`).
  - `JWT_SECRET` - Secret für App-JWT Signierung.
  - `HOST_EMAIL` - erlaubte Host-Spotify-Email (Whitelist).
  - `HOST_WEB_ORIGIN` - Redirect-Ziel für Web-OAuth-Callback (z.B. Expo-Web-Origin).
  - `PLAYER_APP_ORIGIN` - optionaler CORS Origin für Player-App/Webclient.
  - `DEFAULT_CLIENT` - optionaler Fallback für OAuth-Clienttyp (`mobile` oder `web`, default `mobile`).
  - `PORT` - optionaler Backend-Port.
  - `ALLOW_PORT_FALLBACK` - optional (`1` aktiviert Backend-Fallback-Ports; default deaktiviert).
- Frontend:
  - `EXPO_PUBLIC_API_BASE_URL` - Backend-Basis-URL (höchste Priorität).
  - `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` - Spotify Client ID (derzeit im Frontend nicht aktiv im OAuth-Request genutzt; Backend steuert OAuth-Start).
  - `EXPO_PUBLIC_SPOTIFY_REDIRECT_URI` - Mobile Redirect.
  - `EXPO_PUBLIC_SPOTIFY_REDIRECT_URI_WEB` - Web Redirect zu Backend-Callback (bei ungültigem Wert nutzt Frontend automatisch den sicheren Fallback `http://127.0.0.1:3000/auth/spotify/callback`).
- Hinweis zu .env/.env.example und .gitignore Regeln
  - Beide Projekte ignorieren `.env` und erlauben `.env.example` im VCS (`!.env.example`).
  - Ohne `EXPO_PUBLIC_API_BASE_URL` nutzt Frontend automatisch:
    - Web: `http://127.0.0.1:3000`
    - Native (Expo Go): `http://<ermittelte-expo-host-ip>:3000` aus Expo Constants; wenn nicht ermittelbar fallback auf Loopback mit Dev-Warnung.
  - Frontend-Auth-Persistenz nutzt `src/services/authStorage.ts` (Web `localStorage`, Native `expo-secure-store`, optional AsyncStorage-Fallback wenn installiert).

# 6) Authentifizierung (Spotify)
- OAuth Flow (PKCE)
  - Implementiert in `beatbrain-backend/src/auth/auth.service.ts`:
    - Generiert `state`, `code_verifier`, `code_challenge` (S256).
    - Speichert Pending Auth State serverseitig (TTL 10 Minuten) inkl. `clientType` und optional `redirectOrigin`.
    - Callback liefert keine Tokens mehr direkt aus, sondern redirectet mit kurzlebigem `auth_code`.
  - Start-Endpunkt unterstützt expliziten Clienttyp: `POST /auth/spotify/start?client=web|mobile` (fallback: `DEFAULT_CLIENT` oder `mobile`).
- Welche Redirect URIs werden genutzt (Mobile + Web)
  - Mobile: `beatbrain-login://callback`.
  - Web lokal: `http://127.0.0.1:<PORT>/auth/spotify/callback` oder `http://[::1]:<PORT>/auth/spotify/callback`.
  - Web produktiv: `https://<domain>/.../callback`.
  - Frontend-Sicherheitsfallback: ungültige Web-ENV-Werte (z.B. `localhost`, `192.168.*`, `exp://`) werden im Dev-Flow automatisch auf `http://127.0.0.1:3000/auth/spotify/callback` zurückgesetzt.
  - Web-Endfluss: Der Host-Web-Flow uebergibt `redirectOrigin=/host/start`; nach erfolgreichem Callback redirectet das Backend daher auf `HOST_WEB_ORIGIN/host/start?auth_code=...` (bzw. auf das explizit uebergebene Host-Target).
  - Verboten: `exp://`, `http://localhost...`, `http://192.168.x.x...`.
- Welche Scopes
  - `user-read-private user-read-email playlist-read-private playlist-read-collaborative user-modify-playback-state user-read-playback-state user-read-currently-playing app-remote-control streaming`.
- Token Handling (refresh, JWT)
  - Spotify Access/Refresh Tokens im Backend Host-Session-Objekt.
  - Dev-Persistenz: Host-Session wird in Development zusätzlich in `beatbrain-backend/.dev-host-session.json` geschrieben/geladen, um Spotify-Debug-Checks nach Backend-Neustart zu erleichtern.
  - Refresh bei Ablauf und bei 401 in Spotify-Service.
  - App-JWT (`role: host`) per `jsonwebtoken`, Laufzeit 12h.
  - Auth-Ergebnis für Frontend über kurzlebigen One-Time-Code (`/auth/result?code=...`, TTL 60s) statt Token-Query-Parameter.
  - Frontend persistiert `appJwt`: Web via `localStorage`, Native via `expo-secure-store`.
  - Web verarbeitet `auth_code` zusätzlich beim App-Start aus `window.location.search` und bereinigt die URL danach.
- Host-only Restriction (HOST_EMAIL o.ä.) falls implementiert
  - Ja: Login nur erlaubt, wenn Spotify `/me` Email == `HOST_EMAIL`.

# 7) Spotify Integration
- Welche Spotify Endpoints werden genutzt
  - OAuth: `https://accounts.spotify.com/authorize`, `https://accounts.spotify.com/api/token`
  - User: `https://api.spotify.com/v1/me`
  - Playlists/Tracks: `https://api.spotify.com/v1/playlists/...`
  - Dev-Diagnose-Endpunkte (nur `NODE_ENV !== 'production'`): `GET /dev/spotify/ping`, `POST /dev/spotify/playlistTest`, `GET /dev/spotify/mePlaylists`.
- Wo ist der Spotify Client/Service
  - Backend: `beatbrain-backend/src/spotify/spotify.service.ts` + `spotify.controller.ts`.
  - Frontend konsumiert nur Backend-API (`beatbrain-frontend/src/services/beatbrainApi.ts`).
- Pagination/Retry/Rate-limit Handling (falls implementiert)
  - Pagination: ja (`getAllPlaylistTracks` loopt über `next`).
  - Retry: ja, bei Spotify 401 einmaliger Refresh+Retry.
  - Rate-limit (429): ja, zentral über `spotifyFetch` (`beatbrain-backend/src/spotify/spotifyHttp.ts`) mit globalem Concurrency-Limit (2), globalem Mindestabstand (150ms) und einem globalen 429-Cooldown-Fenster. Sobald ein Spotify-Request `429` liefert, werden weitere Spotify-Requests bis Ablauf von `Retry-After` lokal geblockt und ohne neuen Spotify-Netzwerkcall als `429` beantwortet.
  - 5xx Handling: begrenzter Retry (max. 1) mit kurzem Backoff.
  - Request-Spam-Schutz:
    - Backend `resolvePlaylists`: 30s In-Memory-Cache pro `hostUserId + playlistId`.
    - Backend `getAllPlaylistTracks`: 60s In-Memory-Cache + In-Flight-Deduplizierung pro Playlist.
    - Frontend Choose-Flow: AbortController + In-Flight-Dedupe + Session-Cache für `/spotify/playlists/resolve`.
    - Frontend 429-UX: zeigt Retry-After Countdown (`Spotify rate-limited. Try again in Xs.`) und blockiert erneute Resolve-Requests bis Ablauf.

# 8) Quiz Engine
- Wo wird Quiz generiert (frontend/backend)
  - Backend `beatbrain-backend/src/quiz/quiz.service.ts`.
- Quiz-Datenobjekt Struktur (Felder)
  - Session-Response: `sessionId`, `playlistId`, `totalSongs`, `songIDs`.
  - Next-Question Response: `done`, `remainingSongIDs`, `question` mit:
    - `questionObject { questionText, answerFieldPath, answerType, format?, payload? }`
    - `correctSongId`, `correctTrackUri`, `correctAnswer`, `wrongAnswers`, `options`
    - optional `optionDetails[] { value, label, coverUrl?, subtitle? }`
    - `trackInfo { id, uri, name, artist, album, coverUrl, year, explicit, popularity }`
- Question Pool Struktur
  - Serverseitiger `QUESTION_POOL` mit Fragetypen:
    - Songtitel (4 Optionen)
    - Artist (4 Optionen)
    - Album (4 Optionen)
    - Year Multiple Choice (4 Optionen)
    - Year Input `+/- 2`
    - Year Input `+/- 4`
    - `vor oder nach 2000`
    - `Solo Artist oder Band`
    - `Welcher Song ist der aelteste?`
    - `Welcher Song ist der neuste?`
    - `Welches Cover ist korrekt?`
  - `oldest-song`, `newest-song` und `cover` verwenden als Antwortwerte Spotify-Track-IDs; die sichtbaren Labels/Cover kommen ueber `optionDetails`.
  - `cover` setzt `questionObject.format = "cover_options"`, damit das Frontend statt Textbuttons vier Cover-Buttons rendert.
  - Sessions mit `decadeTag` filtern weiterhin alle jahrbezogenen Fragetypen (`year`, `year-pm2`, `year-pm4`, `before-after-2000`) serverseitig aus.
- SongID Handling & Cleanup Regeln
  - Session hält `remainingSongIds` + `allTracksById` (dedupliziert über Spotify Track IDs).
  - Pro Frage wird ein Song aus `remainingSongIds` entfernt.
  - Cleanup via `DELETE /quiz/sessions/:id`.

# 9) Multiplayer (lokal)
- Host vs Player responsibilities
  - Host: Lobby erzeugen, Runde starten, Reveal/Next/End steuern; benötigt Host-JWT.
  - Player: Join per Join-Code, Antworten senden; kein Spotify-Login nötig.
- Join Flow (QR)
  - Host-Web-Lobby erzeugt einen QR-/Join-Link auf die Web-Root mit Query-Parametern (`/?joinCode=...`).
  - Wenn im Host eine LAN-erreichbare Backend-Basis bekannt ist, wird sie zusätzlich als `backendUrl=...` in den Join-Link kodiert.
  - Mobile Player lesen `joinCode` plus optional `backendUrl` aus QR-Scan oder Deep-Link und nutzen diese Basis für den Player-Join.
- Transport (WebSocket/HTTP)
  - HTTP für Auth/Playlist/Quiz APIs.
  - Socket.IO für Lobby-/Round-Realtime; Frontend-Clients erlauben `websocket` mit `polling`-Fallback statt WebSocket-only.
- Max Players
  - 10 (Backend enforced in `MultiplayerService`).
- Game State Authority (Host/Backend)
  - Backend ist authoritative für Lobby-/Round-State; Host-Aktionen sind autorisiert über JWT + Lobby-Bindung.

# 10) Coding Guidelines (für zukünftige Chats)
- “Keine God-Files” Regel (App.tsx schlank halten)
  - Beibehalten: `App.tsx` als Bootstrap/Composition, Logik in Hook/Services/Screens.
- Kleine, generische Functions/Services/Utils bevorzugen
  - API-/Auth-/Quiz-/Realtime-Logik in dedizierten Services/Hooks trennen.
- Duplikate vermeiden
  - Gemeinsame Typen/Konstanten in `src/types` und `src/constants` halten.
- project-log.md / changelog pflegen
  - Jede Aufgabe/Änderung mit Zeitstempel, Change/Files/Reason/Test dokumentieren.
- PROJECT_CONTEXT.md immer aktuell halten (nochmal kurz)
  - Bei jeder strukturellen/technischen Änderung im selben Schritt aktualisieren.

# 11) Status & Offene Punkte
- Was ist fertig?
  - Spotify-basierter Singleplayer/Host-Flow.
  - Lokaler Multiplayer mit Socket.IO.
  - Mock-Artefakte und lokale Mock-Audio-Dateien entfernt.
  - Redirect-Validierung für Mobile + Web (Loopback HTTP und HTTPS) implementiert.
- Was ist in Arbeit?
  - Unklar / nicht gefunden (kein expliziter In-Progress-Status im Code). Grundlage: aktueller Stand aus `project-log.md`.
- Nächste TODOs (max 10)
  - 1) Konsistente, echte Spotify Dashboard Redirect-URIs prüfen (Mobile + Web) und ENV exakt spiegeln.
  - 2) Optional: Frontend-Skripte für Lint/Test ergänzen.
  - 3) Optional: E2E-Test für OAuth-Flows (mobile/web) ergänzen.
  - 4) Optional: `expo-av` auf `expo-audio`/`expo-video` migrieren (SDK 54 Deprecation-Warnung).
  - 5) Optional: Encoding-Artefakte in einzelnen UI-Strings bereinigen.
- Bekannte Probleme (z.B. Redirect URI Themen)
  - Redirect-URI muss string-genau zwischen Spotify Dashboard und ENV passen.
  - Web-Loopback-HTTP ist nur für `127.0.0.1`/`[::1]` zulässig; LAN-HTTP (`192.168.*`) wird blockiert.

# 12) Update 2026-02-20 (Prompt 1 Mobile Cleanup)
- Frontend Architektur:
  - Aktiver App-Entry laeuft jetzt ueber `src/mobile/*`.
  - Neue interne Struktur ist aktiv genutzt: `src/mobile`, `src/shared`, `src/host`.
  - `src/hooks/useBeatBrainController.ts` und `src/navigation/AppRouter.tsx` sind nur noch Re-Exports auf mobile-only Implementierung.
- Mobile Scope:
  - Mobile enthaelt keinen aktiven Host-Flow mehr (kein `host:createLobby`, `host:startRound`, `host:reveal`, `host:next`, `host:end` im aktiven Controller).
  - Multiplayer in Mobile ist Player-Controller-only (Join, Answer, Continue).
  - Join verlangt `sessionId`, `name`, `avatarDataUrl`; Avatar-Picker nutzt `ImagePicker.MediaType.Images`.
- Choose Flow / 429-Schutz:
  - `Choose Quiz` nutzt nur kuratierte statische Playlists aus `src/shared/data/curatedPlaylists.ts`.
  - Im aktiven Mobile-Flow werden beim Oeffnen von Choose keine `/spotify/playlists/resolve` Requests mehr gestartet.
- Auth/API Stabilitaet:
  - Shared API Client implementiert fail-fast bei 401 (Refresh-Versuch, danach JWT clear ohne Loop).
- Backend Quiz Engine:
  - `POST /quiz/sessions` akzeptiert jetzt `{ playlistId, questionCount, decadeTag }`.
  - Session speichert `questionCount`, `decadeTag`, `askedCount`.
  - Neue Fragetypen: Songtitel (4), Artist (4), Album (4), Year MC (4), Year +/-2 (4), Year +/-4 (4), Before/After 2000 (2).
  - Entfernt: `year-input`, `popularity`, `explicit` als Fragetypen.
  - `nextQuestion` liefert nach `questionCount` Fragen `{ done: true }`.
- 429-Weitergabe:
  - Spotify-429 inkl. `retryAfterSeconds` bleibt ueber bestehende Exception-Filter-Payload bis ins Frontend erhalten.

# 13) Start Script Update (2026-02-20)
- Frontend default start is now Tunnel mode on fixed port 8081.
  - `npm run start` -> `npm run start:tunnel`
  - `start:tunnel`, `start:lan`, `start:web` all run with `--port 8081 --clear`.
- Frontend launcher hardened:
  - `beatbrain-frontend/start-frontend.bat` installs dependencies automatically when `node_modules` is missing.
  - Frees port 8081 before start.
  - Default mode is Tunnel; LAN is optional via `start-frontend.bat lan`.
- Backend launcher hardened:
  - `beatbrain-backend/start-backend.bat` installs dependencies automatically when `node_modules` is missing.
  - Supports optional port argument (default `3000`) and frees the selected port before start.
- Root launchers:
  - `start-all.bat` now starts backend + frontend in separate windows via sub-repo start scripts.
- Optional `start-all.bat lan` forwards LAN mode to frontend.

# 14) Update 2026-02-20 (Stability + Host Web App)
- Backend startup stability:
  - `beatbrain-backend/tsconfig.json` now sets `compilerOptions.rootDir` to `./src`, so Nest dev output resolves from `dist/main.js` path expectations.
  - `beatbrain-backend/src/main.ts` EADDRINUSE hint now prints a concrete suggestion (`set PORT=<preferred+1>`) instead of malformed text.
- Root script hardening:
  - `start-frontend.bat` auto-detects the current machine's active LAN IPv4 for `EXPO_PUBLIC_API_BASE_URL` and `REACT_NATIVE_PACKAGER_HOSTNAME`, supports an optional backend override argument, tries Tunnel by default, auto-falls back to LAN on tunnel failure, preserves exit code, and pauses before close for non-web modes.
  - `start-backend.bat` preserves backend exit code, pauses on crash for visible diagnostics, and frees the backend port via PowerShell `Get-NetTCPConnection` (language-independent; no fragile `find \"LISTENING\"` dependency).
  - `start-all.bat` keeps split windows (`cmd /k`) and parameterized mode/port forwarding.
- Mobile Spotify login completion:
  - Redirect parsing accepts Spotify standard `code` (fallback `auth_code`) and finalizes backend exchange -> app JWT persistence, with dev-safe logging and no full code dump.
- Host web app:
  - Web route `/host` now renders dedicated host flow (`beatbrain-frontend/src/host/*`) with screens for login, lobby, setup, quiz and results.
  - Web root `/` defaults to the host flow unless player/mobile query params such as `joinCode`, `sessionId`, `code`, `auth_code`, `state`, or `error` are present.
  - Host-Erkennung liegt in `beatbrain-frontend/App.tsx`; nur `Platform.OS === "web"` kann in den Host-Flow gehen.
  - Host socket actions implemented in host UI: `host:createLobby`, `host:startRound`, `host:reveal`, `host:restartQuiz`, `host:returnToMenu`.
  - Big-screen host quiz view includes timer, reveal state, per-option player avatar mapping, playback error panel, and continue-gate visibility (`x/y`).
- Multiplayer restart/return sync:
  - Backend supports `host:restartQuiz` and `host:returnToMenu` in gateway/service and broadcasts `game:restarted` / `session:returnedToMenu` plus `lobby:state`.
  - Mobile player controller listens for these events and resets local multiplayer round state accordingly.

# 15) Update 2026-02-20 (Choose API + Pool Builder Robustness)
- Choose source of truth moved to backend:
  - New backend module `src/choose/*` provides `GET /choose` (host JWT required).
  - Curated playlist IDs are now stored server-side in `beatbrain-backend/src/choose/choose.constants.ts`.
  - Backend response model: `ChoosePlaylist { id, name, coverUrl }`.
- Frontend choose flow:
  - Mobile/Host now load playlists from `GET /choose` via `getChoosePlaylists(...)`.
  - Frontend no longer keeps curated playlist IDs for choose; local curated playlist data files were removed.
  - Choose screen shows loading state and clearer 429/401 messages.
- Spotify playlist track mapping hardening:
  - `SpotifyService.getPlaylistTrackPageMinimal(...)` now maps from `items[].track` (not item root), uses `market=from_token`, filters `null` tracks, `spotify:local:` URIs, and missing `id/uri`.
  - Added page-level diagnostics: `itemsCount`, `nullTrackCount`, `localTrackCount`, `missingIdOrUriCount`.
- Quiz pool builder hardening:
  - Added `beatbrain-backend/src/quiz/poolBuilder.ts` with serial page fetching from offset `0` (`0,50,100,...`), dedupe by track ID, target pool size 120, minimum pool size 30, max 10 pages.
  - `QuizService.createSession(...)` now uses the pool builder and logs pool diagnostics.
  - If pool remains too small, error now includes diagnostic counts instead of blind generic failure.
- TSConfig stability:
  - Frontend `tsconfig` extends `expo/tsconfig.base.json`.
  - Backend `tsconfig` now includes only `src/**/*.ts` and excludes `test`/spec files to avoid `rootDir` include conflicts.

# 16) Update 2026-02-20 (Spotify 403 -> Reauth Guidance)
- Backend Spotify forbidden classification:
  - `SpotifyService` now analyzes Spotify `403` responses and maps them to actionable errors.
  - If token user (`/me`) and playlist owner differ, backend returns `409` with reason `ACCOUNT_MISMATCH`.
  - If Spotify error message indicates insufficient scopes/permissions, backend returns `409` with reason `INSUFFICIENT_SCOPE`.
  - Other forbidden cases return `403` with reason `SPOTIFY_FORBIDDEN`.
  - `spotifyHttp` now lets `403` responses pass through (only `401` throws unauthorized shortcut), so service-level diagnostics can inspect payloads.
- Frontend reauth UX (mobile controller):
  - On `ApiHttpError status=409`, choose/create flows show backend message and enable an explicit `Erneut einloggen` action that reuses `startSpotifyLogin()`.
  - Reauth prompt state is reset on successful reloads or when a new login is started.

# 17) Update 2026-02-20 (Quiz Session Song Cache)
- Quiz sessions now preload all playlist tracks once at session creation:
  - New DTO `QuizSong` in `beatbrain-backend/src/quiz/types/quizSong.ts`.
  - `SpotifyService.getAllPlaylistQuizSongs(playlistId)` paginates Spotify playlist tracks (`limit=100`, `offset+=100`, `market=from_token`), maps to `QuizSong`, deduplicates by track id, and logs `tracks` + `pageRequests`.
  - `QuizService.createSession(...)` stores preloaded songs on session (`session.songs`) and builds internal quiz track pool from these cached songs.
- No Spotify calls during round progression:
  - `QuizService.nextQuestion(...)` now reads only from in-memory session data; Spotify is only called during session creation.
- Reauth compatibility for preload:
  - If Spotify responds with `403` during preload, backend returns `409` (`Spotify re-auth required`) with reason details, preserving existing frontend reauth flow.

# 18) Update 2026-02-21 (Spotify Songs Debug + Choose Error Button Width)
- Spotify token-source unification:
  - `SpotifyService` now uses a central helper `getUserSpotifyAccessTokenOrThrow()` as single source for Spotify access tokens.
  - Meta- and Tracks-calls share the same resolver path via `spotifyApiRequest(...)`.
- Spotify debug instrumentation (token-safe):
  - For `spotify_meta` and `spotify_tracks` calls, backend logs structured debug lines with:
    - `action`, `playlistId`, `endpointPath`, `tokenFingerprint` (SHA256 prefix, no raw token)
    - on errors additionally `statusCode`, `spotifyMessage`, and optional `tokenUserId` for `401/403`.
- Songs endpoint for quiz seed:
  - Seed loader uses Spotify playlist tracks endpoint `/v1/playlists/{id}/tracks` with constrained fields and paging params:
    - `limit=min(4*questionCount,100)`, `offset=0`, `market=from_token`
    - `fields=items(track(id,uri,name,artists(name),album(name,images(url),release_date),duration_ms,preview_url,explicit,popularity)),total,next,limit,offset`
- Error mapping behavior:
  - Non-2xx responses now consistently extract Spotify payload message (`error.message`) with fallback to `statusText`.
  - `400/404` remain original status/messages (not masked as reauth).
  - Reauth mapping remains limited to real Spotify `403` branches.
- Frontend choose error layout:
  - Error view buttons (`Erneut einloggen`, `Retry`) now render with fixed shared width (`90%`, `maxWidth: 420`) for consistent visual size.

# 19) Update 2026-02-21 (Playlist Items Fallback + 403 Mapping Refinement)
- Spotify playlist items retrieval hardening:
  - `SpotifyService` now fetches playlist song pages via `/playlists/{id}/tracks` with an automatic fallback to `/playlists/{id}/items` for `403/404` on the tracks path.
  - Fallback keeps identical query parameters (`limit`, `offset`, `market`, `fields`) and logs a token-safe debug fallback event.
  - Applied to quiz seed loading and minimal track page loading, plus all-tracks pagination bootstrap.
- Forbidden error mapping refinement:
  - Playlist `403` is no longer always mapped to `409 re-auth required`.
  - `409` is now limited to actionable reauth reasons (`ACCOUNT_MISMATCH`, `INSUFFICIENT_SCOPE`).
  - Other forbidden cases remain `403` and pass through Spotify message context to frontend.
- Dev diagnostics:
  - `POST /dev/spotify/playlistTest` now also falls back from `/tracks` to `/items` on `403/404` for clearer endpoint-difference debugging.
- Choose error visibility:
  - Choose error screen can show secondary reauth details even when a primary error message exists (if different), improving root-cause visibility.

# 20) Update 2026-02-21 (Spotify Playlist Songs: Items-Only)
- Spotify playlist song endpoints are now items-only:
  - Backend no longer calls Spotify `/v1/playlists/{id}/tracks` for playlist songs.
  - All playlist-song fetches use `/v1/playlists/{id}/items` with constrained `fields`, `limit`, `offset`, `market=from_token`.
  - Removed `/tracks -> /items` fallback logic because `/tracks` is no longer attempted.
- Affected backend paths:
  - Quiz seed loading (`limit=min(4*questionCount,100)`) now fetches via `/items`.
  - Playlist-page minimal mapper and all-tracks pagination bootstrap now fetch via `/items`.

# 21) Update 2026-03-29 (Choose UI Race Fix + Multiplayer Join Fallback)
- Frontend choose-flow stability:
  - `useBeatBrainController.loadChoosePlaylists(...)` now preserves UI loading/error state even when a background playlist prefetch is already in flight.
  - The choose screen no longer stays blank when the visible screen reuses an earlier non-UI request; the foreground caller now receives the shared result and renders success/error deterministically.
  - Shared frontend HTTP requests now abort after `8s` and surface a backend-unreachable error instead of leaving `Choose Quiz` in an endless loading state when the device cannot reach the backend host.
- Multiplayer join robustness:
  - Host-web join QR now forwards `backendUrl` when available so mobile players can adopt the correct backend base automatically.
  - Mobile player join reads that backend override from QR/deep links and uses it for Socket.IO/Auth requests.
  - Host and mobile Socket.IO clients now allow `polling` fallback in addition to `websocket`, improving join reliability on restrictive device/network paths.
  - Frontend startup no longer depends on a hardcoded developer IP; the launcher now derives the current machine's LAN IP automatically, while backend CORS accepts private LAN dev origins on the standard Expo/web ports.
  - Dev diagnostics endpoint `POST /dev/spotify/playlistTest` now tests `/items` directly.
- OAuth/Login flow, redirects, and ports remain unchanged.

# 21) Update 2026-02-21 (Playback Device Cache to Reduce Spotify Calls)
- Spotify playback request minimization:
  - `SpotifyService.startPlayback(...)` now caches a resolved Spotify `deviceId` in-memory (`TTL: 5 minutes`) and reuses it for subsequent playback requests.
  - This avoids repeated `/me/player/devices` calls on every question in normal quiz flow.
  - If playback returns `404`, the cache is cleared and the service performs one forced device refresh before failing.
- Error behavior:
  - Existing playback error mapping for `401`, `403`, `404`, `429` remains unchanged.
  - No OAuth/Login/Redirect flow changes.

# 22) Update 2026-02-21 (Global 429 Request Lock)
- Backend Spotify request lock on 429:
  - `spotifyFetch(...)` now applies a global cooldown window after any Spotify `429` response using the response `Retry-After`.
  - During cooldown, all further Spotify requests are short-circuited locally with synthetic `429` responses (including `Retry-After`) and no outgoing Spotify network traffic.
  - Previous automatic 429 retry loop was removed to prevent additional requests while throttled.
- Scope:
  - Applies to all Spotify calls that go through `spotifyFetch` (playlist/items, playback, and dev spotify diagnostics).

# 23) Update 2026-02-21 (Items Payload Mapping Fix)
- Fixed `/playlists/{id}/items` payload parsing:
  - Spotify items endpoint responses are now mapped from `items[].item` (with compatibility fallback to legacy `items[].track` if present).
  - Query field selections for playlist songs were corrected from `items(track(...))` to `items(item(...))`.
  - Non-track media items are filtered by `item.type !== 'track'`.
- Affected flows:
  - Quiz seed song loading (`getPlaylistQuizSeedSongs`) now correctly loads songs from `/items`.
  - Playlist track page mapping (`getPlaylistTrackPageMinimal`) and full track bootstrap (`getAllPlaylistTracks`) now parse `/items` correctly.

# 24) Update 2026-02-21 (Year Input + Quiz UI + App Remote Playback)
- Backend question payload extension:
  - Quiz song DTO now includes parsed `releaseYear` from Spotify album `release_date`.
  - Year tolerance templates (`year-pm2`, `year-pm4`) now return `questionObject.format = "year_input"` and `questionObject.payload = { toleranceYears, correctYear }`.
  - For year-input questions, backend no longer generates answer options.
- Mobile quiz rendering:
  - `QuizView` now renders either answer options or a year `TextInput` (number pad, maxLength 4) based on `questionObject.format`.
  - Year answers are validated in controller with `abs(guess - correctYear) <= toleranceYears`.
  - Quiz header now uses a dedicated quiz layout (left circular back button + small logo on the top-right), matching the in-game design.
  - Song info reveal card was compacted into a horizontal layout (cover left, title/artist/album/year right).
- Playback path change (mobile singleplayer):
  - Removed usage of frontend Web API playback helper (`/spotify/playback/play`) in the active mobile quiz flow.
  - Playback now uses `SpotifyAppRemoteModule` bridge via `src/mobile/services/spotifyAppRemote.ts` (`configure`, `connect`, `playTrackUri`, `disconnect`).
  - On App Remote failures, UI shows a fallback modal with action to open Spotify app.
- Native iOS bridge scaffolding:
  - Added bridge source files under `beatbrain-frontend/native/ios/`:
    - `SpotifyAppRemoteModule.swift`
    - `SpotifyAppRemoteModuleBridge.m`
  - Intended for iOS Dev Client builds (Expo Go cannot load this native module).
- Choose error/start UX:
  - Error action buttons remain same fixed width container (`85%`, `maxWidth 420`) and equal button widths.
  - Start Quiz button is now disabled while a start request is in-flight (`isStartingQuiz`) to prevent double submits.
- Constraints:
  - OAuth/Login flow, redirect URIs, PKCE logic, ports, firewall handling, and start scripts were not changed.

# 25) Update 2026-02-21 (Quiz Copy + Playback Error Visibility)
- Quiz wording refinement:
  - Binary year question text changed from `vor oder ab 2000` to `vor oder nach 2000`.
  - Binary answer labels changed accordingly to `vor 2000` / `nach 2000`.
- Quiz UI copy:
  - Next button label is now `Nächste Frage`.
- Playback error visibility:
  - Suppressed non-actionable App Remote setup errors (`MODULE_MISSING`, `IOS_ONLY`) in the quiz view, so no warning text is shown under the timer for those cases.
  - Other actionable playback errors (e.g. connect/play failures) continue to surface normally.
- Constraints:
  - OAuth/Login flow, redirect URIs, PKCE logic, ports, firewall handling, and start scripts remain unchanged.

# 26) Update 2026-02-21 (Song Info Alignment)
- Quiz reveal layout refinement:
  - In the quiz `Song Info` box, the heading is now explicitly centered.
  - The right-side metadata block (title/artist/album/year) is now centered within its column and text-aligned center.
- Scope:
  - UI-only adjustment in mobile quiz screen layout.
- Constraints:
  - OAuth/Login flow, redirects, PKCE, ports, firewall settings, and start scripts remain unchanged.

# 27) Update 2026-02-21 (Spotify App Remote Token Path Fix)
- Root cause addressed for iOS App Remote playback:
  - App Remote `connect()` previously had no Spotify user access token bound to `connectionParameters.accessToken`, so connection/playback could fail even with valid track URIs.
- Backend additions:
  - New authenticated endpoint `GET /auth/spotify/token` returns `{ accessToken, expiresIn }` from existing host session token handling.
  - OAuth scope string now includes `app-remote-control` in addition to existing playlist/playback scopes.
- Frontend mobile flow:
  - Quiz controller now fetches Spotify SDK token via `/auth/spotify/token`, caches it until near expiry, and passes it to App Remote connect before `playTrackUri`.
  - App Remote bridge API changed from `connect()` to `connect(accessToken)`.
- Native bridge updates:
  - iOS module now requires non-empty `accessToken` in `connect(...)` and sets `remote.connectionParameters.accessToken` before connecting.
  - Bridge declaration updated accordingly.
- Operational note:
  - Existing logged-in users need one re-login so Spotify grants the new `app-remote-control` scope.
- Constraints:
  - Redirect URIs, PKCE mechanics, ports, firewall/start scripts, and JWT session design remain unchanged.

# 28) Update 2026-02-22 (Minimal Spotify Playback Requests + No Auto App Switch)
- Backend playback endpoints normalized for sparse request policy:
  - Added `PUT /spotify/player/play` (also available as `PUT /api/spotify/player/play`).
  - Added `GET /spotify/player/devices` (also available as `GET /api/spotify/player/devices`).
  - Existing legacy playback endpoints remain for compatibility:
    - `POST /spotify/playback/play`
    - `POST /spotify/playback/pause`
- Backend play behavior is now strictly minimal:
  - No automatic `/me/player/devices` call inside play endpoint.
  - No transfer-call, no polling, no retry loop for device activation.
  - One direct Spotify call to `/v1/me/player/play` per play attempt.
  - Optional `deviceId` can be supplied; if absent, backend uses Spotify active-device resolution behavior.
- Backend error mapping for playback:
  - `404` / no-active-device message -> `code: NO_ACTIVE_DEVICE`
  - `403` -> `code: FORBIDDEN_OR_SCOPE`
  - `401` -> `code: UNAUTHORIZED`
  - `429` -> `code: RATE_LIMIT` + `retryAfterSeconds` (from `Retry-After`)
- Device cache strategy:
  - Backend keeps a lightweight in-memory `lastKnownDeviceId` per host (TTL 30 minutes), reused only when no explicit `deviceId` is passed.
  - Frontend also caches selected `deviceId` in playback service state.
- Frontend playback flow (`mobile`):
  - Removed automatic App Remote playback start path from quiz question load.
  - New playback service executes:
    - Attempt #1: `PUT /spotify/player/play` (with cached `deviceId` when available).
    - Fallback on `NO_ACTIVE_DEVICE` only: one `GET /spotify/player/devices`, choose best device, then attempt #2 play.
  - No polling and no auto-retry loops.
  - No automatic `Linking.openURL("spotify:")` during quiz start or question changes.
  - If still no active device, UI shows inline hint and optional manual button `Spotify oeffnen` (user-click only).
- Quiz stability:
  - Added in-flight dedupe guards in mobile quiz question loading/playback trigger to avoid duplicate autoplay attempts from repeated renders/effects.

# 29) Update 2026-02-22 (Playback UX Stabilization: Overlay + Device Warmup)
- Mobile playback startup reliability improvements:
  - Frontend playback service now persists `lastKnownDeviceId` locally (`SecureStore` on native, `localStorage` on web, AsyncStorage fallback if available).
  - On quiz start, frontend performs a silent one-shot device priming (`GET /spotify/player/devices`) to prefill device cache where possible.
  - For `NO_ACTIVE_DEVICE`, frontend now does a one-time short grace retry (~1.2s delay) before surfacing a user-facing warning; this is intended to absorb Spotify device activation race conditions right after app open.
- Quiz request dedupe hardening:
  - Added explicit load-key dedupe for `loadNextQuestion` (`sessionId + qIndex`) to prevent accidental duplicate question/playback starts in dev/render edge cases.
- Playback error presentation:
  - Quiz playback warnings are now rendered as an absolute overlay layer over the quiz UI (instead of inline flow), so the main layout no longer shifts when warnings/buttons appear.

# 30) Update 2026-02-22 (Multiplayer Auto-Flow + Player-Only Answer UI)
- Multiplayer game flow is now player-driven during rounds (no host clicks per question/reveal/next required):
  - Backend `MultiplayerGateway` now auto-reveals the correct answer when either:
    - all players have answered, or
    - the round timer expires.
  - After reveal, when all players tap `Weiter`, backend automatically starts the next question.
  - Host still starts quiz session setup, but round-to-round navigation is automatic.
- Backend lobby round state handling:
  - Gateway now tracks `quizSessionId` and current round `correctAnswer` per lobby to support automatic reveal/advance.
  - Round/session maps are cleared on host disconnect, end, restart, and return-to-menu paths.
- Host web quiz screen (`/host`) behavior:
  - Removed manual in-round control buttons (no explicit `Reveal` / `Naechste Frage` clicks in quiz screen).
  - Screen is now monitor-style: timer, question/options, reveal state, and waiting status text.
  - First round starts automatically right after session creation.
- Mobile multiplayer player UI behavior:
  - Quiz header now matches in-game layout (back button left, small logo top-right).
  - Player no longer sees question text or song info in multiplayer quiz view.
  - Answer buttons no longer change color during reveal on mobile.
  - Mobile screen is reduced to core interactions: choose answer, then press `Weiter`.

# 31) Option (Standalone iPhone ohne lokalen Rechner)
- Zielbild:
  - BeatBrain soll auf iPhone dauerhaft nutzbar sein, ohne lokal laufenden Expo-Dev-Server oder lokalen PC-Backend-Prozess.
- Notwendige Voraussetzungen:
  - Backend dauerhaft online hosten (HTTPS, feste Domain).
  - Frontend-ENV fuer Produktion auf gehostete API umstellen (`EXPO_PUBLIC_API_BASE_URL`).
  - Spotify Redirect-URIs fuer Production korrekt im Spotify Dashboard hinterlegen (App-Scheme + Web-Callback-Domain).
  - iOS App als echter Build verteilen (TestFlight/App Store), nicht Expo Dev-Server-abhaengig.
- Hinweis:
  - Ohne dauerhaftes Backend ist Singleplayer/Spotify-Flow nicht vollstaendig lauffaehig.

# 32) Update 2026-03-30 (Host Web Layout: center when there is space, otherwise scroll)
- Produkt-Rollen:
  - Host/Web (`beatbrain-frontend/src/host/*`) ist der Browser-Flow fuer den grossen Bildschirm: Login, Session/Lobby, Setup, Live-Quiz und Results.
  - Mobile (`beatbrain-frontend/src/mobile/*`) bleibt der separate Smartphone-Client zum Joinen und Antworten.
- Neue gemeinsame Host-Layout-Huelle:
  - `beatbrain-frontend/src/host/components/HostPage.tsx`
  - `HostPage` misst den verfuegbaren Viewport-Bereich unterhalb des Host-Headers und setzt das Prinzip `center when there is space, otherwise scroll` um.
  - `beatbrain-frontend/src/host/components/HostLayout.tsx` nutzt `HostPage` zentral fuer alle Host-Screens.
  - `beatbrain-frontend/src/host/hooks/useHostViewport.ts` liefert host-only Fluid-Sizing aus Browser-Breite und -Hoehe, damit Header, Buttons, Cards und Typografie nicht auf festen 27-Zoll-Groessen beruhen.
- Verwendete Host-Screens:
  - `HostLoginScreen`
  - `HostLobbyScreen`
  - `HostSetupModeScreen`
  - `HostQuizSetupScreen`
  - `HostQuizCreateScreen`
  - `HostQuizScreen`
  - `HostResultsScreen`
- Responsive Host-Web-Verhalten:
  - Host-Content nutzt einen zentrierten Max-Width-Container statt fensterbreiter Vollflaechen.
  - Buttons bleiben in moderaten Breiten; mehrspaltige Bereiche fallen je nach Breite von 3-4 Spalten ueber 2-3 Spalten bis auf 1 Spalte zurueck.
  - Header-/Logo-Abstaende, Content-Padding und wesentliche Typografie reagieren fluide auf Browserbreite und Browserhoehe.
- Host-only Scope:
  - Die Layout-Aenderungen betreffen ausschliesslich den Host-Web-Flow unter `src/host/*`.
  - Mobile App/UI und mobile Navigation wurden nicht angepasst.
- Lokaler Test:
  - `cd beatbrain-frontend && npm run start:web`
  - Host im Browser ueber `http://localhost:8081/host/start` testen.
  - Gepruefte Host-Web-Breakpoints fuer den Layout-Check: `2560x1440`, `1920x1080`, `1366x768`, `1280x800`, `1024x768`, `820x600`, `390x844`.

# 33) Update 2026-04-03 (BeatBrain_-Spotify-Playlists als aktuelle Choose-Quelle)
- Aktuelle Source-of-Truth fuer Choose/Quiz:
  - `GET /choose` liest wieder direkt die Spotify-Playlists des aktuellen Host-Accounts.
  - Beruecksichtigt werden nur Playlists, die dem aktuellen Host gehoeren und deren Name mit `BeatBrain_` beginnt.
  - Das Suffix nach `BeatBrain_` bestimmt die BeatBrain-Kategorie, z. B. `BeatBrain_60s`, `BeatBrain_rock`, `BeatBrain_deutsch`.
- Wichtige Spotify-Einschraenkung:
  - Spotify stellt ueber die Web API keine belastbare Folder-/Verzeichnis-Struktur aus dem Desktop-Client bereit.
  - Die BeatBrain-Logik kann deshalb nicht auf den Spotify-Ordner `BeatBrain` filtern, sondern ausschliesslich auf den Playlist-Namenspraefix `BeatBrain_`.
- Mapping-Regeln:
  - Jahrzehnte (`60s`, `70s`, `80s`, `90s`, `00s`, `10s`, `20s`) werden als `categoryType=decade` ausgeliefert und bekommen `decadeTag=<suffix>`.
  - Andere `BeatBrain_`-Suffixe werden als `categoryType=genre` behandelt.
  - `ChooseService` formatiert daraus die sichtbaren Namen und Tags fuer Host/Mobile (`Decade` oder `Genre`, plus optional `${trackCount} Songs`).
- Runtime-Datenfluss:
  - `POST /quiz/sessions` verwendet fuer diese `BeatBrain_`-Playlists wieder den normalen Spotify-Runtime-Pfad (`getPlaylistQuizSeedSongs(...)`).
  - Es gibt keinen aktiven lokalen curated JSON-Sonderpfad mehr.
  - Create-/Custom-Playlist-IDs bleiben unveraendert ueber den bisherigen Spotify-Pfad unterstuetzt.
- Rueckbau des verworfenen Import-Ansatzes:
  - Die zwischenzeitlich eingefuehrte lokale Curation-Struktur (`src/curation/*`), lokale curated JSON-Dateien, Import-/Validierungs-Skripte und das Build-Asset-Copying wurden wieder aus der aktiven Architektur entfernt.
  - `AppModule`, `ChooseModule`, `QuizModule`, `package.json` und `nest-cli.json` sind wieder auf die Spotify-basierte Laufzeitlogik reduziert.
- Frontend-Integration:
  - Host/Mobile uebernehmen weiterhin optionale Felder wie `tags`, `decadeTag`, `categoryType` und `trackCount` aus `/choose`.
  - Wenn Spotify fuer eine BeatBrain-Playlist einen plausiblen `tracks.total` liefert und dieser fuer die gewaehlte Fragenanzahl zu klein ist, blockiert das Frontend den Start defensiv statt erst beim Session-Create zu scheitern.

# 34) Update 2026-04-04 (Keine "vor oder nach 2000"-Fragen fuer Jahrzehnt-Playlists)
- Quiz-Fragelogik:
  - Sobald eine Session mit `decadeTag` gestartet wurde, werden im Backend jetzt alle jahrbezogenen Fragen konsequent ausgefiltert:
    - `year`
    - `year-pm2`
    - `year-pm4`
    - `before-after-2000`
  - Grund: Bei Jahrzehnt-Playlists wie `60s`, `80s`, `90s`, `00s` usw. sind diese Fragen fachlich trivial oder unpassend.
- Scope:
  - Betrifft die serverseitige Fragenauswahl in `beatbrain-backend/src/quiz/quiz.service.ts`.
  - Nicht-Jahrzehnt-Playlists behalten `before-after-2000` weiterhin, aber nur wenn der geladene Track-Pool sowohl Songs vor als auch ab 2000 enthaelt.

# 35) Update 2026-04-04 (Neue Quiz-Fragetypen: Solo/Band, aeltester/neuster Song, korrektes Cover)
- Backend-Fragelogik:
  - `QuizService` unterstuetzt jetzt zusaetzlich vier neue Fragetypen:
    - `solo-or-band`
    - `oldest-song`
    - `newest-song`
    - `cover`
  - Fuer `solo-or-band` wird der Primary Artist heuristisch als `Solo Artist` oder `Band` klassifiziert; Mehrfach-Artist-Tracks oder unklare Faelle werden defensiv uebersprungen.
  - Fuer `oldest-song` und `newest-song` wird der aktuelle Song nur dann verwendet, wenn drei eindeutige Vergleichssongs mit sicher aelterem bzw. neuerem Jahr im Session-Pool vorhanden sind.
  - Fuer `cover` wird der aktuelle Song nur dann verwendet, wenn ein Cover vorhanden ist und drei weitere eindeutige Cover-URLs als Decoys gefunden werden.
- Payload-/Format-Erweiterung:
  - Quizfragen koennen jetzt `questionObject.format = "cover_options"` liefern.
  - Quizfragen koennen `optionDetails[]` mit `value`, `label`, optional `coverUrl` und optional `subtitle` liefern.
  - Bei `oldest-song`, `newest-song` und `cover` ist `correctAnswer` bewusst die Spotify-Track-ID der richtigen Option; das Frontend mappt diese IDs ueber `optionDetails` wieder auf sichtbare Labels/Cover.
- Frontend-Rendering:
  - Mobile Singleplayer und Mobile Multiplayer rendern `cover_options` als 2x2 Cover-Grid.
  - Waehrend der Beantwortung werden bei Cover-Fragen nur die vier Cover gezeigt; die Textlabels erscheinen erst im Reveal.
  - Der Host-Screen loest Antwortwerte fuer Reveal-Karten jetzt ebenfalls ueber `optionDetails` auf, damit bei Song-/Cover-Fragen keine rohen Spotify-IDs angezeigt werden.
- Spotify-Metadaten:
  - `SpotifyService` und die Quiz-Track-Normalisierung erhalten nun zusaetzlich das komplette `artists[]`-Array pro Track, damit die Solo/Band-Heuristik nicht nur auf einem einzelnen Artist-String basiert.

# 36) Update 2026-04-04 (Host-Reveal verdichtet 5+ Antwort-Kacheln auf eine Reihe)
- Host-Web Reveal-Layout:
  - `beatbrain-frontend/src/host/screens/HostQuizScreen.tsx` verdichtet Reveal-Kacheln jetzt automatisch, sobald mehr als vier unterschiedliche Antwort-Gruppen gleichzeitig angezeigt werden.
  - In diesem Fall werden Spaltenzahl, Tile-Hoehe, Abstaende, Bildgroessen, Schriftgroessen und Spieler-Chips reduziert, damit die Kacheln auf typischen Host-Bildschirmen in einer einzigen Reihe bleiben statt umzubrechen und aus dem sichtbaren Bereich zu laufen.
  - Die Spielernamen in den Reveal-Chips werden dabei explizit in `Colors.navy` statt in der Hintergrund-/Kontrastfarbe gerendert.
- Scope:
  - Betrifft ausschliesslich den Host-Web-Quizscreen; Mobile Quiz, Mobile Multiplayer und Backend-Quizlogik bleiben unveraendert.

# 37) Update 2026-04-04 (Spotify-Playback: Track-Restriktionen frueher filtern, 403 sauber unterscheiden)
- Backend Spotify-/Quiz-Flow:
  - `SpotifyService.isTrackPlayable(...)` behandelt jetzt jede nicht-leere Spotify-`restrictions.reason` als unspielbaren Track und laesst solche Songs gar nicht erst in den Quiz-Pool.
  - `QuizService.mapQuizSongToMinimalTrack(...)` spiegelt dieselbe Regel auf DTO-Ebene, damit keine bereits markierten Restriction-Tracks spaeter doch noch in Sessions gelangen.
- Playback-Fehlermapping:
  - `SpotifyService.playTrack(...)` wertet bei fehlgeschlagenem `PUT /me/player/play` jetzt zuerst die konkrete Spotify-Fehlermeldung aus, bevor ein `403` pauschal als Premium-/Scope-Problem behandelt wird.
  - Track-spezifische Spotify-Fehler wie `restriction violated`, `track unavailable`, Markt-/Katalog-Probleme etc. koennen dadurch wieder als `TRACK_UNPLAYABLE` erkannt werden.
  - Der bestehende Host-Multiplayer-Pfad kann solche Tracks damit wieder automatisch ueberspringen, statt bei einer vorhandenen Spotify-Verbindung mit einem irrefuehrenden allgemeinen Playback-Fehler stehenzubleiben.

# 38) Update 2026-04-04 (Host-Web nutzt standardmaessig Spotify Web Playback SDK mit Backend-Fallback)
- Host-Web Playback-Pfad:
  - Im Host-Modus (`beatbrain-frontend/src/host/*`) ist Browser-Playback jetzt der primaere Standardpfad.
  - Neue Host-only Service-Datei: `beatbrain-frontend/src/host/services/spotifyHostPlayback.ts`.
  - Der Host-Browser laedt die Spotify Web Playback SDK dynamisch (`https://sdk.scdn.co/spotify-player.js`), verbindet einen eigenen Spotify-Connect-Player und holt das dafuer benoetigte Access Token ueber den bestehenden Backend-Endpunkt `GET /auth/spotify/token`.
  - Sobald eine neue Runde startet, versucht der Host zuerst Playback ueber die eigene Web-SDK-`device_id`. Erst wenn das fehlschlaegt, wird automatisch auf den bisherigen Backend-Web-API-Playback-Pfad (`PUT /spotify/player/play` ohne Host-Web-SDK-Devicebindung) zurueckgefallen.
- Multiplayer-/Backend-Integration:
  - `host:startRound` traegt jetzt einen Playback-Modus (`host_web_sdk` oder `server`).
  - Das Backend merkt sich diesen Modus pro Lobby in `MultiplayerGateway`.
  - Fuer `host_web_sdk` startet der Server die Wiedergabe nicht mehr vorab selbst, sondern ueberlaesst den Start dem Host-Browser nach `round:question`.
  - Auto-Next-Runden verwenden denselben gemerkten Playback-Modus weiter.
- Auth-/Runtime-Hinweis:
  - Fuer die Web Playback SDK ist jetzt zusaetzlich der Spotify-Scope `streaming` im OAuth-Start enthalten.
  - Bereits eingeloggte Hosts koennen deshalb eine erneute Spotify-Anmeldung benoetigen, damit der Browser-Player wirklich aktiv wird statt staendig auf den Fallback zu gehen.
- Scope:
  - Mobile Singleplayer und Mobile Multiplayer bleiben auf ihren bisherigen Playback-Pfaden.
  - Die bisherige serverseitige Playback-Variante bleibt erhalten und dient im Host-Web-Modus explizit als Fallback.
