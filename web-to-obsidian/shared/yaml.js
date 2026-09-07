/**
 * Minimal YAML front-matter helpers, scoped to exactly what Obsidian
 * properties need: flat/nested scalars, lists, and lists of strings.
 * We intentionally do NOT pull in a full YAML parser to keep the
 * extension small and dependency-free.
 */

function splitFrontMatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown || '');
  if (!match) return { yaml: '', body: markdown || '' };
  return { yaml: match[1], body: markdown.slice(match[0].length) };
}

function parseScalar(raw) {
  if (raw === undefined) return '';
  let v = raw.trim();
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseScalar(s.trim()));
  }
  return v;
}

/** Parses a simple flat/one-level YAML block into a plain object. */
function parseProperties(yamlText) {
  const props = {};
  if (!yamlText) return props;
  const lines = yamlText.split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    if (/^\s*$/.test(line)) continue;
    const listItemMatch = /^\s*-\s+(.*)$/.exec(line);
    if (listItemMatch && currentKey) {
      if (!currentList) {
        currentList = [];
        props[currentKey] = currentList;
      }
      currentList.push(parseScalar(listItemMatch[1]));
      continue;
    }
    const kvMatch = /^([A-Za-z0-9_\- .]+):\s*(.*)$/.exec(line);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rest = kvMatch[2];
      currentKey = key;
      currentList = null;
      if (rest.trim() === '') {
        props[key] = ''; // may become a list on next iteration
      } else {
        props[key] = parseScalar(rest);
      }
    }
  }
  return props;
}

function yamlEscapeScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const str = String(value);
  if (str === '') return '""';
  if (/^[A-Za-z0-9_.\/#-]+$/.test(str) && !/^(true|false|null|~)$/i.test(str) && !/^-?\d+(\.\d+)?$/.test(str)) {
    return str;
  }
  return JSON.stringify(str);
}

/** Serializes a plain object (values: string/number/boolean/array) into a YAML block (no --- fences). */
function stringifyProperties(props) {
  const keys = Object.keys(props);
  if (keys.length === 0) return '';
  const lines = [];
  for (const key of keys) {
    const value = props[key];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${yamlEscapeScalar(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${yamlEscapeScalar(value)}`);
    }
  }
  return lines.join('\n');
}

function buildMarkdownWithFrontMatter(props, body) {
  const yaml = stringifyProperties(props);
  const trimmedBody = (body || '').replace(/^\s+/, '');
  if (!yaml) return trimmedBody;
  return `---\n${yaml}\n---\n\n${trimmedBody}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { splitFrontMatter, parseProperties, stringifyProperties, buildMarkdownWithFrontMatter, parseScalar };
} else {
  self.ObsidianYaml = { splitFrontMatter, parseProperties, stringifyProperties, buildMarkdownWithFrontMatter, parseScalar };
}
