/* qdata.js */

(() => {
  // ========= CONFIG =========
  const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";

  // South African DSpace repos (Theses & Articles). Add more as needed.
  const DSPACE_REPOS = [
    // Core set (working examples you gave)
    { name: "SPU OpenHub",           type: "articles", oai: "https://openhub.spu.ac.za/oai/request" },
    { name: "CUT Scholar",           type: "articles", oai: "https://cutscholar.cut.ac.za/oai/request" },
    { name: "DUT OpenScholar",       type: "articles", oai: "https://openscholar.dut.ac.za/oai/request" },

    // Well-known SA institutions:
    { name: "Open UCT",              type: "articles", oai: "https://open.uct.ac.za/oai/request" },
    { name: "SUNScholar",            type: "articles", oai: "https://scholar.sun.ac.za/oai/request" },
    { name: "UP Repository",         type: "articles", oai: "https://repository.up.ac.za/oai/request" },
    { name: "UFS Scholar",           type: "articles", oai: "https://scholar.ufs.ac.za/oai/request" },
    { name: "UNISA IR",              type: "articles", oai: "https://uir.unisa.ac.za/oai/request" },
    { name: "UJ IR",                 type: "articles", oai: "https://wiredspace.wits.ac.za/oai/request" }, // adjust if needed
    { name: "Rhodes IR",             type: "articles", oai: "https://vital.seals.ac.za/oai/request" },      // SEALS (Rhodes, etc.)
    { name: "UKZN IR",               type: "articles", oai: "https://researchspace.ukzn.ac.za/oai/request" },
    { name: "TUT IR",                type: "articles", oai: "https://tutvital.tut.ac.za/oai/request" },

    // Add more SA DSpace endpoints here as you verify them:
    // { name: "NWU IR", type: "articles", oai: "https://repository.nwu.ac.za/oai/request" },
    // { name: "UWC IR", type: "articles", oai: "https://etd.uwc.ac.za/oai/request" },
  ];

  // Research data sources (JSON where possible)
  const RESEARCH_SOURCES = [
    { id: "zenodo",   name: "Zenodo",         type: "research" },
    { id: "figshare", name: "Figshare",       type: "research" },
    { id: "osf",      name: "OSF",            type: "research" },
    { id: "dryad",    name: "Dryad",          type: "research" },
    { id: "mendeley", name: "Mendeley Data",  type: "research" },
    { id: "rg",       name: "ResearchGate",   type: "research" }, // HTML fallback
  ];

  // ========= DOM =========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const resultsSection = $("#resultsSection");
  const progressEl = $("#progress");
  const harvestStatus = $("#harvestStatus");
  const dataCardsContainer = $("#dataCardsContainer");
  const resultsCount = $("#resultsCount");

  const yearFilter = $("#yearFilter");
  const sourceFilter = $("#sourceFilter");
  const typeFilter = $("#typeFilter");
  const sortFilter = $("#sortFilter");
  const searchInResults = $("#searchInResults");

  const firstPageBtn = $("#firstPage");
  const prevPageBtn = $("#prevPage");
  const nextPageBtn = $("#nextPage");
  const lastPageBtn = $("#lastPage");
  const pageInfo = $("#pageInfo");
  const pagination = $("#pagination");

  // ========= STATE =========
  const state = {
    all: [],
    filtered: [],
    currentPage: 1,
    pageSize: 12,
    totalPages: 1,
    isHarvesting: false,
    currentType: "all",
    operator: "AND",
  };

  // ========= INIT =========
  document.addEventListener("DOMContentLoaded", () => {
    wireUI();
    setupFilters();
  });

  function wireUI() {
    // Source toggles
    $$(".source-button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        $$(".source-button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.currentType = btn.dataset.type || "all";
      });
    });

    // Advanced toggle
    $(".advanced-toggle").addEventListener("click", () => {
      $("#advancedSearch").classList.toggle("active");
    });

    // Boolean operator buttons
    $$(".boolean-option").forEach(opt => {
      opt.addEventListener("click", () => {
        $$(".boolean-option").forEach(o => o.classList.remove("active"));
        opt.classList.add("active");
        state.operator = opt.dataset.operator || "AND";
      });
    });

    // Harvest All
    $("#harvestAll").addEventListener("click", () => startHarvest());

    // Refresh Page
    $("#refreshPage").addEventListener("click", () => location.reload());

    // Search
    $("#searchButton").addEventListener("click", doSearch);
    $(".search-input").addEventListener("keypress", (e) => {
      if (e.key === "Enter") doSearch();
    });

    // Apply advanced filters mock (just re-run local filtering)
    $("#applyFilters").addEventListener("click", () => applyFilters());

    // Side filters
    yearFilter.addEventListener("change", applyFilters);
    sourceFilter.addEventListener("change", applyFilters);
    typeFilter.addEventListener("change", applyFilters);
    sortFilter.addEventListener("change", applyFilters);
    $("#resetFilters").addEventListener("click", resetFilters);

    // Search within results
    $("#searchInResultsButton").addEventListener("click", searchWithin);
    searchInResults.addEventListener("keypress", (e) => { if (e.key === "Enter") searchWithin(); });

    // Pagination
    firstPageBtn.addEventListener("click", () => goPage(1));
    prevPageBtn.addEventListener("click", () => goPage(state.currentPage - 1));
    nextPageBtn.addEventListener("click", () => goPage(state.currentPage + 1));
    lastPageBtn.addEventListener("click", () => goPage(state.totalPages));
  }

  function setupFilters() {
    // Years
    const now = new Date().getFullYear();
    for (let y = now; y >= 1980; y--) {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      yearFilter.appendChild(o);
    }

    // Sources
    const names = new Set();
    DSPACE_REPOS.forEach(s => names.add(s.name));
    RESEARCH_SOURCES.forEach(s => names.add(s.name));
    for (const n of names) {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sourceFilter.appendChild(o);
    }
  }

  // ========= HARVEST =========
  async function startHarvest() {
    if (state.isHarvesting) return;
    state.isHarvesting = true;
    resultsSection.classList.add("active");
    setProgress(0);
    setStatus("Starting harvest...");

    state.all = [];

    try {
      // sources by type
      const dspace = DSPACE_REPOS;
      const research = RESEARCH_SOURCES;

      const doDspace = state.currentType === "all" || state.currentType === "articles" || state.currentType === "theses";
      const doResearch = state.currentType === "all" || state.currentType === "research";

      const tasks = [];
      if (doDspace) tasks.push(harvestDspaceBatch(dspace));
      if (doResearch) tasks.push(harvestResearchBatch(research));

      await Promise.all(tasks);

      setProgress(100);
      setStatus(`Harvest complete! Collected ${state.all.length} records.`);
      state.filtered = [...state.all];
      state.currentPage = 1;
      refreshList();
      saveLocal();

      setTimeout(() => setStatus("Ready for new harvest"), 2500);
    } catch (e) {
      console.error(e);
      setStatus("Harvest failed. See console for details.");
    } finally {
      state.isHarvesting = false;
    }
  }

  async function harvestDspaceBatch(repos) {
    const per = 100 / (repos.length + 1);
    let cursor = 0;
    for (const repo of repos) {
      setStatus(`Harvesting: ${repo.name}`);
      await harvestDspace(repo);
      cursor += per;
      setProgress(Math.min(95, Math.round(cursor)));
    }
  }

  async function harvestDspace(repo) {
    // OAI-PMH: ListRecords & resumptionToken
    const base = repo.oai;
    const params = new URLSearchParams({
      verb: "ListRecords",
      metadataPrefix: "oai_dc",
    });

    let nextUrl = `${base}?${params.toString()}`;
    let guards = 0;

    while (nextUrl && guards < 10) {
      const xml = await proxyXML(nextUrl);
      if (!xml) break;

      const records = parseOaiDc(xml, repo);
      state.all.push(...records);

      // resumptionToken
      const token = xml.querySelector("resumptionToken");
      if (token && token.textContent.trim()) {
        const rt = token.textContent.trim();
        nextUrl = `${base}?verb=ListRecords&resumptionToken=${encodeURIComponent(rt)}`;
      } else {
        nextUrl = null;
      }
      guards++;
    }
  }

  function parseOaiDc(xml, repo) {
    const out = [];
    const recs = xml.querySelectorAll("record");
    recs.forEach((rec) => {
      const header = rec.querySelector("header");
      const del = header?.getAttribute("status") === "deleted";
      if (del) return;

      const dc = rec.querySelector("metadata dc\\:dc, metadata dc");
      if (!dc) return;

      const getAll = (sel) => Array.from(dc.querySelectorAll(sel)).map(n => n.textContent.trim()).filter(Boolean);

      const title = getAll("dc\\:title, title")[0] || "Untitled";
      const creators = getAll("dc\\:creator, creator");
      const desc = getAll("dc\\:description, description")[0] || "";
      const dates = getAll("dc\\:date, date");
      const subjects = getAll("dc\\:subject, subject");
      const ids = [
        ...getAll("dc\\:identifier, identifier"),
        ...getAll("dc\\:relation, relation"),
      ];

      const { url, idType, idValue } = pickBestIdentifier(ids, repo.oai);

      // Year
      const year = (dates.find(d => /^\d{4}/.test(d)) || "").slice(0,4) || "";

      out.push({
        id: `${repo.name}-${cryptoRandom(8)}`,
        title,
        authors: creators.length ? creators : ["Unknown"],
        description: desc || "No description available",
        keywords: subjects.slice(0,8),
        year: year ? Number(year) : "",
        source: repo.name,
        type: "articles", // theses also live here; keep "articles" label grouping
        identifier: idValue,
        identifierType: idType,
        url,
        downloadUrl: url, // DSpace landing (direct bitstream links vary; landing is reliable)
      });
    });
    return out;
  }

  function pickBestIdentifier(ids, oaiBase) {
    // Prefer DOI > uri(handle) > last fallback
    let doi = null, handleUri = null, anyUri = null;

    ids.forEach(v => {
      const val = v.trim();
      if (/^10\.\d{4,9}\//.test(val)) {
        doi = `https://doi.org/${val}`;
      } else if (val.includes("doi.org/")) {
        doi = val.startsWith("http") ? val : `https://${val}`;
      } else if (val.includes("hdl.handle.net") || val.includes("/handle/")) {
        handleUri = val.startsWith("http") ? val : `http://${val}`;
      } else if (/^https?:\/\//.test(val)) {
        anyUri = val;
      }
    });

    if (doi) return { url: doi, idType: "DOI", idValue: doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "") };
    if (handleUri) return { url: handleUri, idType: "Handle", idValue: handleUri.replace(/^https?:\/\/hdl\.handle\.net\//, "") };
    if (anyUri) return { url: anyUri, idType: "URI", idValue: anyUri };

    // Fallback: OAI base host as landing
    try {
      const u = new URL(oaiBase);
      return { url: `${u.origin}`, idType: "URI", idValue: u.origin };
    } catch {
      return { url: "", idType: "Unknown", idValue: "" };
    }
  }

  async function harvestResearchBatch(sources) {
    const per = 100 / (sources.length + 1);
    let cursor = 50; // continue from mid-bar if run with DSpace
    for (const src of sources) {
      setStatus(`Harvesting: ${src.name}`);
      try {
        const records = await harvestResearchSource(src);
        state.all.push(...records);
      } catch (e) {
        console.warn(`Failed ${src.name}:`, e);
      }
      cursor += per;
      setProgress(Math.min(95, Math.round(cursor)));
    }
  }

  async function harvestResearchSource(src) {
    switch (src.id) {
      case "zenodo":
        return zenodoFetch();
      case "figshare":
        return figshareFetch();
      case "osf":
        return osfFetch();
      case "dryad":
        return dryadFetch();
      case "mendeley":
        return []; // needs auth; skip to avoid errors
      case "rg":
        return []; // HTML is unstable; keep disabled by default
      default:
        return [];
    }
  }

  async function zenodoFetch(page=1, size=50, acc=[]) {
    const api = `https://zenodo.org/api/records?size=${size}&page=${page}&sort=mostrecent`;
    const json = await proxyJSON(api);
    const items = (json?.hits?.hits || []).map(z => ({
      id: `zenodo-${z.id}`,
      title: z.metadata?.title || "Untitled",
      authors: (z.metadata?.creators || []).map(c => c.name) || ["Unknown"],
      description: stripHTML(z.metadata?.description || "") || "No description available",
      keywords: z.metadata?.keywords || [],
      year: z.metadata?.publication_date ? new Date(z.metadata.publication_date).getFullYear() : "",
      source: "Zenodo",
      type: "research",
      identifier: z.metadata?.doi || "",
      identifierType: z.metadata?.doi ? "DOI" : "Record",
      url: z.links?.html || "",
      downloadUrl: z.links?.latest || z.links?.download || z.links?.html || "",
    }));
    acc.push(...items);
    // Stop after 3 pages to be polite
    if (page < 3 && (json?.hits?.hits || []).length === size) {
      return zenodoFetch(page+1, size, acc);
    }
    return acc;
  }

  async function figshareFetch(page=1, size=50, acc=[]) {
    const api = `https://api.figshare.com/v2/articles?page=${page}&page_size=${size}`;
    const json = await proxyJSON(api);
    const items = (Array.isArray(json) ? json : []).map(f => ({
      id: `fig-${f.id}`,
      title: f.title || "Untitled",
      authors: (f.authors || []).map(a => a.full_name) || ["Unknown"],
      description: stripHTML(f.description || "") || "No description available",
      keywords: f.tags || [],
      year: f.published_date ? new Date(f.published_date).getFullYear() : "",
      source: "Figshare",
      type: "research",
      identifier: f.doi || "",
      identifierType: f.doi ? "DOI" : "Record",
      url: f.url_public_html || "",
      downloadUrl: (f.files && f.files[0]?.download_url) || f.url_public_html || "",
    }));
    acc.push(...items);
    if (page < 3 && Array.isArray(json) && json.length === size) {
      return figshareFetch(page+1, size, acc);
    }
    return acc;
  }

  async function osfFetch(pageUrl=`https://api.osf.io/v2/nodes/?page[size]=50`, acc=[]) {
    const json = await proxyJSON(pageUrl);
    const data = json?.data || [];
    const items = data.map(n => ({
      id: `osf-${n.id}`,
      title: n.attributes?.title || "Untitled",
      authors: ["Multiple contributors"],
      description: stripHTML(n.attributes?.description || "") || "No description available",
      keywords: n.attributes?.tags || [],
      year: n.attributes?.date_created ? new Date(n.attributes.date_created).getFullYear() : "",
      source: "OSF",
      type: "research",
      identifier: n.attributes?.doi || "",
      identifierType: n.attributes?.doi ? "DOI" : "Record",
      url: n.links?.html || n.links?.self?.href || "",
      downloadUrl: n.links?.html || n.links?.self?.href || "",
    }));
    acc.push(...items);
    const next = json?.links?.next;
    if (next && acc.length < 150) {
      return osfFetch(next, acc);
    }
    return acc;
  }

  async function dryadFetch(page=1, size=50, acc=[]) {
    const api = `https://datadryad.org/api/v2/search?page=${page}&per_page=${size}`;
    const json = await proxyJSON(api);
    const items = (json?.data || []).map(d => ({
      id: `dryad-${d.id || cryptoRandom(6)}`,
      title: d.attributes?.title || "Untitled",
      authors: (d.attributes?.authors || []).map(a => a.name) || ["Unknown"],
      description: d.attributes?.abstract || "No description available",
      keywords: d.attributes?.keywords || [],
      year: d.attributes?.publicationDate ? new Date(d.attributes.publicationDate).getFullYear() : "",
      source: "Dryad",
      type: "research",
      identifier: d.attributes?.doi || "",
      identifierType: d.attributes?.doi ? "DOI" : "Record",
      url: d.attributes?.url || "",
      downloadUrl: d.attributes?.url || "",
    }));
    acc.push(...items);
    if ((json?.data || []).length === size && page < 3) {
      return dryadFetch(page+1, size, acc);
    }
    return acc;
  }

  // ========= PROXY HELPERS =========
  async function proxyJSON(targetUrl) {
    const resp = await fetch(`${WORKER_URL}/api/proxy?url=${encodeURIComponent(targetUrl)}`);
    if (!resp.ok) throw new Error(`Proxy JSON failed: ${resp.status}`);
    return resp.json();
  }
  async function proxyText(targetUrl) {
    const resp = await fetch(`${WORKER_URL}/api/proxy?url=${encodeURIComponent(targetUrl)}`);
    if (!resp.ok) throw new Error(`Proxy Text failed: ${resp.status}`);
    return resp.text();
  }
  async function proxyXML(targetUrl) {
    const txt = await proxyText(targetUrl);
    const parser = new DOMParser();
    const xml = parser.parseFromString(txt, "text/xml");
    // OAI error?
    if (xml.querySelector("error")) {
      console.warn("OAI Error:", xml.querySelector("error")?.textContent);
    }
    return xml;
  }

  // ========= LIST UI =========
  function refreshList() {
    state.totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    resultsCount.textContent = `${state.filtered.length.toLocaleString()} results`;
    pagination.style.display = state.totalPages > 1 ? "flex" : "none";
    renderPage();
    updatePager();
  }

  function renderPage() {
    const start = (state.currentPage - 1) * state.pageSize;
    const page = state.filtered.slice(start, start + state.pageSize);
    dataCardsContainer.innerHTML = "";
    if (!page.length) {
      dataCardsContainer.innerHTML = `
        <div class="no-results">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>Try harvesting or change filters</p>
        </div>`;
      return;
    }
    page.forEach(item => dataCardsContainer.appendChild(card(item)));

    // Delegated actions
    dataCardsContainer.querySelectorAll(".card-action").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.closest(".data-card")?.dataset.itemId;
        const action = btn.dataset.action;
        handleCardAction(action, id);
      });
    });
  }

  function card(item) {
    const el = document.createElement("div");
    el.className = "data-card";
    el.dataset.itemId = item.id;
    el.innerHTML = `
      <div class="card-header">
        <div class="card-type">${(item.type || "DATA").toUpperCase()}</div>
        <div class="card-source">${item.source || ""}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHTML(item.title)}</h3>
        <div class="card-authors">${(item.authors || []).join(", ")}</div>
        <p class="card-description">${escapeHTML(item.description || "")}</p>
        <div class="card-keywords">
          ${(item.keywords || []).slice(0,6).map(k => `<span class="keyword-tag">${escapeHTML(k)}</span>`).join("")}
        </div>
      </div>
      <div class="card-footer">
        <div class="card-meta">
          <span><i class="far fa-calendar"></i> ${item.year || ""}</span>
          ${item.identifier ? `<span>${item.identifierType || "ID"}: <a class="doi-link" target="_blank" href="${item.url || "#"}">${escapeHTML(item.identifier)}</a></span>` : ""}
        </div>
        <div class="card-actions">
          <button class="card-action" data-action="view" title="View"><i class="fas fa-eye"></i></button>
          <button class="card-action" data-action="download" title="Download"><i class="fas fa-download"></i></button>
          <button class="card-action" data-action="zotero" title="Save to Zotero"><i class="fas fa-bookmark"></i></button>
        </div>
      </div>
    `;
    return el;
  }

  function updatePager() {
    firstPageBtn.disabled = state.currentPage === 1;
    prevPageBtn.disabled = state.currentPage === 1;
    nextPageBtn.disabled = state.currentPage === state.totalPages;
    lastPageBtn.disabled = state.currentPage === state.totalPages;
    pageInfo.textContent = `Page ${state.currentPage} of ${state.totalPages}`;
  }

  function goPage(p) {
    if (p < 1 || p > state.totalPages) return;
    state.currentPage = p;
    renderPage();
    updatePager();
  }

  // ========= FILTERS =========
  function applyFilters() {
    let out = [...state.all];

    const y = yearFilter.value.trim();
    if (y) out = out.filter(i => String(i.year) === y);

    const s = sourceFilter.value.trim();
    if (s) out = out.filter(i => i.source === s);

    const t = typeFilter.value.trim();
    if (t) out = out.filter(i => i.type === t);

    const sort = sortFilter.value;
    if (sort === "year") out.sort((a,b) => (b.year||0)-(a.year||0));
    if (sort === "year_asc") out.sort((a,b) => (a.year||0)-(b.year||0));
    if (sort === "title") out.sort((a,b) => (a.title||"").localeCompare(b.title||""));

    state.filtered = out;
    state.currentPage = 1;
    refreshList();
  }

  function resetFilters() {
    yearFilter.value = "";
    sourceFilter.value = "";
    typeFilter.value = "";
    sortFilter.value = "relevance";
    searchInResults.value = "";
    state.filtered = [...state.all];
    state.currentPage = 1;
    refreshList();
  }

  function searchWithin() {
    const q = (searchInResults.value || "").toLowerCase().trim();
    if (!q) { resetFilters(); return; }
    state.filtered = state.all.filter(i =>
      (i.title || "").toLowerCase().includes(q) ||
      (i.description || "").toLowerCase().includes(q) ||
      (i.authors || []).some(a => (a||"").toLowerCase().includes(q)) ||
      (i.keywords || []).some(k => (k||"").toLowerCase().includes(q))
    );
    state.currentPage = 1;
    refreshList();
  }

  // ========= SEARCH (input box) =========
  function doSearch() {
    resultsSection.classList.add("active");
    // For now, search just filters within harvested data
    searchWithin();
  }

  // ========= HELPERS =========
  function setProgress(pct) { progressEl.style.width = `${pct}%`; }
  function setStatus(msg) { harvestStatus.textContent = msg; }
  function saveLocal() {
    try { localStorage.setItem("qdata.harvest", JSON.stringify({ at: Date.now(), data: state.all })); }
    catch {}
  }
  function stripHTML(s=""){ return s.replace(/<[^>]*>/g,""); }
  function escapeHTML(s=""){ return s.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function cryptoRandom(n=8){ return Math.random().toString(36).slice(2,2+n); }
})();
