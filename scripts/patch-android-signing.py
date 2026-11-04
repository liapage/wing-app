#!/usr/bin/env python3
"""Point the generated Android release build at the personal signing key.

`expo prebuild` regenerates android/app/build.gradle, which defaults to signing
release builds with the public debug key. This patches the generated file to use
.secrets/wing-release.keystore instead. Safe to run repeatedly.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
BUILD_GRADLE = ROOT / "android" / "app" / "build.gradle"

ANCHOR = (
    'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n'
)
SIGNING_SETUP = ANCHOR + """
// Personal release signing key, kept outside the generated android/ folder so
// it survives `expo prebuild`. See .secrets/keystore.properties.
def releaseSigningProperties = new Properties()
def releaseSigningFile = rootProject.file("../.secrets/keystore.properties")
if (releaseSigningFile.exists()) {
    releaseSigningFile.withInputStream { releaseSigningProperties.load(it) }
}
"""

DEBUG_SIGNING = """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
"""

SIGNING_CONFIGS = """    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (releaseSigningFile.exists()) {
                storeFile rootProject.file("../" + releaseSigningProperties.getProperty("storeFile"))
                storePassword releaseSigningProperties.getProperty("storePassword")
                keyAlias releaseSigningProperties.getProperty("keyAlias")
                keyPassword releaseSigningProperties.getProperty("keyPassword")
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }
"""

RELEASE_DEBUG_SIGNING = """            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
"""

RELEASE_SIGNING = "            signingConfig signingConfigs.release\n"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"patch-android-signing: could not find {label} in {BUILD_GRADLE}")
    return source.replace(old, new, 1)


def main() -> None:
    if not BUILD_GRADLE.exists():
        raise SystemExit(
            f"patch-android-signing: {BUILD_GRADLE} is missing; run expo prebuild first"
        )

    source = BUILD_GRADLE.read_text()

    if "releaseSigningProperties" not in source:
        source = replace_once(source, ANCHOR, SIGNING_SETUP, "projectRoot anchor")
        source = replace_once(source, DEBUG_SIGNING, SIGNING_CONFIGS, "signingConfigs block")
        source = replace_once(
            source,
            RELEASE_DEBUG_SIGNING,
            RELEASE_SIGNING,
            "release signingConfig line",
        )
        BUILD_GRADLE.write_text(source)
        print(f"Patched {BUILD_GRADLE.relative_to(ROOT)} to use the release keystore.")
    else:
        print(f"{BUILD_GRADLE.relative_to(ROOT)} already uses the release keystore.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as error:
        print(error, file=sys.stderr)
        raise
