const ObsidianNlp = (() => {
  const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can',
    'could', 'do', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if',
    'in', 'into', 'is', 'it', 'its', 'just', 'may', 'more', 'new', 'not',
    'of', 'on', 'or', 'our', 'out', 'so', 'that', 'the', 'their', 'them',
    'there', 'these', 'this', 'those', 'to', 'up', 'use', 'using', 'was',
    'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will',
    'with', 'you', 'your'
  ]);

  const GENERIC_FOLDER_WORDS = new Set([
    'all', 'archive', 'articles', 'captures', 'clippings', 'docs', 'documents',
    'general', 'inbox', 'journal', 'knowledge', 'main', 'misc', 'miscellaneous',
    'new', 'notes', 'pages', 'reference', 'resources', 'saved', 'sources',
    'stuff', 'web'
  ]);

  function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stripHtml(html) {
    const source = String(html || '').trim();
    if (!source) return '';
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      return normalizeWhitespace(doc.body ? doc.body.textContent : source);
    }
    return normalizeWhitespace(source.replace(/<[^>]+>/g, ' '));
  }

  function splitPageTitle(pageTitle) {
    return normalizeWhitespace(pageTitle)
      .split(/\s+[|\-:·•]\s+/)
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);
  }

  function splitSentences(text) {
    return normalizeWhitespace(text)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => normalizeWhitespace(sentence))
      .filter(Boolean);
  }

  function tokenize(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) || [];
  }

  function buildFrequencyMap(text) {
    const frequencies = new Map();
    tokenize(text).forEach((token) => {
      if (token.length < 3 || STOP_WORDS.has(token)) return;
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    });
    return frequencies;
  }

  function formatFolderLabel(segment) {
    return normalizeWhitespace(segment)
      .split(/[-_]/g)
      .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
      .join(' ');
  }

  function getFolderContext(folderPath) {
    const parts = String(folderPath || '')
      .split('/')
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = parts[index];
      const tokens = tokenize(part).filter((token) => !GENERIC_FOLDER_WORDS.has(token));
      if (tokens.length) {
        return {
          raw: part,
          label: formatFolderLabel(part),
          terms: new Set(tokens),
        };
      }
    }
    return { raw: '', label: '', terms: new Set() };
  }

  function normalizeCandidate(candidate) {
    return normalizeWhitespace(candidate)
      .replace(/^[^a-z0-9]+/i, '')
      .replace(/[.:;,\-–—|]+$/, '')
      .trim();
  }

  function truncateWords(value, maxWords = 8) {
    const words = normalizeWhitespace(value).split(' ').filter(Boolean);
    return words.slice(0, maxWords).join(' ');
  }

  function scoreCandidate(candidate, { frequencies, folderTerms, earlyBonus = 0, isHeading = false }) {
    const normalized = normalizeCandidate(candidate);
    const tokens = tokenize(normalized);
    if (tokens.length < 2) return -Infinity;
    let score = earlyBonus + (isHeading ? 2.5 : 0);
    const uniqueTokens = new Set();
    tokens.forEach((token) => {
      if (STOP_WORDS.has(token)) return;
      uniqueTokens.add(token);
      score += frequencies.get(token) || 0;
      if (folderTerms.has(token)) score += 3;
    });
    if (uniqueTokens.size < 2) score -= 3;
    if (tokens.length >= 3 && tokens.length <= 8) score += 2;
    if (tokens.length > 10) score -= tokens.length - 10;
    return score;
  }

  function collectHeadingCandidates(html) {
    if (!html || typeof DOMParser === 'undefined') return [];
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    return [...doc.querySelectorAll('h1, h2, h3')]
      .map((node) => truncateWords(node.textContent || '', 8))
      .map(normalizeCandidate)
      .filter(Boolean);
  }

  function collectSentenceCandidates(text) {
    return splitSentences(text)
      .slice(0, 5)
      .map((sentence) => truncateWords(sentence, 8))
      .map(normalizeCandidate)
      .filter(Boolean);
  }

  function maybePrefixFolder(bestTitle, folderContext) {
    if (!folderContext.label) return bestTitle;
    const titleTerms = new Set(tokenize(bestTitle));
    const overlap = [...folderContext.terms].some((term) => titleTerms.has(term));
    if (overlap) return bestTitle;
    if (bestTitle.length + folderContext.label.length + 3 > 90) return bestTitle;
    return `${folderContext.label} - ${bestTitle}`;
  }

  function suggestNoteTitle({ html = '', text = '', pageTitle = '', folderPath = '' } = {}) {
    const pageTitleText = normalizeWhitespace(pageTitle);
    const textContent = normalizeWhitespace(text || stripHtml(html));
    const folderContext = getFolderContext(folderPath);
    const frequencies = buildFrequencyMap(`${pageTitleText} ${textContent}`);
    const candidates = [];

    collectHeadingCandidates(html).forEach((candidate, index) => {
      candidates.push({
        value: candidate,
        score: scoreCandidate(candidate, {
          frequencies,
          folderTerms: folderContext.terms,
          earlyBonus: Math.max(0, 3 - index),
          isHeading: true,
        }),
      });
    });

    collectSentenceCandidates(textContent).forEach((candidate, index) => {
      candidates.push({
        value: candidate,
        score: scoreCandidate(candidate, {
          frequencies,
          folderTerms: folderContext.terms,
          earlyBonus: Math.max(0, 2 - index),
        }),
      });
    });

    splitPageTitle(pageTitleText).forEach((candidate, index) => {
      candidates.push({
        value: truncateWords(candidate, 8),
        score: scoreCandidate(candidate, {
          frequencies,
          folderTerms: folderContext.terms,
          earlyBonus: Math.max(0, 1 - index),
          isHeading: index === 0,
        }),
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates.find((candidate) => candidate.score > -Infinity && candidate.value);
    const fallback = truncateWords(pageTitleText || textContent || 'Untitled', 8);
    return maybePrefixFolder(normalizeCandidate(best ? best.value : fallback) || 'Untitled', folderContext);
  }

  return {
    suggestNoteTitle,
    stripHtml,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ObsidianNlp;
} else {
  self.ObsidianNlp = ObsidianNlp;
}
