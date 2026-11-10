// cover-bg v3 — FIXED dark wallpaper background + song-color accent tokens.
// v3 (user m00085): the background no longer tracks the album cover (light
// covers blew out the contrast). It shows a fixed dark wallpaper from
// images/acp-walls.json (deploy.sh ships wallpapers/* → xpui/images/ and
// regenerates the manifest). WALL_CYCLE_MS > 0 enables a slideshow cycle.
// The album cover is STILL sampled into --song-c1/2/3 so the album theme
// (wash radials, progress bar, spectrum, right panel) stays all around.
(() => {
  const WALLS_MANIFEST = "images/acp-walls.json";
  const WALLS_FALLBACK = ["images/acp-wall-01.png"];
  const WALL_CYCLE_MS = 0; // e.g. 60000 to cycle wallpapers; 0 = static

  const clamp255 = (v) => Math.round(Math.max(0, Math.min(255, v)));

  // sample an image region, favouring saturated pixels (grays/blacks wash out)
  function sample(img, x, y, w, h) {
    try {
      const s = 12, c = document.createElement("canvas");
      c.width = s; c.height = s;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, x, y, w, h, 0, 0, s, s);
      const d = g.getImageData(0, 0, s, s).data;
      let best = null, bestScore = -1;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
        const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        const score = sat * 1.6 + (255 - Math.abs(lum - 110)) * 0.4;
        if (score > bestScore) { bestScore = score; best = [r, gg, b]; }
      }
      return best;
    } catch (e) { return null; }
  }

  // Spotify's own palette for the current track (CORS-safe tiebreak fallback)
  function themeColors() {
    try {
      const cp = typeof Spicetify !== "undefined" && Spicetify.colorPalette;
      if (!cp) return null;
      const one = (c) => {
        if (!c) return null;
        if (Array.isArray(c)) return [c[0], c[1], c[2]];
        if (typeof c.r === "number") return [c.r, c.g, c.b];
        return null;
      };
      const cols = [];
      [cp.color, cp.colorSecondary, cp.colorTertiary, cp.colorAccent]
        .forEach((c) => { const x = one(c); if (x) cols.push(x); });
      return cols.length >= 3 ? cols.slice(0, 3) : null;
    } catch (e) { return null; }
  }

  // host-agnostic: Spotify moved to image-cdn-*.spotifycdn.com and local
  // files use spotify:localfileimage: — match any rendered img
  const npArt = () => {
    const imgs = document.querySelectorAll(".Root__now-playing-bar img");
    for (const i of imgs) if (i.complete && i.naturalWidth > 16) return i;
    return null;
  };

  function candidates() {
    const out = [];
    const art = npArt();
    if (art && art.complete && art.naturalWidth > 16) {
      const w = art.naturalWidth, h = art.naturalHeight;
      out.push(art, [art, 0, 0, w, h], [art, 0, 0, w / 2, h / 2],
        [art, w / 4, h / 4, w / 2, h / 2], [art, w * 0.66, 0, w * 0.34, h * 0.34]);
    }
    document.querySelectorAll(".Root__main-view img").forEach((im) => {
      if (im.src.startsWith("data:")) return;
      if (im !== art && im.complete && im.naturalWidth >= 48) {
        out.push(im, [im, 0, 0, im.naturalWidth * 0.5, im.naturalHeight * 0.5]);
      }
    });
    return out;
  }

  async function bestColors(list) {
    const scored = [];
    for (const cnd of list) {
      const px = Array.isArray(cnd)
        ? sample(cnd[0], cnd[1], cnd[2], cnd[3], cnd[4])
        : sample(cnd, 0, 0, cnd.naturalWidth, cnd.naturalHeight);
      if (px) scored.push(px);
    }
    if (scored.length < 3) return null;
    // greedy spread: strongest, then most distant, then most distant from both
    const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const rank = (c) => (Math.max(...c) - Math.min(...c)) + Math.max(...c) * 0.3;
    const pool = scored.slice().sort((a, b) => rank(b) - rank(a));
    const c1 = pool.shift();
    let c2 = pool.shift() || c1;
    pool.sort((a, b) => Math.min(dist(b, c1), dist(b, c2)) - Math.min(dist(a, c1), dist(a, c2)));
    const c3 = pool[0] || c2;
    return [c1, c2, c3];
  }

  function setTokens(cols) {
    const tc = document.querySelector(".Root__top-container");
    if (!tc) return;
    // LUMA CLAMP (m00085): light covers produced near-white accents that blew
    // out wash/progress-bar contrast. Cap the brightest channel so accents
    // stay legible on the dark wallpaper while keeping the hue.
    const cap = (c) => {
      const m = Math.max(c[0], c[1], c[2]);
      return m > 190 ? [clamp255(c[0] * 190 / m), clamp255(c[1] * 190 / m), clamp255(c[2] * 190 / m)] : c;
    };
    cols.slice(0, 3).forEach((c, i) => tc.style.setProperty("--song-c" + (i + 1), cap(c).join(",")));
    const glow = document.querySelector(".acp-song-glow");
    if (glow) glow.classList.add("on"); // v9-era CSS needs .on for opacity 1
  }

  // ---------- wallpaper layer (v3) ----------
  let walls = WALLS_FALLBACK.slice();
  let wallIdx = Math.floor(Math.random() * walls.length);
  let cur = null, nxt = null;

  function paintWall(animate) {
    if (!cur) return;
    const url = 'url("' + walls[wallIdx % walls.length] + '")';
    if (animate && nxt) {
      nxt.style.backgroundImage = url;
      nxt.style.setProperty("opacity", "1", "important");
      cur.style.setProperty("opacity", "0", "important");
      const t = nxt; nxt = cur; cur = t;
    } else {
      cur.style.backgroundImage = url;
      cur.style.setProperty("opacity", "1", "important");
    }
  }

  function loadWalls() {
    // manifest holds images/... paths; fall back silently to the baked wall
    fetch(WALLS_MANIFEST, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.walls) && j.walls.length) {
          walls = j.walls.filter((w) => typeof w === "string" && w.length);
        }
      })
      .catch(() => {})
      .finally(() => {
        paintWall(false);
        if (WALL_CYCLE_MS > 0 && walls.length > 1) {
          setInterval(() => { wallIdx++; paintWall(true); }, WALL_CYCLE_MS);
        }
      });
  }

  let lastArt = null;
  function resync() {
    const tc = document.querySelector(".Root__top-container");
    if (!tc) return;
    tc.classList.add("acp-artsync");
    const th = themeColors();
    bestColors(candidates()).then((cols) => {
      const use = (cols && cols.length >= 3) ? cols : th;
      if (use) setTokens(use);
    });
  }

  function mount() {
    const tc = document.querySelector(".Root__top-container");
    if (!tc) return;

    // v3: fixed dark wallpaper layer (CSS: no blur, cover-fit) + song glow
    cur = document.createElement("div");
    cur.className = "acp-cover-bg";
    nxt = document.createElement("div");
    nxt.className = "acp-cover-bg";
    nxt.style.setProperty("opacity", "0", "important");
    const glow = document.createElement("div");
    glow.className = "acp-song-glow";
    tc.prepend(glow);
    tc.prepend(cur);
    tc.prepend(nxt);

    loadWalls();

    const art = npArt();
    if (art) { lastArt = art; resync(); }
    if (typeof Spicetify !== "undefined" && Spicetify.Player) {
      Spicetify.Player.addEventListener("songchange", () => {
        lastArt = null;
        const a = npArt();
        if (a) { lastArt = a; resync(); }
        else { const th = themeColors(); if (th) setTokens(th); }
      });
    }

    // playback restored from a previous session does NOT fire songchange;
    // poll the now-playing artwork as the authoritative current-track source
    setInterval(() => {
      const img = npArt();
      if (img && img !== lastArt) { lastArt = img; resync(); }
    }, 4000);

    // re-pick colors while the wash is desaturated (lazy DOM artwork)
    setInterval(() => {
      const tcx = document.querySelector(".Root__top-container");
      if (!tcx) return;
      const sats = [1, 2, 3].map(i => {
        const [r, g, b] = (tcx.style.getPropertyValue("--song-c" + i) || "").split(",").map(Number);
        return Number.isFinite(r) ? Math.max(r, g, b) - Math.min(r, g, b) : 0;
      });
      if (Math.max(...sats) < 24) bestColors(candidates()).then(c => { if (c) setTokens(c); });
    }, 2500);
  }

  // wait for .Root__top-container, then mount exactly once
  let tries = 0;
  const t = setInterval(() => {
    if (document.querySelector(".Root__top-container")) { clearInterval(t); mount(); }
    else if (++tries > 50) clearInterval(t);
  }, 400);
})();
