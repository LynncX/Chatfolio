// Site adapter: Claude (claude.ai)
// NOTE: selectors below are placeholders — verify against live DOM.
CFOLIO.registerAdapter({
  id: 'claude',
  name: 'Claude',
  matches: () => /claude\.ai\/chat\//.test(location.href),

  conversationId: () => {
    const m = location.pathname.match(/\/chat\/([a-f0-9-]{10,})/i);
    return m ? m[1] : location.pathname;
  },

  // TODO(claude): real title selector
  title: () => document.title.replace(/\s*[-|]\s*Claude\s*$/i, '') || 'Claude conversation',

  // TODO(claude): real message selectors (human/assistant turn containers)
  messageSelectors: {
    user: null,
    assistant: null,
  },

  containerSelector: null,
  fetchViaApi: null,
});
