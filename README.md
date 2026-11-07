# wing-app

Expo app for [wingd](../wingd).

## Setup

```bash
npm install
cp .env.example .env.development.local   # then fill in your dev Discord client ID
npx expo start
```

The app reads these variables at build time:

| Variable | Required | Default |
| --- | --- | --- |
| `EXPO_PUBLIC_WINGD_URL` | no | `https://wing.lia.page` |
| `EXPO_PUBLIC_DISCORD_CLIENT_ID` | yes | – |

`EXPO_PUBLIC_DISCORD_CLIENT_ID` is the numeric **Application ID** from the Discord Developer Portal (not the client secret). Env changes are inlined at bundle time, so restart with `npx expo start --clear` after editing an env file.

Production values live in the committed `.env.production`. Expo selects env files by mode (`development` for `expo start`, `production` for release builds), and `.env.local` overrides `.env.production` in every mode — so keep machine-specific overrides in the ignored `.env.development.local` instead.

### Discord setup

1. In the Discord Developer Portal, open the app and enable **Public Client** under OAuth2.
2. Add the redirect URI `wing://auth/callback` for native builds.
3. For web, also add `https://wing.lia.page/auth/callback` (and `http://localhost:8081/auth/callback` if you run the web build locally).
4. Make sure the same Discord client ID is configured on wingd as `DISCORD_CLIENT_ID`.

Expo Go cannot complete this flow because its redirect URI uses the `exp://` scheme. Use a development build (`npx expo run:ios` / `npx expo run:android`) or a production build.

The web build also calls wingd from the browser, so wingd must allow that origin through CORS.

## Push notifications (Firebase Installation ID)

Push uses [React Native Firebase](https://rnfirebase.io) in **Installation ID** mode: the device
registers its Firebase Installation ID (FID) and wingd sends to that, instead of to an FCM token.
The IDs are stored on the session row (`sessions.fid`). `GET /api/me` now returns that session
alongside the user, so the app knows which FID wingd already has and skips a redundant upload at
startup; the upsert itself is `PUT /api/sessions/current/fid`.
`expo-notifications` is deliberately not used — it produces Expo/native push tokens and its Android
push service conflicts with RNFirebase's.

Setup:

1. Create **one Firebase app per platform** in the same Firebase project. The identifiers must match
   what `app.json` builds, or `google-services.json` / `GoogleService-Info.plist` are silently wrong:

   | Platform | Identifier | Where |
   | --- | --- | --- |
   | Android | `page.lia.wing` | `expo.android.package` |
   | iOS | `page.lia.wing` | `expo.ios.bundleIdentifier` |

   A package mismatch fails late: Android at `processDebugGoogleServices` ("No matching client
   found"), iOS at launch.

2. Put the downloaded files in `.secrets/` (gitignored, next to the release keystore):
   - `.secrets/google-services.json` (Android)
   - `.secrets/GoogleService-Info.plist` (iOS)

3. iOS credentials (paid Apple Developer account required):
   - Create an **APNs auth key** (`.p8`) in the Apple Developer portal and upload it under Firebase
     → Project settings → Cloud Messaging → Apple app configuration.
   - `app.json` already writes the **Push Notifications** entitlement
     (`ios.entitlements.aps-environment = "development"`) and prebuild wires it into the Xcode
     project, so `expo run:ios` with automatic signing enables the capability on the App ID.
     For App Store / TestFlight builds, use `"production"` (or let EAS manage the entitlement).
   - iOS 16+ Simulators on Xcode 14+ can receive push, but a physical device is the reliable path.

4. Rebuild the native project — the FID flag is a native setting:
   ```bash
   npx expo prebuild --clean
   npx expo run:android    # or: npx expo run:ios, or scripts/build-android.sh
   ```
   `app.json` opts in with `["@react-native-firebase/messaging", { "installationIdEnabled": true }]`,
   which prebuild turns into Android meta-data `firebase_messaging_installation_id_enabled` and the
   iOS Info.plist key `FirebaseMessagingInstallationIdEnabled`. With that flag off,
   `register`/`onRegistered` throw `messaging/installation-id-not-enabled`.

5. Expo Go will not work; use a development build.

Runtime wiring: `src/push/PushRegistration.tsx` (mounted in the root layout) calls
`startPushRegistration()` once the session is authenticated. The `onRegistered` listener fires after
each `register()`, on FID rotation, and on push-subscription changes, and every event upserts the FID
onto the current session. `signOut()` in `AuthProvider` calls `unregister()` and clears the FID
server-side before dropping the token.

## Personal Android APK

Build a signed release APK that talks to `https://wing.lia.page`:

```bash
./scripts/build-android.sh
```

Output: `dist/wing-1.0.0.apk` (package `page.lia.wing`, `arm64-v8a` + `armeabi-v7a` by default; override with `ARCHS`).

Prerequisites: JDK 17+ (the script falls back to Android Studio's bundled JBR) and the Android SDK at `~/Library/Android/sdk` (override with `ANDROID_HOME`). Gradle downloads any missing SDK/NDK components on the first build.

Release builds are signed with `.secrets/wing-release.keystore`; the credentials live in `.secrets/keystore.properties`. Back up `.secrets/` — Android will refuse to install a future update signed with a different key. Both the key and the generated `android/` folder are gitignored.

### GitHub Actions

[.github/workflows/android.yml](.github/workflows/android.yml) builds and signs the APK on every push to `main`, on `v*` tags, and on manual dispatch. Download the `wing-apk` artifact from the workflow run.

Add these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `WING_KEYSTORE_BASE64` | Output of `base64 -i .secrets/wing-release.keystore` (one line) |
| `WING_KEYSTORE_PASSWORD` | `storePassword` from `.secrets/keystore.properties` |
| `WING_GOOGLE_SERVICES_JSON` | Full contents of `google-services.json` for `page.lia.wing` |

The workflow reads `.env.production`, fails early if signing secrets are missing, and verifies the APK is signed and contains the production Discord client ID before uploading it.

## Auth flow

1. The app opens Discord's OAuth2 authorize page with a PKCE challenge (`S256`) and a `state` value.
2. Discord redirects back to the app with a `code`; the app exchanges it directly with Discord's token endpoint using the PKCE verifier.
3. The app posts the Discord access token to `POST /api/auth/discord`, stores the returned wingd token in SecureStore (localStorage on web), and uses it as `Authorization: Bearer` for `GET /api/me`.

## Message formatting

Chat messages support a lightweight subset of markdown:

- `**bold**`, `*italic*`, `~~strikethrough~~`, and `` `inline code` ``
- Links written as `[label](https://example.com)`, `<https://example.com>`, or as bare `https://` URLs
- Fenced code blocks (triple backticks), headings, blockquotes, ordered/unordered lists, and horizontal rules
- Consecutive agent messages whose only content is a `tooluse` or `toolerror` fenced block are grouped into one collapsible row; collapsed it shows the latest block, and tapping it reveals every call in the run

Formatting is rendered in every conversation; chat-list previews and accessibility labels use the plain text without the markdown syntax.
