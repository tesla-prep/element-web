#!/usr/bin/env sh
# Builds CIRQLE Messenger and copies it to https://chat.cirqlecirqle.com/next/.
# Static files only: the host nginx serves them from $DEST (see cirqle/nginx-next.conf).
# No --delete: older bundles/<hash>/ stay, so a tab opened before the deploy keeps loading.
set -eu
cd "$(dirname "$0")/.."
HOST="${CIRQLE_HOST:-root@87.99.156.47}"
DEST=/opt/team-messenger/prod/element-next/webapp
pnpm --filter element-web exec nx build element-web
cp cirqle/config.json apps/web/webapp/config.json
ssh "$HOST" "mkdir -p $DEST"
rsync -az --exclude '*.map' apps/web/webapp/ "$HOST:$DEST/"
echo "deployed $(git rev-parse --short HEAD) to $HOST:$DEST"
