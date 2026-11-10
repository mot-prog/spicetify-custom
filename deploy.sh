#!/usr/bin/env bash
# One-command sync: repo sources -> spicetify/spotify targets -> reload.
# Usage: ./deploy.sh   (extensions + css bake + spicetify apply)
# NOTE: adjust SPOTIFY_DIR for your distro (Windows: %APPDATA%/Spotify).
set -e
R="$(cd "$(dirname "$0")" && pwd)"
S="$HOME/.config/spicetify"
SPOTIFY_DIR="/opt/spotify"

mkdir -p "$S/Extensions"

# 0. source of truth for extensions is ext-src/ in this repo
cp "$R"/ext-src/*.js "$S/Extensions/"

# 1. extensions: Extensions/ -> Apps/xpui/extensions/ (2.46.4 injects from here, NOT config Extensions)
[ -d "$SPOTIFY_DIR/Apps/xpui/extensions" ] && cp "$S/Extensions"/*.js "$SPOTIFY_DIR/Apps/xpui/extensions/"

# 2. CSS: custom-tweaks.css is the working copy of the CUSTOM block appended to the Sleek theme
sed '/CUSTOM: glassmorphism/,$d' "$S/Themes/Sleek/user.css" > /tmp/user.base.css
cat "$R/custom-tweaks.css" >> /tmp/user.base.css
mv /tmp/user.base.css "$S/Themes/Sleek/user.css"

# 3. enable extensions (2.46.4 wants the whole list, pipe-separated).
#    Clear first: setting without clearing had accumulated duplicate entries.
spicetify config extensions ""
spicetify config extensions "cover-bg.js|hover-glow.js|spectrum.js"

# 4. wallpaper assets (v34): wallpapers/ -> xpui/images/ + manifest for cover-bg.js.
#    Run before AND after apply — apply may rebuild xpui from cache.
copy_walls() {
  [ -d "$SPOTIFY_DIR/Apps/xpui/images" ] || return 0
  cp -f "$R"/wallpapers/* "$SPOTIFY_DIR/Apps/xpui/images/" 2>/dev/null || true
  python3 - "$R" "$SPOTIFY_DIR/Apps/xpui/images/acp-walls.json" <<'PY'
import json, sys, glob, os
r, out = sys.argv[1], sys.argv[2]
names = []
for pat in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
    names += [os.path.basename(p) for p in glob.glob(os.path.join(r, "wallpapers", pat))]
json.dump({"walls": ["images/" + n for n in sorted(names)]}, open(out, "w"))
PY
}
copy_walls

# 5. apply (writes into $SPOTIFY_DIR/Apps/xpui/, clears cache, restarts Spotify)
spicetify apply
copy_walls
echo "DEPLOY_OK $(date +%H:%M:%S)"
