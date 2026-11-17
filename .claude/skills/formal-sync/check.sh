#!/bin/sh
set -e
cd "$(dirname "$0")"
JAR="${TLA2TOOLS:-$HOME/.cache/tlaplus/tla2tools-1.7.4.jar}"
SUM=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
if [ ! -f "$JAR" ]; then
  mkdir -p "$(dirname "$JAR")"
  curl -sSLf -o "$JAR" https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar
fi
echo "$SUM  $JAR" | shasum -a 256 -c - >/dev/null || { echo "tla2tools.jar does not match its sha256" >&2; exit 2; }
tlc() { mkdir -p "${TMPDIR:-/tmp}/eve-tlc-$1"; java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -config "$1.cfg" -workers auto -deadlock -metadir "${TMPDIR:-/tmp}/eve-tlc-$1" -cleanup EveSync.tla; }
if [ -n "$1" ]; then tlc "$1"; exit; fi
for c in EveSync EveSyncDay; do
  if tlc $c | grep -q "No error has been found"; then echo "ok   $c: no word lost"; else echo "FAIL $c: run ./check.sh $c for the trace"; exit 1; fi
done
if tlc Reach | grep -q "Invariant NoCopyYet is violated"; then echo "ok   Reach: conflict copies are still reached"
else echo "FAIL Reach: no conflict copy is ever made; a step can no longer fire, and the passes above prove nothing"; exit 1; fi
