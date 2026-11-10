// acp menu-fold (user m00495): round button in the top bar that folds/unfolds
// the middle shelf sections (home verticals). Unfolded by default; state is
// persisted in localStorage. CSS (custom-tweaks v36 d) does the actual hiding
// via body[data-acp-folded="1"].
(() => {
  const KEY = 'acp-fol…d';
  const applyState = () => {
    const btn = document.getElementById('acp-fold-btn');
    if (!btn) return;
    const on = document.body.dataset.acpFolded === '1';
    btn.classList.toggle('folded', on);
    btn.title = on ? 'Unfold middle section' : 'Fold middle section';
  };
  const boot = (n = 0) => {
    const nav = document.querySelector('.Root__globalNav');
    if (!nav) { if (n < 20) setTimeout(() => boot(n + 1), 500); return; }
    let btn = document.getElementById('acp-fold-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'acp-fold-btn';
      btn.type = 'button';
      btn.innerHTML =
        '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.2 8 3l4 3.2"/><path d="M4 9.8 8 13l4-3.2"/></svg>';
      btn.addEventListener('click', () => {
        const on = document.body.dataset.acpFolded === '1';
        document.body.dataset.acpFolded = on ? '0' : '1';
        try { localStorage.setItem(KEY, on ? '0' : '1'); } catch (e) {}
        applyState();
      });
      nav.appendChild(btn);
    }
    try {
      const v = localStorage.getItem(KEY);
      if (v === '1') document.body.dataset.acpFolded = '1';
    } catch (e) {}
    applyState();
  };
  boot();
})();
