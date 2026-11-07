// Content-script entry point: pick adapter, wire UI + messaging.
(() => {
  const CFOLIO = window.CFOLIO;

  const adapter = CFOLIO.adapters.find((a) => a.matches());
  if (!adapter) return; // not a chat page — stay dormant
  CFOLIO.activeAdapter = adapter;
  CFOLIO.log(`adapter "${adapter.id}" active on ${location.href}`);

  // ---- extraction -------------------------------------------------------
  // Returns { ok, conversation?, error? }. Never throws.
  // Adapters with their own extractConversation() (API routes etc.) take priority.
  async function extractConversation() {
    if (adapter.extractConversation) {
      try {
        const conv = await adapter.extractConversation();
        return {
          ok: true,
          conversation: {
            id: conv.id || adapter.conversationId?.() || location.pathname,
            url: conv.url || location.href,
            exportedAt: new Date().toISOString(),
            provider: adapter.id,
            ...conv,
          },
        };
      } catch (e) {
        CFOLIO.log(`adapter "${adapter.id}" extraction failed:`, e);
        return { ok: false, error: String(e.message || e) };
      }
    }

    const conv = {
      id: adapter.conversationId?.() || location.pathname,
      title: adapter.title?.() || document.title,
      url: location.href,
      exportedAt: new Date().toISOString(),
      provider: adapter.id,
      messages: [],
    };

    const sel = adapter.messageSelectors;
    if (sel && sel.user && sel.assistant) {
      const nodes = document.querySelectorAll(`${sel.user}, ${sel.assistant}`);
      for (const n of nodes) {
        conv.messages.push({
          role: n.matches(sel.user) ? 'user' : 'assistant',
          html: CFOLIO.dom.cleanHtml(n),
          text: CFOLIO.dom.textOf(n),
        });
      }
      return { ok: true, conversation: conv };
    }

    // TODO(adapters): per-site selectors missing — fall back to single-block
    // export of the guessed main container so the pipeline still works end-to-end.
    const container = adapter.containerSelector
      ? document.querySelector(adapter.containerSelector)
      : CFOLIO.dom.guessMainContainer();
    if (!container) {
      return { ok: false, error: 'no conversation container found (adapter selectors TODO)' };
    }
    conv.messages.push({
      role: 'assistant',
      html: CFOLIO.dom.cleanHtml(container),
      text: CFOLIO.dom.textOf(container),
    });
    return { ok: true, conversation: conv };
  }

  CFOLIO.extractConversation = extractConversation;

  // ---- export pipeline ---------------------------------------------------
  async function getExportSettings() {
    return chrome.storage.sync.get({
      latexStyle: 'obsidian', // 'obsidian' | 'plain'
      embeddedComponents: 'strip', // 'strip' | 'codeblock'
    });
  }

  async function runExport(format) {
    const { ok, conversation: conv, error } = await extractConversation();
    if (!ok) throw new Error(error);
    const settings = await getExportSettings();
    const { content, ext, mime } = await CFOLIO.export.serialize(conv, format, settings);
    const filename = CFOLIO.export.filename(conv, format);
    CFOLIO.deliver.download(filename, content, mime);
    return { filename, size: content.length };
  }
  CFOLIO.runExport = runExport;

  // ---- floating button ----------------------------------------------------
  let btnBusy = false;
  CFOLIO.ui.injectFloatingButton(async (ev) => {
    const btn = ev.currentTarget;
    if (btnBusy) return;
    btnBusy = true;
    try {
      const { defaultFormat = 'markdown' } = await chrome.storage.sync.get({
        defaultFormat: 'markdown',
      });
      const { filename } = await runExport(defaultFormat);
      CFOLIO.ui.setStatus(btn, `✓ ${filename}`, '#188038');
    } catch (e) {
      CFOLIO.log('export failed:', e);
      CFOLIO.ui.setStatus(btn, `✕ ${e.message}`.slice(0, 40), '#d93025');
    } finally {
      btnBusy = false;
    }
  });

  // ---- messaging (popup -> content) ---------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'CFOLIO_PING') {
      sendResponse({ ok: true, adapter: adapter.id });
      return;
    }
    if (msg?.type === 'CFOLIO_EXPORT') {
      runExport(msg.format || 'markdown')
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
      return true; // async response
    }
    if (msg?.type === 'CFOLIO_COPY') {
      // Return serialized text; the caller (popup) owns the clipboard write,
      // since content-script writeText fails while the page is unfocused.
      (async () => {
        try {
          const { ok, conversation: conv, error } = await extractConversation();
          if (!ok) throw new Error(error);
          const settings = await getExportSettings();
          const { content } = await CFOLIO.export.serialize(conv, msg.format || 'markdown', settings);
          sendResponse({ ok: true, content, size: content.length });
        } catch (e) {
          sendResponse({ ok: false, error: String(e.message || e) });
        }
      })();
      return true;
    }
  });
})();
