// Popup: queries the active tab's content script and drives export.
(() => {
  const $ = (id) => document.getElementById(id);
  const statusEl = $('site-status');
  const resultEl = $('result');

  let currentTab = null;
  let adapterId = null;

  function setStatus(el, text) {
    el.textContent = text;
  }

  async function init() {
    [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs
      .sendMessage(currentTab.id, { type: 'CFOLIO_PING' })
      .catch(() => null);

    if (res?.ok) {
      adapterId = res.adapter;
      setStatus(statusEl, `✓ ${res.adapter} — chat page detected`);
    } else {
      setStatus(
        statusEl,
        '– no response from this tab. If it IS a supported chat page, refresh it (required after install/reload); otherwise the site isn’t supported yet.'
      );
      $('export-btn').disabled = true;
      $('copy-btn').disabled = true;
    }

    const { defaultFormat = 'markdown' } = await chrome.storage.sync.get({
      defaultFormat: 'markdown',
    });
    $('format').value = defaultFormat;
  }

  async function doExport(mode) {
    const format = $('format').value;
    setStatus(resultEl, 'exporting…');
    const type = mode === 'copy' ? 'CFOLIO_COPY' : 'CFOLIO_EXPORT';
    const res = await chrome.tabs
      .sendMessage(currentTab.id, { type, format })
      .catch((e) => ({ ok: false, error: String(e) }));

    if (!res?.ok) {
      setStatus(resultEl, `✕ ${res?.error || 'failed'}`);
      return;
    }

    if (mode === 'copy') {
      // Clipboard write happens here (focused document) — the content script
      // only serializes; writeText fails on an unfocused page document.
      try {
        await navigator.clipboard.writeText(res.content);
        setStatus(resultEl, `✓ copied to clipboard (${res.size} bytes)`);
      } catch (e) {
        setStatus(resultEl, `✕ clipboard: ${e.message}`);
      }
    } else {
      setStatus(resultEl, `✓ ${res.filename} (${res.size} bytes)`);
    }
  }

  $('export-btn').addEventListener('click', () => doExport('download'));
  $('copy-btn').addEventListener('click', () => doExport('copy'));
  $('format').addEventListener('change', (e) => {
    chrome.storage.sync.set({ defaultFormat: e.target.value });
  });
  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  init();
})();
