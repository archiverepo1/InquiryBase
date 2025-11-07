const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev';

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.querySelector('.search-input');
  const searchButton = document.querySelector('.search-button');
  const sourceButtons = document.querySelectorAll('.source-button');
  const harvestButton = document.querySelector('.harvest-button');
  const clearButton = document.querySelector('.clear-button');
  const progressBar = document.querySelector('.progress');
  const harvestStatus = document.querySelector('.harvest-status');
  const dataCardsContainer = document.getElementById('dataCardsContainer');
  const resultsCount = document.getElementById('resultsCount');
  const resultsSection = document.querySelector('.results-section');

  // Filter containers
  const filtersWrapper = document.createElement('div');
  filtersWrapper.className = 'filters';
  resultsSection.insertBefore(filtersWrapper, resultsSection.querySelector('.results-content'));

  // Track state
  const state = {
    allData: [],
    filtered: [],
    facets: {},
    isHarvesting: false,
    activeCategory: 'all',
    selected: new Set()
  };

  /* ------------------------------------------------------------------ */
  /* Event Handlers */
  /* ------------------------------------------------------------------ */
  searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim();
    startHarvest(state.activeCategory, query);
  });

  sourceButtons.forEach(btn => btn.addEventListener('click', () => {
    sourceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeCategory = btn.dataset.type;
    startHarvest(state.activeCategory);
  }));

  harvestButton.addEventListener('click', () => startHarvest('all'));
  clearButton.addEventListener('click', clearResults);

  /* ------------------------------------------------------------------ */
  /* Core Harvest */
  /* ------------------------------------------------------------------ */
  async function startHarvest(category = 'all', query = '') {
    if (state.isHarvesting) {
      alert('Harvest already in progress. Please wait...');
      return;
    }
    state.isHarvesting = true;
    state.allData = [];
    resultsSection.classList.add('active');
    dataCardsContainer.innerHTML = loadingCard(category);
    resultsCount.textContent = 'Fetching...';
    progressBar.style.width = '15%';
    harvestStatus.textContent = 'Initializing harvest...';

    try {
      const payload = { category, query, perSourceLimit: 1000 };
      const res = await fetch(`${WORKER_URL}/api/harvest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Worker responded with ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unknown error');

      progressBar.style.width = '65%';
      state.allData = data.results || [];
      state.facets = data.facets || {};
      harvestStatus.innerHTML = data.cached
        ? `⚡ Loaded from cache (${data.total.toLocaleString()} records)`
        : `⏳ Live harvest complete (${data.total.toLocaleString()} new records)`;

      resultsCount.textContent = `${data.total.toLocaleString()} results`;
      buildFilterControls();
      displayResults(state.allData);
      progressBar.style.width = '100%';
    } catch (err) {
      console.error(err);
      harvestStatus.textContent = `❌ Error: ${err.message}`;
      dataCardsContainer.innerHTML = errorCard(err.message);
    } finally {
      state.isHarvesting = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Display */
  /* ------------------------------------------------------------------ */
  function displayResults(records) {
    if (!records?.length) {
      dataCardsContainer.innerHTML = noResultsCard();
      resultsCount.textContent = '0 results';
      return;
    }

    const frag = document.createDocumentFragment();
    records.forEach(item => {
      const card = document.createElement('div');
      card.className = 'data-card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-type">${escapeHtml(item.type || '')}</div>
          <div class="card-source">${escapeHtml(item.source || '')}</div>
        </div>
        <div class="card-body">
          <input type="checkbox" class="select-record" data-id="${item.id}" style="float:right;margin-left:8px;">
          <h3 class="card-title">${escapeHtml(item.title || 'Untitled')}</h3>
          <div class="card-authors">${(item.authors || []).join(', ')}</div>
          <p class="card-description">${escapeHtml((item.description || '').substring(0, 300))}...</p>
          <div class="card-keywords">
            ${(item.keywords || []).slice(0, 5).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><i class="far fa-calendar"></i> ${item.year || ''}</span>
            ${item.identifier ? `<span>${item.identifierType || ''}: <a href="${item.url || '#'}" target="_blank" class="doi-link">${item.identifier}</a></span>` : ''}
          </div>
          <div class="card-actions">
            <button class="card-action" onclick="window.open('${item.url || '#'}','_blank')" title="View Record"><i class="fas fa-external-link-alt"></i></button>
            <button class="card-action ris-btn" data-id="${item.id}" title="Export RIS"><i class="fas fa-file-export"></i></button>
          </div>
        </div>
      `;
      frag.appendChild(card);
    });

    dataCardsContainer.innerHTML = '';
    dataCardsContainer.appendChild(frag);

    // Bind select + RIS export
    document.querySelectorAll('.select-record').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id);
        else state.selected.delete(id);
      });
    });
    document.querySelectorAll('.ris-btn').forEach(btn => {
      btn.addEventListener('click', () => exportRIS([findRecord(btn.dataset.id)]));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Filters */
  /* ------------------------------------------------------------------ */
  function buildFilterControls() {
    filtersWrapper.innerHTML = '';
    const facets = state.facets;
    if (!facets || Object.keys(facets).length === 0) return;

    const yearSel = createSelect('Year', facets.years, v => applyFilter('year', v));
    const repoSel = createSelect('Repository', facets.repositories, v => applyFilter('source', v));
    const typeSel = createSelect('Type', facets.types, v => applyFilter('type', v));
    const authSel = createSelect('Author', facets.authors, v => applyFilter('author', v));

    filtersWrapper.append(yearSel, repoSel, typeSel, authSel);

    const risAllBtn = document.createElement('button');
    risAllBtn.textContent = 'Export Selected to RIS';
    risAllBtn.className = 'btn sm harvest-btn';
    risAllBtn.onclick = () => {
      const selectedRecords = Array.from(state.selected).map(id => findRecord(id));
      if (selectedRecords.length === 0) return alert('No records selected.');
      exportRIS(selectedRecords);
    };
    filtersWrapper.appendChild(risAllBtn);
  }

  function createSelect(label, items, onChange) {
    const div = document.createElement('div');
    div.className = 'filter';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const sel = document.createElement('select');
    sel.innerHTML = `<option value="">All</option>` +
      (items || []).map(x => `<option value="${x.name}">${x.name} (${x.count})</option>`).join('');
    sel.addEventListener('change', () => onChange(sel.value));
    div.append(lbl, sel);
    return div;
  }

  function applyFilter(field, value) {
    if (!value) {
      state.filtered = state.allData;
    } else {
      state.filtered = state.allData.filter(r => {
        if (field === 'year') return r.year == value;
        if (field === 'source') return r.source === value;
        if (field === 'type') return r.type === value;
        if (field === 'author') return (r.authors || []).includes(value);
        return true;
      });
    }
    displayResults(state.filtered);
    resultsCount.textContent = `${state.filtered.length.toLocaleString()} results (filtered)`;
  }

  /* ------------------------------------------------------------------ */
  /* RIS Export */
  /* ------------------------------------------------------------------ */
  async function exportRIS(records) {
    try {
      const res = await fetch(`${WORKER_URL}/api/ris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qdata-export.ris';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('RIS export failed: ' + err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Helpers */
  /* ------------------------------------------------------------------ */
  function findRecord(id) {
    return state.allData.find(r => r.id === id);
  }

  function clearResults() {
    dataCardsContainer.innerHTML = noResultsCard();
    resultsCount.textContent = '0 results';
    harvestStatus.textContent = 'Ready';
    progressBar.style.width = '0%';
  }

  function escapeHtml(text) {
    return text?.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])) || '';
  }

  function loadingCard(cat) {
    return `
      <div class="no-results">
        <i class="fas fa-spinner fa-spin"></i>
        <h3>Harvesting in progress...</h3>
        <p>Fetching ${cat.toUpperCase()} data. Please wait...</p>
      </div>`;
  }

  function errorCard(msg) {
    return `
      <div class="no-results">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Harvest Failed</h3>
        <p>${msg}</p>
      </div>`;
  }

  function noResultsCard() {
    return `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No data available</h3>
        <p>Click “Harvest” to load records.</p>
      </div>`;
  }
});
