#!/usr/bin/env bash
# The phone's Kotlin unit tests (src-tauri/gen/android/app/src/test), without building the app.
# Gradle reads files that tauri's build scripts write only when cargo builds for Android (tauri.settings.gradle,
# app/tauri.build.gradle.kts, the generated Kotlin); `tauri android build` sets the variables they need, so a
# cargo check for Android with the same variables writes them here.
# Needs: an Android SDK (ANDROID_HOME) with an NDK, JDK 17, rustup target aarch64-linux-android.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
android=$root/src-tauri/gen/android
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
ndk=${NDK_HOME:-${ANDROID_NDK_HOME:-$(ls -d "$sdk"/ndk/* 2>/dev/null | sort -V | tail -1)}}
[ -d "$ndk" ] || { echo "no NDK: set NDK_HOME or install one under \$ANDROID_HOME/ndk" >&2; exit 1; }
bin=$(ls -d "$ndk"/toolchains/llvm/prebuilt/*/bin | head -1)
package=$(node -p "require('$root/src-tauri/tauri.conf.json').identifier")
library=$(sed -n '/^\[lib\]/,/^\[/s/^name = "\(.*\)"/\1/p' "$root/src-tauri/Cargo.toml")
generated=$android/app/src/main/java/${package//.//}/generated
mkdir -p "$generated"

(cd src-tauri && \
  TAURI_ANDROID_PROJECT_PATH=$android \
  WRY_ANDROID_PACKAGE=$package WRY_ANDROID_LIBRARY=$library WRY_ANDROID_KOTLIN_FILES_OUT_DIR=$generated \
  CC_aarch64_linux_android=$bin/aarch64-linux-android24-clang AR_aarch64_linux_android=$bin/llvm-ar \
  cargo check --target aarch64-linux-android --lib --quiet)

cd "$android"
ANDROID_HOME=$sdk ./gradlew --quiet :app:testArm64DebugUnitTest
echo "android unit tests passed"
