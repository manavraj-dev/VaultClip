(() => {
  function getActiveAdapter() {
    return ObsidianAdapters.getAdapter(location.hostname);
  }

  function handleExtract(mode) {
    const adapter = getActiveAdapter();

    if (mode === 'selection') {
      const result = ObsidianExtractor.extractSelection();
      if (!result) return { error: 'No text is selected on the page.' };
      return { ...result, url: location.href, adapterName: adapter ? adapter.name : null };
    }

    if (mode === 'conversation' && adapter && adapter.supportsConversation) {
      const result = adapter.extractConversation();
      if (result) return { ...result, url: location.href, adapterName: adapter.name };
      return { error: 'Could not find a conversation on this page.' };
    }

    // 'article' and 'page' modes
    if (mode === 'article') {
      let result = null;
      if (adapter && adapter.extractArticle) result = adapter.extractArticle();
      if (!result) result = ObsidianExtractor.extractArticle();
      return { ...result, url: location.href, adapterName: adapter ? adapter.name : null };
    }

    // entire page
    const result = ObsidianExtractor.extractEntirePage();
    return { ...result, url: location.href, adapterName: adapter ? adapter.name : null };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'WTO_EXTRACT') {
      try {
        const data = handleExtract(message.mode);
        sendResponse(data);
      } catch (err) {
        sendResponse({ error: String(err && err.message ? err.message : err) });
      }
      return true;
    }
    if (message && message.type === 'WTO_PING') {
      const adapter = getActiveAdapter();
      sendResponse({
        ok: true,
        title: ObsidianExtractor.getPageTitle(),
        hasSelection: !!(window.getSelection() && !window.getSelection().isCollapsed && window.getSelection().toString().trim()),
        adapterName: adapter ? adapter.name : null,
        supportsConversation: !!(adapter && adapter.supportsConversation),
      });
      return true;
    }
    // Popup asked us to start the "draw a box on the page" capture mode.
    // The result comes back asynchronously via a separate WTO_REGION_RESULT
    // message straight to the background script (the popup will likely be
    // closed while the user is dragging on the page).
    if (message && message.type === 'WTO_START_REGION_SELECT') {
      ObsidianRegionSelect.start();
      sendResponse({ ok: true });
      return true;
    }
  });
})();
