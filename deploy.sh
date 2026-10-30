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

# 3. enable extensions (2.46.4 wants the whole list, pipe-separated)
spicetify config extensions "cover-bg.js | hover-glow.js | spectrum.js"

# 4. apply (writes into $SPOTIFY_DIR/Apps/xpui/, clears cache, restarts Spotify)
spicetify apply
echo "DEPLOY_OK $(date +%H:%M:%S)"
