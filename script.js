
const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
const PAGE_SIZE = 24;

let currentCategory = "all";
let currentQuery = "";
let currentPage = 1;
let currentFilters = {};
let totalPages = 1;
let currentResults = [];
let selectedRecords = [];

/* ---------- helpers ---------- */
const qs  = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];
const show = (el) => el && (el.style.display = "");
const hide = (el) => el && (el.style.display = "none");

/* ---------- fetch ---------- */
async function fetchResults(page = 1) {
  currentPage = page;
  const progress = qs("#progressBar");
  if (progress) progress.style.width = "25%";

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
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "API returned failure");
    if (!Array.isArray(data.results)) throw new Error("Invalid response format");

    currentResults = data.results;
    renderResults(data.results);

    const totalRecords = data.total || 0;
    totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    updatePagination(data.page, totalPages, totalRecords);

    show(qs("#filtersSidebar"));
    if (progress) progress.style.width = "100%";
  } catch (e) {
    renderError(e.message);
    if (progress) progress.style.width = "0";
  }
}

/* ---------- render: results (classic clean card) ---------- */
function renderResults(records = []) {
  const c = qs("#dataCardsContainer");
  if (!c) return;
  c.innerHTML = "";

  if (!records.length) {
    c.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>Try another category, search term, or adjust filters.</p>
      </div>`;
    hide(qs("#pagination"));
    return;
  }

  for (const r of records) {
    const authors = Array.isArray(r.authors) ? r.authors.join(", ") : (r.authors || "");
    const desc = (r.description || "").trim();
    const title = r.title || "Untitled";
    const source = r.source || "";
    const type = r.type || "";
    const year = r.year || "";
    const url = r.url || "#";

    const recJSON = encodeURIComponent(JSON.stringify(r));

    c.insertAdjacentHTML("beforeend", `
      <div class="data-card">
        <div class="card-header">
          <h3 class="card-title">${title}</h3>
          <span class="card-source">${source}</span>
        </div>
        <div class="card-body">
          ${desc ? `<p class="card-description">${desc.length > 400 ? desc.slice(0,400) + "…" : desc}</p>` : ""}
        </div>
        <div class="card-footer">
          <div class="card-meta">
            ${authors ? `<span>${authors}</span>` : ""}
            <span>${[year, type].filter(Boolean).join(" • ")}</span>
          </div>
          <div class="card-actions">
            ${url && url !== "#" ? `<a class="btn sm" href="${url}" target="_blank" rel="noopener">Open</a>` : ""}
            <button class="btn sm select-btn" data-record="${recJSON}">Select</button>
          </div>
        </div>
      </div>
    `);
  }

  // selection button wiring
  qsa(".select-btn").forEach(btn => {
    btn.onclick = () => {
      try {
        const record = JSON.parse(decodeURIComponent(btn.dataset.record));
        const idx = selectedRecords.findIndex(r => r.id === record.id);
        if (idx >= 0) selectedRecords.splice(idx, 1);
        else selectedRecords.push(record);
        toggleRISButton();
        btn.textContent = idx >= 0 ? "Select" : "Selected";
      } catch {}
    };
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

  qs("#applyFilters").onclick = () => {
    currentFilters = {
      year: qs("#fltYear").value,
      repository: qs("#fltRepo").value,
      type: qs("#fltType").value,
      author: qs("#fltAuthor").value
    };
    fetchResults(1);
  };
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

  prevBtn.onclick = () => { if (currentPage > 1) fetchResults(currentPage - 1); };
  nextBtn.onclick = () => { if (currentPage < totalPages) fetchResults(currentPage + 1); };
}

/* ---------- search & tabs ---------- */
function initializeEventListeners() {
  qs("#searchBtn").addEventListener("click", () => {
    currentQuery = (qs("#searchBox")?.value || "").trim();
    fetchResults(1);
  });

  const searchBox = qs("#searchBox");
  if (searchBox) {
    searchBox.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        currentQuery = searchBox.value.trim();
        fetchResults(1);
      }
    });
  }

  qsa(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = btn.dataset.type;
      currentPage = 1;
      fetchResults(1);
    });
  });

  // E-LIS mini search (exact-match handled server side too)
  const elisBtn = qs("#elisSearchBtn");
  if (elisBtn) {
    elisBtn.addEventListener("click", () => {
      currentCategory = "elis";
      currentQuery = (qs("#elisBox")?.value || "").trim();
      currentPage = 1;
      fetchResults(1);
    });
  }

  // Bulk RIS
  const risBtn = qs("#bulkRisButton");
  if (risBtn) risBtn.addEventListener("click", exportRIS);
}

function toggleRISButton() {
  const risBtn = qs("#bulkRisButton");
  if (!risBtn) return;
  risBtn.style.display = selectedRecords.length ? "inline-flex" : "none";
}

/* ---------- RIS Export ---------- */
async function exportRIS() {
  if (!selectedRecords.length) {
    alert("Select at least one record.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/ris`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: selectedRecords })
    });
    if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
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
    </div>`;
  hide(qs("#pagination"));
}

/* ---------- init ---------- */
window.addEventListener("DOMContentLoaded", () => {
  initializeEventListeners();
  fetchResults(1);
});
