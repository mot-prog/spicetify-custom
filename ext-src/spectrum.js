// ACP spectrum v2: song-synchronized frequency bars behind the playback-bar controls.
// Spotify 1.3.4 has NO in-page <audio> element (audio is native), so WebAudio capture
// is impossible. Instead we use Spotify's own precomputed audio-analysis JSON
// (same source the Konsl visualizer uses): per-segment loudness envelope + 12 pitch
// vector -> synthesized 44-bar spectrum, synced to Spicetify.Player.getProgress().
// Bars are tinted with the current song colors (--song-c1/2/3 from cover-bg).
(() => {
  if (window.__acpSpectrum) return;
  window.__acpSpectrum = true;

  const style = document.createElement('style');
  style.textContent = `
    .Root__now-playing-bar { position: relative; }
    .acp-spectrum {
      position: absolute; left: 24px; bottom: 12px; height: 38px;
      width: calc(100% - 48px);
      pointer-events: none; opacity: 0; z-index: 2;
      transition: opacity .25s;
    }
    .Root__now-playing-bar > *:not(.acp-spectrum) { position: relative; z-index: 1; }
    .main-nowPlayingBar-center { position: relative; z-index: 3; }
  `;
  document.head.appendChild(style);

  const dBlin = d => Math.min(1, Math.max(0, Math.pow(10, d / 20)));

  const mount = () => {
    const npb = document.querySelector('.Root__now-playing-bar');
    if (!npb) return setTimeout(mount, 500);

    const cv = document.createElement('canvas');
    cv.className = 'acp-spectrum';
    npb.prepend(cv);
    const g = cv.getContext('2d');
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, cv.clientWidth * dpr);
      cv.height = Math.max(1, cv.clientHeight * dpr);
    };
    new ResizeObserver(fit).observe(cv);
    fit();

    let segs = null, segIdx = 0, dur = 0, lastId = null, loading = false;
    const load = async () => {
      if (loading) return;
      try {
        const uri = Spicetify?.Player?.data?.item?.uri;
        if (!uri) return;
        const id = Spicetify.URI.fromString(uri).id;
        if (!id || id === lastId) return;
        loading = true;
        // early-boot Cosmos calls can HANG forever (never resolve) — race a timeout
        const j = await Promise.race([
          Spicetify.CosmosAsync.get(
            `https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${id}?format=json`),
          new Promise((_, rej) => setTimeout(() => rej(new Error('cosmos-timeout')), 10000)),
        ]);
        loading = false;
        // CosmosAsync may hand back the JSON as a raw string — normalize first
        const o = (typeof j === "string") ? JSON.parse(j) : j;
        if (o && Array.isArray(o.segments) && o.segments.length) {
          segs = o.segments; segIdx = 0; lastId = id;
          const last = segs[segs.length - 1];
          dur = last.start + (last.duration || 0.5);
        }
      } catch (e) { loading = false; /* offline or promo: keep previous/no bars */ }
    };
    Spicetify.Player.addEventListener('songchange', () => { lastId = null; load(); });
    Spicetify.Player.addEventListener('play', load);     // resume/relaunch case
    setInterval(() => { if (!segs) load(); }, 3000);     // belt & braces
    window.__acpSpecDbg = () => ({
      segs: segs ? segs.length : 0, lastId, dur: Math.round(dur),
      playing: !!Spicetify?.Player?.isPlaying?.(),
      prog: Math.round((Spicetify?.Player?.getProgress?.() || 0) / 100) / 10,
      energy: Math.round(level.reduce((a, v) => a + v, 0) * 100) / 100,
    });

    const BARS = 72;
    const level = new Float32Array(BARS);
    const rgbOf = name => {
      const tc = document.querySelector('.Root__top-container');
      return ((tc && tc.style.getPropertyValue(name)) || '161,181,211').trim();
    };

    const segAt = t => {
      if (!segs) return null;
      while (segIdx + 1 < segs.length && segs[segIdx + 1].start <= t) segIdx++;
      while (segIdx > 0 && segs[segIdx].start > t) segIdx--;
      const s = segs[segIdx];
      const p = s.start + (s.duration || 0.5);
      if (t > p + 0.05) return null; // gap between analyzed segments
      return s;
    };

    const draw = () => {
      // NOTE: requestAnimationFrame NEVER fires in this CEF environment (verified
      // rafCount=0 with document.visibilityState=visible) — drive the loop with timers.
      setTimeout(draw, 33);
      const w = cv.width, h = cv.height;
      if (!w || !h) return;
      g.clearRect(0, 0, w, h);
      const playing = Spicetify?.Player?.isPlaying?.() && segs;
      // never leave idle red stubs on screen (they read as a broken dashed line)
      cv.style.opacity = playing ? "0.85" : "0";
      const t = playing ? Spicetify.Player.getProgress() / 1000 : -1;
      const s = playing ? segAt(t) : null;

      // loudness envelope inside the segment (attack at max_time)
      let loud = 0;
      if (s) {
        const lt = t - s.start;
        const mt = s.loudness_max_time || 0.1, p = s.duration || 0.5;
        let dB;
        if (lt < mt) dB = s.loudness_start + (s.loudness_max - s.loudness_start) * (lt / mt);
        else dB = s.loudness_max + (s.loudness_end - s.loudness_max) * Math.min(1, (lt - mt) / Math.max(0.05, p - mt));
        loud = dBlin(dB);
      }
      window.__acpDbgFrame = { t: Math.round(t * 10) / 10, idx: segIdx,
        sStart: s ? s.start : null, sDur: s && s.duration, loud: Math.round(loud * 100) / 100,
        pl: !!playing };

      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, `rgba(${rgbOf("--song-c1")}, 0.85)`);
      grad.addColorStop(1, `rgba(${rgbOf("--song-c3")}, 0.4)`);
      g.fillStyle = grad;

      const gap = Math.max(1, (w / BARS) * 0.55);
      const bw = (w - gap * (BARS - 1)) / BARS;
      const n = s ? segs[segIdx + 1] : null;
      const pAt = (s, k) => (s && s.pitches && s.pitches.length) ? (s.pitches[Math.min(11, k)] || 0) : 0.5;
      // no inter-segment morph: each analysis segment snaps in at its start
      // (per-frame morphing was what made the bars look like a slow loop animation)
      const pMix = k => pAt(s, k);
      for (let i = 0; i < BARS; i++) {
        let v = 0;
        if (s) {
          const dim = (i / (BARS - 1)) * 11;
          const k = Math.floor(dim), fr = dim - k;
          const wgt = pMix(k) * (1 - fr) + pMix(Math.min(11, k + 1)) * fr;
          const tilt = 1 - 0.35 * Math.abs(i / (BARS - 1) - 0.5) * 2; // fuller midrange
          v = loud * (0.45 + 0.55 * wgt) * tilt;
        }
        // snappy attack/decay: snap up within ~2 frames, relax in ~200ms
        level[i] = v > level[i] ? level[i] + (v - level[i]) * 0.30 : level[i] * 0.55;
        const bh = level[i] * h;
        if (bh < 1.5) continue; // no floor — a full-width stub row reads as a dashed line
        const x = i * (bw + gap);
        g.beginPath();
        if (g.roundRect) g.roundRect(x, h - bh, bw, bh, bw / 2);
        else g.rect(x, h - bh, bw, bh);
        g.fill();
      }
    };
    setTimeout(draw, 33);
  };

  mount();
})();
