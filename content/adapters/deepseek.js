// Site adapter: DeepSeek (chat.deepseek.com)
// API route: /api/v0/chat/history_messages (Bearer token from localStorage.userToken).
//   Messages are a parent_id tree — rebuilt from chat_session.current_message_id.
// DOM fallback: virtual-list items (.fbb737a4 user / .ds-message > .ds-markdown assistant).
// Selectors/endpoint verified against YourAIScroll 1.9.9 (round-2 static analysis).
CFOLIO.registerAdapter({
  id: 'deepseek',
  name: 'DeepSeek',
  matches: () => /chat\.deepseek\.com\/a\/chat\//.test(location.href),

  conversationId: () =>
    location.pathname.match(/\/chat\/s\/([a-zA-Z0-9-]+)/)?.[1] || null,

  async extractConversation() {
    const id = this.conversationId();
    if (id) {
      try {
        return await this.extractViaApi(id);
      } catch (e) {
        CFOLIO.log('deepseek API route failed, falling back to DOM:', e);
      }
    }
    return this.extractViaDom();
  },

  // ---- API route ---------------------------------------------------------

  getToken() {
    const raw = localStorage.getItem('userToken');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const find = (v) => {
        if (typeof v === 'string') return v || null;
        if (v && typeof v === 'object') {
          for (const k of ['value', 'token', 'accessToken', 'access_token']) {
            const found = find(v[k]);
            if (found) return found;
          }
        }
        return null;
      };
      return find(parsed);
    } catch {
      return raw;
    }
  },

  async extractViaApi(id) {
    const token = this.getToken();
    if (!token) throw new Error('deepseek userToken not found in localStorage');

    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-client-bundle-id': 'com.deepseek.chat',
      'x-client-locale': (document.documentElement.lang || 'en_US').replace(
        '-',
        '_'
      ),
      'x-client-platform': 'web',
      'x-client-timezone-offset': String(-(60 * new Date().getTimezoneOffset())),
      'x-client-version': '2.2.0',
    };

    const res = await fetch(
      `/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(id)}`,
      { method: 'GET', credentials: 'include', headers }
    );
    if (!res.ok) throw new Error(`history_messages responded ${res.status}`);
    const json = await res.json();
    if (json?.data?.biz_code !== 0) throw new Error('deepseek biz_code != 0');
    const biz = json.data.biz_data;
    if (!biz?.chat_messages?.length) throw new Error('no chat_messages');

    return this.apiToConversation(biz, id);
  },

  apiToConversation(biz, id) {
    const session = biz.chat_session || {};
    const byId = new Map(biz.chat_messages.map((m) => [String(m.message_id), m]));

    // Rebuild the active branch: walk parent_id from current_message_id.
    let cur = session.current_message_id
      ? byId.get(String(session.current_message_id))
      : biz.chat_messages.at(-1);
    const chain = [];
    const seen = new Set();
    while (cur) {
      const key = String(cur.message_id);
      if (seen.has(key)) break;
      seen.add(key);
      chain.push(cur);
      cur = cur.parent_id != null ? byId.get(String(cur.parent_id)) : null;
    }
    const ordered = chain.length > 0 ? chain.reverse() : biz.chat_messages;

    const messages = [];
    for (const m of ordered) {
      const role = String(m.role || '').toUpperCase() === 'ASSISTANT' ? 'assistant' : 'user';
      const wanted = role === 'assistant' ? ['RESPONSE', 'TEMPLATE_RESPONSE'] : ['REQUEST'];
      // Preferred: typed fragments. Fallback: all content minus THINK/SEARCH/TIP.
      const frags = m.fragments || [];
      let parts = frags
        .filter((f) => wanted.includes(f.type) && typeof f.content === 'string')
        .map((f) => f.content?.trim())
        .filter(Boolean);
      if (!parts.length) {
        parts = frags
          .filter(
            (f) =>
              !['THINK', 'SEARCH', 'TIP'].includes(f.type) &&
              typeof f.content === 'string'
          )
          .map((f) => f.content?.trim())
          .filter(Boolean);
      }
      const md = parts.join('\n\n');
      if (role === 'assistant' && !md.trim()) continue;
      messages.push({ role, markdown: md });
    }
    if (!messages.length) throw new Error('no messages after fragment filtering');

    // Defensive: model field naming not verified statically — probe common shapes.
    const model =
      session.model ||
      session.model_name ||
      biz.chat_messages.find((m) => m?.model)?.model ||
      biz.chat_messages[0]?.model_name ||
      null;

    return {
      id,
      title: session.title?.trim() || document.title || 'DeepSeek conversation',
      model,
      messages,
    };
  },

  // ---- DOM fallback (API failures; virtual list may omit off-screen turns) --

  // DeepSeek wraps code in .md-code-block with the language in a banner
  // (.d813de27) — normalize to plain <pre><code class="language-X"> so the
  // generic converter keeps the language tag.
  normalizeCodeBlocks(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.md-code-block').forEach((block) => {
      const pre = block.querySelector('pre');
      if (!pre) return;
      const lang = block.querySelector('.d813de27')?.textContent?.trim();
      const code = document.createElement('code');
      code.textContent = pre.textContent || '';
      if (lang) code.className = `language-${lang}`;
      const newPre = document.createElement('pre');
      newPre.appendChild(code);
      block.replaceWith(newPre);
    });
    return clone;
  },

  extractViaDom() {
    const items = document.querySelectorAll('[data-virtual-list-item-key]');
    if (!items.length) throw new Error('no [data-virtual-list-item-key] nodes found');

    const messages = [];
    for (const item of items) {
      // User turns
      const userEl = item.querySelector('.fbb737a4');
      if (userEl) {
        messages.push({
          role: 'user',
          html: CFOLIO.dom.cleanHtml(userEl, [
            'button',
            '[role="button"]',
            'svg',
            '[class*="icon"]',
          ]),
        });
        continue;
      }
      // Assistant turns
      const asstEl = item.querySelector('.ds-message > .ds-markdown');
      if (asstEl) {
        messages.push({
          role: 'assistant',
          html: CFOLIO.dom.cleanHtml(this.normalizeCodeBlocks(asstEl), [
            'button',
            '[role="button"]',
            '.ds-markdown-code-copy-button',
            '.ds-markdown-cite',
            '.md-code-block-banner-wrap',
            'svg',
            '[class*="icon"]',
            '[class*="toolbar"]',
          ]),
        });
      }
    }
    if (!messages.length) throw new Error('no messages in DOM');

    return {
      id: this.conversationId() || location.pathname,
      title:
        document.title.replace(/\s*-\s*DeepSeek\s*$/, '').trim() ||
        'DeepSeek conversation',
      messages,
    };
  },
});
