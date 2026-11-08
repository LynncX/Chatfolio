// Global namespace + adapter registry. Loaded first by every content script.
// Classic scripts (no modules): everything hangs off window.CFOLIO.
(() => {
  const CFOLIO = (window.CFOLIO = window.CFOLIO || {});
  CFOLIO.adapters = CFOLIO.adapters || [];

  // Adapter contract (all fields/functions optional except id/name/matches):
  // {
  //   id: 'chatgpt',
  //   name: 'ChatGPT',
  //   matches: () => boolean,        // true if current URL is a chat page
  //   conversationId: () => string,  // stable id for the current chat (TODO)
  //   title: () => string,           // conversation title (TODO: real selector)
  //   messages: () => [{ role: 'user'|'assistant', html: string, text: string }],
  //   containerSelector: string,     // scrollable chat container (TODO)
  // }
  CFOLIO.registerAdapter = (adapter) => {
    if (CFOLIO.adapters.some((a) => a.id === adapter.id)) return;
    CFOLIO.adapters.push(adapter);
  };

  CFOLIO.log = (...args) => console.debug('[CFOLIO]', ...args);
})();
