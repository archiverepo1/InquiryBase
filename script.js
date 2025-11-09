/* script.js — InquiryBase Frontend v3.1 */
const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  // DOM
  const searchInput = document.getElementById("searchBox");
  const searchBtn   = document.getElementById("searchBtn");
  const clearBtn    = document.getElementById("clearBtn");
  const tabs        = document.querySelectorAll(".tab");
  const progressEl  = document.getElementById("progressBar");
  const cardsEl     = document.getElementById("dataCardsContainer");
  const filtersSide = document.getElementById("filtersSidebar");
  const filtersWrap = document.getElementById("filtersWrap");
  const bulkRisBtn  = document.getElementById("bulkRisButton");

  const prevBtn     = document.getElementById("prevBtn");
  const nextBtn     = document.getElementById("nextBtn");
  const pageInfo    = document.getElementById("pageInfo");
  const totalInfo   = document.getElementById("totalInfo");
  const pagination  = document.getElementById("pagination");

  // State
  const state = {
    activeCategory: "all",
    page: 1,
    pageSize: 50,
    total: 0,
    allData: [],
    facets: {},
    filters: { year: "", repository: "", type: "", author: "" },
    filterKeyword: "",
    topQuery: "",
    isLoading: false,
    selected: new Set()
  };

  // Health check first
  const healthy = await healthCheck();
  if (!healthy) {
    if (cardsEl) {
      cardsEl.innerHTML = errorCard("Cannot connect to server. Please verify the Worker deployment.");
    }
    return;
  }

  // Event wiring
  searchBtn?.addEventListener("click", () => { state.topQuery = (searchInput?.value || "").trim(); state.page = 1; harvest(); });
  searchInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { state.topQuery = (searchInput.value || "").trim(); state.page = 1; harvest(); }});

  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.activeCategory = t.dataset.type;
    state.page = 1;
    harvest();
  }));

  clearBtn?.addEventListener("click", () => {
    state.page = 1; state.total = 0; state.allData = []; state.facets = {};
    state.filters = { year: "", repository: "", type: "", author: "" };
    state.filterKeyword = ""; state.topQuery = ""; state.selected.clear();
    searchInput.value = "";
    if (filtersSide) filtersSide.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";
    hidePagination();
    toggleBulkButton();
    if (cardsEl) cardsEl.innerHTML = emptyCard();
  });

  prevBtn.onclick = () => { if (state.page > 1) { state.page--; harvest(); } };
  nextBtn.onclick = () => {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page < totalPages) { state.page++; harvest(); }
  };

  bulkRisBtn?.addEventListener("click", () => {
    const records = Array.from(state.selected).map(id => state.allData.find(r => r.id === id)).filter(Boolean);
    if (records.length) exportRIS(records);
  });

  // First load
  harvest();

  /* ------------- functions ------------- */

  async function healthCheck() {
    try {
      const r = await fetch(`${WORKER_URL}/api/health`, { cache: "no-store" });
      if (!r.ok) return false;
      const j = await r.json();
      return !!j?.ok;
    } catch { return false; }
  }

  async function harvest() {
    if (state.isLoading) return;
    state.isLoading = true;
    progress(0.1);
    showLoading();

    try {
      const combinedQuery = [state.topQuery, state.filterKeyword].filter(Boolean).join(" ").trim();
      const body = {
        category: state.activeCategory,
        query: combinedQuery,
        page: state.page,
        pageSize: state.pageSize,
        filters: state.filters
      };

      const res = await fetch(`${WORKER_URL}/api/harvest`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Cache-Control":"no-store" },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Harvest failed");

      state.allData = Array.isArray(data.results) ? data.results : [];
      state.facets  = data.facets || {};
      state.total   = Number(data.total || state.allData.length) || 0;

      buildFilters();        // rebuild filters
      renderCards(state.allData);
      updatePagination();

      if (filtersSide) filtersSide.style.display = state.total ? "block" : "none";
      if (clearBtn)    clearBtn.style.display    = state.total ? "inline-flex" : "none";
      progress(1);
    } catch (err) {
      if (cardsEl) cardsEl.innerHTML = errorCard(err.message || "Network error");
      hidePagination();
      if (filtersSide) filtersSide.style.display = "none";
      if (clearBtn) clearBtn.style.display = "inline-flex";
    } finally {
      state.isLoading = false;
      setTimeout(() => progress(0), 400);
    }
  }

  function buildFilters() {
    if (!filtersWrap) return;
    filtersWrap.innerHTML = "";

    const addSelect = (label, id, items) => {
      const box = document.createElement("div");
      box.className = "filter";
      const opts = (items || []).map(x => `<option value="${escapeHtml(String(x.name))}">${escapeHtml(String(x.name))} (${x.count})</option>`).join("");
      box.innerHTML = `
        <label>${label}</label>
        <select id="${id}">
          <option value="">All</option>
          ${opts}
        </select>`;
      return box;
    };

    const yearSel = addSelect("Year", "filterYear", state.facets.years);
    const repoSel = addSelect("Repository", "filterRepo", state.facets.repositories);
    const typeSel = addSelect("Type", "filterType", state.facets.types);
    const authSel = addSelect("Author", "filterAuthor", state.facets.authors);
    filtersWrap.append(yearSel, repoSel, typeSel, authSel);

    setVal("filterYear", state.filters.year);
    setVal("filterRepo", state.filters.repository);
    setVal("filterType", state.filters.type);
    setVal("filterAuthor", state.filters.author);

    ["filterYear","filterRepo","filterType","filterAuthor"].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener("change", () => {
        state.filters = {
          year:       getVal("filterYear"),
          repository: getVal("filterRepo"),
          type:       getVal("filterType"),
          author:     getVal("filterAuthor")
        };
        state.page = 1;
        harvest();
      });
    });

    // keyword box
    const kw = document.createElement("div");
    kw.className = "filter";
    kw.innerHTML = `
      <label>Keyword</label>
      <div style="display:flex;gap:8px;">
        <input id="filterKeyword" type="text" placeholder="Search title / abstract / authors / keywords"
               style="flex:1;border:1px solid #e0e0e0;border-radius:6px;padding:10px;background:#fff">
        <button id="filterSearchBtn" class="btn" style="white-space:nowrap;">Search</button>
      </div>
      <small style="color:#666;">Tip: use quotes for exact matches, e.g. "machine learning"</small>`;
    filtersWrap.appendChild(kw);

    const kwInput = document.getElementById("filterKeyword");
    const kwBtn   = document.getElementById("filterSearchBtn");
    if (kwInput) kwInput.value = state.filterKeyword || "";
    kwInput?.addEventListener("keydown", e => { if (e.key === "Enter") { state.filterKeyword = (kwInput.value||"").trim(); state.page = 1; harvest(); } });
    kwBtn?.addEventListener("click", () => { state.filterKeyword = (kwInput?.value||"").trim(); state.page = 1; harvest(); });
  }

  function renderCards(records) {
    if (!cardsEl) return;
    if (!records || !records.length) { cardsEl.innerHTML = emptyCard(); return; }

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
          <input type="checkbox" class="select-record" data-id="${item.id}" title="Select for bulk RIS" style="float:right;margin-left:8px">
          <h3 class="card-title">${escapeHtml(item.title || "Untitled")}</h3>
          <div class="card-authors">${escapeHtml((item.authors || []).join(", "))}</div>
          <p class="card-description">
            ${escapeHtml((item.description || "").slice(0, 320))}${(item.description || "").length > 320 ? "…" : ""}
          </p>
        </div>

        <div class="card-footer">
          <div class="card-meta">
            <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(item.year || "")}</span>
            ${item.identifier ? `<span>${escapeHtml(item.identifierType || "")}: 
              <a href="${escapeAttr(item.url || "#")}" target="_blank" class="doi-link">${escapeHtml(item.identifier)}</a>
            </span>` : ""}
          </div>
          <div class="card-actions">
            <button class="btn sm" title="Open record" onclick="window.open('${escapeAttr(item.url || "#")}','_blank')">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
            <button class="btn sm ris-btn" title="Export RIS" data-id="${item.id}">
              <i class="fa-solid fa-file-export"></i> Export RIS
            </button>
          </div>
        </div>`;
      frag.appendChild(card);
    }
    cardsEl.innerHTML = "";
    cardsEl.appendChild(frag);

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

  function updatePagination() {
    if (!pagination || !pageInfo || !totalInfo) return;
    if (!state.total) { hidePagination(); return; }

    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
    totalInfo.textContent = `${state.total} records`;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
    pagination.style.display = "flex";
  }

  function hidePagination() { if (pagination) pagination.style.display = "none"; }

  async function exportRIS(records) {
    try {
      const res = await fetch(`${WORKER_URL}/api/ris`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ records })
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "inquirybase-export.ris";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("RIS export failed: " + (e.message || "Unknown error"));
    }
  }

  function progress(ratio) { if (progressEl) progressEl.style.width = `${Math.max(0, Math.min(1, ratio))*100}%`; }
  function showLoading() {
    if (!cardsEl) return;
    cardsEl.innerHTML = `
      <div class="no-results">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <h3>Harvesting in progress…</h3>
        <p>Fetching ${escapeHtml((state.activeCategory || "").toUpperCase())} data. Please wait…</p>
      </div>`;
  }
  function emptyCard(){ return `<div class="no-results"><i class="fa-regular fa-circle-question"></i><h3>No data available</h3><p>Use the search or select a category to harvest records.</p></div>`; }
  function errorCard(msg){ return `<div class="no-results"><i class="fa-solid fa-triangle-exclamation"></i><h3>Harvest Failed</h3><p>${escapeHtml(msg||"Unknown error")}</p></div>`; }
  function toggleBulkButton(){ if (bulkRisBtn) bulkRisBtn.style.display = state.selected.size ? "inline-flex" : "none"; }

  function setVal(id, v){ const el = document.getElementById(id); if (el) el.value = v || ""; }
  function getVal(id){ const el = document.getElementById(id); if (!el) return ""; const v = el.value || ""; return v === "All" ? "" : v; }
  function escapeHtml(t){ if (t==null) return ""; const s = String(t); return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])); }
  function escapeAttr(t){ return escapeHtml(String(t||"").replace(/"/g,"")); }
}
