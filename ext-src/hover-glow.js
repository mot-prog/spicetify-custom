// ACP hover-glow: any hovered cover (sidebar, cards, tracks, anywhere) tints
// the top of the main view with its dominant color — like native home hover.
(() => {
  if (window.__acpHoverGlow) return;
  window.__acpHoverGlow = true;

  const glow = document.createElement('div');
  glow.style.cssText = 'position:fixed;pointer-events:none;z-index:999;opacity:0;' +
    'transition:opacity .45s ease;background-repeat:no-repeat;';
  document.body.appendChild(glow);

  const place = () => {
    const mv = document.querySelector('.Root__main-view');
    if (!mv) return;
    const r = mv.getBoundingClientRect();
    glow.style.left = r.left + 'px';
    glow.style.top = r.top + 'px';
    glow.style.width = r.width + 'px';
    glow.style.height = Math.min(440, r.height) + 'px';
  };

  const cache = new Map();
  async function dominant(url) {
    if (cache.has(url)) return cache.get(url);
    try {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(24, 24);
      const ctx = c.getContext('2d');
      ctx.drawImage(bmp, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let best = null, bestScore = -1;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const score = (mx - mn) * 2 + mx * 0.45; // favor saturated+bright
        if (score > bestScore) { bestScore = score; best = [r, g, b]; }
      }
      cache.set(url, best);
      return best;
    } catch (e) { return null; }
  }

  let hovered = null;
  async function show(img) {
    const rgb = await dominant(img.src);
    if (!rgb) return;
    const [r, g, b] = rgb;
    glow.style.background =
      `radial-gradient(75% 100% at 50% -12%, rgba(${r},${g},${b},.5) 0%, rgba(${r},${g},${b},0) 70%)`;
    place();
    glow.style.opacity = '1';
  }

  function cardOf(node) {
    return node.closest('li, article, [class*="card" i], [class*="Card"]') || node;
  }

  document.addEventListener('pointerover', e => {
    const img = e.target.closest?.('img');
    if (!img || !img.src || !img.src.includes('scdn.co') || img === hovered) return;
    hovered = img;
    show(img);
  });

  document.addEventListener('pointerout', e => {
    if (!hovered) return;
    const from = cardOf(hovered);
    if (!from.contains(e.relatedTarget)) {
      glow.style.opacity = '0';
      hovered = null;
    }
  });
})();
