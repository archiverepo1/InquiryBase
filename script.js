
const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev';

// Initialize app once DOM ready
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

  // Track app state
  const dataState = {
    allData: [],
    isHarvesting: false,
    activeCategory: 'all',
  };

  // --- Event Handlers ---
  searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim();
    startHarvest(dataState.activeCategory, query);
  });

  sourceButtons.forEach(btn => btn.addEventListener('click', () => {
    sourceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const category = btn.dataset.type;
    dataState.activeCategory = category;
    startHarvest(category);
  }));

  harvestButton.addEventListener('click', () => startHarvest('all'));
  clearButton.addEventListener('click', clearResults);

  // --- Core Harvest Function ---
  async function startHarvest(category = 'all', query = '') {
    if (dataState.isHarvesting) {
      alert('Harvest already in progress. Please wait...');
      return;
    }
    dataState.isHarvesting = true;
    dataState.allData = [];

    resultsSection.classList.add('active');
    dataCardsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-spinner fa-spin"></i>
        <h3>Harvesting in progress...</h3>
        <p>Fetching ${category.toUpperCase()} data. Please wait...</p>
      </div>`;
    resultsCount.textContent = 'Fetching...';
    progressBar.style.width = '15%';
    harvestStatus.textContent = 'Initializing harvest...';

    try {
      const payload = {
        category,
        query,
        perSourceLimit: 1000
      };

      const response = await fetch(`${WORKER_URL}/api/harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`Worker responded with ${response.status}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Unknown error');

      progressBar.style.width = '65%';
      dataState.allData = data.results || [];

      // UI: show cache/live indicator
      if (data.cached) {
        harvestStatus.innerHTML = `⚡ Loaded from cache (${data.total.toLocaleString()} records)`;
      } else {
        harvestStatus.innerHTML = `⏳ Live harvest complete (${data.total.toLocaleString()} new records)`;
      }

      // Show results
      displayResults(dataState.allData, category);
      resultsCount.textContent = `${data.total.toLocaleString()} results`;
      progressBar.style.width = '100%';
    } catch (err) {
      console.error(err);
      harvestStatus.textContent = `❌ Error: ${err.message}`;
      dataCardsContainer.innerHTML = `
        <div class="no-results">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Harvest Failed</h3>
          <p>${err.message}</p>
        </div>`;
    } finally {
      dataState.isHarvesting = false;
    }
  }

  // --- Display Result Cards ---
  function displayResults(records, category) {
    if (!records || !records.length) {
      dataCardsContainer.innerHTML = `
        <div class="no-results">
          <i class="fas fa-database"></i>
          <h3>No ${category} records found</h3>
          <p>Try searching for something else or re-harvest data.</p>
        </div>`;
      resultsCount.textContent = '0 results';
      return;
    }

    const fragment = document.createDocumentFragment();
    records.forEach(item => {
      const card = document.createElement('div');
      card.className = 'data-card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-type">${escapeHtml(item.type || '')}</div>
          <div class="card-source">${escapeHtml(item.source || '')}</div>
        </div>
        <div class="card-body">
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
            ${item.downloadUrl ? `<button class="card-action" onclick="window.open('${item.downloadUrl}','_blank')" title="Download"><i class="fas fa-download"></i></button>` : ''}
          </div>
        </div>
      `;
      fragment.appendChild(card);
    });

    dataCardsContainer.innerHTML = '';
    dataCardsContainer.appendChild(fragment);
  }

  // --- Clear Results ---
  function clearResults() {
    dataCardsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>Cache cleared</h3>
        <p>Click harvest to load new data.</p>
      </div>`;
    resultsCount.textContent = '0 results';
    harvestStatus.textContent = 'Ready';
    progressBar.style.width = '0%';
  }

  // --- Helper: escape HTML ---
  function escapeHtml(text) {
    return text?.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])) || '';
  }
});
