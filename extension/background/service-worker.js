// MV3 service worker: message router. Keep thin; heavy work belongs to
// content scripts (DOM) or here (cross-origin API calls with host permissions).
// TODO: add host_permissions + fetch handlers for site REST APIs (batch export).

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[CFOLIO] installed:', details.reason);
  // TODO: seed default settings (chrome.storage.sync)
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case 'CFOLIO_PING_BG':
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return;

    // TODO(bg): FETCH_CHATGPT_CONVERSATION(LIST) — proxy backend-api with the
    // page's session (credentials: include) for batch export.
    // TODO(bg): subscription-free equivalents of paid features go here.
    default:
      return; // unknown message: ignore
  }
});
