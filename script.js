/* Q Data – front-end harvester (standalone)
 * - Uses Cloudflare Worker proxy for CORS: https://inquirybase.archiverepo1.workers.dev/api/proxy?url=...
 * - Harvests: Zenodo, Figshare, OSF, Dryad, Mendeley Data (JSON)
 *             OpenUCT, SUNScholar, UP, UFS, UNISA (OAI-PMH oai_dc XML)
 * - Keeps the existing HTML structure intact.
 */

// ========= CONFIG =========
const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev';
const PROXY = (u) => `${WORKER_URL}/api/proxy?url=${encodeURIComponent(u)}`;

// Base URLs to resolve handle identifiers to institutional repository pages
const HANDLE_PREFIX_MAP = {
  'Open UCT':      'https://open.uct.ac.za/handle/11427/',
  'SUNScholar':    'https://scholar.sun.ac.za/handle/10019.1/',
  'UP Repository': 'https://repository.up.ac.za/handle/2263/',
  'UFS Scholar':   'https://scholar.ufs.ac.za/handle/11660/',
  'UNISA DSpace':  'https://uir.unisa.ac.za/handle/10500/'
};

// ========= APP =========
class QDataHarvester {
  constructor() {
    // State
    this.allData = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.pageSize = 12;
    this.totalPages = 1;
    this.isHarvesting = false;
    this.currentSourceType = 'all';

    // UI
    this.cacheEls();
    this.bindEvents();
    this.initFilters();
    this.loadFromStorage();
  }

  cacheEls() {
    // Search / toggles
    this.searchInput = document.querySelector('.search-input');
    this.searchButton = document.querySelector('.search-button');
    this.sourceButtons = document.querySelectorAll('.source-button');
    this.advancedToggle = document.querySelector('.advanced-toggle');
    this.advancedSearch = document.querySelector('.advanced-search');
    this.booleanOptions = document.querySelectorAll('.boolean-option');

    // Results / status
    this.resultsSection = document.querySelector('.results-section');
    this.harvestButton = document.querySelector('.harvest-button');
    this.clearButton = document.querySelector('.clear-button');
    this.progressBar = document.querySelector('.progress');
    this.harvestStatus = document.querySelector('.harvest-status');

    // Filters / pagination
    this.dataCardsContainer = document.getElementById('dataCardsContainer');
    this.resultsCount = document.getElementById('resultsCount');
    this.yearFilter = document.getElementById('yearFilter');
    this.sourceFilter = document.getElementById('sourceFilter');
    this.typeFilter = document.getElementById('typeFilter');
    this.sortFilter = document.getElementById('sortFilter');
    this.searchInResults = document.getElementById('searchInResults');
    this.searchInResultsButton = document.getElementById('searchInResultsButton');
    this.resetFiltersBtn = document.querySelector('.reset-filters');

    this.pagination = document.getElementById('pagination');
    this.firstPageBtn = document.getElementById('firstPage');
    this.prevPageBtn = document.getElementById('prevPage');
    this.nextPageBtn = document.getElementById('nextPage');
    this.lastPageBtn = document.getElementById('lastPage');
    this.pageInfo = document.getElementById('pageInfo');

    // Misc
    this.emailButton = document.querySelector('.email-button');
  }

  bindEvents() {
    // Search
    this.searchButton.addEventListener('click', () => this.performSearch());
    this.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.performSearch(); });

    // Source buttons (also trigger harvest for UX)
    this.sourceButtons.forEach(btn => {
      btn.addEventListener('click', e => {
        this.sourceButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentSourceType = e.currentTarget.dataset.type;
        this.startHarvest(this.currentSourceType);
      });
    });

    // Advanced UI
    this.advancedToggle.addEventListener('click', () => this.advancedSearch.classList.toggle('active'));
    this.booleanOptions.forEach(opt => opt.addEventListener('click', (e) => {
      this.booleanOptions.forEach(o => o.classList.remove('active'));
      e.currentTarget.classList.add('active');
    }));

    // Harvest / clear
    this.harvestButton.addEventListener('click', () => this.startHarvest('all'));
    this.clearButton.addEventListener('click', () => this.clearResults());

    // Filter changes
    this.yearFilter.addEventListener('change', () => this.applyFilters());
    this.sourceFilter.addEventListener('change', () => this.applyFilters());
    this.typeFilter.addEventListener('change', () => this.applyFilters());
    this.sortFilter.addEventListener('change', () => this.applyFilters());
    this.resetFiltersBtn.addEventListener('click', () => this.resetFilters());

    // Search within results
    this.searchInResultsButton.addEventListener('click', () => this.searchWithinResults());
    this.searchInResults.addEventListener('keypress', e => { if (e.key === 'Enter') this.searchWithinResults(); });

    // Pagination
    this.firstPageBtn.addEventListener('click', () => this.goToPage(1));
    this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    this.nextPageBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
    this.lastPageBtn.addEventListener('click', () => this.goToPage(this.totalPages));

    // Email
    this.emailButton.addEventListener('click', () => {
      window.location.href = 'mailto:contact@qdataresearch.com?subject=Q%20Data%20Platform%20Inquiry';
    });

    // Card actions
    this.dataCardsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.card-action');
      if (!btn) return;
      const card = btn.closest('.data-card');
      const id = card?.dataset.itemId;
      if (!id) return;

      const action = btn.dataset.action;
      if (action === 'view') this.viewItem(id);
      if (action === 'download') this.downloadItem(id);
      if (action === 'zotero') this.saveToZotero(id);
    });
  }

  initFilters() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1980; y--) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      this.yearFilter.appendChild(opt);
    }
    [
      'Zenodo', 'OSF', 'Figshare', 'Mendeley Data', 'Dryad',
      'Open UCT', 'SUNScholar', 'UP Repository', 'UFS Scholar', 'UNISA DSpace'
    ].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      this.sourceFilter.appendChild(opt);
    });
  }

  performSearch() {
    // Platform APIs vary for full-text search; for now just ensure results visible and harvest per current source type.
    if (!this.resultsSection.classList.contains('active')) {
      this.resultsSection.classList.add('active');
    }
    this.startHarvest(this.currentSourceType || 'all');
  }

  // ======== Harvesting ========
  getSourcesByType(type) {
    const all = [
      // JSON data sources
      { id: 'zenodo',   name: 'Zenodo',        type: 'research' },
      { id: 'figshare', name: 'Figshare',      type: 'research' },
      { id: 'osf',      name: 'OSF',           type: 'research' },
      { id: 'dryad',    name: 'Dryad',         type: 'research' },
      { id: 'mendeley', name: 'Mendeley Data', type: 'research' },

      // OAI-PMH repos (oai_dc XML)
      { id:'oai_openuct', name:'Open UCT',      type:'articles', oai:'https://open.uct.ac.za/oai/request' },
      { id:'oai_sun',     name:'SUNScholar',    type:'articles', oai:'https://scholar.sun.ac.za/oai/request' },
      { id:'oai_up',      name:'UP Repository', type:'articles', oai:'https://repository.up.ac.za/oai/request' },
      { id:'oai_ufs',     name:'UFS Scholar',   type:'articles', oai:'https://scholar.ufs.ac.za/oai/request' },
      { id:'oai_unisa',   name:'UNISA DSpace',  type:'articles', oai:'https://uir.unisa.ac.za/oai/request' }
    ];
    if (type === 'all') return all;
    if (type === 'theses') return all.filter(s => s.id.startsWith('oai_'));
    return all.filter(s => s.type === type);
  }

  getPagedApiUrl(source, page = 1, size = 50) {
    const map = {
      zenodo:   `https://zenodo.org/api/records?size=${size}&page=${page}&sort=mostrecent`,
      figshare: `https://api.figshare.com/v2/articles?page=${page}&page_size=${size}`,
      osf:      `https://api.osf.io/v2/nodes/?page=${page}&page_size=${size}`,
      dryad:    `https://datadryad.org/api/v2/search?page=${page}&per_page=${size}`,
      mendeley: `https://data.mendeley.com/api/datasets?page=${page}&limit=${size}`
    };
    if (source.id.startsWith('oai_')) {
      // Initial OAI-PMH request. We’ll follow resumptionToken inside harvestSource().
      return `${source.oai}?verb=ListRecords&metadataPrefix=oai_dc`;
    }
    return map[source.id];
  }

  async startHarvest(type = 'all') {
    if (this.isHarvesting) { alert('Harvesting is already in progress'); return; }

    this.isHarvesting = true;
    this.resultsSection.classList.add('active');
    this.harvestStatus.textContent = 'Starting harvest...';
    this.progressBar.style.width = '0%';

    // fresh run
    this.allData = [];
    this.filteredData = [];
    this.updateResultsDisplay();

    const sources = this.getSourcesByType(type);
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      this.harvestStatus.textContent = `Harvesting from ${src.name}...`;
      this.progressBar.style.width = `${Math.round((i / Math.max(1, sources.length)) * 75)}%`;

      try {
        const list = await this.harvestSource(src);
        // stamp type/source for UI
        const normalized = list.map(r => ({ ...r, source: src.name, type: src.type }));
        this.allData.push(...normalized);
        this.filteredData = [...this.allData];
        this.updateResultsDisplay();
      } catch (err) {
        console.error(`Harvest error for ${src.name}`, err);
      }
      await this.delay(250);
    }

    this.harvestStatus.textContent = `Harvest complete! Collected ${this.allData.length} records`;
    this.progressBar.style.width = '100%';
    this.saveToStorage();
    setTimeout(() => (this.harvestStatus.textContent = 'Ready to harvest'), 2500);
    this.isHarvesting = false;
  }

  async harvestSource(source) {
    // JSON APIs: page through up to ~500 items; OAI-PMH: follow resumptionToken to a safe cap
    const out = [];

    if (!source.id.startsWith('oai_')) {
      const MAX_PAGES = 10;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = this.getPagedApiUrl(source, page, 50);
        const res = await fetch(PROXY(url));
        if (!res.ok) throw new Error(`Proxy ${res.status}`);
        const data = await res.json();
        const parsed = this.parseJson(source.id, data);
        if (!parsed.length) break;
        out.push(...parsed);
        if (parsed.length < 50) break;
        await this.delay(200);
      }
      return out;
    }

    // OAI-PMH
    let nextUrl = this.getPagedApiUrl(source);
    let loops = 0;
    const MAX_LOOPS = 6; // safety cap

    while (nextUrl && loops < MAX_LOOPS) {
      const res = await fetch(PROXY(nextUrl));
      if (!res.ok) throw new Error(`Proxy ${res.status}`);

      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      const xmlText = ctype.includes('xml') ? await res.text() : await res.text(); // worker passes XML as xml

      const { records, resumptionToken } = this.parseOaiDc(xmlText, source.name);
      out.push(...records);

      if (resumptionToken) {
        const base = source.oai;
        nextUrl = `${base}?verb=ListRecords&resumptionToken=${encodeURIComponent(resumptionToken)}`;
      } else {
        nextUrl = null;
      }
      loops++;
      await this.delay(250);
    }
    return out;
  }

  // ======== Parsers ========
  parseJson(sourceId, data) {
    switch (sourceId) {
      case 'zenodo':
        return (data.hits?.hits || []).map(item => ({
          id: String(item.id),
          title: item.metadata?.title || 'Untitled',
          authors: (item.metadata?.creators || []).map(c => c.name).filter(Boolean),
          description: this.clean(item.metadata?.description) || 'No description available',
          keywords: item.metadata?.keywords || (item.metadata?.subjects || []).map(s => s.term) || [],
          year: this.yearOf(item.metadata?.publication_date),
          identifier: item.metadata?.doi || item.doi || '',
          identifierType: (item.metadata?.doi || item.doi) ? 'DOI' : 'ID',
          url: item.links?.html || (item.metadata?.doi ? `https://doi.org/${item.metadata.doi}` : ''),
          downloadUrl: item.links?.download || ''
        }));

      case 'figshare':
        return (Array.isArray(data) ? data : []).map(a => ({
          id: String(a.id),
          title: a.title || 'Untitled',
          authors: (a.authors || []).map(x => x.full_name).filter(Boolean),
          description: this.clean(a.description) || 'No description available',
          keywords: a.tags || [],
          year: this.yearOf(a.published_date),
          identifier: a.doi || '',
          identifierType: a.doi ? 'DOI' : 'ID',
          url: a.url_public_html || '',
          downloadUrl: a.files?.[0]?.download_url || ''
        }));

      case 'osf':
        return (data.data || []).map(n => ({
          id: n.id,
          title: n.attributes?.title || 'Untitled',
          authors: n.attributes?.contributors?.map(c => c?.users?.data?.attributes?.full_name).filter(Boolean) ||
                   [(n.relationships?.contributors?.data?.length ? 'Multiple contributors' : 'Unknown')],
          description: this.clean(n.attributes?.description) || 'No description available',
          keywords: n.attributes?.tags || [],
          year: this.yearOf(n.attributes?.date_created),
          identifier: n.attributes?.doi || '',
          identifierType: n.attributes?.doi ? 'DOI' : 'ID',
          url: n.links?.html || '',
          downloadUrl: n.links?.download || ''
        }));

      case 'dryad':
        return (data?.data || []).map(item => ({
          id: item.id || crypto.randomUUID(),
          title: item.attributes?.title || 'Untitled',
          authors: (item.attributes?.authors || []).map(a => a.name).filter(Boolean),
          description: this.clean(item.attributes?.abstract) || 'No description available',
          keywords: item.attributes?.keywords || [],
          year: this.yearOf(item.attributes?.publicationDate),
          identifier: item.attributes?.doi || '',
          identifierType: item.attributes?.doi ? 'DOI' : 'ID',
          url: item.attributes?.doi ? `https://doi.org/${item.attributes.doi}` : (item.links?.self || ''),
          downloadUrl: ''
        }));

      case 'mendeley':
        // Public listing is limited; map what we can
        const arr = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        return arr.map(item => ({
          id: String(item.id || crypto.randomUUID()),
          title: item.title || 'Untitled',
          authors: (item.authors || []).map(a => a.name).filter(Boolean),
          description: this.clean(item.description) || 'No description available',
          keywords: item.keywords || [],
          year: this.yearOf(item.published_at || item.created_at),
          identifier: item.doi || '',
          identifierType: item.doi ? 'DOI' : 'ID',
          url: item.web_url || (item.doi ? `https://doi.org/${item.doi}` : ''),
          downloadUrl: ''
        }));

      default:
        return [];
    }
  }

  // Parse OAI-PMH oai_dc, return { records, resumptionToken }
  parseOaiDc(xmlText, repoName) {
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');

    // resumptionToken
    const tokenNode = xml.getElementsByTagName('resumptionToken')[0];
    const resumptionToken = tokenNode && tokenNode.textContent ? tokenNode.textContent.trim() : null;

    // records
    const recNodes = Array.from(xml.getElementsByTagName('record'));
    const records = recNodes.map((rec, idx) => {
      const getAll = (qualified) => {
        // support ns or non-ns dc elements
        const [prefix, tag] = qualified.includes(':') ? qualified.split(':') : ['dc', qualified];
        const nsNodes = Array.from(rec.getElementsByTagNameNS('*', tag));
        const plainNodes = Array.from(rec.getElementsByTagName(`${prefix}:${tag}`))
          .concat(Array.from(rec.getElementsByTagName(tag)));
        const all = nsNodes.length ? nsNodes : plainNodes;
        return all.map(n => (n.textContent || '').trim()).filter(Boolean);
      };

      const titles = getAll('dc:title');
      const creators = getAll('dc:creator');
      const descs = getAll('dc:description');
      const subjects = getAll('dc:subject');
      const dates = getAll('dc:date');
      const idents = getAll('dc:identifier');

      const title = titles[0] || 'Untitled';
      const description = this.clean(descs[0] || 'No description available');
      const keywords = subjects.slice(0, 12);
      const year = this.yearOf(dates[0]);

      // identifier selection priority: DOI > handle URL > handle numeric > http(s) URL > first identifier
      const doi = idents.find(v => /^10\./.test(v));
      const handleUrl = idents.find(v => /hdl\.handle\.net\/\d+\/\d+/.test(v));
      const handleShort = idents.find(v => /^\d+\/\d+$/.test(v)); // e.g., 11660/12345
      const httpUrl = idents.find(v => /^https?:\/\//i.test(v));

      let identifier = doi || handleUrl || handleShort || httpUrl || idents[0] || '';
      let identifierType = doi ? 'DOI' : (handleUrl || handleShort) ? 'Handle' : (httpUrl ? 'URL' : 'ID');
      let url = '';

      if (doi) url = `https://doi.org/${doi}`;
      else if (handleUrl) url = handleUrl;
      else if (handleShort) url = this.resolveHandleShort(repoName, handleShort);
      else if (httpUrl) url = httpUrl;

      return {
        id: `${repoName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${idx}`,
        title,
        authors: creators.length ? creators : ['Unknown'],
        description,
        keywords,
        year,
        identifier,
        identifierType,
        url,
        downloadUrl: ''
      };
    });

    return { records, resumptionToken };
  }

  resolveHandleShort(repoName, shortHandle) {
    // shortHandle like "2263/123456" or "11660/xxxxx"
    const base = HANDLE_PREFIX_MAP[repoName];
    if (!base) return `https://hdl.handle.net/${shortHandle}`;
    // base ends with /handle/<prefix>/; we only append the numeric suffix after the slash
    const parts = shortHandle.split('/');
    return `${base}${parts[1] || parts[0]}`;
  }

  // ======== Utils ========
  yearOf(dateStr) {
    if (!dateStr) return new Date().getFullYear();
    const y = new Date(dateStr).getFullYear();
    if (Number.isFinite(y)) return y;
    // try YYYY form
    const m = String(dateStr).match(/\b(19|20)\d{2}\b/);
    return m ? Number(m[0]) : new Date().getFullYear();
  }

  clean(t) {
    if (!t) return '';
    return t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
  }

  // ======== Filters / display ========
  applyFilters() {
    let data = [...this.allData];
    if (this.yearFilter.value) data = data.filter(d => String(d.year) === this.yearFilter.value);
    if (this.sourceFilter.value) data = data.filter(d => d.source === this.sourceFilter.value);
    if (this.typeFilter.value) data = data.filter(d => d.type === this.typeFilter.value);

    const sortBy = this.sortFilter.value;
    if (sortBy === 'year') data.sort((a, b) => b.year - a.year);
    if (sortBy === 'year_asc') data.sort((a, b) => a.year - b.year);
    if (sortBy === 'title') data.sort((a, b) => a.title.localeCompare(b.title));

    this.filteredData = data;
    this.currentPage = 1;
    this.updateResultsDisplay();
  }

  searchWithinResults() {
    const q = (this.searchInResults.value || '').toLowerCase().trim();
    if (!q) { this.filteredData = [...this.allData]; this.updateResultsDisplay(); return; }
    this.filteredData = this.allData.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (Array.isArray(item.authors) && item.authors.join(' ').toLowerCase().includes(q)) ||
      (Array.isArray(item.keywords) && item.keywords.join(' ').toLowerCase().includes(q))
    );
    this.currentPage = 1;
    this.updateResultsDisplay();
  }

  updateResultsDisplay() {
    this.totalPages = Math.max(1, Math.ceil(this.filteredData.length / this.pageSize));
    this.resultsCount.textContent = `${this.filteredData.length.toLocaleString()} results`;
    this.displayCurrentPage();

    this.firstPageBtn.disabled = this.currentPage === 1;
    this.prevPageBtn.disabled = this.currentPage === 1;
    this.nextPageBtn.disabled = this.currentPage === this.totalPages;
    this.lastPageBtn.disabled = this.currentPage === this.totalPages;

    this.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    this.pagination.style.display = this.totalPages <= 1 ? 'none' : 'flex';
  }

  displayCurrentPage() {
    const start = (this.currentPage - 1) * this.pageSize;
    const pageData = this.filteredData.slice(start, start + this.pageSize);
    this.renderCards(pageData);
  }

  renderCards(items) {
    this.dataCardsContainer.innerHTML = '';
    if (!items.length) {
      this.dataCardsContainer.innerHTML = `
        <div class="no-results">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>Try adjusting your filters or harvest more data</p>
        </div>`;
      return;
    }

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'data-card';
      el.dataset.itemId = item.id;

      el.innerHTML = `
        <div class="card-header">
          <div class="card-type">${(item.type || 'DATA').toUpperCase()}</div>
          <div class="card-source">${item.source || ''}</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${this.escape(item.title)}</h3>
          <div class="card-authors">${Array.isArray(item.authors) ? this.escape(item.authors.join(', ')) : this.escape(item.authors || '')}</div>
          <p class="card-description">${this.escape(item.description || '')}</p>
          <div class="card-keywords">
            ${(item.keywords || []).slice(0,4).map(k => `<span class="keyword-tag">${this.escape(k)}</span>`).join('')}
            ${(item.keywords || []).length > 4 ? `<span class="keyword-tag">+${(item.keywords || []).length - 4} more</span>` : ''}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><i class="far fa-calendar"></i> ${item.year || ''}</span>
            <span>${item.identifierType || 'ID'}: ${
              item.identifier
                ? `<a class="doi-link" target="_blank" href="${item.url || '#'}">${this.escape(item.identifier)}</a>`
                : 'N/A'
            }</span>
          </div>
          <div class="card-actions">
            <button class="card-action" data-action="view" title="View Details"><i class="fas fa-eye"></i></button>
            <button class="card-action" data-action="download" title="Download"><i class="fas fa-download"></i></button>
            <button class="card-action" data-action="zotero" title="Save to Zotero"><i class="fas fa-bookmark"></i></button>
          </div>
        </div>`;
      this.dataCardsContainer.appendChild(el);
    });
  }

  // ======== Card actions ========
  viewItem(id) {
    const it = this.allData.find(x => x.id === id);
    if (it?.url) window.open(it.url, '_blank');
    else alert('No URL available for this item');
  }

  downloadItem(id) {
    const it = this.allData.find(x => x.id === id);
    if (it?.downloadUrl) window.open(it.downloadUrl, '_blank');
    else if (it?.url) window.open(it.url, '_blank');
    else alert('No download URL available for this item');
  }

  saveToZotero(id) {
    const it = this.allData.find(x => x.id === id);
    if (!it) return;
    const uri = encodeURIComponent(it.url || (it.identifierType === 'DOI' ? `https://doi.org/${it.identifier}` : ''));
    window.open(`https://www.zotero.org/select/items?uri=${uri}`, '_blank');
  }

  // ======== Storage / utils ========
  resetFilters() {
    this.yearFilter.value = '';
    this.sourceFilter.value = '';
    this.typeFilter.value = '';
    this.sortFilter.value = 'relevance';
    this.searchInResults.value = '';
    this.applyFilters();
  }

  clearResults() {
    this.allData = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.dataCardsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <h3>No data harvested yet</h3>
        <p>Use the harvest button to collect research data</p>
      </div>`;
    this.resultsCount.textContent = '0 results';
    this.pagination.style.display = 'none';
    localStorage.removeItem('qDataHarvest');
    this.searchInput.value = '';
    this.resetFilters();
  }

  saveToStorage() {
    try {
      localStorage.setItem('qDataHarvest', JSON.stringify({
        harvestedData: this.allData,
        ts: Date.now()
      }));
    } catch (e) { console.warn('localStorage save failed', e); }
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('qDataHarvest');
      if (!raw) return;
      const data = JSON.parse(raw);
      this.allData = data.harvestedData || [];
      this.filteredData = [...this.allData];
      if (this.allData.length) {
        this.resultsSection.classList.add('active');
        this.updateResultsDisplay();
      }
    } catch (e) { console.error('localStorage load failed', e); }
  }

  escape(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.qDataHarvester = new QDataHarvester();
});
