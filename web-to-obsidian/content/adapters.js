/**
 * Site-specific adapters. Each adapter can override how "article" capture
 * works, and optionally add a "conversation" capture mode for chat UIs.
 * Adapters are best-effort: these sites change their DOM often, so every
 * adapter degrades gracefully to the generic extractor if selectors miss.
 *
 * Adding a new site does not require touching the rest of the extension:
 * just register another entry in ADAPTERS below.
 *
 * For AI chat sites that don't have a named adapter, `getAdapter` falls
 * back to a generic "AI chat" detector (see genericAIChatAdapter) that
 * looks for common message-turn DOM patterns shared by most chat UIs, so
 * new/unlisted assistants still get a "Conversation" capture mode instead
 * of being run through the plain article/page heuristics.
 */
const ObsidianAdapters = (() => {
  function textOf(el) {
    return el ? (el.innerText || el.textContent || '').trim() : '';
  }

  const ADAPTERS = {
    'chat.openai.com': chatgptAdapter(),
    'chatgpt.com': chatgptAdapter(),
    'claude.ai': claudeAdapter(),
    'gemini.google.com': geminiAdapter(),
    'copilot.microsoft.com': turnRoleAdapter('Copilot', '[data-content="user-message"], [data-content="ai-message"]', (n) => n.getAttribute('data-content') === 'user-message'),
    'perplexity.ai': turnRoleAdapter('Perplexity', '[class*="query-text"], [class*="answer"], [class*="prose"]', (n) => /query/i.test(n.className)),
    'www.perplexity.ai': turnRoleAdapter('Perplexity', '[class*="query-text"], [class*="answer"], [class*="prose"]', (n) => /query/i.test(n.className)),
    'poe.com': turnRoleAdapter('Poe', '[class*="Message_humanMessageBubble"], [class*="Message_botMessageBubble"], [class*="ChatMessage"]', (n) => /human/i.test(n.className)),
    'chat.mistral.ai': turnRoleAdapter('Le Chat', '[data-message-author-role]', (n) => n.getAttribute('data-message-author-role') === 'user'),
    'grok.com': turnRoleAdapter('Grok', '[class*="message-bubble"]', (n) => /(^|\s)user(\s|-)/i.test(n.className)),
    'x.ai': turnRoleAdapter('Grok', '[class*="message-bubble"]', (n) => /(^|\s)user(\s|-)/i.test(n.className)),
    'huggingface.co': turnRoleAdapter('HuggingChat', '.chat-message, [class*="message-bubble"]', (n) => /user/i.test(n.className)),
    'deepseek.com': turnRoleAdapter('DeepSeek', '[class*="message"]', (n) => /user/i.test(n.className)),
    'chat.deepseek.com': turnRoleAdapter('DeepSeek', '[class*="message"]', (n) => /user/i.test(n.className)),
    'you.com': turnRoleAdapter('You.com', '[class*="ChatMessage"], [class*="message"]', (n) => /user/i.test(n.className)),
    'meta.ai': turnRoleAdapter('Meta AI', '[class*="message-row"]', (n) => /user/i.test(n.className)),
    'youtube.com': youtubeAdapter(),
    'www.youtube.com': youtubeAdapter(),
    'reddit.com': redditAdapter(),
    'www.reddit.com': redditAdapter(),
    'old.reddit.com': redditAdapter(),
    'wikipedia.org': wikipediaAdapter(),
    'medium.com': mediumAdapter(),
  };

  // Selectors tried in order by the generic AI-chat fallback. The first
  // selector that matches at least two elements on the page is assumed to
  // be the message-turn pattern for that (unlisted) chat UI.
  const GENERIC_CHAT_SELECTORS = [
    '[data-message-author-role]',
    '[data-testid*="message"]',
    '[class*="message-bubble"]',
    '[class*="chat-message"]',
    '[class*="ChatMessage"]',
    'article[class*="message"]',
    '[class*="message-row"]',
  ];

  function chatgptAdapter() {
    return {
      name: 'ChatGPT',
      supportsConversation: true,
      extractConversation() {
        const turns = [...document.querySelectorAll('[data-message-author-role]')];
        if (turns.length === 0) return null;
        const parts = turns.map((turn) => {
          const role = turn.getAttribute('data-message-author-role') === 'user' ? 'You' : 'ChatGPT';
          const clone = ObsidianExtractor.cleanClone(turn);
          return `### ${role}\n\n${clone.innerHTML}`;
        });
        return { title: ObsidianExtractor.getPageTitle(), html: parts.join('\n\n<hr>\n\n') };
      },
      extractArticle() {
        return this.extractConversation() || null;
      },
    };
  }

  function claudeAdapter() {
    return {
      name: 'Claude',
      supportsConversation: true,
      extractConversation() {
        const candidates = [...document.querySelectorAll(
          '[data-testid="user-message"], [data-testid="chat-message"], .font-user-message, .font-claude-message'
        )];
        const nodes = candidates.length ? candidates : [...document.querySelectorAll('main [class*="message"]')];
        if (nodes.length === 0) return null;
        const parts = nodes.map((node) => {
          const isUser = /user/i.test(node.getAttribute('data-testid') || node.className || '');
          const clone = ObsidianExtractor.cleanClone(node);
          return `### ${isUser ? 'You' : 'Claude'}\n\n${clone.innerHTML}`;
        });
        return { title: ObsidianExtractor.getPageTitle(), html: parts.join('\n\n<hr>\n\n') };
      },
      extractArticle() {
        return this.extractConversation() || null;
      },
    };
  }

  function geminiAdapter() {
    return {
      name: 'Gemini',
      supportsConversation: true,
      extractConversation() {
        const nodes = [...document.querySelectorAll('user-query, model-response')];
        if (nodes.length === 0) return null;
        const parts = nodes.map((node) => {
          const isUser = node.tagName.toLowerCase() === 'user-query';
          const clone = ObsidianExtractor.cleanClone(node);
          return `### ${isUser ? 'You' : 'Gemini'}\n\n${clone.innerHTML}`;
        });
        return { title: ObsidianExtractor.getPageTitle(), html: parts.join('\n\n<hr>\n\n') };
      },
      extractArticle() {
        return this.extractConversation() || null;
      },
    };
  }

  /** Builds a simple two-role (You / Assistant) adapter from a selector + a role test function. */
  function turnRoleAdapter(name, selector, isUserFn) {
    return {
      name,
      supportsConversation: true,
      extractConversation() {
        const nodes = [...document.querySelectorAll(selector)];
        if (nodes.length === 0) return null;
        const parts = nodes.map((node) => {
          const isUser = isUserFn(node);
          const clone = ObsidianExtractor.cleanClone(node);
          return `### ${isUser ? 'You' : name}\n\n${clone.innerHTML}`;
        });
        return { title: ObsidianExtractor.getPageTitle(), html: parts.join('\n\n<hr>\n\n') };
      },
      extractArticle() {
        return this.extractConversation() || null;
      },
    };
  }

  /**
   * Fallback for AI chat sites without a dedicated adapter above. Tries a
   * handful of DOM patterns that are common across chat UIs (message-role
   * attributes, "message bubble"-style class names, etc.) and, if it finds
   * a repeating structure, treats the page as a conversation.
   */
  function genericAIChatAdapter() {
    function findTurnSelector() {
      for (const sel of GENERIC_CHAT_SELECTORS) {
        try {
          if (document.querySelectorAll(sel).length >= 2) return sel;
        } catch (e) { /* invalid selector on this DOM, skip */ }
      }
      return null;
    }
    return {
      name: 'AI Chat (auto-detected)',
      supportsConversation: true,
      detect() {
        return !!findTurnSelector();
      },
      extractConversation() {
        const sel = findTurnSelector();
        if (!sel) return null;
        const nodes = [...document.querySelectorAll(sel)];
        const parts = nodes.map((node) => {
          const hint = (node.getAttribute('data-message-author-role') || node.className || node.getAttribute('data-testid') || '').toLowerCase();
          const isUser = /user|you|human/.test(hint) && !/assistant|bot|response/.test(hint);
          const clone = ObsidianExtractor.cleanClone(node);
          return `### ${isUser ? 'You' : 'Assistant'}\n\n${clone.innerHTML}`;
        });
        return { title: ObsidianExtractor.getPageTitle(), html: parts.join('\n\n<hr>\n\n') };
      },
      extractArticle() {
        return this.extractConversation() || null;
      },
    };
  }

  function youtubeAdapter() {
    return {
      name: 'YouTube',
      extractArticle() {
        const title = textOf(document.querySelector('h1.ytd-watch-metadata, h1 yt-formatted-string'))
          || ObsidianExtractor.getPageTitle();
        const channel = textOf(document.querySelector('#channel-name a, ytd-channel-name a'));
        const description = textOf(document.querySelector('#description-inline-expander, #description'));
        const url = location.href;
        const html = [
          `<p><strong>Channel:</strong> ${channel || 'Unknown'}</p>`,
          `<p><strong>URL:</strong> <a href="${url}">${url}</a></p>`,
          description ? `<h3>Description</h3><p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>` : '',
        ].join('\n');
        return { title, html };
      },
    };
  }

  function redditAdapter() {
    return {
      name: 'Reddit',
      extractArticle() {
        const title = textOf(document.querySelector('h1')) || ObsidianExtractor.getPageTitle();
        const post = document.querySelector('shreddit-post, [data-test-id="post-content"], .Post');
        const body = post ? ObsidianExtractor.cleanClone(post).innerHTML : '';
        const topComments = [...document.querySelectorAll('shreddit-comment, .Comment')]
          .slice(0, 15)
          .map((c) => `<blockquote>${ObsidianExtractor.cleanClone(c).innerHTML}</blockquote>`)
          .join('\n');
        return {
          title,
          html: `${body}\n${topComments ? `<h3>Top comments</h3>\n${topComments}` : ''}`,
        };
      },
    };
  }

  function wikipediaAdapter() {
    return {
      name: 'Wikipedia',
      extractArticle() {
        const container = document.querySelector('#mw-content-text .mw-parser-output') || document.querySelector('#mw-content-text');
        if (!container) return null;
        const clone = ObsidianExtractor.cleanClone(container);
        clone.querySelectorAll('.reflist, .navbox, .infobox, sup.reference, .mw-editsection, table.metadata').forEach((el) => el.remove());
        return { title: ObsidianExtractor.getPageTitle(), html: clone.innerHTML };
      },
    };
  }

  function mediumAdapter() {
    return {
      name: 'Medium',
      extractArticle() {
        const article = document.querySelector('article');
        if (!article) return null;
        const clone = ObsidianExtractor.cleanClone(article);
        return { title: ObsidianExtractor.getPageTitle(), html: clone.innerHTML };
      },
    };
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getAdapter(hostname) {
    const host = hostname.replace(/^www\./, '');
    const named = ADAPTERS[hostname] || ADAPTERS[host];
    if (named) return named;
    // No named adapter — see if this still looks like an AI chat UI we can
    // handle generically (covers "and other AI websites" not listed above).
    const generic = genericAIChatAdapter();
    return generic.detect() ? generic : null;
  }

  return { getAdapter };
})();
