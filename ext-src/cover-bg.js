// ACP cover-bg v2: current track cover as a giant blurred window background (T1),
// plus a song-color wash fed by 3 sampled cover colors (T4).
// v2: multi-candidate sampling with saturation preference and theme-color fallback
// (offline / gray placeholder covers previously produced gray washes).
(() => {
  if (window.__acpCoverBg) return;
  window.__acpCoverBg = true;

  const cache = new Map();

  async function sample(url) {
    if (cache.has(url)) return cache.get(url);
    try {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(32, 32);
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      const pix = [];
      for (let i = 0; i < d.length; i += 4) pix.push([d[i], d[i + 1], d[i + 2]]);
      const score = ([r, g, b]) => {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx < 40) return -1;               // skip near-black pixels
        return (mx - mn) * 3 + mx * 0.15;     // favor SATURATION, not brightness
      };
      const picked = [];
      const sorted = [...pix].sort((a, b) => score(b) - score(a));
      for (const p of sorted) {
        if (picked.every(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) > 90)) {
          picked.push(p);
          if (picked.length === 3) break;
        }
      }
      while (picked.length < 3) picked.push(sorted[0]);
      cache.set(url, picked);
      return picked;
    } catch (e) { return null; }
  }

  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const pick = v => (v || '').trim().split(/\s+/).map(Number);
    return [pick(cs.getPropertyValue('--spice-rgb-secondary')),
            pick(cs.getPropertyValue('--spice-rgb-button')),
            pick(cs.getPropertyValue('--spice-rgb-button-active'))]
      .filter(c => c.length === 3 && c.every(n => !isNaN(n)));
  }

  async function bestColors(urls) {
    let fallback = null;
    for (const u of urls) {
      const cols = await sample(u);
      if (!cols) continue;
      const sat = Math.max(...cols.map(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b)));
      if (sat >= 24) return cols;
      if (!fallback) fallback = cols;
    }
    const th = themeColors();
    return th.length === 3 ? th : fallback;
  }

  const mount = () => {
    const tc = document.querySelector('.Root__top-container');
    if (!tc) return setTimeout(mount, 500);

    const mk = () => { const d = document.createElement('div'); d.className = 'acp-cover-bg'; tc.prepend(d); return d; };
    let cur = mk(), nxt = mk();
    nxt.style.opacity = '0';

    const glow = document.createElement('div');
    glow.className = 'acp-song-glow';
    tc.append(glow);

    const setTokens = cols => {
      if (!cols || cols.length < 3) return;
      tc.style.setProperty('--song-c1', cols[0].join(','));
      tc.style.setProperty('--song-c2', cols[1].join(','));
      tc.style.setProperty('--song-c3', cols[2].join(','));
      glow.classList.add('on');
    };

    // Spicetify.Player.getTrack() was REMOVED in this build (2.46.4 / Spotify 1.3.4).
    // The now-playing bar's own artwork <img> is the reliable "current track art" source.
    const npArt = () => {
      const bar = document.querySelector('.main-nowPlayingBar-container') ||
                  document.querySelector("[data-testid='now-playing-bar']") ||
                  document.querySelector('.Root__now-playing-bar');
      const i = bar && bar.querySelector("img[src*='scdn']");
      return i && i.naturalWidth > 0 ? i.src : null;
    };

    const candidates = extra => {
      const urls = [];
      if (extra) urls.push(extra);
      const a = npArt();
      if (a && !urls.includes(a)) urls.push(a);
      document.querySelectorAll("img[src*='scdn']").forEach(i => {
        if (i.naturalWidth < 150 || urls.includes(i.src)) return;
        // album art (ab67616d) is always real color artwork; prefer it over
        // playlist/artist headers which can be small grayscale placeholders
        if (/ab67616d|ab6770/.test(i.src)) urls.splice(Math.min(urls.length, 2), 0, i.src);
        else urls.push(i.src);
      });
      return urls;
    };

    let lastUrl = "";
    const set = (url) => {
      lastUrl = url;
      nxt.style.backgroundImage = `url("${url}")`;
      nxt.style.opacity = '1';
      cur.style.opacity = '0';
      const t = cur; cur = nxt; nxt = t;
      bestColors(candidates(url)).then(setTokens);
    };

    Spicetify.Player.addEventListener('songchange', ({ data }) => {
      const img = data?.image || npArt();
      if (img) set(img);
      else { cur.style.opacity = '0'; bestColors(candidates()).then(setTokens); }
    });

    let tries = 0;
    const boot = () => {
      const a = npArt();
      if (a) set(a);
      else if (++tries < 20) setTimeout(boot, 1200);
      else bestColors(candidates()).then(setTokens); // no track: DOM/theme-colored wash anyway
    };
    boot();

    // playback restored from a previous session does NOT fire songchange;
    // poll the now-playing artwork as the authoritative current-track source
    setInterval(() => {
      const img = npArt();
      if (img && img !== lastUrl) set(img);
    }, 4000);

    // re-pick colors while the wash is desaturated (lazy DOM artwork)
    setInterval(() => {
      const tc = document.querySelector(".Root__top-container");
      if (!tc) return;
      const sats = [1, 2, 3].map(i => {
        const [r, g, b] = (tc.style.getPropertyValue("--song-c" + i) || "").split(",").map(Number);
        return Number.isFinite(r) ? Math.max(r, g, b) - Math.min(r, g, b) : 0;
      });
      if (Math.max(...sats) < 24) bestColors(candidates()).then(c => { if (c) setTokens(c); });
    }, 2500);
  };

  mount();
})();
