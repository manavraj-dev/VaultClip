chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wto-save-selection',
    title: 'Save selection to Obsidian',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'wto-save-page',
    title: 'Save page to Obsidian',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'wto-save-area',
    title: 'Draw an area to save to Obsidian\u2026',
    contexts: ['page'],
  });
});

/**
 * A "pending capture" is how the extension hands content back to the popup
 * when the popup wasn't open at the moment the content was produced (a
 * right-click menu action, or finishing an in-page area selection). It's
 * stashed in session storage and consumed once by the popup on open.
 *
 * mode: 'selection' | 'article' | 'page' | 'conversation' | 'region'
 * payload: optional pre-extracted { title, html, url } — used for 'region'
 *          captures, since the area selection already did the extraction
 *          work in the content script before the popup re-opens.
 */
async function stashPendingCapture(mode, tabId, payload) {
  await chrome.storage.session.set({
    wto_pending_capture: { mode, tabId, ts: Date.now(), payload: payload || null },
  });
}

async function requestPopupOrBadge(tabId) {
  try {
    await chrome.action.openPopup();
  } catch (e) {
    // openPopup isn't supported in every Chromium version/context, and it
    // generally requires a fresh user gesture. The pending capture is still
    // stashed either way, so the user just needs to click the toolbar icon;
    // the popup will pick it up on open.
    chrome.action.setBadgeText({ text: '1', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#5b3fd1' });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'wto-save-area') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'WTO_START_REGION_SELECT' });
    } catch (e) {
      chrome.action.setBadgeText({ text: '!', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
    }
    return;
  }

  const mode = info.menuItemId === 'wto-save-selection' ? 'selection' : 'article';
  await stashPendingCapture(mode, tab.id);
  await requestPopupOrBadge(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'WTO_CLEAR_BADGE' && sender.tab) {
    chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
  }

  if (message && message.type === 'WTO_CONSUME_PENDING') {
    chrome.storage.session.get('wto_pending_capture').then((data) => {
      sendResponse(data.wto_pending_capture || null);
      chrome.storage.session.remove('wto_pending_capture');
    });
    return true;
  }

  // Sent by the content script once the user finishes drawing (and confirms)
  // an area selection on the page.
  if (message && message.type === 'WTO_REGION_RESULT' && sender.tab) {
    (async () => {
      await stashPendingCapture('region', sender.tab.id, message.result);
      await requestPopupOrBadge(sender.tab.id);
    })();
  }
});
