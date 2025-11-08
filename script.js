// ============================================================================
// InquiryBase Frontend – production
// - Filters drive backend (year/repo/type/author)
// - Cached-first results from Worker, with live re-fetch as needed
// - Pagination (Prev/Next + totals)
// - Per-card RIS + bulk RIS
// ============================================================================

const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  // Controls
  const searchInput = document.querySelector(".search-input");
  const searchBtn   = document.querySelector(".search-btn");
  const tabs        = document.querySelectorAll(".tab");
  const clearBtn    = document.getElementById("clearBtn");
  const progressEl  = document.getElementById("progressBar");
  const cardsEl     = document.getElementById("dataCardsContainer");
  const filtersSidebar = document.getElementById("filtersSidebar");
  const filtersWrap    = document.getElementById("filtersWrap");
  const bulkRisBtn = document.getElementById("bulkRisButton");

  // pagination bar (create if not present)
  let pager = document.getElementById("paginationBar");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "paginationBar";
    pager.style.display = "none";
    pager.style.margin = "16px 0";
    pager.style.textAlign = "center";
    cardsEl.after(pager);
  }

  // App state
  const state = {
    activeCategory: "all",
    isHarvesting: false,
    page: 1,
    pageSize: 24,
    allData: [],
    facets: {},
    filters: { year:"", repository:"", type:"", author:"" },
    selected: new Set(),
    total: 0
  };

  // ---------------------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------------------

  searchBtn.addEventListener("click", () => startHarvest(true));
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") startHarvest(true); });

  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.activeCategory = t.dataset.type;
    state.page = 1;
    startHarvest(true);
  }));

  clearBtn.addEventListener("click", clearResults);

  bulkRisBtn.addEventListener("click", () => {
    const records = Array.from(state.selected).map(id => state.allData.find(r => r.id === id)).filter(Boolean);
    if (!records.length) return;
    exportRIS(records);
  });

  // ---------------------------------------------------------------------------
  // HARVEST (calls backend, honors filters, paginated)
  // ---------------------------------------------------------------------------

  async function startHarvest(resetPage=false) {
    if (state.isHarvesting) return;
    state.isHarvesting = true;
    if (resetPage) state.page = 1;

    state.selected.clear(); toggleBulkButton();
    showLoadingCard(state.activeCategory);
    progressEl.style.width = "15%";

    try {
      const body = {
        category: state.activeCategory,
        query: (searchInput.value || "").trim(),
        page: state.page,
        pageSize: state.pageSize,
        filters: state.filters,
        perSourceLimit: 1000
      };

      const res = await fetch(`${WORKER_URL}/api/harvest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`Worker responded with ${res.status}`);
      const data = await res.json();
      if (!data.success && !Array.isArray(data.results)) throw new Error(data.error || "Unknown error");

      state.allData = data.results || [];
      state.total   = data.total || 0;
      state.facets  = data.facets || {};

      progressEl.style.width = "65%";
      buildFilters();              // rebuild facets UI
      displayResults(state.allData);
      renderPager();               // show pager

      clearBtn.style.display   = state.allData.length ? "inline-flex" : "none";
      filtersSidebar.style.display = state.allData.length ? "block" : "none";
      progressEl.style.width = "100%";
    } catch (err) {
      console.error(err);
      cardsEl.innerHTML = errorCard(err.message);
      clearBtn.style.display = "inline-flex";
      filtersSidebar.style.display = "none";
      pager.style.display = "none";
    } finally {
      state.isHarvesting = false;
      setTimeout(() => (progressEl.style.width = "0%"), 600);
    }
  }

  // ---------------------------------------------------------------------------
  // FILTERS (backend-driven)
  // ---------------------------------------------------------------------------

  function buildFilters() {
    filtersWrap.innerHTML = "";

    const yearSel  = createSelect("Year",        "filterYear",  state.facets.years);
    const repoSel  = createSelect("Repository",  "filterRepo",  state.facets.repositories);
    const typeSel  = createSelect("Type",        "filterType",  state.facets.types);
    const authSel  = createSelect("Author",      "filterAuthor",state.facets.authors);

    filtersWrap.append(yearSel, repoSel, typeSel, authSel);

    // Restore current selections
    setSelectValue("filterYear",  state.filters.year);
    setSelectValue("filterRepo",  state.filters.repository);
    setSelectValue("filterType",  state.filters.type);
    setSelectValue("filterAuthor",state.filters.author);

    // Wire change -> re-fetch
    ["filterYear","filterRepo","filterType","filterAuthor"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => {
        state.filters = {
          year:        valueOrEmpty("filterYear"),
          repository:  valueOrEmpty("filterRepo"),
          type:        valueOrEmpty("filterType"),
          author:      valueOrEmpty("filterAuthor")
        };
        state.page = 1;
        startHarvest(false);
      });
    });
  }

  function createSelect(label, id, items) {
    const box = document.createElement("div");
    box.className = "filter";
    const options = (items || []).map(x => `<option value="${escapeHtml(x.name)}">${escapeHtml(x.name)} (${x.count})</option>`).join("");
    box.innerHTML = `
      <label>${label}</label>
      <select id="${id}">
        <option value="">All</option>
        ${options}
      </select>
    `;
    return box;
  }

  function valueOrEmpty(id){ const v = document.getElementById(id)?.value || ""; return v === "All" ? "" : v; }
  function setSelectValue(id, v){ const el = document.getElementById(id); if (el) el.value = v || ""; }

  // ---------------------------------------------------------------------------
  // RESULTS RENDER
  // ---------------------------------------------------------------------------

  function displayResults(records) {
    if (!records || !records.length) { cardsEl.innerHTML = noResultsCard(); return; }

    const frag = document.createDocumentFragment();
    records.forEach(item => {
      const card = document.createElement("div");
      card.className = "data-card";
      card.innerHTML = `
        <div class="card-header">
          <div class="card-type">${escapeHtml(item.type || "")}</div>
          <div class="card-source">${escapeHtml(item.source || "")}</div>
        </div>

        <div class="card-body">
          <input type="checkbox" class="select-record" data-id="${item.id}" title="Select for bulk RIS" style="float:right;margin-left:8px">
          <h3 class="card-title">${escapeHtml(item.title || "Untitled")}</h3>
          <div class="card-authors">${escapeHtml((item.authors || []).join(", "))}</div>
          <p class="card-description">${escapeHtml((item.description || "").slice(0, 320))}${(item.description||"").length>320?"…":""}</p>
        </div>

        <div class="card-footer">
          <div class="card-meta">
            <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(item.year || "")}</span>
            ${item.identifier ? `<span>${escapeHtml(item.identifierType || "")}: <a href="${escapeHtml(item.url || "#")}" target="_blank" class="doi-link">${escapeHtml(item.identifier)}</a></span>` : ""}
          </div>
          <div class="card-actions">
            <button class="btn sm" title="Open record" onclick="window.open('${item.url || "#"}','_blank')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
            <button class="btn sm ris-btn" title="Export RIS" data-id="${item.id}">
              <i class="fa-solid fa-file-export"></i> Export RIS
            </button>
          </div>
        </div>
      `;
      frag.appendChild(card);
    });

    cardsEl.innerHTML = "";
    cardsEl.appendChild(frag);

    // bind per-card RIS + selection
    cardsEl.querySelectorAll(".ris-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const rec = state.allData.find(r => r.id === btn.dataset.id);
        if (rec) exportRIS([rec]);
      });
    });
    cardsEl.querySelectorAll(".select-record").forEach(cb => {
      cb.addEventListener("change", e => {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
        toggleBulkButton();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // PAGINATION
  // ---------------------------------------------------------------------------

  function renderPager() {
    if (!state.total) { pager.style.display = "none"; return; }
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    pager.style.display = "block";
    pager.innerHTML = `
      <button class="btn sm" id="prevPage" ${state.page<=1?"disabled":""}>Prev</button>
      <span style="margin:0 10px">Page ${state.page} of ${totalPages} • ${state.total.toLocaleString()} results</span>
      <button class="btn sm" id="nextPage" ${state.page>=totalPages?"disabled":""}>Next</button>
    `;
    document.getElementById("prevPage").onclick = () => { if (state.page>1) { state.page--; startHarvest(false); } };
    document.getElementById("nextPage").onclick = () => { if (state.page<totalPages) { state.page++; startHarvest(false); } };
  }

  // ---------------------------------------------------------------------------
  // RIS EXPORT (single & bulk)
  // ---------------------------------------------------------------------------

  async function exportRIS(records) {
    try {
      const res = await fetch(`${WORKER_URL}/api/ris`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ records })
      });
      if (!res.ok) throw new Error("RIS export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "inquirybase-export.ris"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  function clearResults() {
    state.allData = [];
    state.facets  = {};
    state.total   = 0;
    state.page    = 1;
    state.filters = { year:"", repository:"", type:"", author:"" };
    state.selected.clear(); toggleBulkButton();

    searchInput.value = "";
    cardsEl.innerHTML = noResultsCard();
    filtersSidebar.style.display = "none";
    clearBtn.style.display = "none";
    pager.style.display = "none";
  }

  function showLoadingCard(cat){
    cardsEl.innerHTML = `
      <div class="no-results">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <h3>Harvesting in progress…</h3>
        <p>Fetching ${escapeHtml((cat||"").toUpperCase())} data. Please wait…</p>
      </div>`;
  }
  function errorCard(msg){
    return `<div class="no-results">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <h3>Harvest Failed</h3>
      <p>${escapeHtml(msg || "Unknown error")}</p>
    </div>`;
  }
  function noResultsCard(){
    return `<div class="no-results">
      <i class="fa-regular fa-circle-question"></i>
      <h3>No data available</h3>
      <p>Use the search or select a category to harvest records.</p>
    </div>`;
  }
  function escapeHtml(t){
    if (t === null || t === undefined) return "";
    const s = typeof t === "string" ? t : String(t);
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function toggleBulkButton(){ bulkRisBtn.style.display = state.selected.size ? "inline-flex" : "none"; }

  // kick off with current tab (All)
  startHarvest(true);
});
