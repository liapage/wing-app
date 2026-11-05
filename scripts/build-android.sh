#!/usr/bin/env bash
# Build a signed, sideloadable release APK for Android.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .secrets/wing-release.keystore || ! -f .secrets/keystore.properties ]]; then
    echo "Missing .secrets/wing-release.keystore or .secrets/keystore.properties." >&2
    echo "Restore your signing key backup before building." >&2
    exit 1
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
    STUDIO_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    if [[ -x "$STUDIO_JBR/bin/java" ]]; then
        export JAVA_HOME="$STUDIO_JBR"
    fi
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
    echo "Set JAVA_HOME to a JDK 17+ installation (Android Studio bundles one)." >&2
    exit 1
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ ! -f android/app/build.gradle ]]; then
    npx expo prebuild --platform android --no-install
fi

python3 scripts/patch-android-signing.py
python3 scripts/tune-android-gradle.py

ARCHS="${ARCHS:-arm64-v8a,armeabi-v7a}"
(cd android && ./gradlew :app:assembleRelease "-PreactNativeArchitectures=$ARCHS")

VERSION="$(node -p "require('./app.json').expo.version")"
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "dist/wing-$VERSION.apk"
echo "APK: $ROOT/dist/wing-$VERSION.apk"
