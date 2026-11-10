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
  # baked fallback wall stays at the images/ root (WALLS_FALLBACK in cover-bg.js)
  cp -f "$R"/wallpapers/acp-wall-01.png "$SPOTIFY_DIR/Apps/xpui/images/" 2>/dev/null || true
  # user wallpapers are downscaled/re-encoded (slideshow decodes them in CEF —
  # 8-17MB 4-5K px originals would be wasteful) into images/acp-walls/
  mkdir -p "$SPOTIFY_DIR/Apps/xpui/images/acp-walls"
  python3 - "$R" "$SPOTIFY_DIR/Apps/xpui/images/acp-walls" "$SPOTIFY_DIR/Apps/xpui/images/acp-walls.json" <<'PY'
import json, sys, glob, os, re
r, wdir, out = sys.argv[1], sys.argv[2], sys.argv[3]
walls = []
try:
    from PIL import Image
except Exception:
    Image = None
files = []
for pat in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
    files += glob.glob(os.path.join(r, "wallpapers", pat))
for p in sorted(files):
    base = os.path.splitext(os.path.basename(p))[0]
    if base == "acp-wall-01":
        walls.append("images/acp-wall-01.png"); continue
    if not Image:
        print("PIL missing, skipping resize for", p, file=sys.stderr); continue
    name = re.sub(r"[^a-z0-9._-]+", "-", base.lower()) + ".jpg"
    try:
        im = Image.open(p)
        im.thumbnail((2560, 2560))
        im.convert("RGB").save(os.path.join(wdir, name), "JPEG", quality=82)
        walls.append("images/acp-walls/" + name)
    except Exception as e:
        print("wall skip", p, e, file=sys.stderr)
json.dump({"walls": walls}, open(out, "w"))
print("walls:", len(walls))
PY
}
copy_walls

# 5. apply (writes into $SPOTIFY_DIR/Apps/xpui/, clears cache, restarts Spotify)
spicetify apply
copy_walls
echo "DEPLOY_OK $(date +%H:%M:%S)"
