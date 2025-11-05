// ==== CONFIG ====
// Cloudflare Worker base (no trailing slash at the end here)
const WORKER_BASE = 'https://inquirybase.archiverepo1.workers.dev';

// Verified running South African DSpace repositories (OAI-PMH)
const REPOSITORIES = [
  { id:'uct',   name:'Open UCT',                 type:'articles', oai:'https://open.uct.ac.za/oai/request',        handleBase:'https://open.uct.ac.za/handle/',             handlePrefixes:['11427'] },
  { id:'sun',   name:'SUNScholar',               type:'articles', oai:'https://scholar.sun.ac.za/oai/request',     handleBase:'https://scholar.sun.ac.za/handle/',          handlePrefixes:['10019.1'] },
  { id:'up',    name:'UPSpace',                  type:'articles', oai:'https://repository.up.ac.za/oai/request',   handleBase:'https://repository.up.ac.za/handle/',        handlePrefixes:['2263'] },
  { id:'ufs',   name:'KovsieScholar',            type:'articles', oai:'https://scholar.ufs.ac.za/oai/request',     handleBase:'https://scholar.ufs.ac.za/handle/',          handlePrefixes:['11660'] },
  { id:'unisa', name:'UNISA IR',                 type:'articles', oai:'https://uir.unisa.ac.za/oai/request',       handleBase:'https://uir.unisa.ac.za/handle/',            handlePrefixes:['10500'] },
  { id:'spu',   name:'SPU OpenHub',              type:'articles', oai:'https://openhub.spu.ac.za/oai/request',     handleBase:'https://openhub.spu.ac.za/handle/',          handlePrefixes:['10394'] },
  { id:'cut',   name:'CUTScholar',               type:'articles', oai:'https://cutscholar.cut.ac.za/oai/request',  handleBase:'https://cutscholar.cut.ac.za/handle/',       handlePrefixes:['11462'] },
  { id:'dut',   name:'DUT OpenScholar',          type:'articles', oai:'https://openscholar.dut.ac.za/oai/request', handleBase:'https://openscholar.dut.ac.za/handle/',      handlePrefixes:['10321'] },
];

// How many records to pull (per repo) on a harvest click:
const PAGE_SIZE = 50;        // OAI ListRecords chunk size (if supported by server)
const MAX_RECORDS_PER_REPO = 150; // safety cap per source

// ==== DOM HOOKS ====
const els = {};
document.addEventListener('DOMContentLoaded', () => {
  // Top controls
  els.searchInput = document.querySelector('.search-input');
  els.searchButton = document.querySelector('.search-button');
  els.sourceButtons = document.querySelectorAll('.source-button');
  els.advancedToggle = document.querySelector('.advanced-toggle');
  els.advancedSearch = document.querySelector('.advanced-search');
  els.booleanOptions = document.querySelectorAll('.boolean-option');
  els.applyAdvanced = document.getElementById('applyAdvanced');

  // Results & actions
  els.resultsSection = document.querySelector('.results-section');
  els.harvestButton = document.querySelector('.harvest-button');
  els.clearButton = document.querySelector('.clear-button');
  els.progressBar = document.querySelector('.progress');
  els.harvestStatus = document.querySelector('.harvest-status');

  // Filters & paging
  els.yearFilter = document.getElementById('yearFilter');
  els.sourceFilter = document.getElementById('sourceFilter');
  els.typeFilter = document.getElementById('typeFilter');
  els.sortFilter = document.getElementById('sortFilter');
  els.searchInResults = document.getElementById('searchInResults');
  els.searchInResultsButton = document.getElementById('searchInResultsButton');
  els.resultsCount = document.getElementById('resultsCount');

  els.pagination = document.getElementById('pagination');
  els.firstPage = document.getElementById('firstPage');
  els.prevPage = document.getElementById('prevPage');
  els.nextPage = document.getElementById('nextPage');
  els.lastPage = document.getElementById('lastPage');
  els.pageInfo = document.getElementById('pageInfo');
  els.resetFilters = document.querySelector('.reset-filters');

  // Cards container
  els.dataCardsContainer = document.getElementById('dataCardsContainer');

  // State
  stateInit();

  // Listeners
  wireEvents();

  // Fill filters
  initFilters();
});

const state = {
  allData: [],
  filteredData: [],
  currentPage: 1,
  pageSize: 12,
  totalPages: 1,
  isHarvesting: false,
  currentType: 'all',
};

// ==== State / UI wiring =====
function stateInit() {
  state.allData = [];
  state.filteredData = [];
  state.currentPage = 1;
  state.totalPages = 1;
  state.isHarvesting = false;
  state.currentType = 'all';
}

function wireEvents() {
  // Advanced toggle
  els.advancedToggle.addEventListener('click', () => els.advancedSearch.classList.toggle('active'));
  els.booleanOptions.forEach(btn => btn.addEventListener('click', () => {
    els.booleanOptions.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }));
  if (els.applyAdvanced) {
    els.applyAdvanced.addEventListener('click', () => applyFilters(true));
  }

  // Search box
  els.searchButton.addEventListener('click', performSearch);
  els.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });

  // Source buttons
  els.sourceButtons.forEach(b => b.addEventListener('click', (e) => {
    els.sourceButtons.forEach(x => x.classList.remove('active'));
    e.currentTarget.classList.add('active');
    state.currentType = e.currentTarget.dataset.type || 'all';
    applyFilters();
  }));

  // Harvest & clear
  els.harvestButton.addEventListener('click', startHarvest);
  els.clearButton.addEventListener('click', clearResults);

  // Filters
  els.yearFilter.addEventListener('change', applyFilters);
  els.sourceFilter.addEventListener('change', applyFilters);
  els.typeFilter.addEventListener('change', applyFilters);
  els.sortFilter.addEventListener('change', applyFilters);
  els.resetFilters.addEventListener('click', resetFilters);

  // Search within results
  els.searchInResultsButton.addEventListener('click', searchWithinResults);
  els.searchInResults.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchWithinResults(); });

  // Pagination
  els.firstPage.addEventListener('click', () => goToPage(1));
  els.prevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
  els.nextPage.addEventListener('click', () => goToPage(state.currentPage + 1));
  els.lastPage.addEventListener('click', () => goToPage(state.totalPages));

  // Card action delegation
  els.dataCardsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.card-action');
    if (!btn) return;
    const card = btn.closest('.data-card');
    if (!card) return;
    const id = card.dataset.itemId;
    const action = btn.dataset.action;
    handleCardAction(action, id);
  });
}

function initFilters() {
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= 1980; y--) {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = y;
    els.yearFilter.appendChild(o);
  }
  // Sources
  const unique = REPOSITORIES.map(r => r.name);
  unique.forEach(name => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    els.sourceFilter.appendChild(o);
  });
}

// ==== Harvest logic (OAI-PMH oai_dc) ====
async function startHarvest() {
  if (state.isHarvesting) {
    alert('Harvest is already running');
    return;
  }
  state.isHarvesting = true;
  els.resultsSection.classList.add('active');
  els.harvestStatus.textContent = 'Starting harvest...';
  setProgress(0);

  try {
    // Clear previous
    state.allData = [];
    updateResultsDisplay();

    const sources = getSourcesByType(state.currentType);
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      els.harvestStatus.textContent = `Harvesting from ${s.name}...`;
      setProgress(Math.round((i / sources.length) * 80));

      const items = await harvestRepository(s);
      state.allData = state.allData.concat(items);
      updateResultsDisplay();
    }

    els.harvestStatus.textContent = `Harvest complete! Collected ${state.allData.length} records.`;
    setProgress(100);
  } catch (err) {
    console.error('Harvest error:', err);
    els.harvestStatus.textContent = 'Harvest failed. Check console.';
  }
  state.isHarvesting = false;
}

function getSourcesByType(type) {
  if (type === 'all') return REPOSITORIES;
  // DSpace here all are "articles" or "theses" buckets; we keep "articles" default
  return REPOSITORIES.filter(r => r.type === type);
}

async function harvestRepository(repo) {
  const out = [];
  let endpoint = `${repo.oai}?verb=ListRecords&metadataPrefix=oai_dc`;
  let fetched = 0;

  while (endpoint && fetched < MAX_RECORDS_PER_REPO) {
    const url = buildProxyUrl(endpoint);
    const res = await fetch(url, { headers: { 'Accept': 'application/xml' }});
    if (!res.ok) throw new Error(`Fetch failed ${res.status} at ${repo.name}`);
    const xmlText = await res.text();
    const { records, resumptionToken } = parseOaiListRecords(xmlText, repo);

    out.push(...records);
    fetched += records.length;

    if (resumptionToken && fetched < MAX_RECORDS_PER_REPO) {
      endpoint = `${repo.oai}?verb=ListRecords&resumptionToken=${encodeURIComponent(resumptionToken)}`;
      await delay(250);
    } else {
      endpoint = null;
    }
  }
  return out;
}

function buildProxyUrl(target) {
  return `${WORKER_BASE}/api/proxy?url=${encodeURIComponent(target)}`;
}

function parseOaiListRecords(xmlText, repo) {
  // Parse XML robustly (namespace-insensitive)
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');

  const errorNode = xml.querySelector('error');
  if (errorNode) {
    console.warn('OAI error:', errorNode.textContent);
    return { records: [], resumptionToken: null };
  }

  const recNodes = xml.getElementsByTagName('record');
  const records = [];
  for (let i = 0; i < recNodes.length; i++) {
    const rec = recNodes[i];
    const md = rec.getElementsByTagName('metadata')[0];
    if (!md) continue;

    // dc fields (oai_dc:dc)
    const dc = md.getElementsByTagNameNS('*', 'dc')[0] || md.querySelector('dc');
    if (!dc) continue;

    const title = findFirst(dc, ['title']) || 'Untitled';
    const creators = findAll(dc, ['creator']);
    const description = truncate((findFirst(dc, ['description']) || '').replace(/\s+/g, ' ').trim(), 400);
    const date = findFirst(dc, ['date']);
    const year = extractYear(date);

    const identifiers = findAll(dc, ['identifier']);
    const { url, idType, idValue, downloadUrl } = pickBestIdentifier(identifiers, repo);

    // Type: try subject/type else default "articles"
    const dcType = (findFirst(dc, ['type']) || '').toLowerCase().includes('thes') ? 'theses' : 'articles';

    records.push({
      id: `${repo.id}-${hashId(url || idValue || title)}-${i}`,
      title,
      authors: creators.length ? creators : ['Unknown'],
      description: description || `Record from ${repo.name}`,
      keywords: [], // OAI-Dublin core sometimes provides subjects; you can add: findAll(dc, ['subject'])
      year: year || '',
      source: repo.name,
      type: dcType,
      identifier: idValue || '',
      identifierType: idType || '',
      url: url || '',
      downloadUrl: downloadUrl || ''
    });
  }

  const tokenNode = xml.getElementsByTagName('resumptionToken')[0];
  const resumptionToken = tokenNode ? (tokenNode.textContent || '').trim() : null;

  return { records, resumptionToken };
}

function findFirst(dcNode, localNames) {
  for (const name of localNames) {
    const el = dcNode.getElementsByTagNameNS('*', name)[0] || dcNode.getElementsByTagName(name)[0];
    if (el && el.textContent) return el.textContent.trim();
  }
  return null;
}
function findAll(dcNode, localNames) {
  const out = [];
  for (const name of localNames) {
    const list = dcNode.getElementsByTagNameNS('*', name);
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) {
        const t = (list[i].textContent || '').trim();
        if (t) out.push(t);
      }
    }
    const list2 = dcNode.getElementsByTagName(name);
    if (list2 && list2.length) {
      for (let i = 0; i < list2.length; i++) {
        const t = (list2[i].textContent || '').trim();
        if (t) out.push(t);
      }
    }
  }
  return out;
}

function extractYear(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/(19|20)\d{2}/);
  return m ? m[0] : '';
}

function pickBestIdentifier(identifiers, repo) {
  // Prefer DOI, then full http(s) links to item, then handle patterns, then repo handleBase + suffix
  let doi = null;
  let fullUrl = null;
  let handleShort = null;

  const doiRe = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i;
  const doiUrlRe = /^https?:\/\/(dx\.)?doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i;
  const urlRe = /^https?:\/\/.+/i;

  const handleFullRe = /^https?:\/\/hdl\.handle\.net\/(.+?)$/i;
  const repoHandleFullRe = /^https?:\/\/[^\/]+\/handle\/(.+?)$/i; // direct repo handle URL
  const handleShortRe = new RegExp(`^(${repo.handlePrefixes.map(escapeRegExp).join('|')})\\/\\d+`, 'i');

  for (const id of identifiers) {
    const s = id.trim();

    // DOI URL
    const durl = s.match(doiUrlRe);
    if (durl) {
      return { url: `https://doi.org/${durl[2]}`, idType: 'DOI', idValue: durl[2], downloadUrl: '' };
    }
  }
  for (const id of identifiers) {
    const s = id.trim();

    // DOI bare
    if (doiRe.test(s)) {
      doi = s;
      return { url: `https://doi.org/${doi}`, idType: 'DOI', idValue: doi, downloadUrl: '' };
    }
  }
  for (const id of identifiers) {
    const s = id.trim();

    // Full repo item URL (already a handle page)
    const rfull = s.match(repoHandleFullRe);
    if (rfull) {
      return { url: s, idType: 'Handle', idValue: rfull[1], downloadUrl: '' };
    }
    const hfull = s.match(handleFullRe);
    if (hfull) {
      // convert to repository handle if possible (prefer local handle page)
      const hv = hfull[1]; // e.g. 2263/12345
      if (isKnownHandlePrefix(hv, repo)) {
        return { url: repo.handleBase + hv, idType: 'Handle', idValue: hv, downloadUrl: '' };
      }
      // else keep hdl handle
      return { url: `https://hdl.handle.net/${hv}`, idType: 'Handle', idValue: hv, downloadUrl: '' };
    }
  }
  for (const id of identifiers) {
    const s = id.trim();

    // Plain short handle like "2263/12345"
    if (handleShortRe.test(s)) {
      handleShort = s;
      return { url: repo.handleBase + handleShort, idType: 'Handle', idValue: handleShort, downloadUrl: '' };
    }

    // Any direct URL to an item
    if (urlRe.test(s)) {
      fullUrl = s;
      // If it's a file link, keep it as download
      const isBitstream = /bitstream|download/i.test(s);
      return { url: fullUrl, idType: 'URL', idValue: fullUrl, downloadUrl: isBitstream ? fullUrl : '' };
    }
  }

  // Fallback: nothing recognized
  return { url: '', idType: '', idValue: '', downloadUrl: '' };
}

function isKnownHandlePrefix(handleValue, repo) {
  // handleValue like "2263/12345"
  const prefix = (handleValue.split('/')[0] || '').trim();
  return repo.handlePrefixes.some(p => p.toLowerCase() === prefix.toLowerCase());
}

function hashId(s) {
  let h = 0, i, chr;
  const str = s || (Math.random() + '');
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    h = ((h << 5) - h) + chr;
    h |= 0;
  }
  return Math.abs(h);
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

function setProgress(pct) { els.progressBar.style.width = `${pct}%`; }

// ==== Search & Filters & Display ====
function performSearch() {
  // Simple front-end filter over harvested data
  const q = (els.searchInput.value || '').toLowerCase().trim();
  if (!q) { applyFilters(); return; }

  els.resultsSection.classList.add('active');
  state.filteredData = state.allData.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    (item.authors || []).some(a => a.toLowerCase().includes(q))
  );
  state.currentPage = 1;
  updateResultsDisplay();
}

function applyFilters(fromAdvanced = false) {
  let list = [...state.allData];

  // Content type (articles/theses)
  if (state.currentType !== 'all') {
    list = list.filter(x => x.type === state.currentType);
  }

  // Sidebar filters
  const y = els.yearFilter.value;
  if (y) list = list.filter(x => String(x.year) === y);

  const s = els.sourceFilter.value;
  if (s) list = list.filter(x => x.source === s);

  const t = els.typeFilter.value;
  if (t) list = list.filter(x => x.type === t);

  // Advanced (basic boolean simulation)
  if (fromAdvanced) {
    const titleKey = (document.getElementById('advTitle').value || '').toLowerCase().trim();
    const authorKey = (document.getElementById('advAuthor').value || '').toLowerCase().trim();
    const subjectKey = (document.getElementById('advSubject').value || '').toLowerCase().trim();
    const op = document.querySelector('.boolean-option.active')?.dataset?.operator || 'AND';

    list = list.filter(item => {
      const hits = [];
      if (titleKey) hits.push(item.title.toLowerCase().includes(titleKey));
      if (authorKey) hits.push((item.authors || []).some(a => a.toLowerCase().includes(authorKey)));
      if (subjectKey) hits.push((item.keywords || []).some(k => k.toLowerCase().includes(subjectKey)));
      if (!hits.length) return true;
      if (op === 'AND') return hits.every(Boolean);
      if (op === 'OR')  return hits.some(Boolean);
      if (op === 'NOT') return hits.every(v => !v);
      return true;
    });
  }

  // Sort
  const sortBy = els.sortFilter.value;
  if (sortBy === 'year') list.sort((a,b)=> (b.year||0)-(a.year||0));
  else if (sortBy === 'year_asc') list.sort((a,b)=> (a.year||0)-(b.year||0));
  else if (sortBy === 'title') list.sort((a,b)=> (a.title||'').localeCompare(b.title||''));

  state.filteredData = list;
  state.currentPage = 1;
  updateResultsDisplay();
}

function resetFilters() {
  els.yearFilter.value = '';
  els.sourceFilter.value = '';
  els.typeFilter.value = '';
  els.sortFilter.value = 'relevance';
  els.searchInResults.value = '';
  document.getElementById('advTitle').value = '';
  document.getElementById('advAuthor').value = '';
  document.getElementById('advDate').value = '';
  document.getElementById('advSubject').value = '';
  applyFilters();
}

function searchWithinResults() {
  const q = (els.searchInResults.value || '').toLowerCase().trim();
  if (!q) { state.filteredData = [...state.allData]; updateResultsDisplay(); return; }
  state.filteredData = state.allData.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    (item.authors || []).some(a => a.toLowerCase().includes(q))
  );
  state.currentPage = 1;
  updateResultsDisplay();
}

function updateResultsDisplay() {
  state.totalPages = Math.max(1, Math.ceil(state.filteredData.length / state.pageSize));
  els.resultsCount.textContent = `${state.filteredData.length.toLocaleString()} results`;
  displayCurrentPage();
  updatePaginationControls();
}

function displayCurrentPage() {
  const start = (state.currentPage - 1) * state.pageSize;
  const end = start + state.pageSize;
  const pageData = state.filteredData.slice(start, end);
  renderCards(pageData);
}

function updatePaginationControls() {
  els.firstPage.disabled = state.currentPage === 1;
  els.prevPage.disabled = state.currentPage === 1;
  els.nextPage.disabled = state.currentPage === state.totalPages;
  els.lastPage.disabled = state.currentPage === state.totalPages;
  els.pageInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
  els.pagination.style.display = state.totalPages <= 1 ? 'none' : 'flex';
}

function goToPage(page) {
  if (page < 1 || page > state.totalPages) return;
  state.currentPage = page;
  displayCurrentPage();
  updatePaginationControls();
}

function renderCards(data) {
  els.dataCardsContainer.innerHTML = '';
  if (!data.length) {
    els.dataCardsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <h3>No results found</h3>
        <p>Try adjusting your filters or harvest more data</p>
      </div>`;
    return;
  }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'data-card';
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <div class="card-header">
        <div class="card-type">${(item.type || 'ARTICLES').toUpperCase()}</div>
        <div class="card-source">${item.source || ''}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.title || 'Untitled')}</h3>
        <div class="card-authors">${escapeHtml((item.authors || []).join(', ') || 'Unknown')}</div>
        <p class="card-description">${escapeHtml(item.description || '')}</p>
        <div class="card-keywords"></div>
      </div>
      <div class="card-footer">
        <div class="card-meta">
          <span><i class="far fa-calendar"></i> ${item.year || ''}</span>
          ${item.identifier ? `<span>${item.identifierType || 'ID'}: <a class="doi-link" href="${item.url || '#'}" target="_blank" rel="noopener">${escapeHtml(item.identifier)}</a></span>` : ''}
        </div>
        <div class="card-actions">
          <button class="card-action" data-action="view" title="View"><i class="fas fa-eye"></i></button>
          <button class="card-action" data-action="download" title="Download"><i class="fas fa-download"></i></button>
          <button class="card-action" data-action="zotero" title="Save to Zotero"><i class="fas fa-bookmark"></i></button>
        </div>
      </div>
    `;
    els.dataCardsContainer.appendChild(card);
  });
}

function handleCardAction(action, id) {
  const item = state.allData.find(x => x.id === id);
  if (!item) return;
  if (action === 'view') {
    if (item.url) window.open(item.url, '_blank', 'noopener');
    else alert('No URL available');
  } else if (action === 'download') {
    if (item.downloadUrl) window.open(item.downloadUrl, '_blank','noopener');
    else if (item.url) window.open(item.url, '_blank','noopener');
    else alert('No download URL available');
  } else if (action === 'zotero') {
    const target = item.url || (item.identifierType === 'DOI' ? `https://doi.org/${item.identifier}` : '');
    if (!target) return alert('Nothing to save');
    const z = `https://www.zotero.org/select/items?uri=${encodeURIComponent(target)}`;
    window.open(z, '_blank', 'noopener');
  }
}

function escapeHtml(s){
  return (s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
