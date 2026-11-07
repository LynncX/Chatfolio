// Site adapter: ChatGPT (chatgpt.com)
// API route: backend-api/conversation/<id> (same-origin fetch, session cookie auth).
// DOM fallback: temporary chats (?temporary-chat=true) and /share/ pages.
// Selectors/endpoint verified against YourAIScroll 1.9.9 (round-2 static analysis).
CFOLIO.registerAdapter({
  id: 'chatgpt',
  name: 'ChatGPT',
  matches: () =>
    /(?:chatgpt\.com|chat\.openai\.com)\/(?:c|share)\//.test(location.href) ||
    new URLSearchParams(location.search).get('temporary-chat') === 'true',

  conversationId: () =>
    location.pathname.match(/\/c\/([a-f0-9-]+)/i)?.[1] ||
    location.pathname.match(/\/share\/([a-f0-9-]+)/i)?.[1] ||
    null,

  async extractConversation() {
    const id = this.conversationId();
    if (id) {
      try {
        return await this.extractViaApi(id);
      } catch (e) {
        CFOLIO.log('chatgpt API route failed, falling back to DOM:', e);
      }
    }
    return this.extractViaDom();
  },

  // ---- API route ---------------------------------------------------------

  async getAuthToken() {
    try {
      const res = await fetch('https://chatgpt.com/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.accessToken) return `Bearer ${data.accessToken}`;
      }
    } catch (e) {
      CFOLIO.log('session fetch failed:', e);
    }
    return null;
  },

  async extractViaApi(id) {
    const token = await this.getAuthToken();
    if (!token) throw new Error('not logged in to ChatGPT (no session token)');

    const headers = { Authorization: token, Accept: 'application/json' };
    const accountId = CFOLIO.dom.cookie('_account');
    const deviceId = CFOLIO.dom.cookie('oai-did');
    if (accountId) headers['chatgpt-account-id'] = accountId;
    if (deviceId) headers['oai-device-id'] = deviceId;

    const res = await fetch(
      `https://chatgpt.com/backend-api/conversation/${encodeURIComponent(id)}`,
      { method: 'GET', credentials: 'include', headers }
    );
    if (!res.ok) throw new Error(`backend-api responded ${res.status}`);
    const data = await res.json();
    if (!data?.mapping) throw new Error('conversation has no mapping');

    return this.astToConversation(data, id);
  },

  astToConversation(data, id) {
    // Sort tree nodes by create_time; keep user/assistant text turns.
    const nodes = Object.values(data.mapping || {})
      .filter((n) => n.message?.author?.role && n.message?.content?.parts)
      .filter((n) => ['user', 'assistant'].includes(n.message.author.role))
      .sort(
        (a, b) => (a.message.create_time ?? 0) - (b.message.create_time ?? 0)
      );

    const messages = [];
    for (const n of nodes) {
      const role = n.message.author.role;
      const md = n.message.content.parts
        .map((part) => {
          // Structured parts (e.g. code files) arrive as JSON strings
          try {
            const p = JSON.parse(part);
            if (typeof p?.type === 'string' && p.type.startsWith('code/')) {
              return `\`\`\`${p.type.split('/')[1]}\n${p.content}\n\`\`\``;
            }
            return p?.content || part;
          } catch {
            return part;
          }
        })
        .filter((s) => typeof s === 'string' && s.trim())
        .join('\n');
      // TODO(chatgpt): citation footnotes from metadata.search_result_groups
      if (role === 'assistant' && !md.trim()) continue;
      messages.push({ role, markdown: md });
    }
    if (!messages.length) throw new Error('no user/assistant messages in mapping');

    // Model slug rides on assistant-node metadata (e.g. "gpt-5.2", "gpt-4o")
    const model =
      data.default_model_slug ||
      nodes.find((n) => n.message.metadata?.default_model_slug)?.message.metadata
        .default_model_slug ||
      null;

    return {
      id,
      title: data.title?.trim() || document.title || 'ChatGPT conversation',
      model,
      createdAt: this.toIso(data.create_time),
      messages,
    };
  },

  toIso(v) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      return new Date(v < 1e10 ? v * 1000 : v).toISOString();
    }
    if (typeof v === 'string') {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  },

  // ---- DOM fallback (temporary chats, share pages, API failures) ---------

  extractViaDom() {
    const nodes = document.querySelectorAll('[data-message-author-role]');
    if (!nodes.length) throw new Error('no [data-message-author-role] nodes found');

    const messages = [];
    for (const n of nodes) {
      const role = n.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') continue;
      const content = n.querySelector(".markdown, [class*='prose']") || n;
      messages.push({
        role,
        html: CFOLIO.dom.cleanHtml(content, [
          'button',
          '[role="button"]',
          '[data-testid*="copy"]',
          '[aria-label*="Copy"]',
          '.copy-button',
          '.toolbar',
          '.action-buttons',
          '[class*="button"]',
        ]),
      });
    }
    if (!messages.length) throw new Error('no user/assistant messages in DOM');

    return {
      id: this.conversationId() || location.pathname,
      title:
        document.title.replace(/\s*[-|]\s*ChatGPT\s*$/i, '').trim() ||
        'ChatGPT conversation',
      messages,
    };
  },
});
