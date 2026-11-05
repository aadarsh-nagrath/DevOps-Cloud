const fs = require('fs');
const path = require('path');

// Turn a markdown string into searchable plain text. Code is kept (people
// search for commands like `df -i`), only the markdown syntax is removed.
function stripMarkdown(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // real HTML tags only; placeholders like <pid> or <node-name> are searchable text
    .replace(/<\/?(a|b|i|u|p|br|hr|div|span|img|em|strong|code|pre|kbd|sub|sup|small|center|details|summary|table|thead|tbody|tr|td|th|ul|ol|li|h[1-6]|blockquote|iframe|video|source|picture)\b[^>]*>/gi, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')       // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // links -> link text
    .replace(/^\s{0,3}>\s?/gm, '')                  // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '')                  // bullets
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, ' ') // table separator rows
    .replace(/\|/g, ' ')                            // table cells
    .replace(/(\*\*|__|~~|`)/g, '')                 // bold, strike, inline code
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:!?)])/g, '$1$2') // single * or _ emphasis
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function cleanHeading(text) {
  return stripMarkdown(text).replace(/\s+/g, ' ').trim();
}

// Split one note into sections at each heading (ignoring "#" lines inside code fences).
function buildDoc(relPath, md) {
  const sections = [];
  let current = { h: '', lines: [] };
  let inFence = false;
  let title = '';

  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      // drop the fence marker itself; keep the code inside
      continue;
    }
    const m = !inFence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) {
      sections.push(current);
      const h = cleanHeading(m[2]);
      if (!title && m[1].length === 1) title = h;
      current = { h, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  const secs = sections
    .map(s => ({ h: s.h, x: stripMarkdown(s.lines.join('\n')) }))
    .filter(s => s.h || s.x);

  return {
    p: relPath,
    t: title || path.basename(relPath).replace(/\.md$/i, ''),
    s: secs,
  };
}

// notes: [{ path }] relative to repoRoot (forward slashes)
function buildSearchIndex(repoRoot, notes) {
  const docs = [];
  for (const note of notes) {
    try {
      const md = fs.readFileSync(path.join(repoRoot, note.path), 'utf-8');
      docs.push(buildDoc(note.path.split(path.sep).join('/'), md));
    } catch (e) {
      // unreadable file: skip it rather than failing the whole index
    }
  }
  return { v: 1, generated: new Date().toISOString(), docs };
}

module.exports = { buildSearchIndex, buildDoc, stripMarkdown };
