// Full-text search across every note.
// The index ({ docs: [{ p: path, t: title, s: [{ h: heading, x: text }] }] }) is built by
// search-index.js, served from /api/search-index (dev server) or static-notes/search-index.json
// (GitHub Pages), and loaded lazily the first time it's needed.

const MAX_RESULTS = 60;
const SNIPPETS_PER_RESULT = 3;
const RECENT_KEY = 'recent-searches';

let searchDocs = null;          // prepared docs once loaded
let searchIndexPromise = null;
let searchScope = 'all';
let searchResults = [];         // [{ doc, score, hits, sections }]
let selectedResult = 0;
let searchDebounce = null;

const searchOverlayEl = document.getElementById('search-overlay');
const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const searchStatusEl = document.getElementById('search-status');
const searchClearEl = document.getElementById('search-clear');

// ---------- Index loading ----------

function loadSearchIndex() {
  if (searchIndexPromise) return searchIndexPromise;
  const fetchJson = url => fetch(url).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  const staticUrl = './static-notes/search-index.json';
  // Same fallback as the notes list: dev server API first, then the static build's file
  searchIndexPromise = (window.isStaticMode ? fetchJson(staticUrl) : fetchJson('/api/search-index').catch(() => fetchJson(staticUrl)))
    .then(index => {
      searchDocs = index.docs.map(prepareDoc);
      return searchDocs;
    })
    .catch(err => {
      searchIndexPromise = null;  // allow a retry next time
      throw err;
    });
  return searchIndexPromise;
}

// Lower-case copies are computed once so each keystroke only does substring scans.
function prepareDoc(d) {
  const secs = d.s.map(s => ({ h: s.h, x: s.x, hl: s.h.toLowerCase(), xl: s.x.toLowerCase() }));
  const pl = d.p.toLowerCase();
  const tl = d.t.toLowerCase();
  return {
    path: d.p,
    title: d.t,
    pl,
    tl,
    secs,
    all: [tl, pl, ...secs.map(s => s.hl + '\n' + s.xl)].join('\n'),
  };
}

// ---------- Query parsing & ranking ----------

// Filler words dropped from unquoted queries ("count vs for_each" → count, for_each)
const STOPWORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'vs', 'versus',
  'what', 'how', 'why', 'when', 'with', 'between', 'difference', 'do', 'does', 'i', 'you']);

// Words are ANDed; "quoted text" is matched as one exact phrase. Tokens like `-i` stay literal.
function parseQuery(q) {
  const tokens = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(q.toLowerCase())) !== null) {
    const t = (m[1] || m[2]).trim();
    if (t && !tokens.some(x => x.t === t)) tokens.push({ t, quoted: !!m[1] });
  }
  const meaningful = tokens.filter(x => x.quoted || !STOPWORDS.has(x.t));
  return (meaningful.length ? meaningful : tokens).map(x => x.t);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Short terms (≤ 3 chars) must start at a word boundary, so "df" doesn't match "pdf"
// and "-i" doesn't match "multi-instance". Longer terms match anywhere (prefixes, compounds).
const isShort = t => t.length <= 3;
const termPattern = t => (isShort(t) ? `(?<![a-z0-9])${escapeRegExp(t)}` : escapeRegExp(t));

function makeMatcher(t) {
  if (!isShort(t)) return { t, has: s => s.includes(t), count: s => countOccurrences(s, t) };
  const test = new RegExp(termPattern(t));
  const all = new RegExp(termPattern(t), 'g');
  return {
    t,
    has: s => test.test(s),
    count: s => {
      all.lastIndex = 0;
      let c = 0;
      while (c < 50 && all.exec(s)) c++;
      return c;
    },
  };
}

function countOccurrences(haystack, needle, cap = 50) {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1 && count < cap) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

const termsRegex = (terms, flags) =>
  new RegExp([...terms].sort((a, b) => b.length - a.length).map(termPattern).join('|'), flags);

// Hub pages (Index.md, README.md) mention everything; rank them below the actual notes
const isHubPage = path => /(^|\/)(index|readme)\.md$/i.test(path);

function wordBoundaryRe(term) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}($|[^a-z0-9])`);
}

function inScope(path) {
  if (searchScope === 'all') return true;
  const isQna = path.startsWith('Interview Questions/');
  const isCka = path.startsWith('CKA/');
  if (searchScope === 'qna') return isQna;
  if (searchScope === 'cka') return isCka;
  return !isQna && !isCka; // 'notes'
}

function runSearch(query) {
  const terms = parseQuery(query);
  if (!terms.length || !searchDocs) return { terms, results: [], total: 0 };
  const phrase = terms.length > 1 ? query.toLowerCase().replace(/"/g, '').replace(/\s+/g, ' ').trim() : null;
  const wordRes = terms.map(wordBoundaryRe);
  const matchers = terms.map(makeMatcher);
  const results = [];

  for (const doc of searchDocs) {
    if (!inScope(doc.path)) continue;
    if (!matchers.every(mt => mt.has(doc.all))) continue;   // every term somewhere in the note

    let score = 0;
    matchers.forEach((mt, i) => {
      if (mt.has(doc.tl)) score += wordRes[i].test(doc.tl) ? 60 : 35;
      if (mt.has(doc.pl)) score += 15;
    });
    if (phrase && doc.tl.includes(phrase)) score += 40;

    let hits = 0;
    const sections = [];
    for (const sec of doc.secs) {
      let s = 0;
      let termsHit = 0;
      matchers.forEach((mt, i) => {
        const inHeading = mt.has(sec.hl);
        const c = mt.count(sec.xl);
        if (inHeading || c) termsHit++;
        if (inHeading) s += wordRes[i].test(sec.hl) ? 18 : 10;
        s += Math.min(c, 8) + (c && wordRes[i].test(sec.xl) ? 3 : 0);
        hits += c + (inHeading ? 1 : 0);
      });
      if (!termsHit) continue;
      if (termsHit === terms.length && terms.length > 1) s += 15;          // all terms in one section
      if (phrase && (sec.xl.includes(phrase) || sec.hl.includes(phrase))) s += 30;
      sections.push({ sec, score: s, complete: termsHit === terms.length });
    }
    sections.sort((a, b) => (b.complete - a.complete) || (b.score - a.score));
    score += (sections[0] ? sections[0].score : 0) + Math.log2(1 + hits) * 4;
    if (isHubPage(doc.path)) score *= 0.6;
    results.push({ doc, score, hits, sections: sections.slice(0, SNIPPETS_PER_RESULT) });
  }

  results.sort((a, b) => b.score - a.score);
  return { terms, results: results.slice(0, MAX_RESULTS), total: results.length };
}

// ---------- Rendering ----------

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function highlightHtml(text, terms) {
  if (!terms.length) return escapeHtml(text);
  const re = new RegExp(`(${termsRegex(terms).source})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part))).join('');
}

// ~200 characters of context around the first matching term in a section
function makeSnippet(sec, terms) {
  const text = sec.x.replace(/\s+/g, ' ');
  const first = termsRegex(terms, 'i').exec(text);
  const idx = first ? first.index : -1;
  if (idx === -1) return escapeHtml(text.slice(0, 160)) + (text.length > 160 ? '…' : '');
  let start = Math.max(0, idx - 70);
  if (start > 0) {
    const sp = text.indexOf(' ', start);
    if (sp !== -1 && sp < idx) start = sp + 1;
  }
  const end = Math.min(text.length, idx + 150);
  return (start > 0 ? '…' : '') + highlightHtml(text.slice(start, end), terms) + (end < text.length ? '…' : '');
}

function renderEmptyState() {
  const recent = getRecentSearches();
  const examples = ['df -i', 'OOMKilled', '"blue-green"', 'terraform state lock', 'p99 latency', 'LRU cache'];
  const chips = list => list.map(q => `<button type="button" class="query-chip" data-query="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
  searchResultsEl.innerHTML = `
    <div class="search-empty">
      ${recent.length ? `<div class="search-empty-title">Recent</div><div class="query-chips">${chips(recent)}</div>` : ''}
      <div class="search-empty-title">Try</div>
      <div class="query-chips">${chips(examples)}</div>
      <p class="search-tip">Searches the full text of every note: headings, prose, tables and code blocks. All words must match; wrap text in quotes for an exact phrase.</p>
    </div>`;
  searchStatusEl.textContent = searchDocs ? `${searchDocs.length} notes indexed` : '';
}

function renderResults(query) {
  const t0 = performance.now();
  const { terms, results, total } = runSearch(query);
  const ms = Math.max(1, Math.round(performance.now() - t0));
  searchResults = results;
  selectedResult = 0;

  if (!results.length) {
    searchResultsEl.innerHTML = `<div class="search-empty"><p class="search-tip">No notes contain ${terms.map(t => `<mark>${escapeHtml(t)}</mark>`).join(' + ')}${searchScope !== 'all' ? ' in this section — try <b>All</b>' : ''}.</p></div>`;
    searchStatusEl.textContent = `0 results · ${ms} ms`;
    return;
  }

  const totalHits = results.reduce((n, r) => n + r.hits, 0);
  searchStatusEl.textContent = `${total} note${total === 1 ? '' : 's'}${total > results.length ? ` (top ${results.length})` : ''} · ${totalHits} matches · ${ms} ms`;

  searchResultsEl.innerHTML = results.map((r, i) => {
    const folder = r.doc.path.includes('/') ? r.doc.path.slice(0, r.doc.path.lastIndexOf('/')) : '';
    const icon = getFileIconClass(r.doc.path.split('/').pop(), r.doc.path);
    const snippets = r.sections.map((s, j) => `
      <div class="result-snippet" data-result="${i}" data-section="${j}">
        ${s.sec.h ? `<div class="snippet-heading"><i class="fa-solid fa-hashtag"></i>${highlightHtml(s.sec.h, terms)}</div>` : ''}
        <div class="snippet-text">${makeSnippet(s.sec, terms)}</div>
      </div>`).join('');
    return `
      <div class="search-result${i === 0 ? ' selected' : ''}" data-result="${i}" role="option">
        <div class="result-head" data-result="${i}">
          <i class="${icon} result-icon"></i>
          <div class="result-titles">
            <div class="result-title">${highlightHtml(r.doc.title, terms)}</div>
            ${folder ? `<div class="result-path">${highlightHtml(folder, terms)}</div>` : ''}
          </div>
          <span class="result-count" title="matches in this note">${r.hits}</span>
        </div>
        ${snippets}
      </div>`;
  }).join('');
}

function updateSelection(index, scroll = true) {
  const items = searchResultsEl.querySelectorAll('.search-result');
  if (!items.length) return;
  selectedResult = (index + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle('selected', i === selectedResult));
  if (scroll) items[selectedResult].scrollIntoView({ block: 'nearest' });
}

// ---------- Open / close ----------

function openSearch(prefill) {
  searchOverlayEl.hidden = false;
  document.body.classList.add('search-open');
  if (typeof prefill === 'string') searchInputEl.value = prefill;
  searchInputEl.focus();
  searchInputEl.select();
  searchClearEl.hidden = !searchInputEl.value;

  if (!searchDocs) {
    searchResultsEl.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;
    searchStatusEl.textContent = 'Loading search index…';
  }
  loadSearchIndex()
    .then(() => (searchInputEl.value.trim() ? renderResults(searchInputEl.value) : renderEmptyState()))
    .catch(err => {
      console.error(err);
      searchResultsEl.innerHTML = `<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Couldn't load the search index (${escapeHtml(err.message)}). Run <code>npm run build</code> for the static site.</div>`;
      searchStatusEl.textContent = '';
    });
}

function closeSearch() {
  searchOverlayEl.hidden = true;
  document.body.classList.remove('search-open');
}

function openResult(resultIndex, sectionIndex = 0) {
  const r = searchResults[resultIndex];
  if (!r) return;
  const sec = r.sections[sectionIndex] || r.sections[0];
  const terms = parseQuery(searchInputEl.value);
  saveRecentSearch(searchInputEl.value.trim());
  closeSearch();
  loadNote(r.doc.path, { terms, heading: sec ? sec.sec.h : '' });
}

// ---------- Recent searches (per browser, best effort) ----------

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveRecentSearch(q) {
  if (!q) return;
  try {
    const list = [q, ...getRecentSearches().filter(x => x !== q)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (e) {
    // storage unavailable (private mode): recent searches just won't persist
  }
}

// ---------- Highlighting inside an opened note ----------

let noteMarks = [];
let currentMark = -1;
const findBarEl = document.getElementById('find-bar');

function clearNoteHighlights() {
  noteMarks.forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
  if (noteMarks.length) noteContentEl.normalize();
  noteMarks = [];
  currentMark = -1;
  findBarEl.hidden = true;
}

const normalizeHeading = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function highlightInNote(terms, heading) {
  clearNoteHighlights();
  if (!terms || !terms.length) return;
  const re = termsRegex(terms, 'gi');

  const walker = document.createTreeWalker(noteContentEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!node.nodeValue.trim() || !p || p.closest('.mermaid, svg, script, style, mark.search-hit')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const text = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.textContent = m[0];
      frag.appendChild(mark);
      noteMarks.push(mark);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
    if (noteMarks.length > 2000) break;
  }
  if (!noteMarks.length) return;

  // Start at the first hit inside the section the result came from
  let start = 0;
  if (heading) {
    const target = normalizeHeading(heading);
    const h = [...noteContentEl.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .find(el => normalizeHeading(el.textContent) === target);
    if (h) {
      const i = noteMarks.findIndex(mk => h === mk || h.contains(mk) || (h.compareDocumentPosition(mk) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (i !== -1) start = i;
    }
  }
  document.getElementById('find-query').textContent = terms.join(' ');
  findBarEl.hidden = false;
  gotoMark(start);
}

function gotoMark(i) {
  if (!noteMarks.length) return;
  if (currentMark >= 0 && noteMarks[currentMark]) noteMarks[currentMark].classList.remove('current');
  currentMark = (i + noteMarks.length) % noteMarks.length;
  const mark = noteMarks[currentMark];
  mark.classList.add('current');
  mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  document.getElementById('find-count').textContent = `${currentMark + 1} / ${noteMarks.length}`;
}

// ---------- Wiring ----------

function setupSearch() {
  document.getElementById('search-trigger').addEventListener('click', () => openSearch());
  document.getElementById('header-search').addEventListener('click', () => openSearch());
  document.getElementById('search-close').addEventListener('click', closeSearch);

  // Click outside the panel closes it
  searchOverlayEl.addEventListener('mousedown', e => {
    if (e.target === searchOverlayEl) closeSearch();
  });

  searchInputEl.addEventListener('input', () => {
    searchClearEl.hidden = !searchInputEl.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (!searchDocs) return;
      if (searchInputEl.value.trim()) renderResults(searchInputEl.value);
      else renderEmptyState();
    }, 90);
  });

  searchClearEl.addEventListener('click', () => {
    searchInputEl.value = '';
    searchClearEl.hidden = true;
    searchInputEl.focus();
    if (searchDocs) renderEmptyState();
  });

  searchInputEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); updateSelection(selectedResult + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); updateSelection(selectedResult - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); openResult(selectedResult); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  });

  document.getElementById('search-scopes').addEventListener('click', e => {
    const chip = e.target.closest('.scope-chip');
    if (!chip) return;
    searchScope = chip.dataset.scope;
    document.querySelectorAll('.scope-chip').forEach(c => c.classList.toggle('active', c === chip));
    searchInputEl.focus();
    if (searchDocs) (searchInputEl.value.trim() ? renderResults(searchInputEl.value) : renderEmptyState());
  });

  searchResultsEl.addEventListener('click', e => {
    const chip = e.target.closest('.query-chip');
    if (chip) {
      searchInputEl.value = chip.dataset.query;
      searchClearEl.hidden = false;
      renderResults(searchInputEl.value);
      searchInputEl.focus();
      return;
    }
    const snippet = e.target.closest('.result-snippet');
    if (snippet) return openResult(+snippet.dataset.result, +snippet.dataset.section);
    const result = e.target.closest('.search-result');
    if (result) openResult(+result.dataset.result);
  });

  searchResultsEl.addEventListener('mousemove', e => {
    const result = e.target.closest('.search-result');
    if (result && +result.dataset.result !== selectedResult) updateSelection(+result.dataset.result, false);
  });

  // Global shortcuts: Cmd/Ctrl+K anywhere, "/" when not typing; Esc clears note highlights
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchOverlayEl.hidden ? openSearch() : closeSearch();
    } else if (!searchOverlayEl.hidden) {
      if (e.key === 'Escape') closeSearch();
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      openSearch();
    } else if (typing || findBarEl.hidden) {
      return;
    } else if (e.key === 'Escape') {
      clearNoteHighlights();
    } else if (e.key === 'Enter' && document.activeElement === document.body) {
      e.preventDefault();
      gotoMark(currentMark + (e.shiftKey ? -1 : 1));
    }
  });

  document.getElementById('find-next').addEventListener('click', () => gotoMark(currentMark + 1));
  document.getElementById('find-prev').addEventListener('click', () => gotoMark(currentMark - 1));
  document.getElementById('find-close').addEventListener('click', clearNoteHighlights);

  // Show Ctrl+K instead of ⌘K off macOS
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
    document.querySelectorAll('.kbd-hint').forEach(k => { k.textContent = 'Ctrl K'; });
  }

  // Warm the index in the background once the page is idle
  const warm = () => loadSearchIndex().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(() => setTimeout(warm, 1500));
  else setTimeout(warm, 3000);
}
