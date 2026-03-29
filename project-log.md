> WICHTIG: Jede neue Aufgabe und alle umgesetzten Änderungen müssen immer in dieser Datei dokumentiert werden.

## 2026-02-16 22:30
- Change: Added backend environment setup for Spotify auth, host restriction and JWT security. Created `.env` and `.env.example` with required variables and kept examples secret-free.
- Files: `beatbrain-backend/.env`, `beatbrain-backend/.env.example`, `beatbrain-backend/.gitignore`
- Reason: Required secure env-first setup and host-only account enforcement.
- Test: Verified `.gitignore` includes `.env` and allows `.env.example`.

## 2026-02-16 22:31
- Change: Replaced mock-data backend architecture with real Spotify-based modules (`auth`, `spotify`, `quiz`) including PKCE start/callback, refresh token handling, centralized Spotify API calls with refresh+retry, playlist resolution, pagination, and quiz session generation using songIDs + extended question pool.
- Files: `beatbrain-backend/src/app.module.ts`, `beatbrain-backend/src/main.ts`, `beatbrain-backend/src/config/env.ts`, `beatbrain-backend/src/auth/auth.module.ts`, `beatbrain-backend/src/auth/auth.controller.ts`, `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-backend/src/spotify/spotify.module.ts`, `beatbrain-backend/src/spotify/spotify.controller.ts`, `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/quiz/quiz.module.ts`, `beatbrain-backend/src/quiz/quiz.controller.ts`, `beatbrain-backend/src/quiz/quiz.service.ts`, `beatbrain-backend/package.json`
- Reason: Singleplayer/Host must use real Spotify Web API and no mock sources.
- Test: `npm install` (backend) completed successfully.

## 2026-02-16 22:32
- Change: Added local multiplayer backend realtime foundation with lobby/joinCode/player management, max 10 players, host-authorized actions, round lifecycle and score reveal over Socket.IO.
- Files: `beatbrain-backend/src/multiplayer/multiplayer.module.ts`, `beatbrain-backend/src/multiplayer/multiplayer.service.ts`, `beatbrain-backend/src/multiplayer/multiplayer.gateway.ts`
- Reason: Local Jackbox-style multiplayer requires host-authorized realtime state broadcast.
- Test: Dependency install includes websocket packages (`@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`).

## 2026-02-16 22:33
- Change: Frontend switched from mock tracks/playlists to backend Spotify flow with env-based API config, Spotify login/deep-link callback handling, choose/create quiz using real playlist validation and backend quiz sessions/questions. Enabled existing Create button and wired Multiplayer entry without changing visual style system.
- Files: `beatbrain-frontend/src/config.ts`, `beatbrain-frontend/src/data/playlists.ts`, `beatbrain-frontend/src/screens/StartScreen.tsx`, `beatbrain-frontend/src/screens/SinglePlayerMenu.tsx`, `beatbrain-frontend/App.tsx`, `beatbrain-frontend/.env`, `beatbrain-frontend/.env.example`, `beatbrain-frontend/.gitignore`, `beatbrain-frontend/package.json`
- Reason: Remove mock data completely and require host Spotify auth for Singleplayer/Host flows.
- Test: `npm install` (frontend) completed successfully.

## 2026-02-16 22:34
- Change: Added project-level and backend README setup docs with Spotify setup + local run instructions.
- Files: `README.md`, `beatbrain-backend/README.md`
- Reason: Required delivery docs for env setup and local startup.
- Test: Manual verification of env variable names and run commands in README.

## 2026-02-16 22:35
- Change: Fixed TypeScript nullability in multiplayer round start handling and completed smoke builds.
- Files: `beatbrain-backend/src/multiplayer/multiplayer.gateway.ts`
- Reason: Backend build failed because `question` can be undefined after `nextQuestion`.
- Test: `npm run build` (backend) passed, `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 22:40
- Change: Implemented frontend local multiplayer host/player flow using Socket.IO with host lobby creation, join code + QR display, player join without Spotify login, round question/reveal handling and score display.
- Files: `beatbrain-frontend/App.tsx`, `beatbrain-frontend/package.json`, `beatbrain-frontend/package-lock.json`
- Reason: Deliver Jackbox-style local multiplayer behavior with host-auth-only control and player no-auth access.
- Test: `npx tsc --noEmit` (frontend) passed, `npm run build` (backend) passed.

## 2026-02-16 22:41
- Change: Executed backend unit test suite after architecture changes.
- Files: `beatbrain-backend/src/app.controller.spec.ts` (executed, no edit)
- Reason: Basic regression smoke-check for backend runtime after new modules were added.
- Test: `npm run test -- --runInBand` (backend) passed.

## 2026-02-16 22:42
- Change: Added Expo URL scheme for Spotify callback and QR/deeplink player join flow.
- Files: `beatbrain-frontend/app.json`
- Reason: `beatbrain-login://callback` and `beatbrain-login://join?...` require an app scheme configuration.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 22:47
- Change: Extracted shared frontend app types and layout/game constants from `App.tsx` into dedicated modules.
- Files: `beatbrain-frontend/src/types/app.ts`, `beatbrain-frontend/src/constants/app.ts`, `beatbrain-frontend/App.tsx`
- Reason: First step to remove god-file concerns by centralizing reusable types/constants.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 22:48
- Change: Centralized frontend API logic into services (`apiClient` + `beatbrainApi`) and removed inline fetch/refresh implementation from `App.tsx`.
- Files: `beatbrain-frontend/src/services/apiClient.ts`, `beatbrain-frontend/src/services/beatbrainApi.ts`, `beatbrain-frontend/App.tsx`
- Reason: Decouple networking/business logic from UI composition and prepare further split into hooks/screens.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 22:51
- Change: Split `Choose` and `Create` UI blocks out of `App.tsx` into dedicated screen components and introduced reusable header component.
- Files: `beatbrain-frontend/src/components/AppHeader.tsx`, `beatbrain-frontend/src/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/screens/CreateQuizView.tsx`, `beatbrain-frontend/App.tsx`
- Reason: Keep screen UI presentational and reduce App-level rendering complexity without changing layout/design.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 22:54
- Change: Extracted `Quiz` and `Results` UI trees from `App.tsx` into dedicated screen views and kept App wiring-only for flow transitions.
- Files: `beatbrain-frontend/src/screens/QuizView.tsx`, `beatbrain-frontend/src/screens/ResultsView.tsx`, `beatbrain-frontend/App.tsx`
- Reason: Continue deconstructing the god-file by separating presentational screen markup from orchestration logic.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 22:58
- Change: Extracted multiplayer screen UI into a dedicated view and removed leftover dead imports/constants from `App.tsx`.
- Files: `beatbrain-frontend/src/screens/MultiplayerView.tsx`, `beatbrain-frontend/App.tsx`
- Reason: Complete major UI decomposition so App focuses on routing/wiring instead of inline rendering.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 23:02
- Change: Moved frontend orchestration state/effects into `useBeatBrainController` hook and moved screen routing/switching into `AppRouter`; reduced `App.tsx` to bootstrap-only composition.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/navigation/AppRouter.tsx`, `beatbrain-frontend/App.tsx`
- Reason: Fulfill end-goal architecture (no god-file, App only composition/bootstrapping).
- Test: `npx tsc --noEmit` (frontend) passed; `App.tsx` reduced to 7 lines.

## 2026-02-16 23:04
- Change: Added global backend exception filter with consistent error JSON format and dev-only stack traces.
- Files: `beatbrain-backend/src/common/all-exceptions.filter.ts`, `beatbrain-backend/src/main.ts`
- Reason: Standardized backend error handling across controllers without changing endpoint behavior.
- Test: `npm run build` (backend) passed; `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 23:05
- Change: Ran backend unit tests after centralized error handling integration.
- Files: `beatbrain-backend/src/app.controller.spec.ts` (executed, no edits)
- Reason: Regression smoke-check to ensure runtime bootstrapping still works after filter wiring.
- Test: `npm run test -- --runInBand` (backend) passed.

## 2026-02-16 23:22
- Change: Fixed Spotify auth redirect handling for web/mobile by switching to client-provided redirect URI in auth start, callback token exchange via state-stored verifier/redirect, and frontend auth-session flow (`openAuthSessionAsync`) with robust query parsing.
- Files: `beatbrain-backend/src/auth/auth.controller.ts`, `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-frontend/src/services/beatbrainApi.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/package.json`, `beatbrain-frontend/package-lock.json`
- Reason: Resolve observed issue where Spotify consent did not return to app/web and login appeared to hang.
- Test: `npm run build` (backend) passed, `npx tsc --noEmit` (frontend) passed.

## 2026-02-16 23:22
- Change: Re-ran backend unit test suite after OAuth flow changes.
- Files: `beatbrain-backend/src/app.controller.spec.ts` (executed, no edits)
- Reason: Regression check for backend boot/runtime after auth-service modifications.
- Test: `npm run test -- --runInBand` (backend) passed.

## 2026-02-16 23:26
- Change: Finalized cross-platform OAuth return handling by using runtime redirect URI (`web origin + /auth/callback` or Expo deep link URL), removed frontend `code_verifier` callback dependency, and added required browser/deeplink packages.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/services/beatbrainApi.ts`, `beatbrain-frontend/package.json`, `beatbrain-frontend/package-lock.json`, `beatbrain-backend/src/auth/auth.controller.ts`, `beatbrain-backend/src/auth/auth.service.ts`
- Reason: Fix real user issue where Spotify consent did not return control to app in web/Expo flow.
- Test: `npx tsc --noEmit` (frontend) passed; `npm run build` (backend) passed.

## 2026-02-16 23:53
- Change: Added explicit web/mobile Spotify redirect env support, automatic login trigger on Singleplayer and Host role selection, multiplayer state reset when leaving screen, and logo preloading to reduce visible logo reloads.
- Files: `beatbrain-frontend/src/config.ts`, `beatbrain-frontend/.env`, `beatbrain-frontend/.env.example`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/navigation/AppRouter.tsx`
- Reason: Resolve reported runtime UX issues (invalid redirect, extra login click, stuck multiplayer role state, visible logo reload).
- Test: `npx tsc --noEmit` (frontend) passed; `npm run build` (backend) passed.

## 2026-02-16 23:54
- Change: Updated frontend local API base URL in development env from localhost to LAN host IP for device testing over Expo Go.
- Files: `beatbrain-frontend/.env`
- Reason: Mobile devices cannot resolve backend via `localhost`; required for real API/auth callbacks from phone.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 15:07
- Change: Removed manual Spotify login buttons from Choose/Create/Host views, removed multiplayer hint text, and fixed multiplayer back-button flow to return to role selection before start screen.
- Files: `beatbrain-frontend/src/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/screens/CreateQuizView.tsx`, `beatbrain-frontend/src/screens/MultiplayerView.tsx`, `beatbrain-frontend/src/navigation/AppRouter.tsx`
- Reason: Match requested UX: auth only auto-triggered on Singleplayer and Host Mode; back button should navigate to previous multiplayer step.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 15:12
- Change: Aligned Multiplayer role-selection button vertical position with Home screen by using shared button-drop spacing constant; updated both screens to consume the same value.
- Files: eatbrain-frontend/src/constants/app.ts, eatbrain-frontend/src/screens/MultiplayerView.tsx, eatbrain-frontend/src/screens/StartScreen.tsx`n- Reason: Ensure Host/Join buttons start at the same vertical height as Home screen buttons.
- Test: 
px tsc --noEmit (frontend) passed.


## 2026-02-19 15:16
- Change: Matched Multiplayer role-selection button vertical alignment with StartScreen by using shared BUTTON_DROP spacing and consistent content padding.
- Files: eatbrain-frontend/src/screens/MultiplayerView.tsx, eatbrain-frontend/src/screens/StartScreen.tsx, eatbrain-frontend/src/constants/app.ts`n- Reason: Ensure Host/Join buttons are on the same height as Singleplayer/Multiplayer buttons on Home.
- Test: 
px tsc --noEmit (frontend) passed.


## 2026-02-19 15:23
- Change: Added explicit waiting-for-login states with larger spinner + 'Warte auf Login...' message for Host Mode and Singleplayer flow while OAuth window is open.
- Files: eatbrain-frontend/src/screens/MultiplayerView.tsx, eatbrain-frontend/src/screens/SinglePlayerMenu.tsx, eatbrain-frontend/src/navigation/AppRouter.tsx`n- Reason: Prevent premature screen interaction and provide clear feedback during external Spotify login.
- Test: 
px tsc --noEmit (frontend) passed.

## 2026-02-19 15:32
- Change: Fixed Singleplayer auth gating by introducing a dedicated `loginPending` state that remains active until OAuth callback success/failure/cancel; wired `SinglePlayerMenu` loading visibility to `loginPending` so `Choose Quiz`/`Create Quiz` only render after successful login.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/navigation/AppRouter.tsx`
- Reason: Prevent premature display of Singleplayer action buttons before Spotify login is completed.
- Test: `npx tsc --noEmit` (frontend) passed.
## 2026-02-19 15:38
- Change: Updated auth-cancel UX for Host and Singleplayer. If Spotify login is aborted, loading state now hides and only a red error message plus retry button is shown; retry reopens Spotify login.
- Files: `beatbrain-frontend/src/screens/SinglePlayerMenu.tsx`, `beatbrain-frontend/src/screens/MultiplayerView.tsx`, `beatbrain-frontend/src/navigation/AppRouter.tsx`
- Reason: Match requested behavior for aborted OAuth flow and avoid showing normal action buttons while unauthenticated after cancel.
- Test: `npx tsc --noEmit` (frontend) passed.
## 2026-02-19 15:40
- Change: Removed global multiplayer auth error text from the Host/Join selection screen; Spotify abort message now only appears in Host login context.
- Files: `beatbrain-frontend/src/screens/MultiplayerView.tsx`
- Reason: The Host/Join selection screen should not show Spotify login abort warnings.
- Test: `npx tsc --noEmit` (frontend) passed.
## 2026-02-19 15:45
- Change: Fixed Spotify redirect URI selection priority to prefer configured app scheme (`beatbrain-login://callback`) over Expo `exp://` fallback, and updated frontend `.env` to remove insecure web/mobile redirect URIs.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/.env`
- Reason: Resolve `INVALID_CLIENT: Insecure redirect URI` during Spotify login in Expo Go.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 15:53
- Change: Added permanent documentation rule at the top of project-log.md and confirmed that every new user task will be logged here.
- Files: project-log.md
- Reason: User requested persistent instruction so future chats only require "lies das file ein".
- Test: Manual verification of top-line rule and appended log entry.
## 2026-02-19 16:07
- Change: Fixed Spotify OAuth redirect handling to be ENV-driven and secure-only. Backend `/auth/spotify/start` now accepts `clientType` (`mobile|web`) and selects redirect URI only from ENV (`SPOTIFY_REDIRECT_URI`, `SPOTIFY_REDIRECT_URI_WEB`) with strict validation (rejects `localhost`, `192.168.x.x`, `exp://`; web allows only `http://127.0.0.1:<PORT>/callback`; mobile requires `beatbrain-login://callback`).
- Files: `beatbrain-backend/src/auth/auth.controller.ts`, `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-backend/src/main.ts`
- Reason: Resolve `INVALID_CLIENT: Insecure redirect URI` and prevent insecure or overridden redirect URIs.
- Test: `npm run build` (backend) passed.

## 2026-02-19 16:07
- Change: Updated frontend OAuth start flow to send `clientType` instead of arbitrary redirect URI, removed unsafe redirect fallbacks, added strict redirect URI validation, and added dev logging for configured and used redirect URI.
- Files: `beatbrain-frontend/src/services/beatbrainApi.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/config.ts`
- Reason: Ensure frontend and backend use exactly matching secure redirect URIs for mobile and web.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 16:07
- Change: Updated env templates/local env and docs for secure Spotify redirect policy (mobile scheme + web 127.0.0.1 callback only) and added explicit redirect URI rules.
- Files: `beatbrain-frontend/.env.example`, `beatbrain-frontend/.env`, `beatbrain-backend/.env.example`, `beatbrain-backend/.env`, `README.md`, `beatbrain-backend/README.md`
- Reason: Make secure redirect setup explicit and reproducible.
- Test: Manual verification of env keys and README rules.
## 2026-02-19 16:15
- Change: Switched Spotify Web redirect strategy from HTTP loopback to HTTPS-only callback URLs. Updated backend and frontend validation so web OAuth requires https://.../callback, while mobile still requires beatbrain-login://callback.
- Files: beatbrain-backend/src/auth/auth.service.ts, beatbrain-frontend/src/hooks/useBeatBrainController.ts, beatbrain-frontend/src/config.ts
- Reason: Spotify blocks insecure HTTP redirect URIs; web and mobile login must both remain supported under secure redirect rules.
- Test: npm run build (backend) passed, npx tsc --noEmit (frontend) passed.

## 2026-02-19 16:15
- Change: Updated env files and documentation from http://127.0.0.1/... to HTTPS web callback placeholders and documented tunnel/domain requirement for local web development.
- Files: beatbrain-frontend/.env, beatbrain-backend/.env, beatbrain-frontend/.env.example, beatbrain-backend/.env.example, README.md, beatbrain-backend/README.md
- Reason: Ensure setup instructions and runtime config match Spotify-compatible redirect policy for web and mobile.
- Test: Manual verification of env keys and README redirect rules.
## 2026-02-19 16:20
- Change: Evaluated request to set a non-placeholder Spotify Web redirect URI. No code/env value was changed because no real public HTTPS host/tunnel URL exists yet in project context.
- Files: project-log.md
- Reason: A working Spotify Web redirect must be an actually reachable, owned HTTPS callback URL (exact match across Spotify + frontend env + backend env). Placeholder/example URLs are not functional.
- Test: Searched repo config/docs for existing production/tunnel domain; none found.

## 2026-02-19 16:36
- Change: Removed all remaining mock artifacts from backend and frontend, including legacy mock modules/routes, mock screen/component files, mock playlist JSON, and local song asset directory with mock MP3 files.
- Files: `beatbrain-backend/src/mock/mock.module.ts`, `beatbrain-backend/src/mock/mock.controller.ts`, `beatbrain-backend/src/mock/data/mock_songs_70s.json`, `beatbrain-backend/src/mock/data/mock_songs_80s.json`, `beatbrain-backend/src/mock/data/mock_songs_90s.json`, `beatbrain-backend/src/mock/data/mock_songs_hip-hop.json`, `beatbrain-backend/src/mock/data/mock_songs_rock.json`, `beatbrain-frontend/src/mock/playlists.ts`, `beatbrain-frontend/src/mock/songAssets.ts`, `beatbrain-frontend/src/screens/ChooseQuizScreen.tsx`, `beatbrain-frontend/src/components/PlaylistCarousel.tsx`, `beatbrain-frontend/assets/playlists/mock_playlists.json`, `beatbrain-frontend/assets/songs`
- Reason: Enforce Spotify-only data/audio flow and fully remove obsolete mock/demo code and assets.
- Test: Searched for references to deleted mock/audio assets in frontend/backend source; no matches.

## 2026-02-19 16:36
- Change: Performed post-cleanup validation to ensure runtime/build integrity after deletions.
- Files: `beatbrain-frontend`, `beatbrain-backend`
- Reason: Confirm no missing imports, no stale references, and successful compilation after cleanup.
- Test: `npx tsc --noEmit` (frontend) passed; `npm run build` (backend) passed; no `*.mp3`, `*.wav`, `*.ogg` files found.

## 2026-02-19 18:02
- Change: Updated Spotify web redirect validation to allow local loopback HTTP callbacks (`http://127.0.0.1:<PORT>/auth/spotify/callback`, `http://[::1]:<PORT>/auth/spotify/callback`) and keep HTTPS callback support, while still rejecting `192.168.*`, `localhost`, and `exp://`.
- Files: `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Fix `INVALID_CLIENT: Insecure redirect URI` for local web login while preserving secure redirect constraints.
- Test: Verified validator logic for protocol/host/path combinations and error messages in backend/frontend.

## 2026-02-19 18:02
- Change: Aligned auth env defaults and runtime flow to the local loopback web callback (`http://127.0.0.1:3000/auth/spotify/callback`), and ensured frontend auth session uses server-returned `redirectUri` for exact authorize/token redirect string consistency.
- Files: `beatbrain-backend/.env.example`, `beatbrain-backend/.env`, `beatbrain-frontend/.env.example`, `beatbrain-frontend/.env`, `beatbrain-frontend/src/config.ts`, `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Keep mobile/web redirect URIs ENV-driven and identical across auth start and token exchange.
- Test: `npx tsc --noEmit` (frontend) passed; `npm run build` (backend) passed.

## 2026-02-19 18:02
- Change: Updated setup docs for Spotify redirect policy: local web via loopback HTTP only (`127.0.0.1` / `[::1]`), never LAN HTTP (`192.168.*`).
- Files: `README.md`, `beatbrain-backend/README.md`
- Reason: Make supported local web redirect behavior explicit and prevent insecure redirect misconfiguration.
- Test: Manual verification of updated redirect examples/rules in both READMEs.

## 2026-02-19 18:06
- Change: Introduced `PROJECT_CONTEXT.md` in repo root as single source of truth for project architecture, stack, env/auth behavior, run/build setup, multiplayer/quiz system, coding guidelines, and open points; added mandatory maintenance rule at file top.
- Files: `PROJECT_CONTEXT.md`
- Reason: Centralize technical project context for future chats/agents and enforce synchronized documentation updates with system changes.
- Test: Verified file exists at repo root and populated sections match repository code/configs.

## 2026-02-19 18:10
- Change: Fixed React Native Web deprecation warning by moving `Image` `resizeMode` from inline style to explicit `resizeMode` prop in shared header/start/singleplayer/quiz logo renders.
- Files: `beatbrain-frontend/src/components/AppHeader.tsx`, `beatbrain-frontend/src/screens/QuizView.tsx`, `beatbrain-frontend/src/screens/SinglePlayerMenu.tsx`, `beatbrain-frontend/src/screens/StartScreen.tsx`
- Reason: Remove `Image: style.resizeMode is deprecated` warning without changing visual layout.
- Test: `npx tsc --noEmit` (frontend) passed; no remaining `resizeMode:` style usages in `beatbrain-frontend/src`.

## 2026-02-19 18:15
- Change: Hardened frontend web redirect handling by introducing a safe fallback (`http://127.0.0.1:3000/auth/spotify/callback`) when `EXPO_PUBLIC_SPOTIFY_REDIRECT_URI_WEB` is invalid (e.g. `192.168.*`, `localhost`, `exp://`, malformed URL) instead of aborting login.
- Files: `beatbrain-frontend/src/config.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Prevent login failure in cached/misconfigured Expo env scenarios while keeping redirect safety rules.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 18:15
- Change: Updated `PROJECT_CONTEXT.md` auth/env sections to document frontend web redirect fallback behavior.
- Files: `PROJECT_CONTEXT.md`
- Reason: Keep context documentation synchronized with runtime auth behavior changes.
- Test: Manual verification of updated sections under Environment Variables and Auth Redirect URIs.

## 2026-02-19 18:21
- Change: Added missing Spotify scope `user-read-email` to OAuth start parameters so backend host-email validation can reliably read account email from Spotify `/me`.
- Files: `beatbrain-backend/src/auth/auth.service.ts`
- Reason: Resolve false host-whitelist rejections (`403 Only the registered host account is allowed`) when login account is correct but email scope is missing.
- Test: Manual code verification of updated OAuth scope string.

## 2026-02-19 18:21
- Change: Updated `PROJECT_CONTEXT.md` scope list to include `user-read-email`.
- Files: `PROJECT_CONTEXT.md`
- Reason: Keep auth-flow documentation synchronized with backend scope changes.
- Test: Manual verification of updated Auth section.

## 2026-02-19 18:38
- Change: Reworked OAuth callback flow to avoid token JSON rendering on callback route. Added one-time auth result exchange (`auth_code`) with short TTL and redirect-only callback behavior. New endpoints: `POST /auth/spotify/exchange` and `GET /auth/result`.
- Files: `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-backend/src/auth/auth.controller.ts`
- Reason: Fix missing app return after OAuth and improve security by avoiding JWT/Spotify token exposure in callback URL/body.
- Test: `npm run build` (backend) passed.

## 2026-02-19 18:38
- Change: Updated frontend auth handling to consume `auth_code` flow, exchange Spotify code via backend, and persist app JWT (web: `localStorage`, native: `expo-secure-store`). Also set web auth session return URL to current web origin.
- Files: `beatbrain-frontend/src/services/beatbrainApi.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/config.ts`, `beatbrain-frontend/package.json`, `beatbrain-frontend/package-lock.json`
- Reason: Ensure OAuth returns to app/web reliably and authentication survives reload/restart.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 18:38
- Change: Updated env/docs/context for new redirect/exchange flow and mandatory `HOST_WEB_ORIGIN` web callback target.
- Files: `beatbrain-backend/.env.example`, `beatbrain-backend/.env`, `README.md`, `beatbrain-backend/README.md`, `PROJECT_CONTEXT.md`
- Reason: Keep runtime configuration and technical documentation aligned with implemented OAuth behavior.
- Test: Manual verification of updated env keys/endpoints/rules in docs and context file.

## 2026-02-19 18:42
- Change: Hardened backend dev CORS handling to allow local loopback web origins (`localhost`, `127.0.0.1`, `::1`) while still honoring configured origins and rejecting non-local origins not explicitly configured.
- Files: `beatbrain-backend/src/main.ts`
- Reason: Fix CORS preflight failures when frontend runs on local Expo web origin (e.g. `http://localhost:8081`) and API is called from browser.
- Test: `npm run build` (backend) passed.

## 2026-02-19 18:42
- Change: Updated local frontend API base URL to loopback (`http://127.0.0.1:3000`) for web dev consistency with local CORS/OAuth setup.
- Files: `beatbrain-frontend/.env`
- Reason: Avoid browser CORS mismatches caused by mixed localhost-origin with LAN API URL during web development.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 18:42
- Change: Updated `PROJECT_CONTEXT.md` local setup note to reflect dev CORS loopback-origin allowance.
- Files: `PROJECT_CONTEXT.md`
- Reason: Keep context documentation synchronized with runtime CORS behavior.
- Test: Manual verification of updated local setup section.

## 2026-02-19 18:53
- Change: Extended OAuth start flow to support explicit query-based client selection (`/auth/spotify/start?client=web|mobile`) and optional `redirectOrigin` metadata stored in pending auth state for reliable web callback target selection.
- Files: `beatbrain-backend/src/auth/auth.controller.ts`, `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-frontend/src/services/beatbrainApi.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Prevent wrong post-auth web redirects (e.g. connection refused on stale `HOST_WEB_ORIGIN`) and make client-mode detection robust per request.
- Test: `npx tsc --noEmit` (frontend) passed; `npm run build` (backend) passed.

## 2026-02-19 18:53
- Change: Added safe callback fallback response when web callback cannot resolve a redirect origin (`HOST_WEB_ORIGIN` missing) and updated docs/context for `DEFAULT_CLIENT` and `HOST_WEB_ORIGIN` requirements.
- Files: `beatbrain-backend/src/auth/auth.controller.ts`, `PROJECT_CONTEXT.md`, `README.md`, `beatbrain-backend/README.md`
- Reason: Improve DX for local setup errors without exposing tokens and keep config docs aligned with runtime behavior.
- Test: Manual verification of updated endpoint/config documentation sections.

## 2026-02-19 19:05
- Change: Fixed frontend auth/token reliability by removing malformed import artifacts, introducing a shared auth storage wrapper (`localStorage` web + `SecureStore` native + optional AsyncStorage fallback), auto-consuming `auth_code` on web app startup, and hardening API client JWT handling (lazy token load from storage, Bearer header on all requests, one-time refresh retry, clear JWT on failed refresh).
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/services/authStorage.ts`, `beatbrain-frontend/src/services/apiClient.ts`, `beatbrain-frontend/src/services/beatbrainApi.ts`, `beatbrain-frontend/src/config.ts`
- Reason: Resolve TransformError, prevent lost JWT state after redirect/reload, and stop 401 failures on protected `/spotify/*` and `/quiz/*` calls.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 19:05
- Change: Updated backend CORS configuration for Expo Web dev origins and explicit preflight headers/methods; added startup logging for allowed origins and `HOST_WEB_ORIGIN`.
- Files: `beatbrain-backend/src/main.ts`, `PROJECT_CONTEXT.md`
- Reason: Resolve browser preflight failures from `localhost:8081`/`127.0.0.1:*` while keeping origin allowlist controlled via ENV plus dev-safe defaults.
- Test: `npm run build` (backend) passed.

## 2026-02-19 19:19
- Change: Fixed hard frontend build blocker by removing literal `` `r`n `` import corruption in `useBeatBrainController.ts` and restoring clean import lines; ensured UTF-8 write without BOM artifacts in file header.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Metro/TypeScript TransformError (`Missing semicolon`) came from injected literal backtick CRLF text in import header.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 19:19
- Change: Hardened frontend API client contract and auth behavior: `ApiClientContext` now supports async JWT retrieval + optional baseUrl, always attaches Bearer token when available, refreshes only on 401 once, and raises typed `ApiHttpError` (status + optional `retryAfterSeconds`) for non-OK responses including 429.
- Files: `beatbrain-frontend/src/services/apiClient.ts`
- Reason: Prevent false relogin behavior on 429 and stabilize JWT propagation across protected `/spotify/*`, `/quiz/*`, `/auth/refresh` calls.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 19:19
- Change: Updated backend Spotify fetch error mapping so HTTP 429 is no longer thrown as Unauthorized. Added `Retry-After` parsing, max one automatic retry, then explicit 429 response payload with `retryAfterSeconds`.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`, `PROJECT_CONTEXT.md`
- Reason: Separate auth failures (401) from Spotify rate limits (429) and stop misleading Unauthorized errors.
- Test: `npm run build` (backend) passed.

## 2026-02-19 19:27
- Change: Added playlist track request deduplication and 60s cache in `SpotifyService` (`getAllPlaylistTracks`) to reduce repeated Spotify calls and lower 429 risk under rapid quiz/session requests.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`, `PROJECT_CONTEXT.md`
- Reason: Prevent request spam and improve resilience when multiple quiz actions hit the same playlist in short intervals.
- Test: `npm run build` (backend) passed.

## 2026-02-19 19:27
- Change: Executed live backend endpoint verification against running server for auth start + protected Spotify resolve route using signed host JWT (without token output).
- Files: Runtime verification only (no code file edit)
- Reason: Validate real runtime behavior after fixes and isolate remaining blocker for real Spotify data retrieval.
- Test: `POST /auth/spotify/start?client=web` returned 201 with authorize URL; `GET /auth/me` with signed host JWT returned 200; `POST /spotify/playlists/resolve` returned 401 (indicates missing active host Spotify session in backend process, not CORS/build failure).

## 2026-02-19 19:46
- Change: Added DEV-only Spotify verification endpoints (`GET /dev/spotify/ping`, `POST /dev/spotify/playlistTest`) with non-throwing status responses for missing/expired token, 429 retryAfter, and sampled playlist-track payload. Registered controller in app module.
- Files: `beatbrain-backend/src/dev/dev.spotify.controller.ts`, `beatbrain-backend/src/app.module.ts`
- Reason: Provide reproducible E2E verification path for real Spotify connectivity without exposing tokens.
- Test: Isolated backend run on port `3100` confirmed routes are mapped and return structured responses.

## 2026-02-19 19:46
- Change: Implemented DEV host-session persistence in auth flow (`.dev-host-session.json`) and added explicit CORS startup marker log `CORS ENABLED ORIGINS: ...`; added frontend marker `BB_CONTROLLER_VERSION` for runtime code identity.
- Files: `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-backend/src/main.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `PROJECT_CONTEXT.md`
- Reason: Eliminate "unknown running code" ambiguity and allow one-login persistence for subsequent Spotify debug endpoint validation.
- Test: `npx tsc --noEmit` (frontend) passed; `npm run build` (backend) passed; startup log includes `CORS ENABLED ORIGINS`.

## 2026-02-19 19:46
- Change: Verified CORS preflight behavior on isolated backend run.
- Files: Runtime verification only (no code file edit)
- Reason: Confirm browser-origin preflight for Expo Web can pass with Authorization header.
- Test: `OPTIONS /auth/spotify/start?client=web` with origin `http://localhost:8081` returned `204` and `Access-Control-Allow-Origin: http://localhost:8081`.

## 2026-02-19 19:52
- Change: Added runtime-verification marker logs and interactive OAuth verification flow support. Backend now logs `CORS ENABLED ORIGINS: ...` at startup and frontend logs `BB_CONTROLLER_VERSION` once per controller boot in dev.
- Files: `beatbrain-backend/src/main.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Provide unambiguous proof that currently running code contains the expected fixes.
- Test: Backend startup log shows `CORS ENABLED ORIGINS`; `useBeatBrainController.ts` contains `console.log(\"BB_CONTROLLER_VERSION\", \"2026-02-19-1929\")`.

## 2026-02-19 19:52
- Change: Performed real OAuth re-auth trigger and live Spotify connectivity test via new dev endpoints. Confirmed token is valid (`/dev/spotify/ping -> ok:true`) and account identity is returned without exposing token.
- Files: Runtime verification only (no code file edit)
- Reason: Required end-to-end proof that backend can call Spotify with current host session.
- Test: `GET /dev/spotify/ping` returned `{ ok:true, id, display_name }` after interactive auth start.

## 2026-02-19 19:52
- Change: Hardened 429 retry behavior to avoid long request hangs by capping automatic wait-based retry to short windows only; larger Retry-After values now return immediate 429.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Prevent backend requests from blocking for extremely large Spotify Retry-After values during rate-limit periods.
- Test: `npm run build` (backend) passed; live `/spotify/playlists/resolve` and `/quiz/sessions` now return `429` immediately (no false 401 mapping, no long hang).

## 2026-02-19 19:52
- Change: Executed real playlist fetch diagnostics with multiple playlist IDs; Spotify currently returns rate limit responses including `retryAfterSeconds` (~23h), so playlist sample payload is temporarily blocked by upstream quota.
- Files: Runtime verification only (no code file edit)
- Reason: Validate true runtime status instead of masking Spotify upstream limits.
- Test: `POST /dev/spotify/playlistTest` and `POST /spotify/playlists/resolve` returned `{ ok:false, status:429, reason:'rate_limited', retryAfterSeconds: ... }`.

## 2026-02-19 20:26
- Change: Standardized local web dev origin config to Option A (`127.0.0.1`), updated backend env defaults/example `HOST_WEB_ORIGIN` to `http://127.0.0.1:8081`, and set frontend env example API base to `http://127.0.0.1:3000`.
- Files: `beatbrain-backend/.env`, `beatbrain-backend/.env.example`, `beatbrain-frontend/.env.example`, `PROJECT_CONTEXT.md`
- Reason: Remove host mismatch (`localhost` vs `127.0.0.1` vs LAN) that can cause CORS/OAuth inconsistency in web dev.
- Test: `POST /auth/spotify/start?client=web` with `Origin: http://127.0.0.1:8081` returned `201` and `Access-Control-Allow-Origin: http://127.0.0.1:8081`.

## 2026-02-19 20:26
- Change: Added additional dev Spotify diagnostics endpoint `GET /dev/spotify/mePlaylists` to verify whether Spotify playlist APIs are globally rate-limited or ID-specific.
- Files: `beatbrain-backend/src/dev/dev.spotify.controller.ts`, `PROJECT_CONTEXT.md`
- Reason: Needed deterministic evidence for real Spotify playlist API state beyond a single playlist endpoint path.
- Test: `GET /dev/spotify/mePlaylists` returned `{ ok:false, status:429, reason:'rate_limited', retryAfterSeconds: ... }`.

## 2026-02-19 20:26
- Change: Collected deterministic Phase-1/Phase-2 runtime evidence from Expo web bundle startup and bundle fetch (no transform/resolve errors), plus CORS preflight checks.
- Files: Runtime verification only (no code file edit)
- Reason: Confirm Metro/Resolver stability and browser-origin CORS behavior under cache-cleared web startup.
- Test: Expo log showed `Web Bundled ... index.ts`; bundle fetch returned `200` with `BUNDLE_HAS_TRANSFORMERROR:False`, `BUNDLE_HAS_UNABLETORESOLVEERROR:False`; CORS `OPTIONS /auth/spotify/start?client=web` returned `204` with `Access-Control-Allow-Origin` for frontend origin.

## 2026-02-19 20:27
- Change: Re-verified end-to-end Spotify dev diagnostics in running backend process: valid host Spotify session is active (`/dev/spotify/ping -> ok:true`) while all playlist reads remain upstream rate-limited (`/dev/spotify/playlistTest`, `/dev/spotify/mePlaylists`, `/spotify/playlists/resolve`, `/quiz/sessions` return 429).
- Files: Runtime verification only (no code file edit)
- Reason: Provide deterministic acceptance evidence and separate local app issues from current Spotify upstream quota state.
- Test: `GET /dev/spotify/ping` returned `{ok:true,id,display_name}`; playlist endpoints returned `{ok:false,status:429,reason:'rate_limited',retryAfterSeconds:...}`.

## 2026-02-19 20:27
- Change: Captured isolated backend startup evidence for active code markers and route map (`DevSpotifyController` routes + `CORS ENABLED ORIGINS` + `HOST_WEB_ORIGIN=http://127.0.0.1:8081`).
- Files: Runtime verification only (no code file edit)
- Reason: Prove that the currently executable backend build contains the expected CORS/logging/dev endpoint changes.
- Test: Isolated `node dist/main.js` start on port `3100` printed route mapping and marker logs.

## 2026-02-19 21:23
- Change: Finalized TransformError hard-kill steps in frontend controller hook: added top marker comment `// BB_CONTROLLER_OK`, moved module marker log to import section (`BB_CONTROLLER_VERSION FIX-2026-02-19-2030`), and re-verified no literal `` `r`n `` corruption/BOM at file start.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Ensure deterministic identification of active controller code and eliminate recurring malformed import/header corruption.
- Test: `rg --fixed-strings '`r`n' beatbrain-frontend/src` returned no matches; `Format-Hex` start bytes show plain ASCII header; Expo web bundle check returned no TransformError/Missing semicolon.

## 2026-02-19 21:23
- Change: Re-verified resolver path consistency for `apiClient` and module naming.
- Files: `beatbrain-frontend/src/services/apiClient.ts`, `beatbrain-frontend/src/services/beatbrainApi.ts`
- Reason: Eliminate intermittent Metro resolver mismatch (`UnableToResolveError ./apiClient`).
- Test: File existence check + import checks (`./apiClient`) passed; Expo bundle check reports `HAS_UNABLETORESOLVE:False`.

## 2026-02-19 21:23
- Change: Added explicit CORS dev origin for `http://192.168.2.237:8081` and validated required preflight headers/methods against LAN and loopback backend URLs.
- Files: `beatbrain-backend/src/main.ts`
- Reason: Satisfy browser preflight acceptance for localhost-origin web frontend against LAN backend endpoint.
- Test: `curl -i -X OPTIONS http://192.168.2.237:3000/auth/spotify/start?client=web ...` returned `204` with `Access-Control-Allow-Origin: http://localhost:8081`, `Access-Control-Allow-Headers: Content-Type,Authorization`.

## 2026-02-19 21:23
- Change: Updated web redirect host validation to allow private LAN hosts in development (`localhost`, `127.0.0.1`, `::1`, `192.168.*`, `10.*`, `172.16-31.*`) and removed legacy “blocked ... fallback ...” host log branch.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Prevent unnecessary fallback behavior/log noise in local LAN dev while keeping production validation constraints.
- Test: Expo web bundle contains no `blocked EXPO_PUBLIC_SPOTIFY_REDIRECT_URI_WEB host` text; auth start request returns 201 and CORS headers.

## 2026-02-19 21:45
- Change: Finalized Spotify 429 hardening for resolve flow by introducing centralized Spotify HTTP throttling/retry wrapper usage in services, adding backend resolve response cache (30s per `hostUserId+playlistId`), and frontend resolve dedupe/abort/session-cache to prevent multi-fire requests. Also fixed backend compile compatibility by replacing unavailable `TooManyRequestsException` with explicit `HttpException(..., 429)`.
- Files: `beatbrain-backend/src/spotify/spotifyHttp.ts`, `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/spotify/spotify.controller.ts`, `beatbrain-backend/src/dev/dev.spotify.controller.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/services/beatbrainApi.ts`
- Reason: Stop `/spotify/playlists/resolve` request bursts and ensure Spotify `Retry-After` is respected with bounded retries and correct 429 propagation.
- Test: `npx tsc --noEmit` (backend) passed; `npx tsc --noEmit` (frontend) passed; runtime wrapper check via Node script showed one 429 retry then success (`attempts=2`, `elapsedMs~1112`); runtime cache check via Node script showed dedupe (`callCount=2` across host-A cached repeat + host-B miss).

## 2026-02-19 21:45
- Change: Updated technical single-source documentation for Spotify rate-limit architecture and request deduplication/caching.
- Files: `PROJECT_CONTEXT.md`
- Reason: Keep project context synchronized with implemented backend throttling and frontend resolve protections.
- Test: Manual verification of updated "Spotify Integration" and TODO section content.

## 2026-02-19 21:53
- Change: Added auto-retry cap handling for very large Spotify `Retry-After` values in centralized `spotifyFetch` (no long blocking waits; immediate propagated 429 when cap exceeded).
- Files: `beatbrain-backend/src/spotify/spotifyHttp.ts`, `PROJECT_CONTEXT.md`
- Reason: Real runtime test showed upstream `Retry-After` values around ~21h; without cap, `/dev/spotify/playlistTest` and resolve paths can timeout/hang.
- Test: Local backend run on port `3200`: `GET /dev/spotify/ping` returned `200` with `{ok:true,...}`; `POST /dev/spotify/playlistTest` returned quickly with `201` body `{ok:false,status:429,retryAfterSeconds:...}`; backend log emitted `exceeds auto-retry cap (5s), returning 429`.

## 2026-02-19 22:15
- Change: Implemented dynamic mobile API base URL resolution in frontend config. `EXPO_PUBLIC_API_BASE_URL` stays highest priority; without ENV, web keeps `http://127.0.0.1:3000`, native attempts Expo host discovery (`expo-constants`) and uses `http://<host>:3000` with dev warning fallback to loopback if unresolved.
- Files: `beatbrain-frontend/src/config.ts`
- Reason: Expo Go on phone cannot reach backend via loopback; mobile must target host LAN IP automatically.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 22:15
- Change: Added explicit frontend LAN/Tunnel start paths and scripts.
- Files: `beatbrain-frontend/start-frontend.bat`, `beatbrain-frontend/start-frontend-lan.bat`, `beatbrain-frontend/start-frontend-tunnel.bat`, `beatbrain-frontend/package.json`
- Reason: Improve Expo Go connectivity (LAN default, tunnel fallback for firewall/router issues).
- Test: `npm install` (frontend) passed; `package.json` contains `start:lan` and `start:tunnel`.

## 2026-02-19 22:15
- Change: Hardened backend startup for `EADDRINUSE` with clear guidance and automatic fallback over up to three ports (`PORT`, `PORT+1`, `PORT+2`), plus startup failure catch/exit path.
- Files: `beatbrain-backend/src/main.ts`, `beatbrain-backend/start-backend.bat`
- Reason: Prevent silent hard crash when port 3000 is occupied and provide deterministic operator guidance.
- Test: `npx tsc --noEmit` (backend) passed; local occupancy test produced fallback startup log on alternate port.

## 2026-02-19 22:15
- Change: Improved 429 UX and retry metadata propagation. Backend global exception filter now forwards extra error fields (e.g. `retryAfterSeconds`); frontend API client reads retry-after from header or JSON body; choose-flow shows retry countdown and blocks repeated resolve calls during rate-limit window.
- Files: `beatbrain-backend/src/common/all-exceptions.filter.ts`, `beatbrain-frontend/src/services/apiClient.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: 429 should surface as actionable feedback instead of generic network failure and must avoid request spam loops.
- Test: `npx tsc --noEmit` (frontend/backend) passed.

## 2026-02-19 22:15
- Change: Updated central context documentation for new local run commands, backend port fallback behavior, dynamic mobile API base resolution, and frontend 429 countdown handling.
- Files: `PROJECT_CONTEXT.md`
- Reason: Keep single-source technical context in sync with runtime behavior changes.
- Test: Manual verification of updated setup/env/Spotify integration sections.

## 2026-02-19 22:21
- Change: Executed local runtime verification for backend startup/fallback and 429 payload propagation.
- Files: Runtime verification only (no code file edit)
- Reason: Confirm new startup behavior and frontend-consumable retry metadata from backend.
- Test:
  - `npm install` in frontend/backend: both up-to-date.
  - `npx tsc --noEmit` in frontend/backend: both passed.
  - Backend health boot test on custom port: `HEALTH_STATUS=200`, log contained `Backend listening on port 3200`.
  - Backend fallback test with occupied `3000`: log contained `Backend started on fallback port 3002 (preferred 3000 was unavailable).`
  - `curl -i POST /spotify/playlists/resolve` (signed host JWT) returned `HTTP/1.1 429` with JSON body containing `error.retryAfterSeconds`.

## 2026-02-19 22:22
- Change: Adjusted resolve rate-limit guard order so cached playlist results are still usable while rate-limited, and only new network calls are blocked until Retry-After expires.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Preserve responsive UX under 429 without suppressing already available session cache data.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-19 22:55
- Change: Reworked frontend startup BAT scripts for stable Expo Go connectivity. Scripts now enforce fixed port `8081`, clear listeners on `8081` before launch, auto-detect private LAN IP for `REACT_NATIVE_PACKAGER_HOSTNAME`, disable telemetry, and start with explicit `--go --clear` (`tunnel` as default in `start-frontend.bat`/`start-frontend-tunnel.bat`, LAN in `start-frontend-lan.bat`). Added `start-frontend-mobile.bat` alias.
- Files: `beatbrain-frontend/start-frontend.bat`, `beatbrain-frontend/start-frontend-tunnel.bat`, `beatbrain-frontend/start-frontend-lan.bat`, `beatbrain-frontend/start-frontend-mobile.bat`
- Reason: Reduce Expo Go timeout and Metro disconnect issues caused by stale host/port drift or automatic port switching.
- Test: Runtime check via background launch showed `Using REACT_NATIVE_PACKAGER_HOSTNAME=192.168.2.237`, `Tunnel ready.`, `Waiting on http://localhost:8081`, and listener present on `8081`.

## 2026-02-19 22:55
- Change: Made backend startup deterministic on port `3000` by default. `start-backend.bat` now frees `3000` before start and sets `PORT=3000`. In `main.ts`, automatic fallback ports are disabled by default and only enabled with `ALLOW_PORT_FALLBACK=1`.
- Files: `beatbrain-backend/start-backend.bat`, `beatbrain-backend/src/main.ts`
- Reason: Prevent `ERR_CONNECTION_REFUSED` from frontend caused by backend hopping to unexpected fallback ports.
- Test: Occupied-port scenario + `start-backend.bat` produced `Killed process on 3000 ...`, `Using PORT=3000`, `Backend listening on port 3000`, and `GET /health` returned `200`.

## 2026-02-19 22:55
- Change: Added fail-fast API network error handling in frontend API client. Fetch transport failures now throw `ApiHttpError` with `status=0` and explicit backend reachability message including base URL.
- Files: `beatbrain-frontend/src/services/apiClient.ts`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Replace vague browser fetch failures with actionable diagnostics when backend is down/unreachable.
- Test: `npx tsc --noEmit` (frontend) passed; code path verified to throw `Backend not reachable at <API_BASE_URL>...` on fetch exceptions.

## 2026-02-19 22:55
- Change: Updated single-source project context for deterministic startup behavior (frontend 8081 scripts + tunnel default, backend fixed 3000 behavior, `ALLOW_PORT_FALLBACK` semantics, and API `status=0` fail-fast note).
- Files: `PROJECT_CONTEXT.md`
- Reason: Keep architecture/runbook documentation synchronized with runtime behavior.
- Test: Manual verification of updated setup/env/networking sections.

## 2026-02-19 22:55
- Change: Extended backend env template with startup controls (`PORT`, `ALLOW_PORT_FALLBACK`).
- Files: `beatbrain-backend/.env.example`
- Reason: Keep environment template aligned with deterministic backend port behavior.
- Test: Manual verification of keys in `.env.example`.

## 2026-02-19 22:59
- Change: Replaced locale-sensitive `netstat ... | find "LISTENING"` port-kill logic in startup BAT scripts with PowerShell `Get-NetTCPConnection -State Listen` + `Stop-Process`, because German Windows localization does not emit `LISTENING` and previously prevented reliable port cleanup.
- Files: `beatbrain-frontend/start-frontend.bat`, `beatbrain-frontend/start-frontend-lan.bat`, `beatbrain-frontend/start-frontend-tunnel.bat`, `beatbrain-backend/start-backend.bat`
- Reason: Ensure deterministic port cleanup on localized Windows systems and avoid accidental Expo/Backend port auto-switch behavior.
- Test:
  - Frontend runtime check: startup output showed `Using REACT_NATIVE_PACKAGER_HOSTNAME=192.168.2.237`, `Tunnel ready.`, `Waiting on http://localhost:8081`, listener detected on `8081`.
  - Backend runtime check with occupied `3000`: output showed `Killed process on 3000 ...`, `Using PORT=3000`, `Backend listening on port 3000`, `ALLOW_PORT_FALLBACK: 0`, and `GET /health` returned `200`.

## 2026-02-19 23:12
- Change: Improved frontend 429 message UX for very long Spotify retry windows. Resolve flow now displays human-readable durations (`m/h/d`) instead of raw seconds and uses adaptive countdown tick intervals (1s/10s/60s) to avoid excessive state updates for multi-hour limits.
- Files: `beatbrain-frontend/src/hooks/useBeatBrainController.ts`
- Reason: Avoid confusing messages like `71314s` and reduce UI churn while keeping the retry lock active.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-20 15:19
- Change: Activated mobile-only app entry and router architecture (`src/mobile/*`) with player-controller multiplayer screens; removed active host orchestration from the runtime path by switching `App.tsx` to mobile hook/router and turning legacy `src/hooks/useBeatBrainController.ts` + `src/navigation/AppRouter.tsx` into re-exports.
- Files: `beatbrain-frontend/App.tsx`, `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/mobile/navigation/AppRouter.tsx`, `beatbrain-frontend/src/mobile/screens/MultiplayerJoinView.tsx`, `beatbrain-frontend/src/mobile/screens/MultiplayerQuizView.tsx`, `beatbrain-frontend/src/mobile/screens/MultiplayerResultsView.tsx`, `beatbrain-frontend/src/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/navigation/AppRouter.tsx`
- Reason: Mobile app must run without host UI/host socket commands; multiplayer on mobile is player-only (join/answer/continue).
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-20 15:19
- Change: Updated singleplayer mobile flow for curated choose/create + question count slider and removed active resolve usage; choose screen now uses local curated playlists only and session creation sends `{ playlistId, questionCount, decadeTag? }`.
- Files: `beatbrain-frontend/src/mobile/screens/SinglePlayerMenu.tsx`, `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/mobile/screens/CreateQuizView.tsx`, `beatbrain-frontend/src/mobile/screens/QuizView.tsx`, `beatbrain-frontend/src/mobile/screens/ResultsView.tsx`, `beatbrain-frontend/src/shared/net/beatbrainApi.ts`, `beatbrain-frontend/src/shared/net/apiClient.ts`, `beatbrain-frontend/src/data/playlists.ts`, `beatbrain-frontend/package.json`, `beatbrain-frontend/package-lock.json`
- Reason: Prevent `/spotify/playlists/resolve` 429 trigger from choose-flow and keep auth/session handling stable in mobile-only runtime.
- Test: `rg "/spotify/playlists/resolve|playlists/resolve" beatbrain-frontend/src -n` returned no matches; `npx tsc --noEmit` passed.

## 2026-02-20 15:19
- Change: Reworked backend quiz question engine to support `questionCount` + `decadeTag` session config and new question types (song title, artist, album, year MC, year +/-2, year +/-4, before/after 2000), removing old `year-input`/popularity/explicit question templates.
- Files: `beatbrain-backend/src/quiz/quiz.controller.ts`, `beatbrain-backend/src/quiz/quiz.service.ts`, `beatbrain-backend/package-lock.json`
- Reason: Align backend question generation with requested gameplay rules and enforce finite session completion (`done:true` after configured question count).
- Test: `npm run build` (backend) passed; `npm run test -- --runInBand` (backend) passed.

## 2026-02-20 15:19
- Change: Updated central documentation with latest mobile-only runtime, choose-flow behavior, and backend quiz template/session updates.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep project context and implementation log synchronized per repository rule.
- Test: Manual review of appended sections.

## 2026-02-20 16:03
- Change: Hardened startup scripts for frontend/backend/root orchestration. Frontend default start is now tunnel on fixed port 8081 with cache clear; backend supports optional port with default 3000; both scripts auto-run `npm install` when `node_modules` is missing and perform pre-start port cleanup.
- Files: `beatbrain-frontend/package.json`, `beatbrain-frontend/start-frontend.bat`, `beatbrain-backend/start-backend.bat`, `start-frontend.bat`, `start-backend.bat`, `start-all.bat`, `PROJECT_CONTEXT.md`
- Reason: Reliable one-click startup for Expo Go + backend without manual dependency/bootstrap steps and reduced port-conflict failures.
- Test: Script smoke tests executed (`start-all.bat`, `start-frontend.bat`, `start-frontend.bat lan`, `start-backend.bat 3000`); startup logs printed tunnel/lan/backend mode and port selection.

## 2026-02-20 17:08
- Change: Fixed backend startup reliability for Nest dev output resolution and improved EADDRINUSE guidance string.
- Files: `beatbrain-backend/tsconfig.json`, `beatbrain-backend/src/main.ts`
- Reason: Prevent `Cannot find module .../dist/main` bootstrap failures and remove confusing startup hint text.
- Test: `npm run build` (backend) passed.

## 2026-02-20 17:08
- Change: Added host multiplayer restart/return flow in backend gateway/service with timer cleanup and state broadcasts (`game:restarted`, `session:returnedToMenu`, `lobby:state`).
- Files: `beatbrain-backend/src/multiplayer/multiplayer.gateway.ts`, `beatbrain-backend/src/multiplayer/multiplayer.service.ts`
- Reason: Host needs deterministic end-of-game controls (restart quiz / return to menu) with synchronized client state.
- Test: `npm run build` (backend) passed.

## 2026-02-20 17:08
- Change: Implemented dedicated host web app route (`/host`) with new host controller + screens (login, lobby, setup, quiz, results), including large-screen player grid, reveal visualization per option, timer display, playback error panel, and continue gate handling.
- Files: `beatbrain-frontend/App.tsx`, `beatbrain-frontend/src/host/HostApp.tsx`, `beatbrain-frontend/src/host/hooks/useHostController.ts`, `beatbrain-frontend/src/host/screens/HostLoginScreen.tsx`, `beatbrain-frontend/src/host/screens/HostLobbyScreen.tsx`, `beatbrain-frontend/src/host/screens/HostQuizSetupScreen.tsx`, `beatbrain-frontend/src/host/screens/HostQuizScreen.tsx`, `beatbrain-frontend/src/host/screens/HostResultsScreen.tsx`, `beatbrain-frontend/src/host/README.md`
- Reason: Mobile remains player-only while host runs as web big-screen controller flow.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-20 17:08
- Change: Extended mobile player socket sync for host reset actions by handling `game:restarted` and `session:returnedToMenu`.
- Files: `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`
- Reason: Keep player controller UI state consistent when host triggers restart/return actions.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-20 17:08
- Change: Refined root startup scripts for resilience and visibility (`start-frontend` tunnel->LAN fallback with preserved exit code and pause, `start-backend` error pause, `start-all` mode forwarding remains).
- Files: `start-frontend.bat`, `start-backend.bat`, `start-all.bat`
- Reason: Avoid silent window closes and make ngrok outage behavior explicit.
- Test: `npm run start:dev` and `npx expo start --web --port 8081 --clear` were invoked as smoke runs with timeout in this environment (processes kept running until timeout).

## 2026-02-20 17:08
- Change: Updated central project context documentation for the above runtime and architecture changes.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep documentation synchronized with current implementation state.
- Test: Manual review of appended sections.

## 2026-02-20 18:55
- Change: Fixed root backend launcher port cleanup to be language-independent by replacing `netstat | find "LISTENING"` parsing with PowerShell `Get-NetTCPConnection ... -State Listen` + `Stop-Process`.
- Files: `start-backend.bat`, `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: On localized Windows (e.g. German), `LISTENING` string matching is unreliable, causing stale processes on `:3000` and startup `EADDRINUSE`.
- Test: `cmd /c start-backend.bat 3000` launched successfully; health check returned `200` on `http://127.0.0.1:3000/health`.

## 2026-02-20 22:00
- Change: Moved curated choose playlist source-of-truth to backend and introduced authenticated `GET /choose` endpoint with server-side curated IDs and 15-minute cache.
- Files: `beatbrain-backend/src/choose/choose.constants.ts`, `beatbrain-backend/src/choose/choose.types.ts`, `beatbrain-backend/src/choose/choose.service.ts`, `beatbrain-backend/src/choose/choose.controller.ts`, `beatbrain-backend/src/choose/choose.module.ts`, `beatbrain-backend/src/app.module.ts`, `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Frontend should no longer own curated playlist IDs; choose metadata must be fetched from backend/Spotify with host token.
- Test: `npm run build` (backend) passed.

## 2026-02-20 22:00
- Change: Switched frontend choose loading from local curated IDs to backend `GET /choose` and removed obsolete local curated playlist files; added choose loading state and explicit 429/401 user messaging.
- Files: `beatbrain-frontend/src/shared/net/beatbrainApi.ts`, `beatbrain-frontend/src/shared/types/app.ts`, `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/mobile/navigation/AppRouter.tsx`, `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/host/hooks/useHostController.ts`, `beatbrain-frontend/src/shared/data/curatedPlaylists.ts` (deleted), `beatbrain-frontend/src/data/playlists.ts` (deleted)
- Reason: Ensure choose screen makes a single backend call and no longer holds curated playlist IDs in frontend code.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-20 22:00
- Change: Hardened playlist pool building for quiz session creation by adding a dedicated serial pool builder and richer diagnostics for insufficient pools.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/quiz/poolBuilder.ts`, `beatbrain-backend/src/quiz/quiz.service.ts`
- Reason: Fix false `Playlist too small / empty` on large playlists by mapping `items[].track` correctly (`market=from_token`) and avoiding random sparse-page sampling.
- Test: `npm install` (backend) up-to-date, `npm run build` (backend) passed, `npx tsc -p tsconfig.json --noEmit` (backend) passed, `GET /health` returned `200`; direct `/quiz/sessions` smoke in this environment returned `403` (auth context), so live pool count must be confirmed in runtime logs.

## 2026-02-20 22:00
- Change: Fixed TSConfig IDE/compiler consistency for frontend and backend.
- Files: `beatbrain-frontend/tsconfig.json`, `beatbrain-backend/tsconfig.json`
- Reason: Remove `expo/tsconfig.base` resolution warning in frontend and avoid backend `rootDir` vs default include conflict (test files outside `src`).
- Test: `npx tsc --noEmit` (frontend) passed, `npx tsc -p tsconfig.json --noEmit` (backend) passed.

## 2026-02-20 22:25
- Change: Added automatic Spotify forbidden diagnostics in backend and mapped actionable reauth-required cases to `409` (`ACCOUNT_MISMATCH`, `INSUFFICIENT_SCOPE`).
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/spotify/spotifyHttp.ts`
- Reason: Replace opaque `403` failures with explicit remediation guidance and trigger frontend re-login flow when scopes/account mismatch is the root cause.
- Test: `npm run build` (backend) passed, `npx tsc -p tsconfig.json --noEmit` (backend) passed.

## 2026-02-20 22:25
- Change: Mobile choose/create flow now surfaces `409` messages and shows an explicit `Erneut einloggen` button that reuses `startSpotifyLogin()`.
- Files: `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/mobile/navigation/AppRouter.tsx`, `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/mobile/screens/CreateQuizView.tsx`
- Reason: App should not hang on forbidden Spotify cases; user gets immediate reauth action.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-20 23:19
- Change: Added full playlist preload for quiz sessions with dedicated `QuizSong` DTO and session-level song cache; session creation now loads all playlist pages once and `nextQuestion` runs without Spotify calls.
- Files: `beatbrain-backend/src/quiz/types/quizSong.ts`, `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/quiz/quiz.service.ts`
- Reason: Prevent mid-quiz Spotify dependency and ensure stable gameplay after initial session bootstrap.
- Test: `npm run build` (backend) passed, `npx tsc -p tsconfig.json --noEmit` (backend) passed, `rg -n "spotifyService\\." beatbrain-backend/src/quiz/quiz.service.ts` shows Spotify usage only in `createSession`.

## 2026-02-20 23:19
- Change: Refined frontend 409 reauth state naming to explicit `reauthRequired` / `reauthMessage` and surfaced reason + spotify message details in Choose/Create screens.
- Files: `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/mobile/navigation/AppRouter.tsx`, `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/mobile/screens/CreateQuizView.tsx`
- Reason: Ensure forbidden Spotify cases are actionable instead of showing opaque generic errors.
- Test: `npx tsc --noEmit` (frontend) passed.

## 2026-02-21 14:30
- Change: Implemented quiz seed-loading optimization and choose error-state isolation. Backend now creates quiz sessions from one controlled Spotify playlist-items call (`limit=min(4*questionCount,100)`, `offset=0`, constrained `fields`) and stores a minimal seed-song pool in session; `nextQuestion` works from session data only (no further Spotify calls). Frontend choose screen now renders exclusive modes (`normal` OR `error`) with explicit reset flows for `Retry` and `Erneut einloggen`.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/quiz/quiz.service.ts`, `beatbrain-backend/src/quiz/types/quizSong.ts`, `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/mobile/navigation/AppRouter.tsx`
- Reason: Reduce Spotify load and improve quiz start determinism while preventing overlapping choose UI states after start/reauth failures.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`; `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-frontend`; `rg -n "spotifyService" beatbrain-backend/src/quiz/quiz.service.ts` confirms Spotify usage only in session creation path.
- Constraint: Login/Redirect/PKCE/Auth-Flow/Ports/Firewall/Start-Scripts were not changed.

## 2026-02-21 14:58
- Change: Added backend Spotify debug instrumentation for meta/tracks calls and unified token resolution through a single helper (`getUserSpotifyAccessTokenOrThrow`). Logs now include `action`, `playlistId`, `endpointPath`, `tokenFingerprint` and, on error, `statusCode`, `spotifyMessage`, optional `tokenUserId` for `401/403`.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Diagnose why playlist meta can succeed while tracks call fails, without leaking tokens.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 14:58
- Change: Normalized Spotify songs seed call to explicit `/v1/playlists/{id}/tracks` with `limit=min(4*questionCount,100)`, `offset=0`, constrained `fields`, and improved non-2xx mapping to preserve Spotify `error.message` (fallback `statusText`) while keeping reauth mapping limited to real `403`.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Ensure start-quiz song fetch uses the intended endpoint and surfaces real backend-debuggable Spotify errors.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 14:58
- Change: Fixed choose error screen button layout so `Erneut einloggen` and `Retry` render at equal fixed width (`90%`, `maxWidth: 420`) with consistent spacing.
- Files: `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`
- Reason: Prevent narrow/uneven button widths in error mode.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-frontend`.

## 2026-02-21 15:25
- Change: Hardened Spotify playlist-song loading with automatic endpoint fallback (`/playlists/{id}/tracks` -> `/playlists/{id}/items`) for `403/404` while keeping the same constrained query parameters.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Resolve cases where playlist meta succeeds but tracks path fails, despite items path being accessible for the same playlist/token.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 15:25
- Change: Refined playlist forbidden error mapping so only `ACCOUNT_MISMATCH` and `INSUFFICIENT_SCOPE` return `409 Spotify re-auth required`; other forbidden playlist cases now stay `403` with Spotify message details.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Prevent misleading endless re-login loops when root cause is not reauth-related.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 15:25
- Change: Updated dev Spotify playlist test endpoint to fallback from `/tracks` to `/items` on `403/404`, and improved Choose error display to show secondary detail text even when primary error exists.
- Files: `beatbrain-backend/src/dev/dev.spotify.controller.ts`, `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`, `PROJECT_CONTEXT.md`
- Reason: Improve diagnosis parity with Spotify docs console behavior and make actionable error reason visible in UI.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`; `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-frontend`; live Spotify runtime check currently rate-limited (`429`), so endpoint parity must be validated after retry window.

## 2026-02-21 18:23
- Change: Switched Spotify playlist-song fetching to items-only. Backend no longer calls Spotify `/playlists/{id}/tracks` for song loading; all relevant calls now use `/playlists/{id}/items`.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/dev/dev.spotify.controller.ts`
- Reason: User requirement to stop using deprecated/problematic `/tracks` endpoint and use `/items` exclusively.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` (backend) passed.

## 2026-02-21 18:23
- Change: Updated project documentation with current endpoint policy (`items-only`) and removed ambiguity from latest behavior description.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Project rule requires synchronized documentation updates for behavior changes.
- Test: Manual verification of appended section and log entry.

## 2026-02-21 18:42
- Change: Added in-memory Spotify playback device cache (`TTL 5m`) in backend `SpotifyService.startPlayback(...)` to avoid repeated `/me/player/devices` calls for every quiz question; added one forced device refresh on `404` before returning playback-not-available.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Minimize Spotify request volume in quiz runtime without changing OAuth/Login/Redirect flow.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 18:42
- Change: Updated architecture context documentation for playback request minimization strategy.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep mandatory project context and change log synchronized with backend behavior updates.
- Test: Manual verification of appended sections.

## 2026-02-21 19:01
- Change: Implemented global Spotify 429 cooldown lock in `spotifyFetch(...)`. After any `429`, backend stores `Retry-After` as a global block window and short-circuits subsequent Spotify requests with local synthetic `429` responses (with `Retry-After`) until cooldown expires; removed automatic 429 retry loop.
- Files: `beatbrain-backend/src/spotify/spotifyHttp.ts`
- Reason: Prevent additional Spotify requests while throttled and avoid cascading 429 storms.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 19:01
- Change: Updated project context docs to reflect the new global 429 lock behavior and removal of short-window 429 auto-retries.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep central architecture documentation in sync with runtime behavior changes.
- Test: Manual verification of updated rate-limit section and appended update block.

## 2026-02-21 21:03
- Change: Fixed Spotify `/playlists/{id}/items` parsing bug that caused `loaded=0` despite valid responses. Backend now maps from `items[].item` (with compatibility fallback to `items[].track`), filters non-track `item.type`, and updated `fields` query from `items(track(...))` to `items(item(...))`.
- Files: `beatbrain-backend/src/spotify/spotify.service.ts`, `beatbrain-backend/src/dev/dev.spotify.controller.ts`
- Reason: After switching to `/items`, code still expected `track` payload shape, so all 40 returned entries were treated as null tracks.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 21:03
- Change: Updated architecture context documentation with the new items-payload mapping behavior and corrected fields strategy.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep required project context synchronized with backend runtime behavior.
- Test: Manual verification of appended entries.

## 2026-02-21 22:40
- Change: Extended backend quiz question payload for year-input mode. `year-pm2`/`year-pm4` now emit `questionObject.format="year_input"` with `payload { toleranceYears, correctYear }` and no option generation; quiz song DTO/mapping now includes parsed `releaseYear` from Spotify `album.release_date`.
- Files: `beatbrain-backend/src/quiz/quiz.service.ts`, `beatbrain-backend/src/quiz/types/quizSong.ts`, `beatbrain-backend/src/spotify/spotify.service.ts`
- Reason: Year questions should be free-text input with tolerance checks, not multiple-choice decoys.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 22:40
- Change: Mobile singleplayer quiz UI/flow updated with year input rendering, compact song info card, shared header back icon usage, start-quiz in-flight guard wiring, and Spotify App Remote playback path (no frontend `/spotify/playback/play` usage). Added App Remote JS bridge helper and iOS native bridge scaffolding files.
- Files: `beatbrain-frontend/src/mobile/screens/QuizView.tsx`, `beatbrain-frontend/src/components/AppHeader.tsx`, `beatbrain-frontend/src/mobile/navigation/AppRouter.tsx`, `beatbrain-frontend/src/mobile/screens/ChooseQuizView.tsx`, `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/shared/types/app.ts`, `beatbrain-frontend/src/shared/net/beatbrainApi.ts`, `beatbrain-frontend/src/mobile/services/spotifyAppRemote.ts`, `beatbrain-frontend/native/ios/SpotifyAppRemoteModule.swift`, `beatbrain-frontend/native/ios/SpotifyAppRemoteModuleBridge.m`, `beatbrain-frontend/native/ios/README.md`
- Reason: Implement year-input gameplay and full-song App Remote playback requirement while preventing duplicate quiz-start requests and keeping error-actions visually consistent.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-frontend`; `rg -n "spotify/playback/play|startSpotifyPlayback\\(" src` returned no matches.

## 2026-02-21 22:40
- Change: Updated project context documentation with latest year-input + App Remote + quiz UI behavior and explicit note that OAuth/login/redirect/ports/scripts remain untouched.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Mandatory documentation sync after behavior/architecture changes.
- Test: Manual verification of appended sections.

## 2026-02-21 22:43
- Change: Adjusted quiz header layout in `QuizView` to match game design (custom header row with circular back button on the left and small logo on the top-right), replacing the previously reused standard header in quiz screen only.
- Files: `beatbrain-frontend/src/mobile/screens/QuizView.tsx`, `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Quiz screen should visually match the provided in-game screenshot while keeping other screens unchanged.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-frontend`.

## 2026-02-21 22:49
- Change: Updated binary year question copy in backend from `vor oder ab 2000` to `vor oder nach 2000`, including answer labels (`vor 2000` / `nach 2000`).
- Files: `beatbrain-backend/src/quiz/quiz.service.ts`
- Reason: User-facing wording should sound natural in German.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 22:49
- Change: Updated quiz next button label to `Nächste Frage` and suppressed non-actionable App Remote setup warnings (`MODULE_MISSING`, `IOS_ONLY`) so this message is no longer shown under the timer.
- Files: `beatbrain-frontend/src/mobile/screens/QuizView.tsx`, `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`
- Reason: Requested copy fix and cleaner quiz UI without noisy technical warning text.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-frontend`.

## 2026-02-21 22:49
- Change: Updated central context docs for the above wording and playback-error visibility behavior.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep mandatory project context/log synchronized with implementation.
- Test: Manual verification of appended entries.

## 2026-02-21 22:52
- Change: Adjusted quiz reveal `Song Info` alignment so the heading is centered and the right-side metadata (title/artist/album/year) is centered in its column.
- Files: `beatbrain-frontend/src/mobile/screens/QuizView.tsx`
- Reason: User requested centered presentation in the Song Info box.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-frontend`.

## 2026-02-21 22:52
- Change: Updated central project context/log for Song Info alignment update.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep required documentation in sync after UI behavior changes.
- Test: Manual verification of appended entries.

## 2026-02-21 23:00
- Change: Fixed Spotify App Remote token path by adding authenticated backend endpoint `GET /auth/spotify/token` and returning `{ accessToken, expiresIn }` from existing host session token state.
- Files: `beatbrain-backend/src/auth/auth.controller.ts`, `beatbrain-backend/src/auth/auth.service.ts`
- Reason: App Remote connect needs a valid Spotify user access token and previously had no reliable token source in mobile quiz runtime.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in `beatbrain-backend`.

## 2026-02-21 23:00
- Change: Extended Spotify OAuth scope string with `app-remote-control` and wired mobile quiz playback to fetch/cache Spotify SDK token before App Remote connect.
- Files: `beatbrain-backend/src/auth/auth.service.ts`, `beatbrain-frontend/src/shared/net/beatbrainApi.ts`, `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/mobile/services/spotifyAppRemote.ts`
- Reason: Spotify iOS App Remote connection requires token + scope; without this playback fails despite valid quiz data.
- Test: `.\node_modules\.bin\tsc --noEmit -p .\tsconfig.json` passed in both backend/frontend.

## 2026-02-21 23:00
- Change: Updated iOS native bridge signature to `connect(accessToken)` and set `connectionParameters.accessToken` before `connect()`.
- Files: `beatbrain-frontend/native/ios/SpotifyAppRemoteModule.swift`, `beatbrain-frontend/native/ios/SpotifyAppRemoteModuleBridge.m`, `beatbrain-frontend/native/ios/README.md`
- Reason: Match Spotify iOS App Remote connection requirements.
- Test: TypeScript checks unaffected/passed; native files are compile-validated in iOS Dev Client build step.

## 2026-02-21 23:00
- Change: Updated central context docs for App Remote token/scope fix and re-login requirement.
- Files: `PROJECT_CONTEXT.md`, `project-log.md`
- Reason: Keep mandatory docs synchronized with runtime behavior and integration requirements.
- Test: Manual verification of appended entries.

## 2026-03-26 19:00
- Change: Changed the frontend web entry so `http://localhost:8081/` defaults to the host web app; mobile/player web flow still wins when join/auth query params (`joinCode`, `sessionId`, `code`, `auth_code`, `state`, `error`) are present.
- Files: `beatbrain-frontend/App.tsx`
- Reason: Expo Web was opening the mobile app on `/`, even though the intended browser entry for local host mode is the host UI.
- Test: `npx tsc -p tsconfig.json --noEmit` in `beatbrain-frontend`.

## 2026-03-26 19:00
- Change: Updated frontend/backend docs for the new web-root host behavior and clarified that host OAuth returns to `/host/start`.
- Files: `beatbrain-frontend/README.md`, `beatbrain-backend/PROJECT_CONTEXT.md`, `beatbrain-backend/project-log.md`
- Reason: Keep required run/auth documentation synchronized with the changed frontend routing behavior.
- Test: Manual verification of updated docs.

## 2026-03-29 00:00
- Change: Fixed a choose-screen regression in the mobile controller. Shared in-flight playlist loads now return a structured result to the visible caller, so `Choose Quiz` still shows loading/error UI instead of staying blank when a background prefetch started first.
- Files: `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`
- Reason: The choose screen could reuse a non-UI background `/choose` request and then return early without ever applying success/error state, leaving the screen empty although the backend was fine.
- Test: `npx tsc --noEmit` in `beatbrain-frontend`; direct backend check `GET http://127.0.0.1:3000/choose` with a locally signed host JWT returned `200` and `42` playlists with cover URLs.

## 2026-03-29 00:00
- Change: Hardened multiplayer join networking. Host-web QR links now include `backendUrl` when available; mobile player join consumes that override, and both host/mobile Socket.IO clients now allow `websocket` plus `polling` fallback.
- Files: `beatbrain-frontend/src/shared/config.ts`, `beatbrain-frontend/src/shared/net/beatbrainApi.ts`, `beatbrain-frontend/src/host/hooks/useHostController.ts`, `beatbrain-frontend/src/mobile/hooks/useBeatBrainController.ts`, `beatbrain-frontend/src/mobile/navigation/AppRouter.tsx`, `beatbrain-frontend/src/mobile/screens/MultiplayerJoinView.tsx`, `beatbrain-backend/PROJECT_CONTEXT.md`, `beatbrain-backend/project-log.md`
- Reason: Player join needed to adopt the correct backend base from QR/deep links, and WebSocket-only transport was too brittle for device/network combinations where HTTP works but the direct WebSocket handshake is unstable.
- Test: `npx tsc --noEmit` in `beatbrain-frontend`; local Socket.IO probe connected with `polling`; end-to-end local host/createLobby + player/join test succeeded (`playerCount: 1`, transport `polling`).

## 2026-03-29 00:00
- Change: Added an `8s` abort timeout to shared frontend API requests so unreachable backend calls fail with a surfaced `ApiHttpError` instead of leaving `Choose Quiz` spinning forever.
- Files: `beatbrain-frontend/src/shared/net/apiClient.ts`, `beatbrain-backend/PROJECT_CONTEXT.md`, `beatbrain-backend/project-log.md`
- Reason: On a real phone, both singleplayer choose loading and multiplayer join can hit the same backend reachability problem. The app needed to fail fast with a clear backend-unreachable message instead of waiting indefinitely on `fetch`.
- Test: `npx tsc --noEmit` in `beatbrain-frontend`; backend health checks `GET http://127.0.0.1:3000/health` and `GET http://192.168.2.237:3000/health` both returned `{"status":"ok"}` on the host machine.

## 2026-03-29 00:00
- Change: Removed the last hardcoded dev host dependency from startup/networking. `start-frontend.bat` now auto-detects the current machine's LAN IPv4 for `EXPO_PUBLIC_API_BASE_URL` and `REACT_NATIVE_PACKAGER_HOSTNAME`, supports an optional backend override argument, and backend CORS now accepts private LAN dev origins on ports `8081`, `19006`, and `19000` instead of only one fixed `192.168.*` origin.
- Files: `beatbrain-frontend/start-frontend.bat`, `beatbrain-backend/src/main.ts`, `beatbrain-frontend/README.md`, `beatbrain-backend/PROJECT_CONTEXT.md`, `beatbrain-backend/project-log.md`
- Reason: Hosting from another laptop in the same network should work without editing a hardcoded IP in the repo. The previous setup still baked one machine's address into frontend startup and backend CORS.
- Test: `npx tsc --noEmit` in `beatbrain-backend`; LAN IP autodetect probes returned `192.168.2.237`; CORS preflight with `Origin: http://192.168.2.50:8081` now returns `204` plus `Access-Control-Allow-Origin: http://192.168.2.50:8081`.

## 2026-03-29 00:00
- Change: Reworked the host web UI around a clearer big-screen presentation. Header copy, login, lobby, setup, quiz and results screens now explicitly frame the host as a large-display stage, with stronger visual hierarchy, bigger action surfaces and a more readable live-quiz layout that prioritizes question, timer and reveal state.
- Files: `beatbrain-frontend/src/host/components/HostHeader.tsx`, `beatbrain-frontend/src/host/components/HostLayout.tsx`, `beatbrain-frontend/src/host/screens/HostLoginScreen.tsx`, `beatbrain-frontend/src/host/screens/HostLobbyScreen.tsx`, `beatbrain-frontend/src/host/screens/HostSetupModeScreen.tsx`, `beatbrain-frontend/src/host/screens/HostQuizSetupScreen.tsx`, `beatbrain-frontend/src/host/screens/HostQuizCreateScreen.tsx`, `beatbrain-frontend/src/host/screens/HostQuizScreen.tsx`, `beatbrain-frontend/src/host/screens/HostResultsScreen.tsx`
- Reason: The previous host frontend did not communicate strongly enough that it belongs on a TV/laptop/beamer and did not give the live question/timer state enough dominance for a time-based room experience.
- Test: `npx tsc --noEmit` in `beatbrain-frontend`.
