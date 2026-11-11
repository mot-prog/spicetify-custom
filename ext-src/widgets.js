// widgets v1 — top-bar extras (user m00634: "adding tools, widgets"):
//  • clock+date chip  • wallpaper slideshow controls (pause/resume, next)
// Controls talk to window.ACPW exposed by cover-bg.js.
(() => {
  const svgPause = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="3" y="2.5" width="3.5" height="11" rx="1"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1"/></svg>';
  const svgPlay = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4.5 2.5l9 5.5-9 5.5z"/></svg>';
  const svgNext = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3 3l7 5-7 5z"/><rect x="11" y="3" width="2.5" height="10" rx="1"/></svg>';

  function boot() {
    const nav = document.querySelector(".Root__globalNav");
    if (!nav) return false;
    if (document.getElementById("acp-clock")) return true;

    const clock = document.createElement("div");
    clock.id = "acp-clock";
    clock.innerHTML = '<span id="acp-clock-d"></span><span id="acp-clock-t"></span>';
    nav.appendChild(clock);
    const tick = () => {
      const d = new Date();
      const t = document.getElementById("acp-clock-t");
      const dd = document.getElementById("acp-clock-d");
      if (t) t.textContent = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      if (dd) dd.textContent = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    };
    tick();
    setInterval(tick, 5000);

    const mk = (id, html, title, fn) => {
      const b = document.createElement("button");
      b.id = id;
      b.innerHTML = html;
      b.title = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("click", fn);
      nav.appendChild(b);
      return b;
    };
    const pb = mk("acp-wall-pause", svgPause, "Pause slideshow", () => {
      const w = window.ACPW;
      if (!w) return;
      pb.innerHTML = w.togglePaused() ? svgPlay : svgPause;
    });
    mk("acp-wall-next", svgNext, "Next wallpaper", () => window.ACPW && window.ACPW.next());
    if (window.ACPW && window.ACPW.isPaused()) pb.innerHTML = svgPlay;
    return true;
  }

  let n = 0;
  const iv = setInterval(() => { if (boot() || ++n > 20) clearInterval(iv); }, 500);
})();
