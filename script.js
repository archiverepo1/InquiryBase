/* ============================================================================
   InquiryBase Frontend v3.5 (Production)
   - Proper source labels (Zenodo/Dryad/etc.)
   - Filters + Clear Results
   - Bulk RIS export using embedded record JSON
   ========================================================================== */

const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
let currentCategory = "all";
let currentQuery = "";
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 24;

/* ---------------- Utility ---------------- */
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => [...document.querySelectorAll(sel)];
const html = (el, v) => (el.innerHTML = v);
const show = (el) => (el.style.display = "");
const hide = (el) => (el.style.display = "none");

/* ---------------- Fetch + Render ---------------- */
async function fetchResults(category = "all", query = "", filters = {}, page = 1, pageSize = PAGE_SIZE) {
  const progress = qs("#progressBar");
  if (progress) progress.style.width = "25%";

  try {
    const res = await fetch(`${API_BASE}/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, query, filters, page, pageSize }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || "No data returned");

    renderResults(data.results);
    renderFilters(data.facets);
    updatePagination(data.page, Math.ceil(data.total / pageSize), data.total);
    show(qs("#clearBtn"));
    if (progress) progress.style.width = "100%";
  } catch (err) {
    console.error("❌ Fetch error:", err);
    showError(`⚠️ ${err.message}`);
    if (progress) progress.style.width = "0";
  }
}

/* ---------------- Render Filters ---------------- */
function renderFilters(facets) {
  if (!facets) return;
  const wrap = qs("#filtersWrap");
  const sidebar = qs("#filtersSidebar");
  show(sidebar);

  const yearOpts = facets.years.map(y => `<option value="${y.name}">${y.name} (${y.count})</option>`).join("");
  const repoOpts = facets.repositories.map(r => `<option value="${r.name}">${r.name} (${r.count})</option>`).join("");
  const typeOpts = facets.types.map(t => `<option value="${t.name}">${t.name} (${t.count})</option>`).join("");

  html(wrap, `
    <div class="filter">
      <label for="yearFilter">Year</label>
      <select id="yearFilter">
        <option value="">All</option>${yearOpts}
      </select>
    </div>
    <div class="filter">
      <label for="repoFilter">Repository</label>
      <select id="repoFilter">
        <option value="">All</option>${repoOpts}
      </select>
    </div>
    <div class="filter">
      <label for="typeFilter">Type</label>
      <select id="typeFilter">
        <option value="">All</option>${typeOpts}
      </select>
    </div>
    <div class="filter">
      <label for="authorFilter">Author (contains)</label>
      <input id="authorFilter" placeholder="e.g. Smith" />
    </div>
    <button class="btn sm" id="applyFiltersBtn">Apply Filters</button>
  `);

  qs("#applyFiltersBtn").onclick = () => {
    const filters = {
      year: qs("#yearFilter").value || undefined,
      repository: qs("#repoFilter").value || undefined,
      type: qs("#typeFilter").value || undefined,
      author: qs("#authorFilter").value?.trim() || undefined
    };
    fetchResults(currentCategory, currentQuery, filters, 1);
  };
}

/* ---------------- Render Cards ---------------- */
function renderResults(records = []) {
  const container = qs("#dataCardsContainer");
  if (!container) return;
  html(container, "");

  if (!records.length) {
    html(container, `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>The harvest cache may be empty. Try another category or adjust filters.</p>
      </div>
    `);
    hide(qs("#pagination"));
    return;
  }

  for (const r of records) {
    const recordJSON = encodeURIComponent(JSON.stringify(r));
    const sourceLabel = r.source || r.repository || "Research";

    const card = document.createElement("div");
    card.className = "data-card";
    card.innerHTML = `
      <div class="card-header">
        <span class="card-type">${r.type || "Record"}</span>
        <span class="card-source">${sourceLabel}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${r.title || "Untitled"}</h3>
        <p class="card-authors">${(r.authors || []).join(", ")}</p>
        <p class="card-description">${(r.description || "").substring(0, 300)}...</p>
      </div>
      <div class="card-footer">
        <div class="card-meta">
          <span><b>Year:</b> ${r.year || "—"}</span>
          <span><b>ID:</b> ${r.identifier || "—"}</span>
        </div>
        <div class="card-actions">
          ${r.url ? `<a href="${r.url}" target="_blank" class="btn sm">Open</a>` : ""}
          <input type="checkbox" class="select-record card-checkbox" data-record="${recordJSON}">
        </div>
      </div>
    `;
    container.appendChild(card);
  }

  show(qs("#pagination"));
}

/* ---------------- Pagination ---------------- */
function updatePagination(page, totalPagesCalc, total) {
  currentPage = page;
  totalPages = totalPagesCalc;
  qs("#pageInfo").textContent = `Page ${page} of ${totalPages}`;
  qs("#totalInfo").textContent = `${total} records`;
  qs("#prevBtn").disabled = page <= 1;
  qs("#nextBtn").disabled = page >= totalPages;
}

qs("#prevBtn")?.addEventListener("click", () => {
  if (currentPage > 1) fetchResults(currentCategory, currentQuery, collectFiltersUI(), currentPage - 1);
});
qs("#nextBtn")?.addEventListener("click", () => {
  if (currentPage < totalPages) fetchResults(currentCategory, currentQuery, collectFiltersUI(), currentPage + 1);
});

function collectFiltersUI() {
  return {
    year: qs("#yearFilter")?.value || undefined,
    repository: qs("#repoFilter")?.value || undefined,
    type: qs("#typeFilter")?.value || undefined,
    author: qs("#authorFilter")?.value?.trim() || undefined
  };
}

/* ---------------- Search + Tabs ---------------- */
qs("#searchBtn")?.addEventListener("click", () => {
  currentQuery = qs("#searchBox")?.value.trim() || "";
  fetchResults(currentCategory, currentQuery, collectFiltersUI(), 1);
});
qs("#searchBox")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    currentQuery = qs("#searchBox")?.value.trim() || "";
    fetchResults(currentCategory, currentQuery, collectFiltersUI(), 1);
  }
});

qsa(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    qsa(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    currentCategory = btn.dataset.type;   // "all" | "research" | "articles" | "theses"
    currentPage = 1;
    fetchResults(currentCategory, currentQuery, collectFiltersUI(), 1);
  });
});

/* ---------------- Bulk RIS Export ---------------- */
qs("#bulkRisButton")?.addEventListener("click", async () => {
  const selected = qsa(".card-checkbox:checked");
  if (!selected.length) return alert("Select at least one record.");

  const records = selected.map(cb => JSON.parse(decodeURIComponent(cb.dataset.record)));
  const res = await fetch(`${API_BASE}/ris`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inquirybase-export.ris";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ---------------- Toggle Floating RIS Button ---------------- */
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("select-record")) {
    const anyChecked = qsa(".select-record:checked").length > 0;
    qs("#bulkRisButton").style.display = anyChecked ? "flex" : "none";
  }
});

/* ---------------- Clear Results ---------------- */
qs("#clearBtn")?.addEventListener("click", () => {
  html(qs("#dataCardsContainer"), "");
  hide(qs("#filtersSidebar"));
  hide(qs("#pagination"));
  hide(qs("#clearBtn"));
  qs("#bulkRisButton").style.display = "none";
});

/* ---------------- Errors ---------------- */
function showError(msg) {
  const container = qs("#dataCardsContainer");
  html(container, `
    <div class="no-results">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Error</h3>
      <p>${msg}</p>
    </div>
  `);
  hide(qs("#pagination"));
}

/* ---------------- Auto-load ---------------- */
window.addEventListener("DOMContentLoaded", () => {
  fetchResults("all", "");
});
