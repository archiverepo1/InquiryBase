// ============================================================================
// InquiryBase Frontend (Production)
// - Works with your existing HTML/CSS
// - Filters: Year/Repository/Type/Author + Keyword (last element, below filters)
// - Tabs: all | research | articles | theses
// - 50 per page, cached-first, live fallback handled by Worker
// - In-flight cancellation to avoid "Failed to fetch" after multiple clicks
// ============================================================================

const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  // DOM
  const searchInput   = document.getElementById("searchBox");
  const searchBtn     = document.getElementById("searchBtn");
  const clearBtn      = document.getElementById("clearBtn");
  const tabs          = document.querySelectorAll(".tab");
  const progressEl    = document.getElementById("progressBar");
  const cardsEl       = document.getElementById("dataCardsContainer");
  const filtersSide   = document.getElementById("filtersSidebar");
  const filtersWrap   = document.getElementById("filtersWrap");
  const bulkRisBtn    = document.getElementById("bulkRisButton");

  // Build pagination container if missing
  let pager = document.getElementById("paginationBar");
  if (!pager) {
    pager = document.createElement("div");
    pager.id = "paginationBar";
    pager.style.display = "none";
    pager.style.margin = "16px 0";
    pager.style.textAlign = "center";
    cardsEl.after(pager);
  }

  // State
  const state = {
    activeCategory: "all",
    page: 1,
    pageSize: 50,
    total: 0,
    allData: [],
    facets: {},
    filters: { year: "", repository: "", type: "", author: "" },
    filterKeyword: "",      // from the Keyword box (below filters)
    topQuery: "",           // from the top search bar
    isLoading: false,
    selected: new Set()
  };

  let currentAbort = null;

  // ----------------------- Events -----------------------

  // Top search
  searchBtn.addEventListener("click", () => {
    state.topQuery = (searchInput.value || "").trim();
    state.page = 1;
    harvest();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      state.topQuery = (searchInput.value || "").trim();
      state.page = 1;
      harvest();
    }
  });

  // Tabs
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.activeCategory = t.dataset.type;
    state.page = 1;
    harvest();
  }));

  // Clear all UI
  clearBtn.addEventListener("click", () => {
    state.page = 1;
    state.total = 0;
    state.allData = [];
    state.facets = {};
    state.filters = { year: "", repository: "", type: "", author: "" };
    state.filterKeyword = "";
    state.topQuery = "";
    state.selected.clear();
    toggleBulkButton();

    searchInput.value = "";
    filtersSide.style.display = "none";
    clearBtn.style.display = "none";
    pager.style.display = "none";

    cardsEl.innerHTML = emptyCard();
  });

  // ----------------------- Harvest -----------------------

  async function harvest() {
    if (state.isLoading) {
      if (currentAbort) currentAbort.abort();
    }
    state.isLoading = true;
    progress(0.12);
    showLoading();

    try {
      // merge queries: filter keyword + top search bar
      const combinedQuery = [state.topQuery, state.filterKeyword].filter(Boolean).join(" ").trim();

      const body = {
        category: state.activeCategory,
        query: combinedQuery,
        page: state.page,
        pageSize: state.pageSize,
        filters: state.filters,
        perSourceLimit: 1000
      };

      currentAbort = new AbortController();
      const res = await fetch(`${WORKER_URL}/api/harvest?t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify(body),
        signal: currentAbort.signal
      });
      if (!res.ok) throw new Error(`Worker responded with ${res.status}`);
      const data = await res.json();

      state.allData = Array.isArray(data.results) ? data.results : [];
      state.facets  = data.facets || {};
      state.total   = Number(data.total || state.allData.length) || 0;

      progress(0.7);

      buildFilters();               // rebuild left filters + keyword box
      renderCards(state.allData);   // page slice already handled by Worker
      renderPager();                // prev/next

      // UI bits
      filtersSide.style.display = state.allData.length ? "block" : "none";
      clearBtn.style.display    = state.allData.length ? "inline-flex" : "none";
      progress(1);
    } catch (e) {
      if (e.name !== "AbortError") {
        cardsEl.innerHTML = errorCard(e.message || "Network error — please retry.");
        pager.style.display = "none";
        filtersSide.style.display = "none";
        clearBtn.style.display = "inline-flex";
      }
    } finally {
      state.isLoading = false;
      setTimeout(() => progress(0), 500);
      currentAbort = null;
    }
  }

  // ----------------------- Filters UI -----------------------

  function buildFilters() {
    filtersWrap.innerHTML = "";

    const addSelect = (label, id, items) => {
      const box = document.createElement("div");
      box.className = "filter";
      const opts = (items || [])
        .map(x => `<option value="${escapeHtml(String(x.name))}">${escapeHtml(String(x.name))} (${x.count})</option>`)
        .join("");
      box.innerHTML = `
        <label>${label}</label>
        <select id="${id}">
          <option value="">All</option>
          ${opts}
        </select>
      `;
      return box;
    };

    const yearSel = addSelect("Year", "filterYear", state.facets.years);
    const repoSel = addSelect("Repository", "filterRepo", state.facets.repositories);
    const typeSel = addSelect("Type", "filterType", state.facets.types);
    const authSel = addSelect("Author", "filterAuthor", state.facets.authors);

    filtersWrap.append(yearSel, repoSel, typeSel, authSel);

    // Restore selections
    setVal("filterYear", state.filters.year);
    setVal("filterRepo", state.filters.repository);
    setVal("filterType", state.filters.type);
    setVal("filterAuthor", state.filters.author);

    // Bind change -> re-harvest same category (server filters applied)
    ["filterYear", "filterRepo", "filterType", "filterAuthor"].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener("change", () => {
        state.filters = {
          year:        getVal("filterYear"),
          repository:  getVal("filterRepo"),
          type:        getVal("filterType"),
          author:      getVal("filterAuthor")
        };
        state.page = 1;
        harvest();
      });
    });

    // Keyword box (last element)
    const kw = document.createElement("div");
    kw.className = "filter";
    kw.innerHTML = `
      <label>Keyword</label>
      <div style="display:flex;gap:8px;">
        <input id="filterKeyword" type="text" placeholder="Search title / abstract / authors / keywords"
               style="flex:1;border:1px solid #e0e0e0;border-radius:6px;padding:10px;background:#fff">
        <button id="filterSearchBtn" class="btn" style="white-space:nowrap;">Search</button>
      </div>
      <small style="color:#666;">Tip: use quotes for exact matches, e.g. "machine learning"</small>
    `;
    filtersWrap.appendChild(kw);
    document.getElementById("filterKeyword").value = state.filterKeyword || "";
    document.getElementById("filterKeyword").addEventListener("keydown", e => {
      if (e.key === "Enter") {
        state.filterKeyword = (document.getElementById("filterKeyword").value || "").trim();
        state.page = 1;
        harvest();
      }
    });
    document.getElementById("filterSearchBtn").addEventListener("click", () => {
      state.filterKeyword = (document.getElementById("filterKeyword").value || "").trim();
      state.page = 1;
      harvest();
    });
  }

  // ----------------------- Cards -----------------------

  function renderCards(records) {
    if (!records || !records.length) {
      cardsEl.innerHTML = emptyCard();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of records) {
      const card = document.createElement("div");
      card.className = "data-card";
      card.innerHTML = `
        <div class="card-header">
          <div class="card-type">${escapeHtml(item.type || "")}</div>
          <div class="card-source">${escapeHtml(item.source || "")}</div>
        </div>

        <div class="card-body">
          <input type="checkbox" class="select-record" data-id="${item.id}"
                 title="Select for bulk RIS" style="float:right;margin-left:8px">
          <h3 class="card-title">${escapeHtml(item.title || "Untitled")}</h3>
          <div class="card-authors">${escapeHtml((item.authors || []).join(", "))}</div>
          <p class="card-description">
            ${escapeHtml((item.description || "").slice(0, 320))}
            ${(item.description || "").length > 320 ? "…" : ""}
          </p>
        </div>

        <div class="card-footer">
          <div class="card-meta">
            <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(item.year || "")}</span>
            ${item.identifier
              ? `<span>${escapeHtml(item.identifierType || "")}: 
                   <a href="${escapeAttr(item.url || "#")}" target="_blank" class="doi-link">
                     ${escapeHtml(item.identifier)}
                   </a>
                 </span>`
              : ""}
          </div>
          <div class="card-actions">
            <button class="btn sm" title="Open record"
                    onclick="window.open('${escapeAttr(item.url || "#")}','_blank')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
            <button class="btn sm ris-btn" title="Export RIS" data-id="${item.id}">
              <i class="fa-solid fa-file-export"></i> Export RIS
            </button>
          </div>
        </div>
      `;
      frag.appendChild(card);
    }

    cardsEl.innerHTML = "";
    cardsEl.appendChild(frag);

    // Bind RIS + selection
    cardsEl.querySelectorAll(".ris-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const rec = state.allData.find(r => r.id === btn.dataset.id);
        if (rec) exportRIS([rec]);
      });
    });
    cardsEl.querySelectorAll(".select-record").forEach(cb => {
      cb.addEventListener("change", e => {
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id);
        else state.selected.delete(id);
        toggleBulkButton();
      });
    });
  }

  // ----------------------- Pagination -----------------------

  function renderPager() {
    if (!state.total) {
      pager.style.display = "none";
      return;
    }
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    pager.style.display = "block";
    pager.innerHTML = `
      <button class="btn sm" id="prevPage" ${state.page <= 1 ? "disabled" : ""}>Prev</button>
      <span style="margin:0 10px">Page ${state.page} of ${totalPages} • ${state.total.toLocaleString()} results</span>
      <button class="btn sm" id="nextPage" ${state.page >= totalPages ? "disabled" : ""}>Next</button>
    `;
    document.getElementById("prevPage").onclick = () => {
      if (state.page > 1) { state.page--; harvest(); }
    };
    document.getElementById("nextPage").onclick = () => {
      const totalPages2 = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page < totalPages2) { state.page++; harvest(); }
    };
  }

  // ----------------------- RIS Export -----------------------

  async function exportRIS(records) {
    try {
      const res = await fetch(`${WORKER_URL}/api/ris?t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records })
      });
      if (!res.ok) throw new Error("RIS export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inquirybase-export.ris";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "RIS export failed");
    }
  }

  // ----------------------- Helpers -----------------------

  function showLoading() {
    cardsEl.innerHTML = `
      <div class="no-results">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <h3>Harvesting in progress…</h3>
        <p>Fetching ${escapeHtml((state.activeCategory || "").toUpperCase())} data. Please wait…</p>
      </div>
    `;
  }
  function errorCard(msg) {
    return `
      <div class="no-results">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Harvest Failed</h3>
        <p>${escapeHtml(msg || "Unknown error")}</p>
      </div>
    `;
  }
  function emptyCard() {
    return `
      <div class="no-results">
        <i class="fa-regular fa-circle-question"></i>
        <h3>No data available</h3>
        <p>Use the search or select a category to harvest records.</p>
      </div>
    `;
  }

  function toggleBulkButton() {
    bulkRisBtn.style.display = state.selected.size ? "inline-flex" : "none";
  }

  function progress(ratio) {
    progressEl.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v || "";
  }
  function getVal(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    const v = el.value || "";
    return v === "All" ? "" : v;
  }

  function escapeHtml(t) {
    if (t === null || t === undefined) return "";
    const s = typeof t === "string" ? t : String(t);
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function escapeAttr(t) {
    return escapeHtml(String(t || "").replace(/"/g, ""));
  }

  // Initial load (All Sources, first page)
  harvest();

  // Floating bulk RIS button handler
  bulkRisBtn.addEventListener("click", () => {
    const records = Array.from(state.selected)
      .map(id => state.allData.find(r => r.id === id))
      .filter(Boolean);
    if (records.length) exportRIS(records);
  });
});
