
const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
const PAGE_SIZE = 24;

let currentCategory = "all";
let currentQuery = "";
let currentPage = 1;
let currentFilters = {};
let totalPages = 1;
let selectedCount = 0;
let lastHarvestTime = 0;
const HARVEST_INTERVAL = 30 * 60 * 1000; // 30 minutes

/* ---------- helpers ---------- */
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const show = (el) => el && (el.style.display = "");
const hide = (el) => el && (el.style.display = "none");

/* ---------- Smart Search with Auto-Harvest ---------- */
async function smartSearch(page = 1) {
  currentPage = page;
  const progress = qs("#progressBar");
  const progressContainer = qs(".progress-bar");
  const sourceIndicator = qs("#sourceIndicator");
  const currentSource = qs("#currentSource");
  const liveBadge = qs("#liveBadge");
  
  if (progress && progressContainer) {
    progressContainer.style.display = "block";
    progress.style.width = "25%";
  }

  // Update source indicator
  show(sourceIndicator);
  if (currentCategory === "elis") {
    currentSource.textContent = "E-LIS Repository";
    show(liveBadge);
  } else {
    currentSource.textContent = getCategoryDisplayName(currentCategory);
    hide(liveBadge);
  }

  showLoadingState();

  console.log(`🔍 Smart Search: category=${currentCategory}, page=${page}, query="${currentQuery}"`);

  try {
    let apiUrl, requestBody;
    
    if (currentCategory === "elis") {
      // E-LIS always uses live search
      apiUrl = `${API_BASE}/elis-live-search`;
      requestBody = {
        query: currentQuery,
        page: currentPage,
        pageSize: PAGE_SIZE
      };
    } else {
      // Other categories use cached data
      apiUrl = `${API_BASE}/harvest`;
      requestBody = {
        category: currentCategory,
        query: currentQuery,
        page: currentPage,
        pageSize: PAGE_SIZE,
        filters: currentFilters
      };
    }

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log("📦 API Response:", data);
    
    if (!data.success) {
      throw new Error(data.error || "API returned failure");
    }

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Invalid response format: results array missing");
    }

    // Trigger auto-harvest for non-ELIS categories
    if (currentCategory !== "elis") {
      triggerAutoHarvest(currentCategory);
    }

    renderResults(data.results, currentCategory === "elis");
    
    if (currentCategory !== "elis") {
      renderFilters(data.facets);
      show(qs("#filtersSidebar"));
    } else {
      hide(qs("#filtersSidebar"));
    }
    
    const totalRecords = data.total || 0;
    totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    updatePagination(data.page, totalPages, totalRecords);

    if (progress) {
      progress.style.width = "100%";
      setTimeout(() => {
        progressContainer.style.display = "none";
        progress.style.width = "0%";
      }, 500);
    }
    
  } catch (e) {
    console.error("❌ Search error:", e);
    renderError(e.message);
    if (progress) {
      progress.style.width = "0%";
      progressContainer.style.display = "none";
    }
  }
}

/* ---------- Auto-Harvest System ---------- */
async function triggerAutoHarvest(category) {
  const now = Date.now();
  
  // Only harvest if it's been more than the interval since last harvest
  if (now - lastHarvestTime < HARVEST_INTERVAL) {
    console.log("⏱️  Using cached data, last harvest:", new Date(lastHarvestTime).toLocaleTimeString());
    return;
  }

  console.log(`🔄 Auto-harvesting fresh data for: ${category}`);
  
  try {
    const response = await fetch(`${API_BASE}/harvest-incremental`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: category })
    });
    
    const result = await response.json();
    
    if (result.success) {
      lastHarvestTime = now;
      console.log(`✅ Auto-harvest completed: ${result.newRecords} new records`);
      
      // Show subtle notification
      showHarvestNotification(result.newRecords);
      
      // Update system info to reflect new data
      setTimeout(() => checkSystemHealth(), 2000);
    } else {
      console.error("❌ Auto-harvest failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Auto-harvest request failed:", error);
  }
}

function showHarvestNotification(newRecords) {
  if (newRecords === 0) return;
  
  const notification = qs("#harvestNotification");
  notification.textContent = `🔄 Added ${newRecords} new records`;
  notification.style.display = "block";
  
  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
}

/* ---------- render: results ---------- */
function renderResults(records = [], isLiveSearch = false) {
  const c = qs("#dataCardsContainer");
  if (!c) {
    console.error("Could not find dataCardsContainer");
    return;
  }

  c.innerHTML = "";

  if (!records.length) {
    const noResultsMessage = isLiveSearch 
      ? "No results found in E-LIS repository. Try a different search term."
      : "No results found in cached data. Try a different search term or category.";
      
    c.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>${noResultsMessage}</p>
        ${!isLiveSearch && currentQuery ? `<p><button class="btn primary" onclick="switchToEliSLiveSearch()">Try E-LIS Live Search</button></p>` : ''}
      </div>`;
    hide(qs("#pagination"));
    return;
  }

  console.log(`🎨 Rendering ${records.length} records`);

  for (const r of records) {
    try {
      const recJSON = encodeURIComponent(JSON.stringify(r));
      const authors = Array.isArray(r.authors) ? r.authors.join(", ") : (r.authors || "");
      const desc = (r.description || "").trim();
      const title = r.title || "Untitled";
      const source = r.source || "Unknown";
      const type = r.type || "Record";
      const year = r.year || "—";
      const identifier = r.identifier || "—";
      const url = r.url || "#";

      // URL validation
      const hasValidUrl = url && url !== '#' && (url.startsWith('http://') || url.startsWith('https://'));

      c.insertAdjacentHTML("beforeend", `
        <div class="data-card">
          <div class="card-header">
            <span class="card-type">${type}</span>
            <span class="card-source">${source}</span>
          </div>
          <div class="card-body">
            <h3 class="card-title">${title}</h3>
            ${authors ? `<p class="card-authors">${authors}</p>` : ''}
            ${desc ? `<p class="card-description">${desc.length > 300 ? desc.slice(0,300) + "…" : desc}</p>` : ''}
          </div>
          <div class="card-footer">
            <div class="card-meta">
              <span><b>Year:</b> ${year}</span>
              <span><b>ID:</b> ${identifier}</span>
            </div>
            <div class="card-actions">
              ${hasValidUrl ? 
                `<a class="btn sm" href="${url}" target="_blank" rel="noopener">
                  <i class="fas fa-external-link-alt"></i> Open
                </a>` : 
                `<span class="btn sm disabled">
                  <i class="fas fa-unlink"></i> No URL
                </span>`
              }
              <input class="select-record" type="checkbox" data-record="${recJSON}">
            </div>
          </div>
        </div>
      `);
    } catch (err) {
      console.error("Error rendering record:", err, r);
    }
  }

  // Add event listeners to checkboxes
  qsa(".select-record").forEach(cb => {
    cb.addEventListener("change", updateSelectedCount);
  });

  updateSelectedCount();
  show(qs("#pagination"));
}

function switchToEliSLiveSearch() {
  currentCategory = "elis";
  qsa(".tab").forEach(t => t.classList.remove("active"));
  qs('.tab[data-type="elis"]').classList.add("active");
  smartSearch(1);
}

function showLoadingState() {
  const c = qs("#dataCardsContainer");
  if (!c) return;
  
  if (currentCategory === "elis") {
    c.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <h3>Searching E-LIS Repository</h3>
        <p>Performing live search in Library and Information Science e-prints...</p>
      </div>`;
  } else {
    c.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <h3>Loading Research Data</h3>
        <p>Searching ${getCategoryDisplayName(currentCategory)} records...</p>
      </div>`;
  }
}

function getCategoryDisplayName(category) {
  const names = {
    all: "All Sources",
    research: "Research Data", 
    articles: "Journal Articles",
    theses: "Theses",
    elis: "E-LIS Repository"
  };
  return names[category] || category;
}

/* ---------- selected records count ---------- */
function updateSelectedCount() {
  selectedCount = qsa(".select-record:checked").length;
  const risBtn = qs("#bulkRisButton");
  
  if (risBtn) {
    if (selectedCount > 0) {
      risBtn.style.display = "flex";
      risBtn.innerHTML = `<i class="fas fa-download"></i> Export RIS (${selectedCount})`;
    } else {
      risBtn.style.display = "none";
    }
  }
}

/* ---------- filters ---------- */
function renderFilters(facets) {
  const wrap = qs("#filtersWrap");
  if (!facets || !wrap) return;

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

  const applyBtn = qs("#applyFilters");
  if (applyBtn) {
    applyBtn.onclick = () => {
      currentFilters = {
        year: qs("#fltYear").value,
        repository: qs("#fltRepo").value,
        type: qs("#fltType").value,
        author: qs("#fltAuthor").value
      };
      console.log("🎯 Applying filters:", currentFilters);
      smartSearch(1);
    };
  }
}

/* ---------- pagination ---------- */
function updatePagination(page, computedTotalPages, total) {
  currentPage = page;
  totalPages = computedTotalPages || 1;
  
  const pageInfo = qs("#pageInfo");
  const totalInfo = qs("#totalInfo");
  const prevBtn = qs("#prevBtn");
  const nextBtn = qs("#nextBtn");
  
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  if (totalInfo) totalInfo.textContent = `${total} records`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

/* ---------- search & tabs ---------- */
function initializeEventListeners() {
  // Search button
  const searchBtn = qs("#searchBtn");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      currentQuery = (qs("#searchBox")?.value || "").trim();
      console.log("Searching for:", currentQuery);
      smartSearch(1);
    });
  }

  // Enter key in search box
  const searchBox = qs("#searchBox");
  if (searchBox) {
    searchBox.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        currentQuery = searchBox.value.trim();
        console.log("Searching (Enter):", currentQuery);
        smartSearch(1);
      }
    });
  }

  // Tabs - with auto-harvest
  qsa(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = btn.dataset.type;
      currentPage = 1;
      console.log("📁 Switching to category:", currentCategory);
      smartSearch(1);
    });
  });

  // Clear button
  const clearBtn = qs("#clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      currentQuery = "";
      currentFilters = {};
      const searchBox = qs("#searchBox");
      if (searchBox) searchBox.value = "";
      console.log("🧹 Clearing search and filters");
      smartSearch(1);
    });
  }

  // Pagination
  const prevBtn = qs("#prevBtn");
  const nextBtn = qs("#nextBtn");
  
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        smartSearch(currentPage - 1);
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        smartSearch(currentPage + 1);
      }
    });
  }

  // RIS Export
  const risBtn = qs("#bulkRisButton");
  if (risBtn) {
    risBtn.addEventListener("click", exportRIS);
  }
}

/* ---------- bulk RIS ---------- */
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
    alert("Select at least one record.");
    return;
  }

  console.log(`Exporting ${selected.length} records to RIS`);

  try {
    const res = await fetch(`${API_BASE}/ris`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: selected })
    });

    if (!res.ok) {
      throw new Error(`Export failed: HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inquirybase_export.ris";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (e) {
    console.error("RIS export error:", e);
    alert("Export failed: " + e.message);
  }
}

/* ---------- System Health Monitoring ---------- */
async function checkSystemHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    updateSystemInfo(data);
    
    // Update last harvest time from system info
    if (data.harvest?.last_harvest) {
      lastHarvestTime = new Date(data.harvest.last_harvest).getTime();
    }
  } catch (e) {
    console.error("Health check failed:", e);
    updateSystemInfo({ error: "Health check failed" });
  }
}

function updateSystemInfo(data) {
  const el = qs("#systemInfo");
  if (!el) return;

  if (data.error) {
    el.innerHTML = `<span style="color: #dc3545;">❌ ${data.error}</span>`;
    return;
  }

  const healthData = data.data || {};
  const lastHarvest = data.harvest?.last_harvest ? new Date(data.harvest.last_harvest).toLocaleString() : 'Never';
  
  el.innerHTML = `
    <div><b>Records:</b> ${healthData.total_records?.toLocaleString() || 0}</div>
    <div><b>Theses:</b> ${healthData.theses?.toLocaleString() || 0}</div>
    <div><b>Articles:</b> ${healthData.articles?.toLocaleString() || 0}</div>
    <div><b>Research Data:</b> ${healthData.research?.toLocaleString() || 0}</div>
    <div><b>Last Harvest:</b> ${lastHarvest}</div>
    <div><b>Includes E-LIS:</b> ${data.repositories?.includes_elis ? '✅' : '❌'}</div>
  `;
}

/* ---------- error ---------- */
function renderError(msg) {
  const c = qs("#dataCardsContainer");
  if (!c) return;

  c.innerHTML = `
    <div class="error-state">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Error Loading Data</h3>
      <p>${msg}</p>
      <p><small>Check the console for more details.</small></p>
    </div>`;
    
  hide(qs("#pagination"));
}

/* ---------- initial load ---------- */
window.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Academic Library Harvester initialized with Auto-Harvest System");
  initializeEventListeners();
  checkSystemHealth();
  smartSearch(1);
  
  // Refresh health every 5 minutes
  setInterval(checkSystemHealth, 300000);
  
  // Auto-harvest every 30 minutes if page remains open
  setInterval(() => {
    if (currentCategory !== "elis") {
      triggerAutoHarvest(currentCategory);
    }
  }, HARVEST_INTERVAL);
});
