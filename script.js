const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev';

document.addEventListener('DOMContentLoaded', () => {
  // Controls
  const searchInput = document.querySelector('.search-input');
  const searchBtn   = document.querySelector('.search-btn');
  const tabs        = document.querySelectorAll('.tab');
  const clearBtn    = document.getElementById('clearBtn');

  const progressEl  = document.getElementById('progressBar');
  const cardsEl     = document.getElementById('dataCardsContainer');
  const filtersSidebar = document.getElementById('filtersSidebar');
  const filtersWrap    = document.getElementById('filtersWrap');
  const bulkRisBtn = document.getElementById('bulkRisButton');

  // App state
  const state = {
    activeCategory: 'all',
    isHarvesting: false,
    allData: [],
    filtered: [],
    facets: {},
    selected: new Set()
  };

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  searchBtn.addEventListener('click', () => startHarvest(state.activeCategory, searchInput.value.trim()));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startHarvest(state.activeCategory, searchInput.value.trim());
  });

  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    state.activeCategory = t.dataset.type;
    startHarvest(state.activeCategory, searchInput.value.trim());
  }));

  clearBtn.addEventListener('click', clearResults);

  bulkRisBtn.addEventListener('click', () => {
    const records = Array.from(state.selected).map(id => state.allData.find(r => r.id === id)).filter(Boolean);
    if (!records.length) return;
    exportRIS(records);
  });

  // ---------------------------------------------------------------------------
  // HARVEST LOGIC
  // ---------------------------------------------------------------------------

  async function startHarvest(category='all', query='') {
    if (state.isHarvesting) return;
    state.isHarvesting = true;
    state.selected.clear();
    toggleBulkButton();

    showLoadingCard(category);
    progressEl.style.width = '15%';

    try {
      const res = await fetch(`${WORKER_URL}/api/harvest`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ category, query, perSourceLimit: 1000 })
      });
      if (!res.ok) throw new Error(`Worker responded with ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unknown error');

      state.allData = Array.isArray(data.results) ? data.results : [];
      state.filtered = state.allData.slice();
      state.facets = data.facets || {};

      progressEl.style.width = '65%';

      buildFilters();
      displayResults(state.filtered);

      // show UI bits
      clearBtn.style.display = state.allData.length ? 'inline-flex' : 'none';
      filtersSidebar.style.display = state.allData.length ? 'block' : 'none';

      progressEl.style.width = '100%';
    } catch (err) {
      console.error(err);
      cardsEl.innerHTML = errorCard(err.message);
      clearBtn.style.display = 'inline-flex';
      filtersSidebar.style.display = 'none';
    } finally {
      state.isHarvesting = false;
      setTimeout(() => (progressEl.style.width = '0%'), 700);
    }
  }

  // ---------------------------------------------------------------------------
  // FILTERS
  // ---------------------------------------------------------------------------

  function buildFilters() {
    filtersWrap.innerHTML = '';

    const yearSel  = createSelect('Year', state.facets.years, v => applyFilter());
    const repoSel  = createSelect('Repository', state.facets.repositories, v => applyFilter());
    const typeSel  = createSelect('Type', state.facets.types, v => applyFilter());
    const authSel  = createSelect('Author', state.facets.authors, v => applyFilter());

    filtersWrap.append(yearSel, repoSel, typeSel, authSel);

    function applyFilter() {
      const y   = yearSel.querySelector('select').value;
      const rep = repoSel.querySelector('select').value;
      const typ = typeSel.querySelector('select').value;
      const au  = authSel.querySelector('select').value;

      state.filtered = state.allData.filter(r => {
        if (y   && String(r.year) !== String(y)) return false;
        if (rep && r.source !== rep) return false;
        if (typ && r.type   !== typ) return false;
        if (au  && !(r.authors||[]).includes(au)) return false;
        return true;
      });
      displayResults(state.filtered);
    }
  }

  function createSelect(label, items, onChange) {
    const box = document.createElement('div');
    box.className = 'filter';
    box.innerHTML = `
      <label>${label}</label>
      <select>
        <option value="">All</option>
        ${(items||[]).map(x => `<option value="${escapeHtml(x.name)}">${escapeHtml(x.name)} (${x.count})</option>`).join('')}
      </select>
    `;
    box.querySelector('select').addEventListener('change', onChange);
    return box;
  }

  // ---------------------------------------------------------------------------
  // DISPLAY RESULTS
  // ---------------------------------------------------------------------------

  function displayResults(records) {
    if (!records || !records.length) {
      cardsEl.innerHTML = noResultsCard();
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
          <input type="checkbox" class="select-record" data-id="${item.id}" title="Select for bulk RIS" style="float:right;margin-left:8px">
          <h3 class="card-title">${escapeHtml(item.title || 'Untitled')}</h3>
          <div class="card-authors">${escapeHtml((item.authors || []).join(', '))}</div>
          <p class="card-description">${escapeHtml((item.description || '').slice(0, 320))}${(item.description||'').length>320?'…':''}</p>
        </div>

        <div class="card-footer">
          <div class="card-meta">
            <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(item.year || '')}</span>
            ${item.identifier ? `<span>${escapeHtml(item.identifierType || '')}: <a href="${escapeHtml(item.url || '#')}" target="_blank" class="doi-link">${escapeHtml(item.identifier)}</a></span>` : ''}
          </div>
          <div class="card-actions">
            <button class="btn sm" title="Open record" onclick="window.open('${item.url || '#'}','_blank')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
            <button class="btn sm ris-btn" title="Export RIS" data-id="${item.id}">
              <i class="fa-solid fa-file-export"></i> Export RIS
            </button>
          </div>
        </div>
      `;
      frag.appendChild(card);
    });

    cardsEl.innerHTML = '';
    cardsEl.appendChild(frag);

    // bind per-card RIS + selection
    cardsEl.querySelectorAll('.ris-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = state.allData.find(r => r.id === btn.dataset.id);
        if (rec) exportRIS([rec]);
      });
    });

    cardsEl.querySelectorAll('.select-record').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id);
        else state.selected.delete(id);
        toggleBulkButton();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // RIS EXPORT
  // ---------------------------------------------------------------------------

  async function exportRIS(records) {
    try {
      const res = await fetch(`${WORKER_URL}/api/ris`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ records })
      });
      if (!res.ok) throw new Error('RIS export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'qdata-export.ris'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    }
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  function clearResults() {
    state.allData = [];
    state.filtered = [];
    state.facets = {};
    state.selected.clear();
    toggleBulkButton();

    cardsEl.innerHTML = noResultsCard();
    filtersSidebar.style.display = 'none';
    clearBtn.style.display = 'none';
  }

  function showLoadingCard(cat){
    cardsEl.innerHTML = `
      <div class="no-results">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <h3>Harvesting in progress…</h3>
        <p>Fetching ${escapeHtml(cat.toUpperCase())} data. Please wait…</p>
      </div>`;
  }

  function errorCard(msg){
    return `<div class="no-results">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <h3>Harvest Failed</h3>
      <p>${escapeHtml(msg || 'Unknown error')}</p>
    </div>`;
  }

  function noResultsCard(){
    return `<div class="no-results">
      <i class="fa-regular fa-circle-question"></i>
      <h3>No data available</h3>
      <p>Use the search or select a category to harvest records.</p>
    </div>`;
  }

  // ✅ FIXED escapeHtml
  function escapeHtml(t){
    if (t === null || t === undefined) return '';
    const s = typeof t === 'string' ? t : String(t);
    return s.replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
    );
  }

  function toggleBulkButton(){
    bulkRisBtn.style.display = state.selected.size ? 'inline-flex' : 'none';
  }
});
