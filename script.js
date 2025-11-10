/* ============================================================================
   InquiryBase Frontend v5.0.0 (Production Ready - Fixed DSpace & Research)
   - Enhanced URL validation and display
   - Better error handling
   - Improved debugging
   ========================================================================== */

const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
const PAGE_SIZE = 24;

let currentCategory = "all";
let currentQuery = "";
let currentPage = 1;
let currentFilters = {};
let totalPages = 1;

/* ---------- helpers ---------- */
const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const show = (el) => el && (el.style.display = "");
const hide = (el) => el && (el.style.display = "none");

/* ---------- fetch ---------- */
async function fetchResults(page = 1) {
  currentPage = page;
  const progress = qs("#progressBar");
  if (progress) progress.style.width = "25%";

  console.log(`Fetching: category=${currentCategory}, page=${page}, query="${currentQuery}"`);

  try {
    const res = await fetch(`${API_BASE}/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: currentCategory,
        query: currentQuery,
        page: currentPage,
        pageSize: PAGE_SIZE,
        filters: currentFilters
      })
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log("API Response:", data);
    
    if (!data.success) {
      throw new Error(data.error || "API returned failure");
    }

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Invalid response format: results array missing");
    }

    renderResults(data.results);
    renderFilters(data.facets);
    
    const totalRecords = data.total || 0;
    totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    updatePagination(data.page, totalPages, totalRecords);

    show(qs("#filtersSidebar"));
    show(qs("#clearBtn"));
    if (progress) progress.style.width = "100%";
    
  } catch (e) {
    console.error("Fetch error:", e);
    renderError(e.message);
    if (progress) progress.style.width = "0";
  }
}

/* ---------- render: results ---------- */
function renderResults(records = []) {
  const c = qs("#dataCardsContainer");
  if (!c) {
    console.error("Could not find dataCardsContainer");
    return;
  }

  c.innerHTML = "";

  if (!records.length) {
    c.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>Try another category, search term, or check your filters.</p>
        <p><small>Current category: ${currentCategory}</small></p>
      </div>`;
    hide(qs("#pagination"));
    return;
  }

  console.log(`Rendering ${records.length} records`);
  let validUrlCount = 0;
  let dspaceRecords = 0;

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

      // Enhanced URL validation for DSpace and research repositories
      const isDSpace = source.includes('University') && !source.includes('Figshare');
      const hasValidUrl = url && url !== '#' && (url.startsWith('http://') || url.startsWith('https://'));
      
      if (hasValidUrl) validUrlCount++;
      if (isDSpace) dspaceRecords++;

      console.log(`📄 ${isDSpace ? '🏛️' : '🔬'} ${title.substring(0, 50)}... | URL: ${url} | Valid: ${hasValidUrl}`);
      
      // Truncate long URLs for display
      const displayUrl = hasValidUrl ? url : "#";
      const truncatedUrl = hasValidUrl ? (url.length > 50 ? url.substring(0, 50) + '...' : url) : 'No URL available';

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
                `<a class="btn sm" href="${displayUrl}" target="_blank" rel="noopener" title="${url}">
                  <i class="fas fa-external-link-alt"></i> Open
                </a>` : 
                `<span class="btn sm disabled" title="${truncatedUrl}">
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

  console.log(`✅ ${validUrlCount}/${records.length} records have valid URLs`);
  console.log(`🏛️ ${dspaceRecords} DSpace repository records`);

  // Add event listeners to checkboxes
  qsa(".select-record").forEach(cb => {
    cb.addEventListener("change", toggleRISButton);
  });

  toggleRISButton();
  show(qs("#pagination"));
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
      console.log("Applying filters:", currentFilters);
      fetchResults(1);
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

  // Tabs
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
    clearBtn.addEventListener("click", () => {
      currentQuery = "";
      currentFilters = {};
      const searchBox = qs("#searchBox");
      if (searchBox) searchBox.value = "";
      console.log("Clearing search and filters");
      fetchResults(1);
    });
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

/* ---------- bulk RIS ---------- */
function toggleRISButton() {
  const any = qsa(".select-record:checked").length > 0;
  const risBtn = qs("#bulkRisButton");
  if (risBtn) {
    risBtn.style.display = any ? "flex" : "none";
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

/* ---------- error ---------- */
function renderError(msg) {
  const c = qs("#dataCardsContainer");
  if (!c) return;

  c.innerHTML = `
    <div class="no-results">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Error Loading Data</h3>
      <p>${msg}</p>
      <p><small>Check the console for more details.</small></p>
    </div>`;
    
  hide(qs("#pagination"));
}

/* ---------- initial load ---------- */
window.addEventListener("DOMContentLoaded", () => {
  console.log("InquiryBase Frontend v5.0.0 initialized (Fixed DSpace & Research)");
  initializeEventListeners();
  fetchResults(1);
});
