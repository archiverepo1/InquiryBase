const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
let currentCategory = "all";
let currentPage = 1;
let currentQuery = "";
let currentResults = [];
let selectedRecords = [];

/* Helpers */
const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

/* Fetch */
async function fetchResults(page = 1) {
  const body = {
    category: currentCategory,
    query: currentQuery.trim(),
    page,
    pageSize: 24,
    filters: getCurrentFilters()
  };

  const container  = qs("#dataCardsContainer");
  const progress   = qs("#progressBar");
  const pagination = qs("#pagination");

  container.innerHTML = "";
  pagination.style.display = "none";
  if (progress) progress.style.width = "20%";

  try {
    const res = await fetch(`${API_BASE}/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Harvest failed");

    currentResults = data.results || [];
    renderResults(currentResults, data.page, data.total);
    renderFilters(data.facets);
  } catch (e) {
    container.innerHTML = `
      <div class="no-results">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error Loading Data</h3>
        <p>${e.message}</p>
      </div>`;
  } finally {
    if (progress) {
      progress.style.width = "100%";
      setTimeout(() => (progress.style.width = "0%"), 400);
    }
  }
}

/* Render */
function renderResults(records, page, total) {
  const container  = qs("#dataCardsContainer");
  const pagination = qs("#pagination");
  container.innerHTML = "";

  if (!records?.length) {
    container.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>Try another category, search term, or adjust filters.</p>
      </div>`;
    pagination.style.display = "none";
    updateBulkButton();
    return;
  }

  const html = records.map(r => {
    const title   = r.title || "Untitled";
    const source  = r.source || "";
    const desc    = (r.description || "").trim();
    const short   = desc.length > 300 ? desc.slice(0, 300) + "…" : desc;
    const authors = Array.isArray(r.authors) ? r.authors.join(", ") : (r.authors || "");
    const year    = r.year || "—";
    const type    = r.type || "";
    const url     = r.url || "#";

    return `
      <div class="data-card" data-type="${type}">
        <div class="data-header">
          <h3>${title}</h3>
          <span class="source-tag">${source}</span>
        </div>
        <div class="data-body">
          ${authors ? `<p class="card-authors">${authors}</p>` : ""}
          ${short   ? `<p class="card-description">${short}</p>` : ""}
        </div>
        <div class="data-meta"><small>${year} • ${type}</small></div>
        <div class="data-actions">
          ${url !== "#" ? `<a href="${url}" target="_blank" rel="noopener" class="btn-sm">Open</a>` : ""}
          <button class="btn-sm select-btn" data-id="${r.id}">
            <i class="fa-solid fa-circle-plus"></i> Select
          </button>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = html;

  // Pagination controls
  const pageInfo  = qs("#pageInfo");
  const totalInfo = qs("#totalInfo");
  const prevBtn   = qs("#prevBtn");
  const nextBtn   = qs("#nextBtn");

  const pageSize  = 24;
  const totalPages= Math.ceil(total / pageSize);

  pageInfo.textContent  = `Page ${page} of ${totalPages}`;
  totalInfo.textContent = `${total} records`;
  pagination.style.display = "flex";
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;

  prevBtn.onclick = () => { currentPage = Math.max(1, page - 1); fetchResults(currentPage); };
  nextBtn.onclick = () => { currentPage = Math.min(totalPages, page + 1); fetchResults(currentPage); };

  // selection buttons
  qsa(".select-btn").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const rec = currentResults.find(r => r.id === id);
      if (!rec) return;
      const idx = selectedRecords.findIndex(r => r.id === id);
      if (idx >= 0) selectedRecords.splice(idx, 1);
      else selectedRecords.push(rec);
      updateSelectButtons();
    };
  });

  updateSelectButtons();
}

/* Filters */
function renderFilters(facets) {
  const wrap    = qs("#filtersWrap");
  const sidebar = qs("#filtersSidebar");
  if (!wrap || !facets) return;

  const years = facets.years || [];
  const repos = facets.repositories || [];
  const types = facets.types || [];
  const langs = facets.languages || [];

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
        ${repos.map(r => `<option value="${r.name}">${r.name} (${r.count})</option>`).join("")}
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
      <label>Language</label>
      <select id="fltLanguage">
        <option value="">All Languages</option>
        ${langs.map(l => `<option value="${l.name}">${l.name} (${l.count})</option>`).join("")}
      </select>
    </div>

    <div class="filter">
      <label>Author contains</label>
      <input id="fltAuthor" type="text" placeholder="e.g. Smith" />
    </div>

    <button id="applyFilters" class="btn sm">
      <i class="fa-solid fa-filter"></i> Apply Filters
    </button>
  `;

  sidebar.style.display = "block";
  qs("#applyFilters").onclick = () => { currentPage = 1; fetchResults(1); };
}

function getCurrentFilters() {
  return {
    year:       qs("#fltYear")?.value || "",
    repository: qs("#fltRepo")?.value || "",
    type:       qs("#fltType")?.value || "",
    author:     qs("#fltAuthor")?.value || "",
    language:   qs("#fltLanguage")?.value || ""
  };
}

/* Tabs */
qsa(".tab").forEach(tab => {
  tab.addEventListener("click", (e) => {
    qsa(".tab").forEach(t => t.classList.remove("active"));
    e.currentTarget.classList.add("active");
    currentCategory = e.currentTarget.dataset.type; // all | research | articles | theses
    currentPage = 1;
    fetchResults();
  });
});

/* Main Search */
qs("#searchBtn").addEventListener("click", () => {
  currentQuery = qs("#searchBox").value || "";
  currentPage = 1;
  fetchResults();
});

/* E-prints redirect (accurate search handled by E-LIS) */
qs("#elisSearchBtn")?.addEventListener("click", () => {
  const q = (qs("#elisBox")?.value || "").trim();
  const url = q
    ? `http://eprints.rclis.org/cgi/search/simple?q=${encodeURIComponent(q)}`
    : `http://eprints.rclis.org/`;
  window.open(url, "_blank", "noopener");
});

/* Selection + RIS export */
function updateSelectButtons() {
  qsa(".select-btn").forEach(b => {
    const id = b.dataset.id;
    const on = selectedRecords.some(r => r.id === id);
    b.innerHTML = on ? `<i class="fa-solid fa-check-circle"></i> Selected`
                     : `<i class="fa-solid fa-circle-plus"></i> Select`;
    b.classList.toggle("selected", on);
  });
  updateBulkButton();
}
function updateBulkButton() {
  const bulkBtn = qs("#bulkRisButton");
  const n = selectedRecords.length;
  bulkBtn.style.display = n ? "inline-flex" : "none";
  bulkBtn.innerHTML = `<i class="fa-solid fa-file-export"></i> Export Selected (${n})`;
}
qs("#bulkRisButton").addEventListener("click", async () => {
  if (!selectedRecords.length) return alert("No records selected.");
  try {
    const res = await fetch(`${API_BASE}/ris`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: selectedRecords })
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inquirybase_export.ris";
    a.click();
  } catch (err) {
    alert("Failed to export RIS: " + err.message);
  }
});

/* Auto-load */
window.addEventListener("DOMContentLoaded", () => fetchResults());
