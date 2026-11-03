# wing-app

Expo app for [wingd](../wingd).

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the Discord client ID
npx expo start
```

The app reads these variables at build time:

| Variable | Required | Default |
| --- | --- | --- |
| `EXPO_PUBLIC_WINGD_URL` | no | `http://localhost:8080` |
| `EXPO_PUBLIC_DISCORD_CLIENT_ID` | yes | – |

`EXPO_PUBLIC_DISCORD_CLIENT_ID` is the numeric **Application ID** from the Discord Developer Portal (not the client secret). Env changes are inlined at bundle time, so restart with `npx expo start --clear` after editing `.env.local`.

### Discord setup

1. In the Discord Developer Portal, open the app and enable **Public Client** under OAuth2.
2. Add the redirect URI `wing://auth/callback` for native builds.
3. For web, also add `http://localhost:8081/auth/callback` (or the URL you serve the web build from).
4. Make sure the same Discord client ID is configured on wingd as `DISCORD_CLIENT_ID`.

Expo Go cannot complete this flow because its redirect URI uses the `exp://` scheme. Use a development build (`npx expo run:ios` / `npx expo run:android`) or a production build.

The web build also calls wingd from the browser, so wingd must allow that origin through CORS.

## Auth flow

1. The app opens Discord's OAuth2 authorize page with a PKCE challenge (`S256`) and a `state` value.
2. Discord redirects back to the app with a `code`; the app exchanges it directly with Discord's token endpoint using the PKCE verifier.
3. The app posts the Discord access token to `POST /api/auth/discord`, stores the returned wingd token in SecureStore (localStorage on web), and uses it as `Authorization: Bearer` for `GET /api/me`.
