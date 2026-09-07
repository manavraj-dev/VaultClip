/**
 * Obsidian vault bridge.
 *
 * Primary path ("folder" method): uses the File System Access API to hold
 * a handle to the user's local vault folder, so the extension can read and
 * write Markdown notes directly onto
 * disk, inside the vault, no server or native host required.
 *
 */
const ObsidianVault = (() => {
  async function pickVaultFolder() {
    if (!window.showDirectoryPicker) {
      throw new Error('This browser does not support local folder access (File System Access API).');
    }
    return window.showDirectoryPicker({ id: 'obsidian-vault', mode: 'readwrite' });
  }

  async function verifyPermission(handle, mode = 'readwrite') {
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  async function getHandleForProject(project) {
    if (!project.handleKey) return null;
    const handle = await ObsidianIdb.get(project.handleKey);
    return handle || null;
  }

  /** Walks/creates a path of subfolders under a root directory handle. */
  async function getDirectory(rootHandle, path, { create = false } = {}) {
    const clean = ObsidianFilename.sanitizeFolderPath(path);
    let dir = rootHandle;
    if (!clean) return dir;
    for (const segment of clean.split('/')) {
      dir = await dir.getDirectoryHandle(segment, { create });
    }
    return dir;
  }

  /** Lists .md files (non-recursive) in a folder, returning {name, handle}. */
  async function listMarkdownFiles(rootHandle, path) {
    let dir;
    try {
      dir = await getDirectory(rootHandle, path, { create: false });
    } catch (e) {
      return []; // folder doesn't exist yet
    }
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && name.toLowerCase().endsWith('.md')) {
        files.push({ name: name.replace(/\.md$/i, ''), handle });
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
  }

  async function readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return file.text();
  }

  /** Lists subfolders (recursively, depth-limited) for a folder picker. */
  async function listFolders(rootHandle, maxDepth = 4) {
    const results = [''];
    async function walk(dir, prefix, depth) {
      if (depth > maxDepth) return;
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'directory' && !name.startsWith('.')) {
          const path = prefix ? `${prefix}/${name}` : name;
          results.push(path);
          await walk(handle, path, depth + 1);
        }
      }
    }
    await walk(rootHandle, '', 0);
    return results;
  }

  async function writeNote(rootHandle, folderPath, filename, content) {
    const dir = await getDirectory(rootHandle, folderPath, { create: true });
    let finalName = filename.endsWith('.md') ? filename : `${filename}.md`;
    // Avoid clobbering an existing note with the same name.
    let suffix = 1;
    while (await fileExists(dir, finalName)) {
      const base = filename.endsWith('.md') ? filename.slice(0, -3) : filename;
      finalName = `${base} (${suffix}).md`;
      suffix += 1;
      if (suffix > 200) break;
    }
    const fileHandle = await dir.getFileHandle(finalName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return finalName;
  }

  async function fileExists(dir, name) {
    try {
      await dir.getFileHandle(name, { create: false });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Reads a file at an arbitrary vault-relative path, e.g. "Meta/Rules.md". */
  async function readFileAtPath(rootHandle, filePath) {
    const clean = ObsidianFilename.sanitizeFolderPath(filePath);
    if (!clean) throw new Error('No file path given.');
    const parts = clean.split('/');
    const name = parts.pop();
    const dir = parts.length ? await getDirectory(rootHandle, parts.join('/'), { create: false }) : rootHandle;
    const fileHandle = await dir.getFileHandle(name, { create: false });
    return readFile(fileHandle);
  }

  /** Writes (creating folders as needed) a file at an arbitrary vault-relative path. */
  async function writeFileAtPath(rootHandle, filePath, content) {
    const clean = ObsidianFilename.sanitizeFolderPath(filePath);
    if (!clean) throw new Error('No file path given.');
    const parts = clean.split('/');
    const name = parts.pop();
    const dir = parts.length ? await getDirectory(rootHandle, parts.join('/'), { create: true }) : rootHandle;
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async function updateFolderProperties(rootHandle, folderPath, properties) {
    let dir;
    try {
      dir = await getDirectory(rootHandle, folderPath, { create: false });
    } catch (e) {
      return 0;
    }
    let updated = 0;
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.md')) continue;
      const raw = await readFile(handle);
      const split = ObsidianYaml.splitFrontMatter(raw);
      const current = ObsidianYaml.parseProperties(split.yaml);
      const content = ObsidianYaml.buildMarkdownWithFrontMatter({ ...current, ...properties }, split.body);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      updated += 1;
    }
    return updated;
  }

  async function suggestNextFilename(rootHandle, folderPath, candidate) {
    const safeCandidate = ObsidianFilename.sanitizeFilename(candidate || 'Untitled');
    const match = /^(.*?)(\d+)$/.exec(safeCandidate);
    if (!match) return safeCandidate;
    const prefix = match[1];
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const files = await listMarkdownFiles(rootHandle, folderPath);
    const numbers = files.map((file) => new RegExp(`^${escapedPrefix}(\\d+)$`, 'i').exec(file.name))
      .filter(Boolean).map((hit) => Number(hit[1]));
    return numbers.length ? `${prefix}${Math.max(...numbers) + 1}` : safeCandidate;
  }

  /**
   * Walks every .md file in the vault and collects the unique set of values
   * used in front-matter `tags` fields, so the popup can offer them as
   * autocomplete suggestions instead of the user having to remember or
   * retype exact tag spelling/casing.
   */
  async function scanVaultTags(rootHandle, { maxFiles = 800, maxDepth = 6 } = {}) {
    const tags = new Set();
    let filesRead = 0;

    async function walk(dir, depth) {
      if (depth > maxDepth || filesRead >= maxFiles) return;
      for await (const [name, handle] of dir.entries()) {
        if (filesRead >= maxFiles) return;
        if (handle.kind === 'directory') {
          if (!name.startsWith('.')) await walk(handle, depth + 1);
          continue;
        }
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.md')) {
          filesRead += 1;
          try {
            const file = await handle.getFile();
            const text = await file.text();
            const { yaml } = ObsidianYaml.splitFrontMatter(text);
            if (!yaml) continue;
            const props = ObsidianYaml.parseProperties(yaml);
            const raw = props.tags ?? props.tag;
            if (Array.isArray(raw)) {
              raw.forEach((t) => { if (t) tags.add(String(t)); });
            } else if (typeof raw === 'string' && raw.trim()) {
              raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => tags.add(t));
            }
          } catch (e) {
            // Unreadable/binary-ish file — skip it.
          }
        }
      }
    }

    await walk(rootHandle, 0);
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Walks Markdown files in the vault and returns note paths (without .md) so
   * the popup can suggest existing notes for link-type properties.
   */
  async function scanVaultNoteNames(rootHandle, { maxFiles = 1200, maxDepth = 8 } = {}) {
    const notes = new Set();
    let filesRead = 0;

    async function walk(dir, prefix, depth) {
      if (depth > maxDepth || filesRead >= maxFiles) return;
      for await (const [name, handle] of dir.entries()) {
        if (filesRead >= maxFiles) return;
        if (handle.kind === 'directory') {
          if (!name.startsWith('.')) {
            const nextPrefix = prefix ? `${prefix}/${name}` : name;
            await walk(handle, nextPrefix, depth + 1);
          }
          continue;
        }
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.md')) {
          filesRead += 1;
          const noteName = name.replace(/\.md$/i, '');
          const notePath = prefix ? `${prefix}/${noteName}` : noteName;
          notes.add(notePath);
        }
      }
    }

    await walk(rootHandle, '', 0);
    return [...notes].sort((a, b) => a.localeCompare(b));
  }

  return {
    pickVaultFolder,
    verifyPermission,
    getHandleForProject,
    getDirectory,
    listMarkdownFiles,
    listFolders,
    readFile,
    writeNote,
    readFileAtPath,
    writeFileAtPath,
    scanVaultTags,
    scanVaultNoteNames,
    updateFolderProperties,
    suggestNextFilename,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ObsidianVault;
