/**
 * Project configuration storage (chrome.storage.local).
 * A "project" describes one Obsidian vault setup a user wants to capture into.
 * Projects are identified purely by their vault name — there is no separate
 * "project name" field; `name` always mirrors `vaultName` and exists only
 * for convenience/display in the UI.
 *
 * Project shape:
 * {
 *   id, name,                   // name === vaultName, kept in sync automatically
 *   method: 'folder',
 *   vaultName: string,           // the exact Obsidian vault name — also the folder name for 'folder' method
 *   handleKey: string|null,      // key into IndexedDB for the FileSystemDirectoryHandle (folder method)
 *   defaultFolder: string,       // path within vault, e.g. "Sources"
 *   rules: string,               // free-form notes on what each tag/folder/property means for this vault
 *   rulesNotePath: string,       // ('folder' method) vault-relative path where `rules` is mirrored as a real note
 * }
 */
const ObsidianStorage = (() => {
  const KEY = 'wto_projects';
  const LAST_USED_KEY = 'wto_last_used';
  const PROPERTY_PRESETS_KEY = 'wto_property_presets';
  const DEFAULT_RULES_NOTE_PATH = 'Web to Obsidian Rules.md';

  async function getProjects() {
    const data = await chrome.storage.local.get(KEY);
    const projects = data[KEY] || [];
    return projects.map((project) => ({ ...project, method: 'folder' }));
  }

  async function saveProjects(projects) {
    await chrome.storage.local.set({ [KEY]: projects });
  }

  async function upsertProject(project) {
    const projects = await getProjects();
    const idx = projects.findIndex((p) => p.id === project.id);
    if (idx === -1) projects.push(project);
    else projects[idx] = project;
    await saveProjects(projects);
    return projects;
  }

  async function deleteProject(id) {
    const projects = await getProjects();
    const filtered = projects.filter((p) => p.id !== id);
    await saveProjects(filtered);
    return filtered;
  }

  async function getLastUsed() {
    const data = await chrome.storage.local.get(LAST_USED_KEY);
    return data[LAST_USED_KEY] || {};
  }

  async function setLastUsed(partial) {
    const current = await getLastUsed();
    await chrome.storage.local.set({ [LAST_USED_KEY]: { ...current, ...partial } });
  }

  async function getPropertyPresets() {
    const data = await chrome.storage.local.get(PROPERTY_PRESETS_KEY);
    return data[PROPERTY_PRESETS_KEY] || {};
  }

  async function getPropertyPreset(projectId) {
    if (!projectId) return null;
    const presets = await getPropertyPresets();
    return Object.prototype.hasOwnProperty.call(presets, projectId) ? (presets[projectId] || []) : null;
  }

  async function setPropertyPreset(projectId, rows) {
    if (!projectId) return;
    const presets = await getPropertyPresets();
    presets[projectId] = Array.isArray(rows) ? rows : [];
    await chrome.storage.local.set({ [PROPERTY_PRESETS_KEY]: presets });
  }

  async function deletePropertyPreset(projectId) {
    if (!projectId) return;
    const presets = await getPropertyPresets();
    if (!Object.prototype.hasOwnProperty.call(presets, projectId)) return;
    delete presets[projectId];
    await chrome.storage.local.set({ [PROPERTY_PRESETS_KEY]: presets });
  }

  function newId() {
    return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  return {
    getProjects,
    saveProjects,
    upsertProject,
    deleteProject,
    getLastUsed,
    setLastUsed,
    getPropertyPreset,
    setPropertyPreset,
    deletePropertyPreset,
    newId,
    DEFAULT_RULES_NOTE_PATH,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ObsidianStorage;
