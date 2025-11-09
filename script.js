/* ============================================================================
   InquiryBase Frontend v3.8 (Production)
   - Category tabs fixed
   - Filters restored
   - Bulk RIS export fixed (downloads .ris)
   - Keeps UI/structure from your HTML/CSS
   ========================================================================== */

const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
const PAGE_SIZE = 24;

let currentCategory = "all";
let currentQuery = "";
let currentPage = 1;
let currentFilters = {};
let totalPages = 1;

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
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "No data returned");

    renderResults(data.results);
    renderFilters(data.facets);
    updatePagination(data.page, Math.ceil(data.total / PAGE_SIZE), data.total);

    show(qs("#filtersSidebar"));
    show(qs("#clearBtn"));
    if (progress) progress.style.width = "100%";
  } catch (e) {
    renderError(e.message);
    if (progress) progress.style.width = "0";
  }
}

/* ---------- render: results ---------- */
function renderResults(records = []) {
  const c = qs("#dataCardsContainer");
  c.innerHTML = "";

  if (!records.length) {
    c.innerHTML = `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>Harvest Failed or No Results</h3>
        <p>No data retrieved. Try another category or search again.</p>
      </div>`;
    hide(qs("#pagination"));
    return;
  }

  for (const r of records) {
    const recJSON = encodeURIComponent(JSON.stringify(r));
    const authors = (r.authors || []).join(", ");
    const desc = (r.description || "").trim();
    c.insertAdjacentHTML("beforeend", `
      <div class="data-card">
        <div class="card-header">
          <span class="card-type">${r.type || "Record"}</span>
          <span class="card-source">${r.source || ""}</span>
        </div>
        <div class="card-body">
          <h3 class="card-title">${r.title || "Untitled"}</h3>
          <p class="card-authors">${authors}</p>
          <p class="card-description">${desc ? (desc.length > 300 ? desc.slice(0,300) + "…" : desc) : ""}</p>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><b>Year:</b> ${r.year || "—"}</span>
            <span><b>ID:</b> ${r.identifier || "—"}</span>
          </div>
          <div class="card-actions">
            ${r.url ? `<a class="btn sm" href="${r.url}" target="_blank" rel="noopener">Open</a>` : ""}
            <input class="select-record" type="checkbox" data-record="${recJSON}">
          </div>
        </div>
      </div>
    `);
  }

  // show RIS button if anything checked
  toggleRISButton();
  qsa(".select-record").forEach(cb => cb.addEventListener("change", toggleRISButton));

  show(qs("#pagination"));
}

/* ---------- filters ---------- */
function renderFilters(facets) {
  const wrap = qs("#filtersWrap");
  if (!facets || !wrap) return;

  wrap.innerHTML = `
    <div class="filter">
      <label>Year</label>
      <select id="fltYear">
        <option value="">All</option>
        ${facets.years.map(y => `<option value="${y.name}">${y.name} (${y.count})</option>`).join("")}
      </select>
    </div>
    <div class="filter">
      <label>Repository</label>
      <select id="fltRepo">
        <option value="">All</option>
        ${facets.repositories.map(r => `<option value="${r.name}">${r.name} (${r.count})</option>`).join("")}
      </select>
    </div>
    <div class="filter">
      <label>Type</label>
      <select id="fltType">
        <option value="">All</option>
        ${facets.types.map(t => `<option value="${t.name}">${t.name} (${t.count})</option>`).join("")}
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
  qs("#pageInfo").textContent  = `Page ${currentPage} of ${totalPages}`;
  qs("#totalInfo").textContent = `${total} records`;
  qs("#prevBtn").disabled = currentPage <= 1;
  qs("#nextBtn").disabled = currentPage >= totalPages;
}
qs("#prevBtn")?.addEventListener("click", () => currentPage > 1 && fetchResults(currentPage - 1));
qs("#nextBtn")?.addEventListener("click", () => currentPage < totalPages && fetchResults(currentPage + 1));

/* ---------- search & tabs ---------- */
qs("#searchBtn")?.addEventListener("click", () => {
  currentQuery = (qs("#searchBox")?.value || "").trim();
  fetchResults(1);
});
qsa(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    qsa(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    currentCategory = btn.dataset.type;  // all | research | articles | theses
    currentPage = 1;
    fetchResults(1);
  });
});

/* ---------- clear ---------- */
qs("#clearBtn")?.addEventListener("click", () => {
  currentQuery = "";
  currentFilters = {};
  qs("#searchBox").value = "";
  fetchResults(1);
});

/* ---------- bulk RIS ---------- */
function toggleRISButton() {
  const any = qsa(".select-record:checked").length > 0;
  qs("#bulkRisButton").style.display = any ? "flex" : "none";
}
qs("#bulkRisButton")?.addEventListener("click", async () => {
  const selected = qsa(".select-record:checked").map(cb => JSON.parse(decodeURIComponent(cb.dataset.record)));
  if (!selected.length) return alert("Select at least one record.");

  const res = await fetch(`${API_BASE}/ris`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: selected })
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inquirybase_export.ris";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ---------- error ---------- */
function renderError(msg) {
  const c = qs("#dataCardsContainer");
  c.innerHTML = `
    <div class="no-results">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Error</h3>
      <p>${msg}</p>
    </div>`;
  hide(qs("#pagination"));
}

/* ---------- initial load ---------- */
window.addEventListener("DOMContentLoaded", () => fetchResults(1));
