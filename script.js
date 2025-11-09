/* ============================================================================
   InquiryBase Frontend v4.6 (Production - Aligned with Worker v4.6)
   - Enhanced API response handling with retry logic
   - Better error management and loading states
   - Complete Zenodo filtering awareness
   ========================================================================== */

const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
const PAGE_SIZE = 24;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

let currentCategory = "all";
let currentQuery = "";
let currentPage = 1;
let currentFilters = {};
let totalPages = 1;
let totalRecords = 0;

/* ---------- DOM Utilities ---------- */
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const show = (el) => el && (el.style.display = "");
const hide = (el) => el && (el.style.display = "none");

/* ---------- Enhanced API Fetch with Retry Logic ---------- */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success && data.success !== undefined) {
        throw new Error(data.error || "API returned failure");
      }
      
      return data;
    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt === retries) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
    }
  }
}

/* ---------- Main Data Fetch ---------- */
async function fetchResults(page = 1) {
  currentPage = page;
  const progress = qs("#progressBar");
  const container = qs("#dataCardsContainer");
  
  // Show loading state
  if (progress) progress.style.width = "25%";
  if (container) {
    container.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading ${currentCategory} records...</p>
        <p><small>Sources: University Repositories + Dryad + Mendeley Data</small></p>
      </div>
    `;
  }
  
  hide(qs("#pagination"));
  hide(qs("#filtersSidebar"));

  console.log(`Fetching: category=${currentCategory}, page=${page}, query="${currentQuery}", filters=`, currentFilters);

  try {
    const data = await fetchWithRetry(`${API_BASE}/harvest`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "InquiryBase-Frontend/4.6" 
      },
      body: JSON.stringify({
        category: currentCategory,
        query: currentQuery,
        page: currentPage,
        pageSize: PAGE_SIZE,
        filters: currentFilters
      })
    });
    
    console.log("API Response:", data);

    // Validate response structure
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Invalid response format: results array missing");
    }

    renderResults(data.results);
    renderFilters(data.facets);
    
    totalRecords = data.total || 0;
    totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    updatePagination(data.page, totalPages, totalRecords);

    // Show UI elements only if we have results
    if (data.results.length > 0) {
      show(qs("#filtersSidebar"));
      show(qs("#clearBtn"));
    }
    
    if (progress) progress.style.width = "100%";
    
  } catch (error) {
    console.error("Fetch error:", error);
    renderError(error.message);
    if (progress) progress.style.width = "0";
  }
}

/* ---------- Enhanced Results Rendering ---------- */
function renderResults(records = []) {
  const container = qs("#dataCardsContainer");
  if (!container) {
    console.error("Could not find dataCardsContainer");
    return;
  }

  container.innerHTML = "";

  if (!records.length) {
    container.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>Try another category, search term, or check your filters.</p>
        <p><small>Current category: ${currentCategory} • Query: "${currentQuery}"</small></p>
        <p><small>Sources: University Repositories + Dryad + Mendeley Data (Zenodo excluded)</small></p>
        <button class="btn" onclick="clearSearch()">Clear Search & Filters</button>
      </div>`;
    hide(qs("#pagination"));
    return;
  }

  console.log(`Rendering ${records.length} records`);

  records.forEach(record => {
    try {
      const card = createRecordCard(record);
      container.appendChild(card);
    } catch (err) {
      console.error("Error rendering record:", err, record);
    }
  });

  // Add event listeners to checkboxes
  qsa(".select-record").forEach(cb => {
    cb.addEventListener("change", toggleRISButton);
  });

  toggleRISButton();
  show(qs("#pagination"));
}

/* ---------- Create Record Card Element ---------- */
function createRecordCard(record) {
  const recJSON = encodeURIComponent(JSON.stringify(record));
  const authors = Array.isArray(record.authors) ? record.authors.join(", ") : (record.authors || "");
  const description = (record.description || "").trim();
  const title = record.title || "Untitled";
  const source = record.source || "Unknown";
  const type = record.type || "Record";
  const year = record.year || "—";
  const identifier = record.identifier || "—";
  const url = record.url || "#";
  
  const card = document.createElement('div');
  card.className = 'data-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-type">${escapeHtml(type)}</span>
      <span class="card-source">${escapeHtml(source)}</span>
    </div>
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(title)}</h3>
      ${authors ? `<p class="card-authors">${escapeHtml(authors)}</p>` : ''}
      ${description ? `<p class="card-description">${escapeHtml(description.length > 300 ? description.slice(0,300) + "…" : description)}</p>` : ''}
    </div>
    <div class="card-footer">
      <div class="card-meta">
        <span><b>Year:</b> ${escapeHtml(year)}</span>
        <span><b>ID:</b> ${escapeHtml(identifier)}</span>
      </div>
      <div class="card-actions">
        ${url !== '#' ? `<a class="btn sm" href="${url}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
        <input class="select-record" type="checkbox" data-record="${recJSON}">
      </div>
    </div>
  `;
  
  return card;
}

/* ---------- Enhanced Filter Rendering ---------- */
function renderFilters(facets = {}) {
  const wrap = qs("#filtersWrap");
  if (!wrap) return;

  const years = facets.years || [];
  const repositories = facets.repositories || [];
  const types = facets.types || [];

  wrap.innerHTML = `
    <div class="filter">
      <label>Year</label>
      <select id="fltYear">
        <option value="">All Years</option>
        ${years.map(y => `<option value="${y.name}">${y.name} (${y.count})</option>`).join("")}
      </select>
    </div>
    <div class="filter">
      <label>Repository</label>
      <select id="fltRepo">
        <option value="">All Repositories</option>
        ${repositories.map(r => `<option value="${r.name}">${r.name} (${r.count})</option>`).join("")}
      </select>
    </div>
    <div class="filter">
      <label>Type</label>
      <select id="fltType">
        <option value="">All Types</option>
        ${types.map(t => `<option value="${t.name}">${t.name} (${t.count})</option>`).join("")}
      </select>
    </div>
    <div class="filter">
      <label>Author contains</label>
      <input id="fltAuthor" type="text" placeholder="e.g. Smith" />
    </div>
    <button id="applyFilters" class="btn sm"><i class="fa-solid fa-filter"></i> Apply Filters</button>
  `;

  // Restore previous filter values
  if (currentFilters.year) qs("#fltYear").value = currentFilters.year;
  if (currentFilters.repository) qs("#fltRepo").value = currentFilters.repository;
  if (currentFilters.type) qs("#fltType").value = currentFilters.type;
  if (currentFilters.author) qs("#fltAuthor").value = currentFilters.author;

  const applyBtn = qs("#applyFilters");
  if (applyBtn) {
    applyBtn.onclick = () => {
      currentFilters = {
        year: qs("#fltYear").value,
        repository: qs("#fltRepo").value,
        type: qs("#fltType").value,
        author: qs("#fltAuthor").value
      };
      console.log("Applying filters:", currentFilters);
      fetchResults(1);
    };
  }
}

/* ---------- Enhanced Pagination ---------- */
function updatePagination(page, computedTotalPages, total) {
  currentPage = page;
  totalPages = computedTotalPages || 1;
  totalRecords = total || 0;
  
  const pageInfo = qs("#pageInfo");
  const totalInfo = qs("#totalInfo");
  const prevBtn = qs("#prevBtn");
  const nextBtn = qs("#nextBtn");
  
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  if (totalInfo) totalInfo.textContent = `${totalRecords} records total`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

/* ---------- Event Listeners Initialization ---------- */
function initializeEventListeners() {
  // Search button
  const searchBtn = qs("#searchBtn");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      currentQuery = (qs("#searchBox")?.value || "").trim();
      console.log("Searching for:", currentQuery);
      fetchResults(1);
    });
  }

  // Enter key in search box
  const searchBox = qs("#searchBox");
  if (searchBox) {
    searchBox.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        currentQuery = searchBox.value.trim();
        console.log("Searching (Enter):", currentQuery);
        fetchResults(1);
      }
    });
  }

  // Category tabs
  qsa(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = btn.dataset.type;
      currentPage = 1;
      console.log("Switching to category:", currentCategory);
      fetchResults(1);
    });
  });

  // Clear button
  const clearBtn = qs("#clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearSearch);
  }

  // Pagination
  const prevBtn = qs("#prevBtn");
  const nextBtn = qs("#nextBtn");
  
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        fetchResults(currentPage - 1);
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        fetchResults(currentPage + 1);
      }
    });
  }

  // RIS Export
  const risBtn = qs("#bulkRisButton");
  if (risBtn) {
    risBtn.addEventListener("click", exportRIS);
  }
}

/* ---------- Clear Search Function ---------- */
function clearSearch() {
  currentQuery = "";
  currentFilters = {};
  const searchBox = qs("#searchBox");
  if (searchBox) searchBox.value = "";
  console.log("Clearing search and filters");
  fetchResults(1);
}

/* ---------- Bulk RIS Export ---------- */
function toggleRISButton() {
  const selectedCount = qsa(".select-record:checked").length;
  const risBtn = qs("#bulkRisButton");
  if (risBtn) {
    risBtn.style.display = selectedCount > 0 ? "flex" : "none";
    risBtn.innerHTML = `<i class="fas fa-download"></i> Export ${selectedCount} to RIS`;
  }
}

async function exportRIS() {
  const selected = qsa(".select-record:checked").map(cb => {
    try {
      return JSON.parse(decodeURIComponent(cb.dataset.record));
    } catch (e) {
      console.error("Error parsing record:", e);
      return null;
    }
  }).filter(record => record !== null);

  if (!selected.length) {
    alert("Please select at least one record to export.");
    return;
  }

  console.log(`Exporting ${selected.length} records to RIS`);

  try {
    const response = await fetchWithRetry(`${API_BASE}/ris`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "InquiryBase-Frontend/4.6" 
      },
      body: JSON.stringify({ records: selected })
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inquirybase_export_${new Date().toISOString().split('T')[0]}.ris`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("RIS export error:", error);
    alert("Export failed: " + error.message);
  }
}

/* ---------- Error Handling ---------- */
function renderError(message) {
  const container = qs("#dataCardsContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="no-results error">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Error Loading Data</h3>
      <p>${escapeHtml(message)}</p>
      <p><small>Check the console for more details or try refreshing the page.</small></p>
      <button class="btn" onclick="fetchResults(1)">
        <i class="fas fa-redo"></i> Retry
      </button>
    </div>`;
    
  hide(qs("#pagination"));
}

/* ---------- Utility Functions ---------- */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- Health Check ---------- */
async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    console.log('API Health:', data);
    
    // Update status in UI if element exists
    const statusElement = qs("#apiStatus");
    if (statusElement) {
      statusElement.textContent = data.ok ? "✅ API Online" : "❌ API Offline";
      statusElement.title = `Last harvest: ${data.last_harvest || 'Never'}`;
    }
    
    return data.ok;
  } catch (error) {
    console.warn('API health check failed:', error);
    
    const statusElement = qs("#apiStatus");
    if (statusElement) {
      statusElement.textContent = "❌ API Offline";
    }
    
    return false;
  }
}

/* ---------- Initialization ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  console.log("InquiryBase Frontend v4.6 initialized");
  
  // Check API health on startup
  await checkAPIHealth();
  
  initializeEventListeners();
  fetchResults(1);
});

// Make clearSearch available globally for the retry button
window.clearSearch = clearSearch;
