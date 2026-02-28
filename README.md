# beatbrain-backend

NestJS backend for BeatBrain (Spotify auth, quiz endpoints, realtime multiplayer gateway).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` (copy from `.env.example`) and set at least:

```env
SPOTIFY_CLIENT_ID=<your-client-id>
SPOTIFY_REDIRECT_URI=beatbrain-login://callback
SPOTIFY_REDIRECT_URI_WEB=http://127.0.0.1:3000/auth/spotify/callback
HOST_WEB_ORIGIN=http://127.0.0.1:19006
DEFAULT_CLIENT=mobile
JWT_SECRET=<strong-random-secret>
HOST_EMAIL=<host-email>
# optional
# PLAYER_APP_ORIGIN=http://127.0.0.1:8081
```

Notes:
- Keep `.env` local only; do not commit it.
- Use `.env.example` as template.

## Run locally

Option 1 (script in this folder):

```bat
start-backend.bat
```

Option 2 (manual):

```bash
npm run start:dev
```

Default API port is `3000`.

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

Realtime multiplayer is provided via Socket.IO on the same backend server.
