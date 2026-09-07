/**
 * Generic content extraction engine. Adapters (adapters.js) can override
 * this for specific sites; everything else falls back to these heuristics.
 */
const ObsidianExtractor = (() => {
  const NOISE_SELECTORS = [
    'nav', 'header', 'footer', 'aside',
    'script', 'style', 'noscript', 'template', 'svg', 'iframe',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
    '.advertisement', '.ad', '.ads', '[class*="cookie"]', '[id*="cookie"]',
    '[class*="banner"]', '[class*="popup"]', '[class*="modal"]', '[class*="newsletter"]',
    '[class*="subscribe"]', '[class*="share-buttons"]', '[class*="social-share"]',
    '[class*="related-posts"]', '[class*="comments"]', '[aria-hidden="true"]',
    'button', 'form', '[class*="sidebar"]',
  ];

  const CONTENT_SELECTORS = [
    'article', '[role="main"]', 'main',
    '#content', '.content', '#main-content', '.main-content',
    '.post-content', '.article-content', '.entry-content', '.post-body',
  ];

  function cleanClone(root) {
    const clone = root.cloneNode(true);
    for (const sel of NOISE_SELECTORS) {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    }
    // Strip inline event handlers / tracking attributes for a cleaner DOM.
    clone.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name) || attr.name === 'style') el.removeAttribute(attr.name);
      });
    });
    return clone;
  }

  function textDensityScore(el) {
    const text = el.innerText || el.textContent || '';
    const textLen = text.trim().length;
    if (textLen < 40) return 0;
    const linkText = [...el.querySelectorAll('a')].reduce((sum, a) => sum + (a.innerText || '').length, 0);
    const linkDensity = textLen > 0 ? linkText / textLen : 1;
    const paragraphBonus = el.querySelectorAll('p').length * 25;
    return textLen * (1 - Math.min(linkDensity, 0.9)) + paragraphBonus;
  }

  function findBestContainer(doc) {
    for (const sel of CONTENT_SELECTORS) {
      const el = doc.querySelector(sel);
      if (el && (el.innerText || '').trim().length > 200) return el;
    }
    // Fall back to scoring candidate blocks.
    const candidates = [...doc.querySelectorAll('div, section, article')];
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      const score = textDensityScore(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best || doc.body;
  }

  function extractArticle() {
    const container = findBestContainer(document);
    const clone = cleanClone(container);
    return {
      title: getPageTitle(),
      html: clone.innerHTML,
    };
  }

  function extractEntirePage() {
    const clone = cleanClone(document.body);
    return {
      title: getPageTitle(),
      html: clone.innerHTML,
    };
  }

  function extractSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const container = document.createElement('div');
    for (let i = 0; i < sel.rangeCount; i++) {
      container.appendChild(sel.getRangeAt(i).cloneContents());
    }
    const clone = cleanClone(container);
    return {
      title: getPageTitle(),
      html: clone.innerHTML,
    };
  }

  function getPageTitle() {
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) return og.content.trim();
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText.trim()) return h1.innerText.trim();
    return document.title || 'Untitled';
  }

  function getMetaDescription() {
    const og = document.querySelector('meta[property="og:description"]');
    if (og && og.content) return og.content.trim();
    const meta = document.querySelector('meta[name="description"]');
    return meta && meta.content ? meta.content.trim() : '';
  }

  return { extractArticle, extractEntirePage, extractSelection, getPageTitle, getMetaDescription, cleanClone, NOISE_SELECTORS };
})();
