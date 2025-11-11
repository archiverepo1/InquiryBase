
const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";

// UI state
let currentCategory = "all";   // all | research | articles | theses
let currentPage = 1;
let currentQuery = "";
let currentResults = [];
let selectedRecords = [];

// Shortcuts
const qs  = (s) => document.querySelector(s);
const qsa = (s) => document.querySelectorAll(s);

/* ============================== Fetch ============================== */
async function fetchResults(page = 1) {
  const payload = {
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
  if (pagination) pagination.style.display = "none";
  if (progress) progress.style.width = "20%";

  try {
    const res  = await fetch(`${API_BASE}/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error || "Failed to load records.");
    currentResults = data.results || [];

    renderResults(data.results, data.page, data.total);
    renderFilters(data.facets);
  } catch (err) {
    container.innerHTML = `
      <div class="no-results">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error Loading Data</h3>
        <p>${err.message}</p>
      </div>`;
  } finally {
    if (progress) {
      progress.style.width = "100%";
      setTimeout(() => (progress.style.width = "0%"), 400);
    }
  }
}

/* ============================== Render: Cards ============================== */
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
    if (pagination) pagination.style.display = "none";
    updateBulkButton();
    return;
  }

  const html = records.map(cardHTML).join("");
  container.innerHTML = html;

  // Pagination
  const pageInfo   = qs("#pageInfo");
  const totalInfo  = qs("#totalInfo");
  const prevBtn    = qs("#prevBtn");
  const nextBtn    = qs("#nextBtn");
  const pageSize   = 24;
  const totalPages = Math.ceil(total / pageSize);

  if (pageInfo)  pageInfo.textContent = `Page ${page} of ${Math.max(totalPages, 1)}`;
  if (totalInfo) totalInfo.textContent = `${total} records`;

  if (pagination) pagination.style.display = "flex";
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;

  if (prevBtn) prevBtn.onclick = () => { currentPage = Math.max(1, page - 1); fetchResults(currentPage); };
  if (nextBtn) nextBtn.onclick = () => { currentPage = Math.min(totalPages, page + 1); fetchResults(currentPage); };

  // “Select” buttons
  qsa(".select-btn").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const record = currentResults.find(r => r.id === id);
      if (!record) return;
      const idx = selectedRecords.findIndex(r => r.id === id);
      if (idx >= 0) selectedRecords.splice(idx, 1);
      else selectedRecords.push(record);
      updateSelectButtons();
    };
  });

  updateSelectButtons();
}

function cardHTML(r) {
  const title   = escapeHTML(r.title || "Untitled");
  const source  = escapeHTML(r.source || "");
  const descRaw = String(r.description || "").trim();
  const desc    = escapeHTML(descRaw.length > 300 ? descRaw.slice(0, 300) + "…" : descRaw);
  const authors = Array.isArray(r.authors) ? r.authors.join(", ") : (r.authors || "");
  const year    = r.year || "—";
  const type    = r.type || "";
  const url     = r.url || "#";

  return `
    <div class="data-card">
      <div class="card-header">
        <span class="card-type">${escapeHTML(type || "Record")}</span>
        <span class="card-source">${source}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${title}</h3>
        ${authors ? `<p class="card-authors">${escapeHTML(authors)}</p>` : ""}
        ${desc ? `<p class="card-description">${desc}</p>` : ""}
      </div>
      <div class="card-footer">
        <div class="card-meta">
          <span><b>Year:</b> ${escapeHTML(String(year))}</span>
        </div>
        <div class="card-actions">
          ${url !== "#" ? `<a class="btn sm" href="${url}" target="_blank" rel="noopener">Open</a>` : ""}
          <button class="btn sm select-btn" data-id="${r.id}">
            <i class="fa-solid fa-circle-plus"></i> Select
          </button>
        </div>
      </div>
    </div>`;
}

/* ============================== Render: Filters ============================== */
function renderFilters(facets) {
  const wrap    = qs("#filtersWrap");
  const sidebar = qs("#filtersSidebar");
  if (!wrap || !facets) return;

  const years = facets.years || [];
  const repos = (facets.repositories || []).filter(r => !/zenodo/i.test(r.name)); // hard-remove any stray Zenodo label
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
        ${repos.map(r => `<option value="${escapeHTML(r.name)}">${escapeHTML(r.name)} (${r.count})</option>`).join("")}
      </select>
    </div>
    <div class="filter">
      <label>Type</label>
      <select id="fltType">
        <option value="">All Types</option>
        ${types.map(t => `<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)} (${t.count})</option>`).join("")}
      </select>
    </div>
    <div class="filter">
      <label>Author contains</label>
      <input id="fltAuthor" type="text" placeholder="e.g. Smith" />
    </div>
    <div class="filter">
      <label>Language</label>
      <select id="fltLanguage">
        <option value="">All Languages</option>
        ${langs.map(l => `<option value="${escapeHTML(l.name)}">${escapeHTML(l.name)} (${l.count})</option>`).join("")}
      </select>
    </div>
    <button id="applyFilters" class="btn sm"><i class="fa-solid fa-filter"></i> Apply Filters</button>
  `;

  sidebar.style.display = "block";
  qs("#applyFilters").onclick = () => { currentPage = 1; fetchResults(1); };
}

function getCurrentFilters() {
  const year       = qs("#fltYear")?.value || "";
  const repository = qs("#fltRepo")?.value || "";
  const type       = qs("#fltType")?.value || "";
  const author     = qs("#fltAuthor")?.value || "";
  const language   = qs("#fltLanguage")?.value || "";
  return { year, repository, type, author, language };
}

/* ============================== Tabs & Search ============================== */
qsa(".tab").forEach((tab) => {
  tab.addEventListener("click", (e) => {
    qsa(".tab").forEach(t => t.classList.remove("active"));
    e.currentTarget.classList.add("active");
    currentCategory = e.currentTarget.dataset.type; // all | research | articles | theses
    currentPage = 1;
    fetchResults();
  });
});

// Main search (exact or non-quoted) — accuracy handled by backend scorer
qs("#searchBtn").addEventListener("click", () => {
  currentQuery = qs("#searchBox").value || "";
  currentPage = 1;
  fetchResults();
});

// Press Enter in search box
qs("#searchBox").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    currentQuery = qs("#searchBox").value || "";
    currentPage = 1;
    fetchResults();
  }
});

/* ============================== E-LIS (E-prints) ============================== */
// Redirect — keep live search externally; accurate results controlled by E-LIS
qs("#elisSearchBtn")?.addEventListener("click", () => {
  const q = (qs("#elisBox")?.value || "").trim();
  const url = q
    ? `http://eprints.rclis.org/cgi/search/simple?q=${encodeURIComponent(q)}`
    : `http://eprints.rclis.org/`;
  window.open(url, "_blank", "noopener");
});

/* ============================== Selection + Export ============================== */
function updateSelectButtons() {
  qsa(".select-btn").forEach((b) => {
    const id = b.dataset.id;
    const isSelected = selectedRecords.some(r => r.id === id);
    b.innerHTML = isSelected
      ? `<i class="fa-solid fa-check-circle"></i> Selected`
      : `<i class="fa-solid fa-circle-plus"></i> Select`;
    b.classList.toggle("selected", isSelected);
  });
  updateBulkButton();
}

function updateBulkButton() {
  const bulkBtn = qs("#bulkRisButton");
  const n = selectedRecords.length;
  if (!bulkBtn) return;
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

/* ============================== Utils ============================== */
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ============================== Boot ============================== */
window.addEventListener("DOMContentLoaded", () => {
  // Smaller, professional placeholder (if your CSS doesn’t already handle it)
  const searchBox = qs("#searchBox");
  if (searchBox) searchBox.setAttribute("placeholder", "Search by keyword, title, or author…");

  fetchResults();
});
