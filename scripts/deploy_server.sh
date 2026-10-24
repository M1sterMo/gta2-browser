#!/usr/bin/env bash
# Deploys the GTA2 game server (D21) to the shared droplet, following its
# hosting rules (deploy/README.md): everything under /opt/gta2, the image is
# pulled from GHCR (built in CI), the shared Caddy gets one sites file.
#
#   DOMAIN=gta2.example.com GTA2_PASSWORD='...' scripts/deploy_server.sh user@host   # first time
#   scripts/deploy_server.sh user@host                                                # updates
#
# DOMAIN writes the Caddy site; GTA2_PASSWORD writes /opt/gta2/.env (chmod 600).
# Both are only needed the first time, or to change them.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:?usage: [DOMAIN=...] [GTA2_PASSWORD=...] scripts/deploy_server.sh user@host}"

[ -f build/port/release/gta2.wasm ] || python3 scripts/build_port.py --preset release
[ -f game/data/wil.gmp ] || { echo "deploy_server: game/ has no GTA2 files" >&2; exit 1; }

ssh "$target" 'test -f /opt/HOSTING.md || { echo "deploy_server: /opt/HOSTING.md missing - is this the right server?" >&2; exit 1; }
  docker network inspect edge >/dev/null || { echo "deploy_server: no docker network edge" >&2; exit 1; }
  mkdir -p /opt/gta2/data/web /opt/gta2/data/game /opt/gta2/data/db
  chmod 777 /opt/gta2/data/db'

if [ -n "${GTA2_PASSWORD:-}" ]; then
  : "${DOMAIN:?set DOMAIN with GTA2_PASSWORD (it goes into the invite link)}"
  # through stdin, so the password never appears on a command line
  printf 'GTA2_PASSWORD=%s\nPUBLIC_URL=https://%s\n' "$GTA2_PASSWORD" "$DOMAIN" |
    ssh "$target" 'umask 077 && cat > /opt/gta2/.env && chmod 600 /opt/gta2/.env'
fi
ssh "$target" 'test -f /opt/gta2/.env' || { echo "deploy_server: first deploy needs DOMAIN and GTA2_PASSWORD" >&2; exit 1; }

# Keep the version that is live now: Saves-screen saves only load in the build that made them,
# and the Saves screen opens old/<build>/ for them ("Open in its version"). If the live build is
# about to be replaced and isn't archived yet, copy it into old/ first, so it goes back up with
# the rest and no save is ever stranded.
new_build=$(shasum -a 256 build/port/release/gta2.wasm | cut -c1-24)
live_build=$(ssh "$target" 'test -f /opt/gta2/data/web/gta2.wasm && sha256sum /opt/gta2/data/web/gta2.wasm | cut -c1-24' || true)
if [ -n "$live_build" ] && [ "$live_build" != "$new_build" ] && [ ! -f "build/port/release/old/$live_build/gta2.wasm" ]; then
  echo "deploy_server: archiving the live build $live_build in old/"
  mkdir -p "build/port/release/old/$live_build"
  rsync -a --exclude old --exclude obj --exclude dev --exclude objects.rsp \
    "$target:/opt/gta2/data/web/" "build/port/release/old/$live_build/"
fi

# readable by the container's user (the installer leaves some folders owner-only)
rsync -az --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r build/port/release/ "$target:/opt/gta2/data/web/"
rsync -az --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r --exclude '*.exe' --exclude '*.dll' --exclude '*.bik' game/ "$target:/opt/gta2/data/game/"
rsync -az deploy/compose.yml "$target:/opt/gta2/compose.yml"
# also here: macOS's own rsync (openrsync) ignores --chmod, and the container must read every file
ssh "$target" 'chmod -R u=rwX,go=rX /opt/gta2/data/web /opt/gta2/data/game'

ssh "$target" 'cd /opt/gta2 && docker compose pull -q && docker compose up -d'

if [ -n "${DOMAIN:-}" ]; then
  printf '%s {\n\treverse_proxy gta2-app:8790\n}\n' "$DOMAIN" | ssh "$target" 'cat > /opt/edge/sites/gta2.caddy'
  ssh "$target" 'docker exec edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile'
fi

sleep 2
ssh "$target" 'docker logs --tail 5 gta2-app'
echo "deploy_server: done"
