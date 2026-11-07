// Floating export button injected into supported chat pages.
(() => {
  const CFOLIO = window.CFOLIO;
  const BTN_ID = 'aice-export-btn';

  CFOLIO.ui = {
    injectFloatingButton(onClick) {
      if (document.getElementById(BTN_ID)) return;
      const btn = document.createElement('div');
      btn.id = BTN_ID;
      btn.textContent = '⬇ Export';
      Object.assign(btn.style, {
        position: 'fixed',
        right: '16px',
        bottom: '88px',
        zIndex: 2147483647,
        padding: '8px 14px',
        borderRadius: '20px',
        background: '#1a73e8',
        color: '#fff',
        fontSize: '13px',
        fontFamily: 'sans-serif',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        userSelect: 'none',
      });
      btn.addEventListener('click', onClick);
      document.documentElement.appendChild(btn);
    },

    setStatus(btn, text, color = '#1a73e8') {
      if (!btn) return;
      const original = '⬇ Export';
      btn.textContent = text;
      btn.style.background = color;
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = '#1a73e8';
      }, 1500);
    },
  };
})();
