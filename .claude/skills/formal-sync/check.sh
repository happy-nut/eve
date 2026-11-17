#!/bin/sh
# Runs TLC on one config of EveSync (default: the promise). ./check.sh [EveSync|FindingDelete|FindingSameId|FindingMidSync]
# Fetches the pinned tla2tools.jar (TLA+ 1.7.4, from the TLA+ project's GitHub release) once, checked by its sha256.
set -e
cd "$(dirname "$0")"
JAR="${TLA2TOOLS:-$HOME/.cache/tlaplus/tla2tools-1.7.4.jar}"
SUM=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
if [ ! -f "$JAR" ]; then
  mkdir -p "$(dirname "$JAR")"
  curl -sSLf -o "$JAR" https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
fi
echo "$SUM  $JAR" | shasum -a 256 -c - >/dev/null || { echo "tla2tools.jar does not match its sha256" >&2; exit 2; }
CFG="${1:-EveSync}"
OUT="${TMPDIR:-/tmp}/eve-tlc-$CFG"
mkdir -p "$OUT"
exec java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -config "$CFG.cfg" -workers auto -deadlock -metadir "$OUT" -cleanup EveSync.tla
