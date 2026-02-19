# beatbrain-backend

NestJS backend for BeatBrain.

## Spotify Setup

Create `beatbrain-backend/.env`:

```env
SPOTIFY_CLIENT_ID=b78d9f576fe7491bb91bc7c826c95ee2
SPOTIFY_REDIRECT_URI=beatbrain-login://callback
SPOTIFY_REDIRECT_URI_WEB=http://127.0.0.1:3000/auth/spotify/callback
HOST_WEB_ORIGIN=http://127.0.0.1:19006
DEFAULT_CLIENT=mobile
JWT_SECRET=<strong-random-secret>
HOST_EMAIL=PATCHES0433@GOOGLEMAIL.COM
# optional
# PLAYER_APP_ORIGIN=http://127.0.0.1:8081
```

Do not commit `.env`. Use `.env.example` as template.

## Spotify Redirect URI Rules

- Mobile login uses `SPOTIFY_REDIRECT_URI=beatbrain-login://callback`.
- Web local dev uses `SPOTIFY_REDIRECT_URI_WEB=http://127.0.0.1:<PORT>/auth/spotify/callback` (or `http://[::1]:<PORT>/auth/spotify/callback`).
- Web production can use `SPOTIFY_REDIRECT_URI_WEB=https://<domain>/.../callback`.
- Callback response is redirect-only and forwards to `HOST_WEB_ORIGIN` with short-lived `auth_code`.
- `HOST_WEB_ORIGIN` must match the currently running web host origin.
- Avoid `localhost`, avoid `192.168.x.x`, and never use `exp://` for Spotify OAuth redirect.

## Running locally

```bash
npm install
npm run start:dev
```

Default API port: `3000`.

## Main endpoints

- `POST /auth/spotify/start`
- `GET /auth/spotify/callback`
- `POST /auth/spotify/exchange`
- `GET /auth/result`
- `POST /auth/refresh`
- `POST /spotify/playlists/resolve`
- `GET /spotify/playlists/:id`
- `GET /spotify/playlists/:id/tracks`
- `POST /quiz/sessions`
- `POST /quiz/sessions/:id/next`
- `DELETE /quiz/sessions/:id`

Realtime multiplayer gateway: Socket.IO (same backend server).
