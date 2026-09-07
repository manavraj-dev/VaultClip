(() => {
  const el = (id) => document.getElementById(id);

  const state = {
    tab: null,
    pageInfo: null, // {title, hasSelection, adapterName, supportsConversation}
    projects: [],
    project: null,
    rootHandle: null,
    propRows: [], // {key, value}
    filenameTouched: false,
    lastMarkdown: null,
    regionResult: null, // {title, html, url} captured via "draw a box on the page", or {error}
    extraContent: '',
    vaultTagsLoaded: false,
    vaultNotesLoaded: false,
    propertyPresetRows: [],
    hasPropertyPreset: false,
  };

  const DYNAMIC_PROPERTY_KEYS = new Set(['title', 'source', 'captured']);
  const DEFAULT_PROPERTY_ROWS = [
    { key: 'tags', value: '' },
    { key: 'links', value: '' },
  ];

  const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  if (window.turndownPluginGfm) turndownService.use([turndownPluginGfm.tables, turndownPluginGfm.strikethrough, turndownPluginGfm.taskListItems]);

  function showStatus(message, type = 'info') {
    const bar = el('statusBar');
    bar.textContent = message;
    bar.className = `status ${type}`;
    bar.classList.remove('hidden');
  }
  function clearStatus() {
    el('statusBar').classList.add('hidden');
  }

  function getSelectedMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : 'article';
  }
  function setSelectedMode(mode) {
    const input = document.querySelector(`input[name="mode"][value="${mode}"]`);
    if (input) input.checked = true;
  }

  async function pingActiveTab(tabId) {
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'WTO_PING' });
    } catch (e) {
      return null;
    }
  }

  async function extractFromTab(tabId, mode) {
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'WTO_EXTRACT', mode });
    } catch (e) {
      return { error: 'Couldn\u2019t reach this page to read it. If you just installed or reloaded the extension, refresh this tab first \u2014 content scripts only attach to tabs opened after that, then try again.' };
    }
  }

  // ---------- Properties UI ----------
  function normalizePropertyKey(key) {
    return String(key || '').trim().toLowerCase();
  }

  function isDynamicPropertyKey(key) {
    return DYNAMIC_PROPERTY_KEYS.has(normalizePropertyKey(key));
  }

  function isTagsProperty(key) {
    const normalized = normalizePropertyKey(key);
    return normalized === 'tag' || normalized === 'tags';
  }

  function isLinksProperty(key) {
    const normalized = normalizePropertyKey(key);
    return normalized === 'link' || normalized === 'links';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeLinkItem(raw) {
    return String(raw || '').trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
  }

  function parseLinkItems(raw) {
    if (Array.isArray(raw)) return raw.map(normalizeLinkItem).filter(Boolean);
    return String(raw || '')
      .split(',')
      .map(normalizeLinkItem)
      .filter(Boolean);
  }

  function stringifyLinkItems(items) {
    return items.join(', ');
  }

  function formatPropertyValue(key, value) {
    if (isLinksProperty(key)) {
      return stringifyLinkItems(Array.isArray(value) ? value : parseLinkItems(value));
    }
    if (Array.isArray(value)) return value.join(', ');
    return String(value ?? '');
  }

  function clonePropertyRows(rows) {
    return (rows || []).map((row) => ({
      key: row && row.key ? String(row.key) : '',
      value: row ? formatPropertyValue(row.key, row.value) : '',
      draft: row && row.draft ? String(row.draft) : '',
    }));
  }

  function mergePropertyRows(baseRows, extraRows) {
    const merged = clonePropertyRows(baseRows);
    (extraRows || []).forEach((row) => {
      const key = normalizePropertyKey(row && row.key);
      if (!key) return;
      const nextRow = {
        key: row.key,
        value: formatPropertyValue(row.key, row.value),
        draft: '',
      };
      const existingIdx = merged.findIndex((item) => normalizePropertyKey(item.key) === key);
      if (existingIdx === -1) merged.push(nextRow);
      else merged[existingIdx] = nextRow;
    });
    return merged;
  }

  function appendMissingPropertyRows(baseRows, extraRows) {
    const merged = clonePropertyRows(baseRows);
    (extraRows || []).forEach((row) => {
      const key = normalizePropertyKey(row && row.key);
      if (!key) return;
      const exists = merged.some((item) => normalizePropertyKey(item.key) === key);
      if (!exists) {
        merged.push({
          key: row.key,
          value: formatPropertyValue(row.key, row.value),
          draft: '',
        });
      }
    });
    return merged;
  }

  async function loadPropertyPresetForProject() {
    state.propertyPresetRows = [];
    state.hasPropertyPreset = false;
    if (!state.project) return;
    if (!state.project.yamlProperties || typeof state.project.yamlProperties !== 'object') return;
    state.propertyPresetRows = clonePropertyRows(
      Object.entries(state.project.yamlProperties).map(([key, value]) => ({ key, value }))
    );
    state.hasPropertyPreset = true;
  }

  function addLinkToRow(idx, rawValue) {
    const row = state.propRows[idx];
    if (!row) return;
    const nextItem = normalizeLinkItem(rawValue);
    row.draft = '';
    if (!nextItem) {
      renderProperties();
      return;
    }
    const items = parseLinkItems(row.value);
    if (!items.some((item) => item.toLowerCase() === nextItem.toLowerCase())) {
      items.push(nextItem);
      row.value = stringifyLinkItems(items);
    }
    renderProperties();
  }

  function removeLinkFromRow(idx, linkValue) {
    const row = state.propRows[idx];
    if (!row) return;
    row.value = stringifyLinkItems(
      parseLinkItems(row.value).filter((item) => item.toLowerCase() !== String(linkValue).toLowerCase())
    );
    renderProperties();
  }

  function renderProperties() {
    const list = el('propertiesList');
    list.innerHTML = '';
    state.propRows.forEach((row, idx) => {
      const isTagsRow = isTagsProperty(row.key);
      const isLinksRow = isLinksProperty(row.key);
      const rowEl = document.createElement('div');
      rowEl.className = `property-row${isLinksRow ? ' link-property-row' : ''}`;
      if (isLinksRow) {
        const chips = parseLinkItems(row.value).map((item) => `
          <span class="link-chip">
            <span>${escapeHtml(item)}</span>
            <button class="remove-link-chip" data-idx="${idx}" data-link="${escapeAttr(item)}" type="button" title="Remove link">×</button>
          </span>
        `).join('');
        rowEl.innerHTML = `
          <input class="prop-key" data-idx="${idx}" value="${escapeAttr(row.key)}" placeholder="key" />
          <div class="property-value-wrap">
            ${chips ? `<div class="link-chip-list">${chips}</div>` : ''}
            <div class="link-input-row">
              <input class="prop-link-input" data-idx="${idx}" value="${escapeAttr(row.draft || '')}" placeholder="Link notes…" list="vaultNotesList" />
              <button class="add-link-item" data-idx="${idx}" type="button">Add</button>
            </div>
          </div>
          <button class="remove-prop" data-idx="${idx}" title="Remove" type="button">×</button>
        `;
      } else {
        rowEl.innerHTML = `
          <input class="prop-key" data-idx="${idx}" value="${escapeAttr(row.key)}" placeholder="key" />
          <input class="prop-value" data-idx="${idx}" value="${escapeAttr(row.value)}" placeholder="value" ${isTagsRow ? 'list="vaultTagsList"' : ''} />
          <button class="remove-prop" data-idx="${idx}" title="Remove" type="button">×</button>
        `;
      }
      list.appendChild(rowEl);
    });
    list.querySelectorAll('.prop-key').forEach((inp) => inp.addEventListener('input', (e) => {
      state.propRows[+e.target.dataset.idx].key = e.target.value;
      renderProperties(); // key may have changed to/from "tags" — refresh datalist wiring
    }));
    list.querySelectorAll('.prop-value').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        state.propRows[+e.target.dataset.idx].value = e.target.value;
      });
      if (inp.getAttribute('list') === 'vaultTagsList') {
        inp.addEventListener('focus', loadVaultTags);
      }
    });
    list.querySelectorAll('.prop-link-input').forEach((inp) => {
      inp.addEventListener('focus', loadVaultNotes);
      inp.addEventListener('input', (e) => {
        state.propRows[+e.target.dataset.idx].draft = e.target.value;
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          addLinkToRow(+e.target.dataset.idx, e.target.value);
        }
      });
      inp.addEventListener('change', (e) => {
        addLinkToRow(+e.target.dataset.idx, e.target.value);
      });
    });
    list.querySelectorAll('.add-link-item').forEach((btn) => btn.addEventListener('click', (e) => {
      const idx = +e.target.dataset.idx;
      addLinkToRow(idx, state.propRows[idx] ? state.propRows[idx].draft : '');
    }));
    list.querySelectorAll('.remove-link-chip').forEach((btn) => btn.addEventListener('click', (e) => {
      removeLinkFromRow(+e.target.dataset.idx, e.target.dataset.link);
    }));
    list.querySelectorAll('.remove-prop').forEach((btn) => btn.addEventListener('click', (e) => {
      state.propRows.splice(+e.target.dataset.idx, 1);
      renderProperties();
    }));
  }

  function escapeAttr(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function upsertPropRow(key, value) {
    const existing = state.propRows.find((r) => r.key.toLowerCase() === key.toLowerCase());
    if (existing) return;
    state.propRows.push({ key, value });
  }

  function applyAutoProperties({ title, url }) {
    upsertPropRow('title', title || '');
    upsertPropRow('source', url || '');
    upsertPropRow('captured', new Date().toISOString().slice(0, 10));
  }

  // ---------- Vault tag suggestions ----------
  async function loadVaultTags() {
    if (state.vaultTagsLoaded || !state.project) return;
    state.vaultTagsLoaded = true; // avoid re-scanning the whole vault on every focus
    let tags = [];
    try {
      if (state.project.method === 'folder' && state.rootHandle) {
        tags = await ObsidianVault.scanVaultTags(state.rootHandle);
      }
    } catch (e) {
      tags = [];
    }
    const dl = el('vaultTagsList');
    dl.innerHTML = '';
    tags.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      dl.appendChild(opt);
    });
  }

  async function loadVaultNotes() {
    if (state.vaultNotesLoaded || !state.project) return;
    state.vaultNotesLoaded = true;
    let notes = [];
    try {
      if (state.project.method === 'folder' && state.rootHandle) {
        notes = await ObsidianVault.scanVaultNoteNames(state.rootHandle);
      }
    } catch (e) {
      notes = [];
    }
    const dl = el('vaultNotesList');
    dl.innerHTML = '';
    notes.forEach((note) => {
      const opt = document.createElement('option');
      opt.value = note;
      dl.appendChild(opt);
    });
  }

  // ---------- Vault rules panel ----------
  function updateRulesPanelContent() {
    const rules = state.project && state.project.rules ? state.project.rules.trim() : '';
    el('rulesText').textContent = rules || 'No rules defined for this vault yet. Add them from Settings → this vault → Vault rules, to note what each tag/folder means so it\u2019s easy to stay consistent.';
  }

  // ---------- Project loading ----------
  async function loadProjects() {
    state.projects = await ObsidianStorage.getProjects();
    const select = el('projectSelect');
    select.innerHTML = '';
    if (state.projects.length === 0) {
      el('noProjects').classList.remove('hidden');
      el('mainForm').classList.add('hidden');
      return false;
    }
    el('noProjects').classList.add('hidden');
    el('mainForm').classList.remove('hidden');
    state.projects.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    const lastUsed = await ObsidianStorage.getLastUsed();
    if (lastUsed.projectId && state.projects.some((p) => p.id === lastUsed.projectId)) {
      select.value = lastUsed.projectId;
    }
    return true;
  }

  async function onProjectChange() {
    clearStatus();
    const id = el('projectSelect').value;
    state.project = state.projects.find((p) => p.id === id) || null;
    state.rootHandle = null;
    state.vaultTagsLoaded = false;
    state.vaultNotesLoaded = false;
    state.filenameTouched = false;
    el('vaultTagsList').innerHTML = '';
    el('vaultNotesList').innerHTML = '';
    el('rulesPanel').classList.add('hidden');
    updateRulesPanelContent();
    el('folderInput').value = state.project ? state.project.defaultFolder || '' : '';
    populateFolderOptions([]);
    await loadPropertyPresetForProject();
    initializeProperties();

    if (!state.project) return;

    if (state.project.method === 'folder') {
      const handle = await ObsidianVault.getHandleForProject(state.project);
      if (!handle) {
        showStatus('This vault\u2019s folder isn\u2019t connected. Open Settings to connect it.', 'error');
        return;
      }
      let granted = false;
      try {
        granted = await ObsidianVault.verifyPermission(handle, 'readwrite');
      } catch (e) {
        granted = false;
      }
      if (!granted) {
        showStatus('Folder access needed \u2014 click Save and allow access when prompted, or reconnect in Settings.', 'info');
      }
      state.rootHandle = handle;
      try {
        const folders = await ObsidianVault.listFolders(handle);
        populateFolderOptions(folders);
        const title = state.regionResult && !state.regionResult.error
          ? state.regionResult.title
          : (state.pageInfo ? state.pageInfo.title : 'Untitled');
        el('filenameInput').value = await ObsidianVault.suggestNextFilename(handle, state.project.defaultFolder || '', title);
      } catch (e) {
        showStatus(`Couldn\u2019t read the vault folder: ${e.message}`, 'error');
      }
    }
  }

  function populateFolderOptions(folders) {
    const dl = el('folderOptions');
    dl.innerHTML = '';
    folders.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f;
      dl.appendChild(opt);
    });
  }

  function initializeProperties() {
    const properties = {};
    let nextRows = Object.keys(properties).map((k) => ({
      key: k,
      value: formatPropertyValue(k, properties[k]),
      draft: '',
    }));
    if (state.hasPropertyPreset) nextRows = mergePropertyRows(nextRows, state.propertyPresetRows);
    else nextRows = appendMissingPropertyRows(nextRows, DEFAULT_PROPERTY_ROWS);
    state.propRows = nextRows;
    const source = state.regionResult && !state.regionResult.error ? state.regionResult : null;
    applyAutoProperties({
      title: source ? source.title : (state.pageInfo ? state.pageInfo.title : ''),
      url: source ? source.url : (state.tab ? state.tab.url : ''),
    });
    renderProperties();
  }

  // ---------- Capture pipeline ----------
  function buildPropertiesObject() {
    const props = {};
    state.propRows.forEach((row) => {
      const key = row.key.trim();
      if (!key) return;
      if (isTagsProperty(key)) {
        props[key] = row.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (isLinksProperty(key)) {
        props[key] = parseLinkItems(row.value).map((item) => `[[${item}]]`);
      } else {
        props[key] = ObsidianYaml.parseScalar(row.value);
      }
    });
    return props;
  }

  async function runCapturePipeline() {
    const mode = getSelectedMode();
    let result;
    if (mode === 'region') {
      if (!state.regionResult) throw new Error('Draw a box on the page first, using the button above.');
      result = state.regionResult;
    } else {
      result = await extractFromTab(state.tab.id, mode);
    }
    if (!result || result.error) {
      throw new Error((result && result.error) || 'Could not read this page.');
    }
    let markdown = turndownService.turndown(result.html || '');
    if (state.extraContent && state.extraContent.trim()) {
      markdown = `${markdown}\n\n---\n\n${state.extraContent.trim()}`;
    }
    const props = buildPropertiesObject();
    const finalMarkdown = ObsidianYaml.buildMarkdownWithFrontMatter(props, markdown);

    if (!state.filenameTouched) {
      el('filenameInput').value = ObsidianFilename.sanitizeFilename(result.title || 'Untitled');
    }
    return finalMarkdown;
  }

  async function handlePreview() {
    if (!state.project) { showStatus('Choose a vault first.', 'error'); return; }
    clearStatus();
    try {
      const markdown = await runCapturePipeline();
      state.lastMarkdown = markdown;
      el('previewSection').classList.remove('hidden');
      el('previewText').value = markdown;
    } catch (e) {
      showStatus(e.message, 'error');
    }
  }

  async function handleSave() {
    if (!state.project) { showStatus('Choose a vault first.', 'error'); return; }
    clearStatus();
    el('saveBtn').disabled = true;
    try {
      let content = el('previewSection').classList.contains('hidden')
        ? await runCapturePipeline()
        : el('previewText').value;

      const filename = ObsidianFilename.sanitizeFilename(el('filenameInput').value || 'Untitled');
      const folder = el('folderInput').value || '';

      const handle = state.rootHandle || await ObsidianVault.getHandleForProject(state.project);
      if (!handle) throw new Error('Vault folder not connected. Open Settings to connect it.');
      const granted = await ObsidianVault.verifyPermission(handle, 'readwrite');
      if (!granted) throw new Error('Folder access was not granted.');
      const savedName = await ObsidianVault.writeNote(handle, folder, filename, content);
      showStatus(`Saved to ${folder ? folder + '/' : ''}${savedName}`, 'success');

      await ObsidianStorage.setLastUsed({ projectId: state.project.id, mode: getSelectedMode() });
    } catch (e) {
      showStatus(e.message, 'error');
    } finally {
      el('saveBtn').disabled = false;
    }
  }

  // ---------- Init ----------
  async function startApp() {
    el('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
    el('goToOptionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
    el('projectSelect').addEventListener('change', onProjectChange);
    el('addPropertyBtn').addEventListener('click', () => {
      state.propRows.push({ key: '', value: '', draft: '' });
      renderProperties();
    });
    el('filenameInput').addEventListener('input', () => { state.filenameTouched = true; });
    el('previewBtn').addEventListener('click', handlePreview);
    el('saveBtn').addEventListener('click', handleSave);

    el('toggleExtraBtn').addEventListener('click', () => {
      el('extraContentWrap').classList.toggle('hidden');
      if (!el('extraContentWrap').classList.contains('hidden')) el('extraContentInput').focus();
    });
    el('extraContentInput').addEventListener('input', (e) => { state.extraContent = e.target.value; });

    el('viewRulesBtn').addEventListener('click', () => {
      updateRulesPanelContent();
      el('rulesPanel').classList.toggle('hidden');
    });
    el('closeRulesBtn').addEventListener('click', () => el('rulesPanel').classList.add('hidden'));
    el('editRulesBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

    el('selectAreaBtn').addEventListener('click', async () => {
      if (!state.tab || !state.tab.id) { showStatus('No active tab to select on.', 'error'); return; }
      try {
        await chrome.tabs.sendMessage(state.tab.id, { type: 'WTO_START_REGION_SELECT' });
        // The popup will close as soon as the user clicks into the page to
        // start dragging; the extension re-opens (or badges) itself once
        // the selection is confirmed, via the pending-capture mechanism.
        window.close();
      } catch (e) {
        showStatus('Couldn\u2019t start area selection on this page. If you just installed or reloaded the extension, refresh this tab first, then try again.', 'error');
      }
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab;
    if (tab && tab.id) chrome.action.setBadgeText({ text: '', tabId: tab.id });

    const hasProjects = await loadProjects();
    if (!hasProjects) return;

    if (tab && tab.id) {
      state.pageInfo = await pingActiveTab(tab.id);
    }

    if (state.pageInfo) {
      if (!state.pageInfo.hasSelection) {
        document.querySelector('input[name="mode"][value="selection"]').closest('.radio-pill').style.opacity = '0.5';
      }
      if (state.pageInfo.supportsConversation) {
        el('conversationPill').classList.remove('hidden');
      }
      if (state.pageInfo.adapterName) {
        el('adapterNote').textContent = `Using the ${state.pageInfo.adapterName} adapter for cleaner extraction.`;
        el('adapterNote').classList.remove('hidden');
      }
      el('filenameInput').value = ObsidianFilename.sanitizeFilename(state.pageInfo.title || tab.title || 'Untitled');
    } else if (tab) {
      showStatus('Can\u2019t read this page (browser pages and some sites block extensions). You can still save manually below.', 'info');
      el('filenameInput').value = ObsidianFilename.sanitizeFilename(tab.title || 'Untitled');
    }

    // Pending capture from the right-click context menu, or from a
    // just-finished "draw a box on the page" area selection.
    let pending = null;
    try {
      pending = await chrome.runtime.sendMessage({ type: 'WTO_CONSUME_PENDING' });
    } catch (e) { /* no-op */ }

    if (pending && pending.mode === 'region') {
      el('regionPill').classList.remove('hidden');
      if (pending.payload && !pending.payload.error) {
        state.regionResult = pending.payload;
        setSelectedMode('region');
        el('filenameInput').value = ObsidianFilename.sanitizeFilename(pending.payload.title || 'Untitled');
      } else {
        showStatus((pending.payload && pending.payload.error) || 'That area selection didn\u2019t work — try again.', 'error');
      }
    } else if (pending && pending.mode) {
      setSelectedMode(pending.mode === 'selection' && state.pageInfo && !state.pageInfo.hasSelection ? 'article' : pending.mode);
    } else {
      const lastUsed = await ObsidianStorage.getLastUsed();
      if (lastUsed.mode && lastUsed.mode !== 'region') setSelectedMode(lastUsed.mode);
    }

    await onProjectChange();
  }

  function setupTermsGate() {
    el('termsText').textContent = ObsidianTerms.TEXT;
    el('termsCheckbox').addEventListener('change', (e) => {
      el('acceptTermsBtn').disabled = !e.target.checked;
    });
    el('acceptTermsBtn').addEventListener('click', async () => {
      await ObsidianTerms.accept();
      el('termsGate').classList.add('hidden');
      el('appShell').classList.remove('hidden');
      startApp();
    });
    el('declineTermsBtn').addEventListener('click', () => {
      window.close();
    });
  }

  async function init() {
    const accepted = await ObsidianTerms.isAccepted();
    if (!accepted) {
      setupTermsGate();
      el('termsGate').classList.remove('hidden');
      return;
    }
    el('appShell').classList.remove('hidden');
    await startApp();
  }

  init();
})();
