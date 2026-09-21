#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm build:protocol
pnpm --filter @sakyawira/mockride-driver --filter @sakyawira/mockride-rider build
for role in driver rider; do
  (
    cd "openride-${role}-frontend"
    flutter pub get
    if [[ "$role" == rider ]]; then
      flutter build web --no-web-resources-cdn --base-href /rider/
    else
      flutter build web --no-web-resources-cdn
    fi
  )
done
