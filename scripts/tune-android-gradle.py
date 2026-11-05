#!/usr/bin/env python3
"""Opt the generated Android project into Gradle's build cache.

`expo prebuild` rewrites `android/gradle.properties` from the Expo template on
every run, so tuning that file by hand never survives. CI therefore starts each
build with `org.gradle.caching` unset, meaning the `~/.gradle/caches/build-cache-1`
directory that `gradle/actions/setup-gradle` restores is never written to or read
from: every job recompiles Kotlin/Java, re-dexes and re-runs R8 from scratch.

Run this after prebuild (`scripts/build-android.sh` does) to enable the cache and
give the daemon enough heap that R8/dexing don't spend time in GC. Safe to run
repeatedly.
"""

from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parent.parent
GRADLE_PROPERTIES = ROOT / "android" / "gradle.properties"

# Keys this script owns. Anything else in the file is left untouched.
WANTED = {
    "org.gradle.caching": "true",
    "org.gradle.jvmargs": "-Xmx4g -XX:MaxMetaspaceSize=1g",
}

if os.environ.get("GRADLE_CONFIGURATION_CACHE") == "1":
    WANTED["org.gradle.configuration-cache"] = "true"


def set_property(lines: list[str], key: str, value: str) -> list[str]:
    """Replace an existing `key=` line in place, else append one."""
    setting = f"{key}={value}"
    for index, line in enumerate(lines):
        if line.split("=", 1)[0].strip() == key:
            if line == setting:
                return lines
            lines[index] = setting
            return lines
    if lines and lines[-1].strip():
        lines.append("")
    lines.append(setting)
    return lines


def main() -> None:
    if not GRADLE_PROPERTIES.exists():
        raise SystemExit(
            f"tune-android-gradle: {GRADLE_PROPERTIES} is missing; run expo prebuild first"
        )

    original = GRADLE_PROPERTIES.read_text()
    lines = original.splitlines()
    for key, value in WANTED.items():
        lines = set_property(lines, key, value)

    updated = "\n".join(lines) + "\n"
    if updated == original:
        print(f"{GRADLE_PROPERTIES.relative_to(ROOT)} already tuned.")
        return

    GRADLE_PROPERTIES.write_text(updated)
    print(f"Tuned {GRADLE_PROPERTIES.relative_to(ROOT)}: {', '.join(WANTED)}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as error:
        print(error, file=sys.stderr)
        raise
