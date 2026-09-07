function sanitizeFilename(name) {
  if (!name) return 'Untitled';
  let clean = name
    // Characters invalid across Windows/macOS/Linux filesystems
    .replace(/[\\/:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  clean = clean.replace(/\.+$/, '').trim();
  if (clean.length > 180) clean = clean.slice(0, 180).trim();
  return clean || 'Untitled';
}

function sanitizeFolderPath(path) {
  if (!path) return '';
  return path
    .split('/')
    .map((seg) => seg.replace(/[\\:*?"<>|]/g, '').trim())
    .filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
    .join('/');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sanitizeFilename, sanitizeFolderPath };
} else {
  self.ObsidianFilename = { sanitizeFilename, sanitizeFolderPath };
}
