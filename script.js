// ======== CONFIG ========
/**
 * Your Worker service will expose a workers.dev URL.
 * If you attached a custom domain/route, set WORKER_URL to that.
 * The dash path you shared corresponds to the service named "inquirybase".
 */
const WORKER_URL = 'https://inquirybase.workers.dev'; // change if you use a custom route

// ======== APP ========
class QDataHarvester {
  constructor() {
    // state
    this.allData = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.pageSize = 12;
    this.totalPages = 1;
    this.isHarvesting = false;
    this.currentSourceType = 'all';

    // elements
    this.grabElements();
    this.bindEvents();
    this.initFilters();
    this.loadFromStorage();
  }

  grabElements() {
    this.searchInput = document.querySelector('.search-input');
    this.searchButton = document.querySelector('.search-button');
    this.sourceButtons = document.querySelectorAll('.source-button');
    this.advancedToggle = document.querySelector('.advanced-toggle');
    this.advancedSearch = document.querySelector('.advanced-search');
    this.booleanOptions = document.querySelectorAll('.boolean-option');

    this.resultsSection = document.querySelector('.results-section');
    this.harvestButton = document.querySelector('.harvest-button');
    this.clearButton = document.querySelector('.clear-button');
    this.progressBar = document.querySelector('.progress');
    this.harvestStatus = document.querySelector('.harvest-status');

    this.dataCardsContainer = document.getElementById('dataCardsContainer');
    this.resultsCount = document.getElementById('resultsCount');
    this.yearFilter = document.getElementById('yearFilter');
    this.sourceFilter = document.getElementById('sourceFilter');
    this.typeFilter = document.getElementById('typeFilter');
    this.sortFilter = document.getElementById('sortFilter');

    this.pagination = document.getElementById('pagination');
    this.firstPageBtn = document.getElementById('firstPage');
    this.prevPageBtn = document.getElementById('prevPage');
    this.nextPageBtn = document.getElementById('nextPage');
    this.lastPageBtn = document.getElementById('lastPage');
    this.pageInfo = document.getElementById('pageInfo');

    this.searchInResults = document.getElementById('searchInResults');
    this.searchInResultsButton = document.getElementById('searchInResultsButton');
    this.resetFiltersBtn = document.querySelector('.reset-filters');
    this.emailButton = document.querySelector('.email-button');
  }

  bindEvents() {
    this.searchButton.addEventListener('click', () => this.performSearch());
    this.searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') this.performSearch(); });

    this.sourceButtons.forEach(btn => {
      btn.addEventListener('click', e => {
        this.sourceButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentSourceType = e.currentTarget.dataset.type;
        this.startHarvest(this.currentSourceType);
      });
    });

    this.advancedToggle.addEventListener('click', () => this.advancedSearch.classList.toggle('active'));
    this.booleanOptions.forEach(opt => opt.addEventListener('click', e => {
      this.booleanOptions.forEach(o => o.classList.remove('active'));
      e.currentTarget.classList.add('active');
    }));

    this.harvestButton.addEventListener('click', () => this.startHarvest('all'));
    this.clearButton.addEventListener('click', () => this.clearResults());

    this.yearFilter.addEventListener('change', () => this.applyFilters());
    this.sourceFilter.addEventListener('change', () => this.applyFilters());
    this.typeFilter.addEventListener('change', () => this.applyFilters());
    this.sortFilter.addEventListener('change', () => this.applyFilters());
    this.resetFiltersBtn.addEventListener('click', () => this.resetFilters());

    this.searchInResultsButton.addEventListener('click', () => this.searchWithinResults());
    this.searchInResults.addEventListener('keypress', e => { if (e.key === 'Enter') this.searchWithinResults(); });

    this.firstPageBtn.addEventListener('click', () => this.goToPage(1));
    this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    this.nextPageBtn.addEventListener('click', () => this.goToPage(this.totalPages > 1 ? this.currentPage + 1 : 1));
    this.lastPageBtn.addEventListener('click', () => this.goToPage(this.totalPages));

    this.emailButton.addEventListener('click', () => {
      window.location.href = 'mailto:contact@qdataresearch.com?subject=Q%20Data%20Platform%20Inquiry';
    });

    // card actions
    this.dataCardsContainer.addEventListener('click', e => {
      const actionBtn = e.target.closest('.card-action');
      if (!actionBtn) return;
      const card = actionBtn.closest('.data-card');
      const itemId = card?.dataset.itemId;
      if (!itemId) return;

      const action = actionBtn.dataset.action;
      if (action === 'view') this.viewItem(itemId);
      if (action === 'download') this.downloadItem(itemId);
      if (action === 'zotero') this.saveToZotero(itemId);
    });
  }

  initFilters() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1980; y--) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      this.yearFilter.appendChild(opt);
    }
    const sources = [
      'Zenodo','OSF','Figshare','Mendeley Data','Dryad',
      'Open UCT','SUNScholar','UP Repository','UFS Scholar','UNISA DSpace'
    ];
    sources.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      this.sourceFilter.appendChild(opt);
    });
  }

  performSearch() {
    const q = this.searchInput.value.trim();
    if (!q) return;
    this.resultsSection.classList.add('active');
    // For now, harvesting ignores query (platform APIs vary); you can wire per-API queries later.
    this.startHarvest(this.currentSourceType || 'all');
  }

  async startHarvest(type = 'all') {
    if (this.isHarvesting) { alert('Harvesting is already in progress'); return; }

    this.isHarvesting = true;
    this.resultsSection.classList.add('active');
    this.harvestStatus.textContent = 'Starting harvest...';
    this.progressBar.style.width = '0%';

    this.allData = []; // fresh run

    const sources = this.getSourcesByType(type);
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const pct = Math.round((i / Math.max(sources.length,1)) * 80);
      this.harvestStatus.textContent = `Harvesting from ${src.name}...`;
      this.progressBar.style.width = `${pct}%`;

      try {
        const recs = await this.harvestSource(src);
        this.allData = this.allData.concat(recs.map(r => ({ ...r, source: src.name, type: src.type })));
        this.filteredData = [...this.allData];
        this.updateResultsDisplay();
      } catch (err) {
        console.error(`Harvest error for ${src.name}:`, err);
      }
      await this.delay(300);
    }

    this.harvestStatus.textContent = `Harvest complete! Collected ${this.allData.length} records`;
    this.progressBar.style.width = '100%';
    this.saveToStorage();
    setTimeout(() => (this.harvestStatus.textContent = 'Ready to harvest'), 3000);
    this.isHarvesting = false;
  }

  getSourcesByType(type) {
    const all = [
      { id:'zenodo',   name:'Zenodo',         type:'research' },
      { id:'figshare', name:'Figshare',       type:'research' },
      { id:'osf',      name:'OSF',            type:'research' },
      { id:'dryad',    name:'Dryad',          type:'research' },
      { id:'mendeley', name:'Mendeley Data',  type:'research' },
      // DSpace OAI-PMH (South Africa)
      { id:'oai_openuct', name:'Open UCT',        type:'articles', oai:'https://open.uct.ac.za/oai/request' },
      { id:'oai_sun',     name:'SUNScholar',      type:'articles', oai:'https://scholar.sun.ac.za/oai/request' },
      { id:'oai_up',      name:'UP Repository',   type:'articles', oai:'https://repository.up.ac.za/oai/request' },
      { id:'oai_ufs',     name:'UFS Scholar',     type:'articles', oai:'https://scholar.ufs.ac.za/oai/request' },
      { id:'oai_unisa',   name:'UNISA DSpace',    type:'articles', oai:'https://uir.unisa.ac.za/oai/request' }
    ];
    if (type === 'all') return all;
    if (type === 'theses') {
      // theses often live in same OAI endpoints; keep type label for UI
      return all.filter(s => s.id.startsWith('oai_'));
    }
    return all.filter(s => s.type === type);
  }

  getApiUrl(source, page = 1, size = 50) {
    const map = {
      zenodo:   `https://zenodo.org/api/records?size=${size}&page=${page}&sort=mostrecent`,
      figshare: `https://api.figshare.com/v2/articles?page=${page}&page_size=${size}`,
      osf:      `https://api.osf.io/v2/nodes/?page=${page}&page_size=${size}`,
      dryad:    `https://datadryad.org/api/v2/search?page=${page}&per_page=${size}`,
      mendeley: `https://data.mendeley.com/api/datasets?page=${page}&limit=${size}`
    };
    if (source.id.startsWith('oai_')) {
      // OAI-PMH (XML)
      const base = source.oai;
      return `${base}?verb=ListRecords&metadataPrefix=oai_dc`;
    }
    return map[source.id];
  }

  async harvestSource(source) {
    const all = [];
    // JSON APIs: page through; OAI-PMH: fetch once (you can extend with resumptionToken later)
    const maxPages = source.id.startsWith('oai_') ? 1 : 10;

    for (let page = 1; page <= maxPages; page++) {
      const apiUrl = this.getApiUrl(source, page, 50);
      const proxyUrl = `${WORKER_URL}/api/proxy?url=${encodeURIComponent(apiUrl)}`;

      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Proxy ${res.status}: ${res.statusText}`);
      const ctype = (res.headers.get('content-type') || '').toLowerCase();

      let records = [];
      if (ctype.includes('xml')) {
        const xmlText = await res.text();
        records = this.parseOaiDc(xmlText, source.name);
      } else {
        const json = await res.json();
        records = this.parseJson(source.id, json);
      }

      if (!records.length) break;
      all.push(...records);
      if (source.id.startsWith('oai_')) break; // simple single call for now
      if (records.length < 50) break;
    }
    return all;
  }

  parseJson(sourceId, data) {
    switch (sourceId) {
      case 'zenodo':
        return (data.hits?.hits || []).map(item => ({
          id: String(item.id),
          title: item.metadata?.title || 'Untitled',
          authors: (item.metadata?.creators || []).map(c => c.name).filter(Boolean),
          description: this.cleanText(item.metadata?.description) || 'No description available',
          keywords: item.metadata?.keywords || (item.metadata?.subjects || []).map(s => s.term) || [],
          year: this.yearOf(item.metadata?.publication_date),
          identifier: item.metadata?.doi || item.doi,
          identifierType: 'DOI',
          url: item.links?.html || (item.metadata?.doi ? `https://doi.org/${item.metadata.doi}` : ''),
          downloadUrl: item.links?.download || ''
        }));

      case 'figshare':
        return (Array.isArray(data) ? data : []).map(item => ({
          id: String(item.id),
          title: item.title || 'Untitled',
          authors: (item.authors || []).map(a => a.full_name).filter(Boolean),
          description: this.cleanText(item.description) || 'No description available',
          keywords: item.tags || [],
          year: this.yearOf(item.published_date),
          identifier: item.doi || '',
          identifierType: item.doi ? 'DOI' : 'ID',
          url: item.url_public_html || '',
          downloadUrl: item.files?.[0]?.download_url || ''
        }));

      case 'osf':
        return (data.data || []).map(n => ({
          id: n.id,
          title: n.attributes?.title || 'Untitled',
          authors: (n.attributes?.contributors || []).map(c => c?.users?.data?.attributes?.full_name).filter(Boolean) ||
                   [(n.relationships?.contributors?.data?.length ? 'Multiple contributors' : 'Unknown')],
          description: this.cleanText(n.attributes?.description) || 'No description available',
          keywords: n.attributes?.tags || [],
          year: this.yearOf(n.attributes?.date_created),
          identifier: n.attributes?.doi || '',
          identifierType: n.attributes?.doi ? 'DOI' : 'ID',
          url: n.links?.html || '',
          downloadUrl: n.links?.download || ''
        }));

      case 'dryad':
        // Dryad search API returns list with attributes
        return (data?.data || []).map(item => ({
          id: item.id || item.identifier || crypto.randomUUID(),
          title: item.attributes?.title || 'Untitled',
          authors: (item.attributes?.authors || []).map(a => a.name).filter(Boolean),
          description: this.cleanText(item.attributes?.abstract) || 'No description available',
          keywords: item.attributes?.keywords || [],
          year: this.yearOf(item.attributes?.publicationDate),
          identifier: item.attributes?.doi || '',
          identifierType: item.attributes?.doi ? 'DOI' : 'ID',
          url: item.links?.self || (item.attributes?.doi ? `https://doi.org/${item.attributes.doi}` : ''),
          downloadUrl: ''
        }));

      case 'mendeley':
        // Public endpoints are limited; we keep minimal mapping
        return (data?.results || data || []).map(item => ({
          id: String(item.id || crypto.randomUUID()),
          title: item.title || 'Untitled',
          authors: (item.authors || []).map(a => a.name).filter(Boolean),
          description: this.cleanText(item.description) || 'No description available',
          keywords: item.keywords || [],
          year: this.yearOf(item.published_at || item.created_at),
          identifier: item.doi || '',
          identifierType: item.doi ? 'DOI' : 'ID',
          url: item.web_url || '',
          downloadUrl: ''
        }));

      default:
        return [];
    }
  }

  // Parse OAI-PMH oai_dc (XML)
  parseOaiDc(xmlText, repoName) {
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
    const recs = Array.from(xml.getElementsByTagName('record'));
    return recs.map((rec, idx) => {
      const md = rec.getElementsByTagName('metadata')[0];
      const dc = md ? md.getElementsByTagNameNS('*', 'dc')[0] || md : null;

      const getAll = (tag) => Array.from(rec.getElementsByTagNameNS('*', `dc:${tag}`))
        .concat(Array.from(rec.getElementsByTagName(tag)))
        .map(n => n.textContent.trim()).filter(Boolean);

      const title = getAll('title')[0] || 'Untitled';
      const creators = getAll('creator');
      const desc = getAll('description')[0] || 'No description available';
      const subs = getAll('subject');
      const dates = getAll('date');
      const ids = getAll('identifier');

      // try DOI then handle then any http link
      const doi = ids.find(v => /^10\./.test(v)) || '';
      const handle = ids.find(v => /hdl\.handle\.net/.test(v) || /^\d+\/\d+/.test(v)) || '';
      const http = ids.find(v => /^https?:\/\//i.test(v)) || '';

      const identifier = doi || handle || http || ids[0] || '';
      const identifierType = doi ? 'DOI' : (handle ? 'Handle' : (http ? 'URL' : 'ID'));
      const year = this.yearOf(dates[0]);

      // best-guess landing URL
      let url = http;
      if (!url && doi) url = `https://doi.org/${doi}`;
      if (!url && handle && !/^https?:\/\//i.test(handle)) url = `https://hdl.handle.net/${handle}`;

      return {
        id: `${repoName.replace(/\s+/g,'-').toLowerCase()}-${Date.now()}-${idx}`,
        title,
        authors: creators.length ? creators : ['Unknown'],
        description: this.cleanText(desc),
        keywords: subs.slice(0,10),
        year,
        identifier,
        identifierType,
        url,
        downloadUrl: ''
      };
    });
  }

  // helpers
  yearOf(dateStr) {
    if (!dateStr) return new Date().getFullYear();
    const y = new Date(dateStr).getFullYear();
    return Number.isFinite(y) ? y : new Date().getFullYear();
    }

  cleanText(t) {
    if (!t) return '';
    return t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
  }

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
      (Array.isArray(item.authors) ? item.authors.join(' ').toLowerCase().includes(q) : false) ||
      (Array.isArray(item.keywords) ? item.keywords.join(' ').toLowerCase().includes(q) : false)
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
          <div class="card-type">${(item.type || 'data').toUpperCase()}</div>
          <div class="card-source">${item.source || ''}</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${item.title}</h3>
          <div class="card-authors">${Array.isArray(item.authors)?item.authors.join(', '):item.authors||''}</div>
          <p class="card-description">${item.description || ''}</p>
          <div class="card-keywords">
            ${(item.keywords||[]).slice(0,4).map(k=>`<span class="keyword-tag">${k}</span>`).join('')}
            ${(item.keywords||[]).length>4?`<span class="keyword-tag">+${(item.keywords||[]).length-4} more</span>`:''}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><i class="far fa-calendar"></i> ${item.year || ''}</span>
            <span>${item.identifierType||'ID'}: ${item.identifier ? `<a class="doi-link" target="_blank" href="${item.url || '#'}">${item.identifier}</a>` : 'N/A'}</span>
          </div>
          <div class="card-actions">
            <button class="card-action" data-action="view" title="View"><i class="fas fa-eye"></i></button>
            <button class="card-action" data-action="download" title="Download"><i class="fas fa-download"></i></button>
            <button class="card-action" data-action="zotero" title="Save to Zotero"><i class="fas fa-bookmark"></i></button>
          </div>
        </div>`;
      this.dataCardsContainer.appendChild(el);
    });
  }

  goToPage(p) {
    if (p < 1 || p > this.totalPages) return;
    this.currentPage = p;
    this.displayCurrentPage();
    this.updateResultsDisplay();
  }

  viewItem(id) {
    const item = this.allData.find(x => x.id === id);
    if (item?.url) window.open(item.url, '_blank');
    else alert('No URL available for this item');
  }

  downloadItem(id) {
    const item = this.allData.find(x => x.id === id);
    if (item?.downloadUrl) window.open(item.downloadUrl, '_blank');
    else if (item?.url) window.open(item.url, '_blank');
    else alert('No download URL available for this item');
  }

  saveToZotero(id) {
    const item = this.allData.find(x => x.id === id);
    if (!item) return;
    const uri = encodeURIComponent(item.url || (item.identifierType === 'DOI' ? `https://doi.org/${item.identifier}` : ''));
    window.open(`https://www.zotero.org/select/items?uri=${uri}`, '_blank');
  }

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

  delay(ms){ return new Promise(r => setTimeout(r, ms)); }
}

// boot
document.addEventListener('DOMContentLoaded', () => { window.qDataHarvester = new QDataHarvester(); });
