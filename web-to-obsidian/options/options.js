(() => {
  const el = (id) => document.getElementById(id);
  let projects = [];
  let editing = null; // project object being edited (or null)
  let connectedHandle = null; // FileSystemDirectoryHandle just picked, pending save

  async function refreshList() {
    projects = await ObsidianStorage.getProjects();
    const list = el('projectList');
    list.innerHTML = '';
    el('emptyHint').classList.toggle('hidden', projects.length > 0);
    projects.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'project-card';
      const methodLabel = 'Local folder';
      card.innerHTML = `
        <div class="meta">
          <strong>${escapeHtml(p.vaultName || p.name || 'Untitled vault')}</strong>
          <span>${methodLabel}</span>
        </div>
        <div class="buttons">
          <button class="secondary-btn edit-btn" type="button">Edit</button>
          <button class="danger-btn delete-btn" type="button">Delete</button>
        </div>
      `;
      card.querySelector('.edit-btn').addEventListener('click', () => openEditor(p));
      card.querySelector('.delete-btn').addEventListener('click', () => deleteProject(p));
      list.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  async function deleteProject(p) {
    if (!confirm(`Remove vault "${p.vaultName || p.name}" from the extension? This won't delete any files in your vault.`)) return;
    if (p.handleKey) await ObsidianIdb.del(p.handleKey);
    await ObsidianStorage.deletePropertyPreset(p.id);
    await ObsidianStorage.deleteProject(p.id);
    await refreshList();
  }

  async function openEditor(project) {
    editing = project || null;
    connectedHandle = null;

    el('editorTitle').textContent = project ? `Edit "${project.vaultName || project.name}"` : 'New vault';
    el('fVaultName').value = project ? project.vaultName || '' : '';
    el('fDefaultFolder').value = project ? project.defaultFolder || '' : '';
    el('fRules').value = project ? project.rules || '' : '';
    el('fRulesNotePath').value = project ? project.rulesNotePath || ObsidianStorage.DEFAULT_RULES_NOTE_PATH : ObsidianStorage.DEFAULT_RULES_NOTE_PATH;
    el('vaultNameWarning').classList.add('hidden');
    updateConnectStatus(project && project.method === 'folder' && project.handleKey ? 'existing' : 'none');
    toggleMethodBlocks();
    el('editorPanel').classList.remove('hidden');
    el('editorPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeEditor() {
    editing = null;
    connectedHandle = null;
    el('editorPanel').classList.add('hidden');
  }

  function toggleMethodBlocks() {
    el('folderMethodBlock').classList.remove('hidden');
  }

  function updateConnectStatus(mode, name) {
    const status = el('connectStatus');
    if (mode === 'existing') {
      status.textContent = 'Connected to a local folder \u2014 reconnect only if you moved it.';
      status.classList.add('ok');
    } else if (mode === 'new') {
      status.textContent = `Connected: ${name}`;
      status.classList.add('ok');
    } else {
      status.textContent = 'Not connected';
      status.classList.remove('ok');
    }
  }

  /**
   * Obsidian identifies a vault by its folder name, so if the name typed
   * into "Obsidian vault name" doesn't match the folder that was actually
   * picked, that's very likely a mistake (wrong folder, or a rename that
   * didn't get reflected). Flash a warning instead of silently accepting it.
   */
  function checkVaultNameMatch() {
    const warn = el('vaultNameWarning');
    if (!connectedHandle) { warn.classList.add('hidden'); return; }
    const entered = el('fVaultName').value.trim();
    const folderName = connectedHandle.name;

    if (!entered) {
      // Nothing typed yet — just fill it in from the folder, no warning needed.
      el('fVaultName').value = folderName;
      warn.classList.add('hidden');
      return;
    }

    if (entered.toLowerCase() !== folderName.toLowerCase()) {
      warn.innerHTML = `\u26a0\ufe0f The vault name you entered is <strong>"${escapeHtml(entered)}"</strong>, but the folder you connected is named <strong>"${escapeHtml(folderName)}"</strong>. Obsidian identifies a vault by its folder name, so these should usually match \u2014 double check you picked the right folder. <button type="button" id="useFolderNameBtn" class="link-btn">Use "${escapeHtml(folderName)}" instead</button>`;
      warn.classList.remove('hidden');
      const fixBtn = el('useFolderNameBtn');
      if (fixBtn) {
        fixBtn.addEventListener('click', () => {
          el('fVaultName').value = folderName;
          warn.classList.add('hidden');
        });
      }
    } else {
      warn.classList.add('hidden');
    }
  }

  async function connectFolder() {
    try {
      connectedHandle = await ObsidianVault.pickVaultFolder();
      updateConnectStatus('new', connectedHandle.name);
      checkVaultNameMatch();
    } catch (e) {
      if (e.name !== 'AbortError') alert(`Couldn\u2019t open folder picker: ${e.message}`);
    }
  }

  /** Resolves the vault folder handle usable right now for this editor session (freshly picked, or already saved). */
  async function resolveHandleForRulesSync() {
    if (connectedHandle) return connectedHandle;
    if (editing && editing.handleKey) return ObsidianVault.getHandleForProject(editing);
    return null;
  }

  async function loadRulesFromVault() {
    const handle = await resolveHandleForRulesSync();
    if (!handle) { alert('Connect a vault folder first.'); return; }
    const path = el('fRulesNotePath').value.trim() || ObsidianStorage.DEFAULT_RULES_NOTE_PATH;
    try {
      const granted = await ObsidianVault.verifyPermission(handle, 'readwrite');
      if (!granted) throw new Error('Folder access was not granted.');
      const text = await ObsidianVault.readFileAtPath(handle, path);
      const { body } = ObsidianYaml.splitFrontMatter(text);
      el('fRules').value = body.trim();
    } catch (e) {
      alert(`Couldn\u2019t read that note yet (it may not exist): ${e.message}`);
    }
  }

  async function saveRulesToVault() {
    const handle = await resolveHandleForRulesSync();
    if (!handle) { alert('Connect a vault folder first.'); return; }
    const path = el('fRulesNotePath').value.trim() || ObsidianStorage.DEFAULT_RULES_NOTE_PATH;
    try {
      const granted = await ObsidianVault.verifyPermission(handle, 'readwrite');
      if (!granted) throw new Error('Folder access was not granted.');
      const content = `# Web \u2192 Obsidian: vault rules\n\n${el('fRules').value.trim()}\n`;
      await ObsidianVault.writeFileAtPath(handle, path, content);
      alert(`Saved to ${path} in your vault.`);
    } catch (e) {
      alert(`Couldn\u2019t write that note: ${e.message}`);
    }
  }

  async function saveProject() {
    const vaultName = el('fVaultName').value.trim();
    if (!vaultName) { alert('Enter the Obsidian vault name \u2014 it\u2019s used to identify this vault throughout the extension.'); return; }
    const method = 'folder';

    // Final safety check: don't let a folder/vault-name mismatch slip through silently.
    if (method === 'folder' && connectedHandle && vaultName.toLowerCase() !== connectedHandle.name.toLowerCase()) {
      const proceed = confirm(
        `The vault name "${vaultName}" doesn\u2019t match the connected folder name "${connectedHandle.name}". ` +
        `Obsidian identifies a vault by its folder name, so this is usually a mistake. Save anyway?`
      );
      if (!proceed) return;
    }

    const project = {
      id: editing ? editing.id : ObsidianStorage.newId(),
      name: vaultName, // no separate project name — the vault name is the identity
      vaultName,
      method,
      defaultFolder: el('fDefaultFolder').value.trim(),
      handleKey: editing ? editing.handleKey || null : null,
      rules: el('fRules').value.trim(),
      rulesNotePath: el('fRulesNotePath').value.trim() || ObsidianStorage.DEFAULT_RULES_NOTE_PATH,
    };

    if (method === 'folder' && connectedHandle) {
      project.handleKey = project.handleKey || `vault_${project.id}`;
      await ObsidianIdb.set(project.handleKey, connectedHandle);
    }
    if (method === 'folder' && !project.handleKey) {
      const proceed = confirm('No vault folder connected yet. Save anyway? You can connect it later by editing this vault.');
      if (!proceed) return;
    }

    await ObsidianStorage.upsertProject(project);
    closeEditor();
    await refreshList();
  }

  // ---------- Terms & Conditions gate ----------
  function setupTermsGate() {
    el('termsText').textContent = ObsidianTerms.TEXT;
    el('termsCheckbox').addEventListener('change', (e) => {
      el('acceptTermsBtn').disabled = !e.target.checked;
    });
    el('acceptTermsBtn').addEventListener('click', async () => {
      await ObsidianTerms.accept();
      el('termsGate').classList.add('hidden');
      el('appShell').classList.remove('hidden');
      initApp();
    });
    el('declineTermsBtn').addEventListener('click', () => {
      document.body.innerHTML = '<p style="font-family:sans-serif;padding:40px;color:#a6a3b3;background:#16161b;">You need to accept the Terms &amp; Conditions to use this extension. You can close this tab.</p>';
    });
  }

  function initApp() {
    el('newProjectBtn').addEventListener('click', () => openEditor(null));
    el('cancelEditBtn').addEventListener('click', closeEditor);
    el('saveProjectBtn').addEventListener('click', saveProject);
    el('fVaultName').addEventListener('input', checkVaultNameMatch);
    el('connectFolderBtn').addEventListener('click', connectFolder);
    el('loadRulesFromVaultBtn').addEventListener('click', loadRulesFromVault);
    el('saveRulesToVaultBtn').addEventListener('click', saveRulesToVault);
    refreshList();
  }

  async function init() {
    const accepted = await ObsidianTerms.isAccepted();
    setupTermsGate();
    if (!accepted) {
      el('termsGate').classList.remove('hidden');
      return;
    }
    el('appShell').classList.remove('hidden');
    initApp();
  }

  init();
})();
