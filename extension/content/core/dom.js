// Generic DOM helpers shared by all adapters.
(() => {
  const CFOLIO = window.CFOLIO;

  // Noise present in chat UI chrome (default; adapters extend per-site).
  const DEFAULT_REMOVE = [
    'button',
    '[role="button"]',
    '.copy-button',
    '[data-testid*="copy"]',
    '[aria-label*="Copy"]',
    '.toolbar',
    '.action-buttons',
  ];

  CFOLIO.dom = {
    // Outer HTML of an element, with site-specific noise removed.
    cleanHtml(el, removeSelectors = DEFAULT_REMOVE) {
      const clone = el.cloneNode(true);
      clone
        .querySelectorAll(
          'script, style, [aria-hidden="true"], ' + removeSelectors.join(', ')
        )
        .forEach((n) => n.remove());
      return clone.innerHTML;
    },

    textOf(el) {
      return (el.innerText || el.textContent || '').trim();
    },

    cookie(name) {
      const m = document.cookie.match(
        new RegExp(`(?:^|; )${name}=([^;]*)`)
      );
      return m ? decodeURIComponent(m[1]) : null;
    },

    // Fallback: best-effort main content container of any page.
    guessMainContainer() {
      return (
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.body
      );
    },
  };
})();
