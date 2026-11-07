// Serialize a conversation object into the requested format.
// Message shape: { role, html?, markdown?, text? } — adapters fill what they have.
// Conversation shape: { id, title, url, provider, model?, messages }
//
// Settings (chrome.storage.sync, read by main.js):
//   latexStyle: 'obsidian' (default) -> \(\)\[\] normalized to $/$$ in markdown
//               'plain'              -> $/$$ normalized to \(\)/\[\]
//   embeddedComponents: 'strip' (default) | 'codeblock' — JSX-ish artifact
//               component blocks (e.g. <box gap={2}>...</box>) in GPT answers.
//
// HTML export renders TeX with vendored KaTeX (vendor/katex/) at export time:
//   * katex.min.js is injected as a content script (see manifest)
//   * katex-inline.css (fonts inlined as data URIs, built by tools/gen-katex-inline.sh)
//     is fetched and embedded into the exported file only when math is present,
//     so exported .html stays standalone/offline with zero runtime JS.
(() => {
  const CFOLIO = window.CFOLIO;

  const DEFAULTS = { latexStyle: 'obsidian', embeddedComponents: 'strip' };

  const mdOf = (m) => m.markdown ?? CFOLIO.convert.htmlToMarkdown(m.html || '');

  // ---- code-safe text transform -------------------------------------------
  // Apply fn to text outside fenced code blocks and inline code spans.
  function transformOutsideCode(md, fn) {
    const lines = String(md).split('\n');
    let fence = false;
    return lines
      .map((line) => {
        if (/^\s*(```|~~~)/.test(line)) {
          fence = !fence;
          return line;
        }
        if (fence) return line;
        const parts = line.split(/(`[^`]*`)/);
        return parts.map((p, i) => (i % 2 === 1 ? p : fn(p))).join('');
      })
      .join('\n');
  }

  // ---- LaTeX delimiter style ----------------------------------------------
  const LOOKS_LIKE_TEX = /\\|\^|_|\{/;

  function applyLatexStyle(md, style) {
    if (style === 'plain') {
      // $...$ -> \(...\),  $$...$$ -> \[...\]  (tex-lookalike guard vs. prices)
      return transformOutsideCode(md, (s) => {
        s = s.replace(/\$\$([^$]+?)\$\$/g, (m0, inner) =>
          LOOKS_LIKE_TEX.test(inner) ? `\\[${inner}\\]` : m0
        );
        return s.replace(/\$([^$\n]+?)\$/g, (m0, inner) =>
          LOOKS_LIKE_TEX.test(inner) ? `\\(${inner}\\)` : m0
        );
      });
    }
    // obsidian (default): \(\) -> $, \[\] -> $$
    // (function replacements — '$$' in a replacement *string* means a literal '$')
    return transformOutsideCode(
      md,
      (s) =>
        s
          .replace(/\\\[/g, () => '$$')
          .replace(/\\\]/g, () => '$$')
          .replace(/\\\(/g, () => '$')
          .replace(/\\\)/g, () => '$')
    );
  }

  // ---- embedded artifact components ----------------------------------------
  // Block opens on a JSX-props line (`<box gap={2}>`), continues across close
  // tags/blanks, ends when real prose resumes.
  const COMP_OPEN = /^\s*<[a-z][a-z0-9-]*\s+[^>]*=\{/;
  const COMP_CLOSE = /^\s*<\/[a-z][a-z0-9-]*>\s*\.?\s*$/;

  function processComponents(md, mode) {
    if (mode === 'keep') return md;
    const lines = String(md).split('\n');
    const out = [];
    let block = null; // collecting component lines
    for (const line of lines) {
      const open = COMP_OPEN.test(line);
      const close = block && COMP_CLOSE.test(line);
      if (open || close) {
        block = block || [];
        block.push(line);
        continue;
      }
      if (block) {
        if (!line.trim()) {
          block.push(line); // blank inside/between component lines — keep collecting
          continue;
        }
        // prose resumed: emit (or drop) the collected block, then the line
        if (mode === 'codeblock') out.push('```', ...trimBlank(block), '```', '');
        block = null;
        out.push(line);
        continue;
      }
      out.push(line);
    }
    if (block && mode === 'codeblock') out.push('```', ...trimBlank(block), '```');
    return out.join('\n');
  }

  const trimBlank = (arr) => {
    const c = [...arr];
    while (c.length && !c[0].trim()) c.shift();
    while (c.length && !c.at(-1).trim()) c.pop();
    return c;
  };

  // ---- math extraction (html export) ---------------------------------------
  // $...$, $$...$$, \(...\), \[...\] -> placeholders, rendered after mdToHtml.
  const M_START = '';
  const M_END = '';

  function extractMath(md) {
    const math = [];
    const text = transformOutsideCode(md, (s) =>
      s.replace(
        /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g,
        (m0, dd, disp, inl1, inl2) => {
          const tex = dd ?? disp ?? inl1 ?? inl2;
          if (!tex) return m0;
          math.push({ tex, display: dd != null || disp != null });
          return `${M_START}${math.length - 1}${M_END}`;
        }
      )
    );
    return { text, math };
  }

  function renderMath(html, math) {
    if (!math.length) return { html, usedKatex: false };
    let usedKatex = false;
    const rendered = html.replace(
      new RegExp(`${M_START}(\\d+)${M_END}`, 'g'),
      (m0, i) => {
        const { tex, display } = math[Number(i)];
        if (window.katex?.renderToString) {
          try {
            usedKatex = true;
            return window.katex.renderToString(tex, {
              displayMode: display,
              throwOnError: false,
              output: 'html',
            });
          } catch (e) {
            CFOLIO.log('katex render failed:', e);
          }
        }
        return `<code class="tex-src">${CFOLIO.convert.escapeHtml(tex)}</code>`;
      }
    );
    return { html: rendered, usedKatex };
  }

  let katexCssPromise = null;
  function getKatexCss() {
    katexCssPromise ??= fetch(chrome.runtime.getURL('vendor/katex/katex-inline.css')).then(
      (r) => {
        if (!r.ok) throw new Error(`katex css ${r.status}`);
        return r.text();
      }
    );
    return katexCssPromise;
  }

  // ---- formatters -----------------------------------------------------------

  function toMarkdown(conv, settings) {
    const out = [];
    for (const m of conv.messages) {
      let md = processComponents(mdOf(m), settings.embeddedComponents);
      md = applyLatexStyle(md, settings.latexStyle);
      out.push(`[${m.role === 'user' ? 'User' : 'Assistant'}]`, '', md, '');
    }
    return out.join('\n');
  }

  async function toHtml(conv, settings) {
    const bodies = [];
    let usedKatex = false;
    for (const m of conv.messages) {
      let inner;
      if (m.html) {
        // DOM route: markup already rendered; site KaTeX spans styled by our CSS.
        inner = m.html;
      } else {
        const src = processComponents(m.markdown || '', settings.embeddedComponents);
        const { text, math } = extractMath(src);
        const res = renderMath(CFOLIO.convert.mdToHtml(text), math);
        inner = res.html;
        usedKatex ||= res.usedKatex;
      }
      bodies.push(
        `<div class="msg ${m.role}"><div class="role">${m.role}</div><div class="content">${inner}</div></div>`
      );
    }
    const katexCss = usedKatex ? await getKatexCss() : '';
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${conv.title}</title>
${katexCss ? `<style>${katexCss}</style>` : ''}
<style>
  body { font-family: sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
  .msg { margin: 1.5rem 0; padding: 1rem; border-radius: 8px; }
  .msg.user { background: #f0f4ff; }
  .msg.assistant { background: #f6f6f6; }
  .role { font-size: 0.8rem; color: #666; text-transform: uppercase; margin-bottom: 0.5rem; }
  pre { overflow-x: auto; background: #f0f0f0; padding: 0.75rem; border-radius: 6px; }
  code { font-family: monospace; }
  p > code { background: #eee; padding: 0.1rem 0.3rem; border-radius: 4px; }
  table { border-collapse: collapse; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; }
  blockquote { border-left: 3px solid #ccc; margin: 0.5rem 0; padding: 0.25rem 1rem; color: #555; }
</style></head>
<body><h1>${conv.title}</h1>${bodies.join('\n')}</body></html>`;
  }

  function toJson(conv) {
    return JSON.stringify(conv, null, 2);
  }

  function toText(conv) {
    return conv.messages
      .map((m) => `[${m.role}]\n${m.text ?? (m.markdown || CFOLIO.convert.htmlToText(m.html || ''))}`)
      .join('\n\n');
  }

  const FORMATTERS = {
    markdown: { ext: 'md', mime: 'text/markdown', fn: (c, s) => toMarkdown(c, s) },
    html: { ext: 'html', mime: 'text/html', fn: (c, s) => toHtml(c, s) },
    json: { ext: 'json', mime: 'application/json', fn: (c) => toJson(c) },
    text: { ext: 'txt', mime: 'text/plain', fn: (c) => toText(c) },
    // TODO: pdf, image (screenshot via captureVisibleTab), docx, notion upload
  };

  const sanitize = (s) =>
    String(s)
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

  CFOLIO.export = {
    formats: Object.keys(FORMATTERS),
    async serialize(conv, format, settings = {}) {
      const s = { ...DEFAULTS, ...settings };
      const f = FORMATTERS[format] || FORMATTERS.markdown;
      return { content: await f.fn(conv, s), ext: f.ext, mime: f.mime };
    },
    filename(conv, format) {
      const f = FORMATTERS[format] || FORMATTERS.markdown;
      let base = sanitize((conv.title || 'conversation').slice(0, 60));
      if (conv.model) base += `_${sanitize(conv.model).slice(0, 30)}`;
      return `${base}.${f.ext}`;
    },
    applyLatexStyle,
    processComponents,
  };
})();
