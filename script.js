// Q Data Research Hub — Front-end controller (Production)
// Requires your existing HTML. Replace the inline <script> with a <script src="qdata-harvester.js"></script>

const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev';

class QDataHarvester {
  constructor() {
    this.allData = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.pageSize = 12;
    this.totalPages = 1;
    this.currentSourceType = 'all'; // 'all' | 'research' | 'articles' | 'theses'
    this.currentQuery = '';
    this.isBusy = false;

    this.initEls();
    this.bindEvents();
    this.initFilters();
    this.loadFromStorage();
  }

  /* --------------------------- DOM & EVENT WIRING --------------------------- */

  initEls() {
    this.searchInput = document.querySelector('.search-input');
    this.searchButton = document.querySelector('.search-button');
    this.sourceButtons = document.querySelectorAll('.source-button');
    this.advancedToggle = document.querySelector('.advanced-toggle');
    this.advancedSearch = document.querySelector('.advanced-search');
    this.booleanOptions = document.querySelectorAll('.boolean-option');

    this.resultsSection = document.querySelector('.results-section');
    this.clearButton = document.querySelector('.clear-button');
    this.progressBar = document.querySelector('.progress');
    this.harvestStatus = document.querySelector('.harvest-status');

    this.dataCardsContainer = document.getElementById('dataCardsContainer');
    this.resultsCount = document.getElementById('resultsCount');
    this.yearFilter = document.getElementById('yearFilter');
    this.sourceFilter = document.getElementById('sourceFilter');
    this.typeFilter = document.getElementById('typeFilter');
    this.sortFilter = document.getElementById('sortFilter');
    this.searchInResults = document.getElementById('searchInResults');
    this.searchInResultsButton = document.getElementById('searchInResultsButton');
    this.pagination = document.getElementById('pagination');
    this.firstPageBtn = document.getElementById('firstPage');
    this.prevPageBtn = document.getElementById('prevPage');
    this.nextPageBtn = document.getElementById('nextPage');
    this.lastPageBtn = document.getElementById('lastPage');
    this.pageInfo = document.getElementById('pageInfo');
    this.resetFiltersBtn = document.querySelector('.reset-filters');
    this.emailButton = document.querySelector('.email-button');
  }

  bindEvents() {
    // Buttons for source type
    this.sourceButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.sourceButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSourceType = btn.dataset.type || 'all';
        // Kick off a harvest for this type
        this.performHarvest();
      });
    });

    // Search
    this.searchButton.addEventListener('click', () => this.performHarvest());
    this.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.performHarvest(); });

    // Advanced
    this.advancedToggle.addEventListener('click', () => this.advancedSearch.classList.toggle('active'));
    this.booleanOptions.forEach(opt => opt.addEventListener('click', () => {
      this.booleanOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    }));

    // Clear results
    this.clearButton.addEventListener('click', () => this.clearResults());

    // Filters
    this.yearFilter.addEventListener('change', () => this.applyFilters());
    this.sourceFilter.addEventListener('change', () => this.applyFilters());
    this.typeFilter.addEventListener('change', () => this.applyFilters());
    this.sortFilter.addEventListener('change', () => this.applyFilters());
    this.resetFiltersBtn.addEventListener('click', () => this.resetFilters());

    // In-results search
    this.searchInResultsButton.addEventListener('click', () => this.searchWithinResults());
    this.searchInResults.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.searchWithinResults(); });

    // Pagination
    this.firstPageBtn.addEventListener('click', () => this.goToPage(1));
    this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    this.nextPageBtn.addEventListener('click', () => this.goToPage(this.totalPages));
    this.lastPageBtn.addEventListener('click', () => this.goToPage(this.totalPages));

    // Card actions (delegated)
    this.dataCardsContainer.addEventListener('click', (e) => {
      const act = e.target.closest('.card-action'); if (!act) return;
      const card = act.closest('.data-card'); if (!card) return;
      const id = card.dataset.itemId; if (!id) return;
      const which = act.dataset.action;
      if (which === 'view') this.viewItem(id);
      else if (which === 'download') this.downloadItem(id);
      else if (which === 'zotero') this.saveToZotero(id);
    });

    // Email
    this.emailButton.addEventListener('click', () => {
      window.location.href = 'mailto:contact@qdataresearch.com?subject=Q%20Data%20Platform%20Inquiry';
    });
  }

  initFilters() {
    // Years
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2000; y--) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      this.yearFilter.appendChild(o);
    }
    // Sources (display purposes)
    [
      'Zenodo','Figshare','OSF','Dryad','Mendeley Data','ResearchGate',
      'Open UCT','SUNScholar','UP Repository','UFS Scholar','UNISA Repository','NWU Repository','Wits WiredSpace','Rhodes (SEALS/Vital)'
    ].forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      this.sourceFilter.appendChild(o);
    });
  }

  /* --------------------------------- HARVEST -------------------------------- */

  async performHarvest() {
    if (this.isBusy) return;
    const query = (this.searchInput.value || '').trim();
    this.currentQuery = query;
    this.resultsSection.classList.add('active');
    this.harvestStatus.textContent = 'Preparing…';
    this.progressBar.style.width = '0%';

    // Determine list of backend source IDs we’ll call one-by-one
    const sourceIds = this.getBackendSources(this.currentSourceType);
    if (!sourceIds.length) {
      alert('No sources mapped for this category');
      return;
    }

    this.isBusy = true;
    this.allData = [];
    let completed = 0;

    for (const sid of sourceIds) {
      this.harvestStatus.textContent = `Harvesting ${this.prettySource(sid)}…`;
      const payload = {
        category: this.currentSourceType,
        query,
        sources: [sid],
        perSourceLimit: 1000
      };

      try {
        const resp = await fetch(`${WORKER_URL}/api/harvest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        const newRecords = Array.isArray(data?.results) ? data.results : [];
        // Merge
        this.allData.push(...newRecords);
        // Deduplicate by id
        const seen = new Set();
        this.allData = this.allData.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));

        // Update display progressively
        this.filteredData = [...this.allData];
        this.updateResultsDisplay();

      } catch (e) {
        console.error(`Harvest failed for ${sid}:`, e);
      }

      completed++;
      const pct = Math.max(5, Math.round((completed / sourceIds.length) * 100));
      this.progressBar.style.width = `${pct}%`;
    }

    this.harvestStatus.textContent = `Harvest complete. ${this.allData.length.toLocaleString()} records.`;
    this.saveToStorage();
    this.isBusy = false;

    // Reset status later
    setTimeout(() => {
      this.harvestStatus.textContent = 'Ready';
      this.progressBar.style.width = '0%';
    }, 2500);
  }

  getBackendSources(type) {
    const research = ['zenodo','figshare','osf','dryad','mendeley','researchgate'];
    const dspace   = ['uct','sun','up','ufs','unisa','nwu','wits','rhodes'];

    if (type === 'research') return research;
    if (type === 'articles') return dspace;
    if (type === 'theses')   return dspace;
    return [...research, ...dspace];
  }

  prettySource(id) {
    const map = {
      zenodo:'Zenodo', figshare:'Figshare', osf:'OSF', dryad:'Dryad', mendeley:'Mendeley Data', researchgate:'ResearchGate',
      uct:'Open UCT', sun:'SUNScholar', up:'UP Repository', ufs:'UFS Scholar', unisa:'UNISA Repository',
      nwu:'NWU Repository', wits:'Wits WiredSpace', rhodes:'Rhodes (SEALS/Vital)'
    };
    return map[id] || id;
  }

  /* --------------------------- FILTERS & RENDERING -------------------------- */

  applyFilters() {
    let arr = [...this.allData];

    // Source type (category) — keep everything; we already scoped harvest to category
    // Year
    if (this.yearFilter.value) {
      arr = arr.filter(x => String(x.year) === String(this.yearFilter.value));
    }
    // Source (by display name)
    if (this.sourceFilter.value) {
      arr = arr.filter(x => x.source === this.sourceFilter.value);
    }
    // Explicit type dropdown (research/articles/theses)
    if (this.typeFilter.value) {
      arr = arr.filter(x => x.type === this.typeFilter.value);
    }
    // Sort
    const s = this.sortFilter.value;
    if (s === 'year') arr.sort((a,b) => (b.year||0) - (a.year||0));
    else if (s === 'year_asc') arr.sort((a,b) => (a.year||0) - (b.year||0));
    else if (s === 'title') arr.sort((a,b) => (a.title||'').localeCompare(b.title||''));

    this.filteredData = arr;
    this.currentPage = 1;
    this.updateResultsDisplay();
  }

  searchWithinResults() {
    const q = (this.searchInResults.value || '').toLowerCase().trim();
    if (!q) {
      this.filteredData = [...this.allData];
    } else {
      this.filteredData = this.allData.filter(it =>
        (it.title || '').toLowerCase().includes(q) ||
        (it.description || '').toLowerCase().includes(q) ||
        (Array.isArray(it.authors) ? it.authors.join(' ').toLowerCase().includes(q) : false) ||
        (Array.isArray(it.keywords) ? it.keywords.join(' ').toLowerCase().includes(q) : false)
      );
    }
    this.currentPage = 1;
    this.updateResultsDisplay();
  }

  updateResultsDisplay() {
    this.totalPages = Math.max(1, Math.ceil(this.filteredData.length / this.pageSize));
    this.resultsCount.textContent = `${this.filteredData.length.toLocaleString()} results`;
    this.displayCurrentPage();
    this.updatePagination();
  }

  displayCurrentPage() {
    const start = (this.currentPage - 1) * this.pageSize;
    const pageData = this.filteredData.slice(start, start + this.pageSize);
    this.renderCards(pageData);
  }

  renderCards(data) {
    const el = this.dataCardsContainer;
    el.innerHTML = '';
    if (!data.length) {
      el.innerHTML = `
        <div class="no-results">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>Try adjusting your filters or search terms</p>
        </div>`;
      return;
    }

    for (const item of data) {
      const card = document.createElement('div');
      card.className = 'data-card';
      card.dataset.itemId = item.id;
      card.innerHTML = `
        <div class="card-header">
          <div class="card-type">${(item.type || '').toUpperCase()}</div>
          <div class="card-source">${item.source || ''}</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.title || 'Untitled')}</h3>
          <div class="card-authors">${Array.isArray(item.authors) ? item.authors.join(', ') : (item.authors || '')}</div>
          <p class="card-description">${escapeHtml(item.description || '')}</p>
          <div class="card-keywords">
            ${(item.keywords || []).slice(0,4).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
            ${(item.keywords || []).length > 4 ? `<span class="keyword-tag">+${(item.keywords||[]).length - 4} more</span>` : ''}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><i class="far fa-calendar"></i> ${item.year || ''}</span>
            <span>${item.identifierType || 'URL'}: ${item.url ? `<a href="${item.url}" target="_blank" class="${item.identifierType === 'DOI' ? 'doi-link' : 'handle-link'}">${escapeHtml(item.identifier || '')}</a>` : escapeHtml(item.identifier || '')}</span>
          </div>
          <div class="card-actions">
            <button class="card-action" data-action="view" title="View Details"><i class="fas fa-eye"></i></button>
            <button class="card-action" data-action="download" title="Download"><i class="fas fa-download"></i></button>
            <button class="card-action" data-action="zotero" title="Save to Zotero"><i class="fas fa-bookmark"></i></button>
          </div>
        </div>`;
      el.appendChild(card);
    }
  }

  updatePagination() {
    this.firstPageBtn.disabled = (this.currentPage === 1);
    this.prevPageBtn.disabled = (this.currentPage === 1);
    this.nextPageBtn.disabled = (this.currentPage === this.totalPages);
    this.lastPageBtn.disabled = (this.currentPage === this.totalPages);
    this.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    this.pagination.style.display = (this.totalPages <= 1) ? 'none' : 'flex';
  }

  goToPage(p) {
    if (p < 1 || p > this.totalPages) return;
    this.currentPage = p;
    this.displayCurrentPage();
    this.updatePagination();
  }

  /* --------------------------------- ACTIONS -------------------------------- */

  viewItem(id) {
    const item = this.allData.find(x => x.id === id);
    if (item?.url) window.open(item.url, '_blank');
    else alert('No URL available for this item');
  }

  downloadItem(id) {
    const item = this.allData.find(x => x.id === id);
    if (!item) return;
    if (item.downloadUrl) window.open(item.downloadUrl, '_blank');
    else if (item.url) window.open(item.url, '_blank');
    else alert('Download URL not available');
  }

  saveToZotero(id) {
    const item = this.allData.find(x => x.id === id);
    if (!item?.url) return alert('No URL available for Zotero');
    const z = `https://www.zotero.org/select/items?uri=${encodeURIComponent(item.url)}`;
    window.open(z, '_blank');
  }

  /* ------------------------------ PERSISTENCE ------------------------------- */

  saveToStorage() {
    try {
      localStorage.setItem('qDataResults', JSON.stringify({
        data: this.allData,
        query: this.currentQuery,
        ts: Date.now()
      }));
    } catch {}
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('qDataResults');
      if (!raw) return;
      const obj = JSON.parse(raw);
      this.allData = Array.isArray(obj?.data) ? obj.data : [];
      this.filteredData = [...this.allData];
      this.currentQuery = obj?.query || '';
      if (this.allData.length) {
        this.resultsSection.classList.add('active');
        this.searchInput.value = this.currentQuery;
        this.updateResultsDisplay();
      }
    } catch {}
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
    this.currentQuery = '';

    this.dataCardsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <h3>No data harvested yet</h3>
        <p>Use the buttons or search to collect research data</p>
      </div>`;
    this.resultsCount.textContent = '0 results';
    this.updatePagination();
    this.resultsSection.classList.add('active');
    try { localStorage.removeItem('qDataResults'); } catch {}
  }
}

/* ------------------------------- UTILITIES -------------------------------- */

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* --------------------------- BOOT THE CONTROLLER -------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  window.qDataHarvester = new QDataHarvester();
});
