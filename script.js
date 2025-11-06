// ==========================
// Q Data Research Hub (LIVE)
// ==========================

const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev';

// Main app initialization
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

  // Data state
  const dataState = {
    allData: [],
    isHarvesting: false,
  };

  // Attach event handlers
  searchButton.addEventListener('click', () => startHarvest('search', searchInput.value.trim()));
  sourceButtons.forEach(btn => btn.addEventListener('click', () => {
    sourceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    startHarvest(btn.dataset.type);
  }));
  harvestButton.addEventListener('click', () => startHarvest('all'));
  clearButton.addEventListener('click', clearResults);

  // Core harvesting function
  async function startHarvest(category = 'all', query = '') {
    if (dataState.isHarvesting) {
      alert('Harvest already in progress');
      return;
    }
    dataState.isHarvesting = true;
    dataState.allData = [];
    resultsSection.classList.add('active');
    dataCardsContainer.innerHTML = `<div class="no-results"><i class="fas fa-spinner fa-spin"></i><h3>Harvesting in progress...</h3><p>Please wait while we collect live data.</p></div>`;
    resultsCount.textContent = 'Fetching...';
    harvestStatus.textContent = 'Initializing harvest...';
    progressBar.style.width = '0%';

    try {
      const payload = {
        category,
        query,
        perSourceLimit: 100
      };

      const response = await fetch(`${WORKER_URL}/api/harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(`Worker responded with ${response.status}`);
      const data = await response.json();

      if (!data.success) throw new Error(data.error || 'Unknown error');

      // Flatten results
      dataState.allData = data.results || [];
      displayHarvestProgress(data.bySource || []);

      // Display results
      displayResults(dataState.allData);

      harvestStatus.textContent = `Harvest complete — ${data.total.toLocaleString()} records loaded`;
      progressBar.style.width = '100%';
    } catch (err) {
      console.error(err);
      harvestStatus.textContent = `Error: ${err.message}`;
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

  // Show per-source progress summary
  function displayHarvestProgress(sources) {
    if (!Array.isArray(sources)) return;
    const done = sources.filter(s => s.count > 0);
    const failed = sources.filter(s => s.error);
    const lines = [];

    if (done.length)
      lines.push(`✅ ${done.length} sources completed: ${done.map(s => s.source.toUpperCase()).join(', ')}`);
    if (failed.length)
      lines.push(`⚠️ ${failed.length} failed: ${failed.map(s => s.source).join(', ')}`);

    harvestStatus.innerHTML = lines.join('<br>') || 'No sources responded.';
  }

  // Display result cards
  function displayResults(records) {
    if (!records.length) {
      dataCardsContainer.innerHTML = `
        <div class="no-results">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>Try a different keyword or source</p>
        </div>`;
      resultsCount.textContent = '0 results';
      return;
    }

    resultsCount.textContent = `${records.length.toLocaleString()} results`;

    dataCardsContainer.innerHTML = records.map(item => `
      <div class="data-card">
        <div class="card-header">
          <div class="card-type">${(item.type || '').toUpperCase()}</div>
          <div class="card-source">${item.source || ''}</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="card-authors">${(item.authors || []).join(', ')}</div>
          <p class="card-description">${escapeHtml(item.description || '').substring(0, 300)}...</p>
          <div class="card-keywords">
            ${(item.keywords || []).slice(0, 5).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><i class="far fa-calendar"></i> ${item.year || ''}</span>
            <span>${item.identifierType || ''}: <a href="${item.url || '#'}" target="_blank" class="doi-link">${item.identifier || ''}</a></span>
          </div>
          <div class="card-actions">
            <button class="card-action" onclick="window.open('${item.url || '#'}','_blank')" title="View"><i class="fas fa-eye"></i></button>
            ${item.downloadUrl ? `<button class="card-action" onclick="window.open('${item.downloadUrl}','_blank')" title="Download"><i class="fas fa-download"></i></button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  // Clear results
  function clearResults() {
    dataCardsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <h3>No data harvested yet</h3>
        <p>Use the harvest button to collect research data</p>
      </div>`;
    resultsCount.textContent = '0 results';
    harvestStatus.textContent = 'Cleared';
    progressBar.style.width = '0%';
  }

  // Utility
  function escapeHtml(text) {
    return text?.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])) || '';
  }
});
