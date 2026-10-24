#!/bin/bash
# Fails open: capture problems must never block a prompt from being sent.
event="$1"
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$dir/.state"

node_bin="$(command -v node)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$node_bin" ] && break
  [ -x "$candidate" ] && node_bin="$candidate"
done

if [ -n "$node_bin" ]; then
  "$node_bin" "$dir/capture.mjs" "$event" >/dev/null 2>>"$dir/.state/errors.log"
else
  echo "$(date -u +%FT%TZ) node not found for event $event" >>"$dir/.state/errors.log"
fi

if [ "$event" = "prompt" ]; then
  echo '{"continue": true}'
else
  echo '{}'
fi
exit 0
