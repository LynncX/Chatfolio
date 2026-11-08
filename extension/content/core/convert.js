// HTML <-> markdown <-> html conversion. Zero-dependency.
// Table rule ported from YourAIScroll's turndown config (round-2 static analysis).
(() => {
  const CFOLIO = window.CFOLIO;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Pipe-table cell: collapse whitespace, escape pipes (empty cell -> ' ')
  function cellText(el) {
    const t = (el.innerText || el.textContent || '')
      .replace(/ /g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .replace(/\|/g, '\\|');
    return t || ' ';
  }

  function tableToMarkdown(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    if (!rows.length) return '';
    const out = [];
    rows.forEach((tr, i) => {
      const cells = Array.from(tr.children).filter(
        (c) => c.tagName === 'TD' || c.tagName === 'TH'
      );
      if (!cells.length) return;
      out.push(`| ${cells.map(cellText).join(' | ')} |`);
      if (i === 0) out.push(`| ${cells.map(() => '---').join(' | ')} |`);
    });
    return out.join('\n');
  }

  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const convert = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      // KaTeX-style math spans carry the source in data-math (chatgpt.com)
      if (
        node.tagName === 'SPAN' &&
        node.classList.contains('math-inline') &&
        node.getAttribute('data-math')
      ) {
        return `$${node.getAttribute('data-math')}$`;
      }

      switch (node.tagName) {
        case 'H1': return `\n\n# ${kidsMd(node)}\n\n`;
        case 'H2': return `\n\n## ${kidsMd(node)}\n\n`;
        case 'H3': return `\n\n### ${kidsMd(node)}\n\n`;
        case 'H4': case 'H5': case 'H6': return `\n\n#### ${kidsMd(node)}\n\n`;
        case 'STRONG': case 'B': return kidsMd(node).trim() ? `**${kidsMd(node)}**` : '';
        case 'EM': case 'I': return kidsMd(node).trim() ? `*${kidsMd(node)}*` : '';
        case 'CODE':
          return node.closest('pre') ? node.textContent : `\`${node.textContent}\``;
        case 'PRE': {
          const code = node.querySelector('code');
          const lang = code
            ? (code.className.match(/language-(\S+)/) || [])[1] || ''
            : '';
          return `\n\n\`\`\`${lang}\n${code ? code.textContent : node.textContent}\n\`\`\`\n\n`;
        }
        case 'A': {
          const href = node.getAttribute('href') || '';
          return href ? `[${kidsMd(node)}](${href})` : kidsMd(node);
        }
        case 'UL': case 'OL': {
          const ordered = node.tagName === 'OL';
          let idx = parseInt(node.getAttribute('start') || '1', 10) || 1;
          const items = Array.from(node.children)
            .filter((li) => li.tagName === 'LI')
            .map((li) => {
              const marker = ordered ? `${idx++}. ` : '- ';
              return `${marker}${kidsMd(li).trim()}`;
            });
          return `\n\n${items.join('\n')}\n\n`;
        }
        case 'TABLE': return `\n\n${tableToMarkdown(node)}\n\n`;
        case 'BR': return '\n';
        case 'HR': return '\n\n---\n\n';
        case 'P': case 'DIV': return `\n\n${kidsMd(node)}\n\n`;
        default: return kidsMd(node);
      }
    };

    const kidsMd = (node) =>
      Array.from(node.childNodes).map(convert).join('');

    return normalize(convert(doc.body));
  }

  function normalize(md) {
    return md
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  // ---- minimal markdown -> html (for API-route messages that carry md) ----

  function inlineMd(s) {
    let out = escapeHtml(s);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      '<img alt="$1" src="$2">'
    );
    out = out.replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      '<a href="$2">$1</a>'
    );
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return out;
  }

  function mdToHtml(md) {
    const lines = String(md).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    const isUl = (l) => /^\s*[-*+]\s+/.test(l);
    const isOl = (l) => /^\s*\d+[.)]\s+/.test(l);

    while (i < lines.length) {
      const line = lines[i];

      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        i++; // closing fence
        out.push(
          `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`
        );
        continue;
      }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`);
        i++;
        continue;
      }

      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      // pipe table: header row + |---| separator + body rows
      if (
        /^\s*\|.*\|\s*$/.test(line) &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])
      ) {
        const parseRow = (l) =>
          l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        const head = parseRow(line);
        i += 2;
        const body = [];
        while (i < lines.length && /^\s*\|.*\|?\s*$/.test(lines[i])) {
          body.push(parseRow(lines[i]));
          i++;
        }
        out.push(
          `<table><thead><tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr></thead><tbody>${body
            .map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`
        );
        continue;
      }

      if (isUl(line) || isOl(line)) {
        const tag = isUl(line) ? 'ul' : 'ol';
        const items = [];
        while (i < lines.length && (isUl(lines[i]) || isOl(lines[i]))) {
          const content = lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
          items.push(`<li>${inlineMd(content)}</li>`);
          i++;
        }
        out.push(`<${tag}>${items.join('')}</${tag}>`);
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      const buf = [line.trim()];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^```|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|^\s*\|/.test(lines[i])
      ) {
        buf.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${inlineMd(buf.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  CFOLIO.convert = {
    escapeHtml,
    htmlToMarkdown,
    mdToHtml,
    htmlToText(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return (doc.body.textContent || '').trim();
    },
  };
})();
