/* qdata.js - InquiryBase harvester (production) */

(() => {
  // ==== CONFIG ===============================================================
  const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";
  const PROXY = (url) => `${WORKER_URL}/api/proxy?url=${encodeURIComponent(url)}`;

  // Research-data sources (JSON APIs)
  const RESEARCH_SOURCES = [
    { id: "zenodo", name: "Zenodo", type: "research" },
    { id: "figshare", name: "Figshare", type: "research" },
    { id: "osf", name: "OSF", type: "research" },
    { id: "dryad", name: "Dryad", type: "research" },
    { id: "mendeley", name: "Mendeley Data", type: "research" },
    // ResearchGate has no public JSON API; omitted from live harvesting
  ];

  // South African DSpace repos (OAI-PMH | oai_dc)
  const DSPACE_SOURCES = [
    // Provided earlier + your new ones
    { id: "uct",  name: "Open UCT",                type: "articles",  oai: "https://open.uct.ac.za/oai/request" },
    { id: "sun",  name: "SUNScholar",              type: "articles",  oai: "https://scholar.sun.ac.za/oai/request" },
    { id: "up",   name: "UP Repository",           type: "articles",  oai: "https://repository.up.ac.za/oai/request" },
    { id: "ufs",  name: "UFS Scholar",             type: "articles",  oai: "https://scholar.ufs.ac.za/oai/request" },
    { id: "unisa",name: "UNISA DSpace",            type: "articles",  oai: "https://uir.unisa.ac.za/oai/request" },

    // Newly added/confirmed live
    { id: "spu",  name: "SPU OpenHub",             type: "articles",  oai: "https://openhub.spu.ac.za/oai/request" },
    { id: "cut",  name: "CUT Scholar",             type: "articles",  oai: "https://cutscholar.cut.ac.za/oai/request" },
    { id: "dut",  name: "DUT OpenScholar",         type: "articles",  oai: "https://openscholar.dut.ac.za/oai/request" },

    // A few more commonly-live SA DSpaces (safe add; harmless if empty)
    { id: "ukzn", name: "UKZN ResearchSpace",      type: "articles",  oai: "https://researchspace.ukzn.ac.za/oai/request" },
    { id: "tut",  name: "TUT VITAL",               type: "articles",  oai: "https://tutvital.tut.ac.za/oai/request" },
    { id: "uwc",  name: "UWC VITAL (SEALS)",       type: "articles",  oai: "https://vital.seals.ac.za/oai/request" }
  ];

  // ==== STATE ================================================================
  const state = {
    items: [],
    filtered: [],
    page: 1,
    pageSize: 12,
    totalPages: 1,
    isHarvesting: false,
    currentType: "all",
  };

  // ==== ELEMENTS ============================================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const resultsSection = $("#resultsSection");
  const progressEl = $("#progress");
  const statusEl = $("#harvestStatus");
  const cardsEl = $("#dataCardsContainer");
  const resultsCountEl = $("#resultsCount");
  const yearFilter = $("#yearFilter");
  const sourceFilter = $("#sourceFilter");
  const typeFilter = $("#typeFilter");
  const sortFilter = $("#sortFilter");
  const searchInResults = $("#searchInResults");
  const firstBtn = $("#firstPage");
  const prevBtn = $("#prevPage");
  const nextBtn = $("#nextPage");
  const lastBtn = $("#lastPage");
  const pageInfo = $("#pageInfo");
  const pagination = $("#pagination");

  // ==== HELPERS =============================================================
  function setProgress(pct, msg) {
    progressEl.style.width = `${pct}%`;
    if (msg) statusEl.textContent = msg;
  }

  function safeText(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }

  function parseYear(anyDate) {
    const d = anyDate ? new Date(anyDate) : null;
    const y = d && !isNaN(d) ? d.getFullYear() : "";
    return y || "";
  }

  function pickIdentifier(identifiers = []) {
    // Prefer DOI / URL / handle-looking values
    let url = "", handle = "", doi = "";
    identifiers.forEach((v) => {
      if (/^https?:\/\//i.test(v)) url = url || v;
      if (/^10\.\d{4,9}\//.test(v)) doi = doi || v;
      if (/hdl:|handle\.net|\/\d{4,}\//i.test(v)) handle = handle || v;
    });
    // Build handle url if handle only present as "hdl:xxx/yyy"
    if (!url && handle && handle.startsWith("hdl:")) {
      url = `https://hdl.handle.net/${handle.replace(/^hdl:/i, "")}`;
    }
    return { url, doi, handle };
  }

  function authorsFromDC(dcCreators = []) {
    return dcCreators.map(safeText).filter(Boolean);
  }

  // ==== DSPACE / OAI-PMH ====================================================
  async function harvestOAI(oaiEndpoint, pages = 1) {
    // ListRecords oai_dc; follow resumptionToken up to 'pages'
    const records = [];
    let token = null;
    let pageCount = 0;

    do {
      const url = token
        ? `${oaiEndpoint}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`
        : `${oaiEndpoint}?verb=ListRecords&metadataPrefix=oai_dc`;

      const res = await fetch(PROXY(url));
      if (!res.ok) throw new Error(`OAI ${res.status}`);
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, "text/xml");

      const list = Array.from(doc.getElementsByTagName("record"));
      list.forEach((rec) => {
        const md = rec.getElementsByTagName("metadata")[0];
        if (!md) return;
        const dc = md.getElementsByTagNameNS("*", "dc")[0] || md;

        const title = safeText(textFirst(dc, "title"));
        const creators = texts(dc, "creator");
        const desc = safeText(textFirst(dc, "description"));
        const subjects = texts(dc, "subject");
        const ids = texts(dc, "identifier");
        const date = safeText(textFirst(dc, "date"));
        const year = (date || "").slice(0, 4);

        const { url, doi, handle } = pickIdentifier(ids);

        records.push({
          id: `${url || handle || title}-${Math.random().toString(36).slice(2)}`,
          title: title || "Untitled",
          authors: authorsFromDC(creators).length ? authorsFromDC(creators) : ["Unknown"],
          description: desc || "No description.",
          keywords: subjects.length ? subjects.slice(0, 6) : ["dspace", "repository"],
          year: year || "",
          identifierType: doi ? "DOI" : handle ? "Handle" : "URL",
          identifier: doi || handle || url || "",
          url: url || (doi ? `https://doi.org/${doi}` : handle ? `https://hdl.handle.net/${handle.replace(/^hdl:/i, "")}` : ""),
          downloadUrl: url,
        });
      });

      // resumptionToken handling
      const rt = doc.getElementsByTagName("resumptionToken")[0];
      token = rt && safeText(rt.textContent) ? safeText(rt.textContent) : null;
      pageCount += 1;
    } while (token && pageCount < pages);

    return records;

    // helpers scoped to OAI
    function texts(dcNode, localName) {
      return Array.from(dcNode.getElementsByTagNameNS("*", localName)).map((n) => safeText(n.textContent));
    }
    function textFirst(dcNode, localName) {
      const n = dcNode.getElementsByTagNameNS("*", localName)[0];
      return n ? n.textContent : "";
    }
  }

  // ==== RESEARCH JSON PARSERS ==============================================
  function parseZenodo(json) {
    const hits = json?.hits?.hits || [];
    return hits.map((it) => {
      const md = it.metadata || {};
      const links = it.links || {};
      const title = safeText(md.title);
      const authors = (md.creators || []).map((c) => c.name).filter(Boolean);
      const year = parseYear(md.publication_date);
      const keywords = md.keywords || (md.subjects || []).map((s) => s.term) || [];

      return {
        id: String(it.id || Math.random()),
        title: title || "Untitled",
        authors: authors.length ? authors : ["Unknown"],
        description: stripHTML(md.description || "No description."),
        keywords: keywords.slice(0, 8),
        year,
        identifierType: md.doi ? "DOI" : "URL",
        identifier: md.doi || links.html || "",
        url: links.html || (md.doi ? `https://doi.org/${md.doi}` : ""),
        downloadUrl: links.download || "",
      };
    });
  }

  function parseFigshare(json) {
    const arr = Array.isArray(json) ? json : [];
    return arr.map((it) => {
      const title = safeText(it.title);
      const authors = (it.authors || []).map((a) => a.full_name);
      const year = parseYear(it.published_date);
      return {
        id: String(it.id || Math.random()),
        title: title || "Untitled",
        authors: authors.length ? authors : ["Unknown"],
        description: stripHTML(it.description || "No description."),
        keywords: it.tags || [],
        year,
        identifierType: it.doi ? "DOI" : "URL",
        identifier: it.doi || it.url_public_html || "",
        url: it.url_public_html || (it.doi ? `https://doi.org/${it.doi}` : ""),
        downloadUrl: it.files?.[0]?.download_url || it.url_public_html || "",
      };
    });
  }

  function parseOSF(json) {
    const arr = json?.data || [];
    return arr.map((it) => {
      const a = it.attributes || {};
      const year = parseYear(a.date_created);
      return {
        id: it.id || Math.random().toString(36),
        title: safeText(a.title) || "Untitled",
        authors: ["Multiple contributors"],
        description: stripHTML(a.description || "No description."),
        keywords: a.tags || [],
        year,
        identifierType: a.doi ? "DOI" : "URL",
        identifier: a.doi || it.links?.html || "",
        url: it.links?.html || (a.doi ? `https://doi.org/${a.doi}` : ""),
        downloadUrl: it.links?.download || it.links?.html || "",
      };
    });
  }

  function parseDryad(json) {
    const arr = json?.data || json?.items || json?.results || [];
    return arr.map((it) => {
      const title = safeText(it?.attributes?.title || it?.title);
      const authors = (it?.attributes?.authors || it?.authors || []).map((a) => a?.name || a).filter(Boolean);
      const doi = it?.attributes?.doi || it?.doi || "";
      const pub = it?.attributes?.publicationDate || it?.publicationDate || "";
      return {
        id: it?.id || Math.random().toString(36),
        title: title || "Untitled",
        authors: authors.length ? authors : ["Unknown"],
        description: stripHTML(it?.attributes?.abstract || it?.abstract || "No description."),
        keywords: it?.attributes?.keywords || it?.keywords || [],
        year: parseYear(pub),
        identifierType: doi ? "DOI" : "URL",
        identifier: doi || "",
        url: doi ? `https://doi.org/${doi}` : "",
        downloadUrl: doi ? `https://datadryad.org/stash/dataset/${doi}` : "",
      };
    });
  }

  function parseMendeley(json) {
    const arr = json?.results || json || [];
    return (Array.isArray(arr) ? arr : []).map((it) => {
      const title = safeText(it.title || it.name);
      const doi = it.doi || "";
      const year = parseYear(it.created || it.modified);
      return {
        id: String(it.id || Math.random()),
        title: title || "Untitled",
        authors: ["Unknown"],
        description: stripHTML(it.description || "No description."),
        keywords: [],
        year,
        identifierType: doi ? "DOI" : "URL",
        identifier: doi || "",
        url: doi ? `https://doi.org/${doi}` : "",
        downloadUrl: "",
      };
    });
  }

  function stripHTML(t) {
    const tmp = document.createElement("div");
    tmp.innerHTML = t || "";
    const clean = tmp.textContent || tmp.innerText || "";
    return clean.length > 300 ? clean.slice(0, 300) + "…" : clean;
  }

  // ==== FETCHERS ============================================================
  function apiUrlJson(sourceId, page = 1, size = 50, query = "") {
    switch (sourceId) {
      case "zenodo":
        return `https://zenodo.org/api/records?size=${size}&page=${page}${
          query ? `&q=${encodeURIComponent(query)}` : ""
        }&sort=mostrecent`;
      case "figshare":
        return `https://api.figshare.com/v2/articles?page=${page}&page_size=${size}`;
      case "osf":
        return `https://api.osf.io/v2/nodes/?page=${page}&page[size]=${size}`;
      case "dryad":
        return `https://datadryad.org/api/v2/search?per_page=${size}&page=${page}`;
      case "mendeley":
        return `https://data.mendeley.com/api/datasets?page=${page}&limit=${size}`;
      default:
        return "";
    }
  }

  async function harvestJsonSource(source, query) {
    let all = [];
    for (let page = 1; page <= 2; page++) { // keep light for production
      const url = apiUrlJson(source.id, page, 50, query);
      if (!url) continue;
      const res = await fetch(PROXY(url));
      if (!res.ok) throw new Error(`${source.name} ${res.status}`);
      const ct = res.headers.get("Content-Type") || "";
      const data = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());

      let parsed = [];
      if (source.id === "zenodo") parsed = parseZenodo(data);
      else if (source.id === "figshare") parsed = parseFigshare(data);
      else if (source.id === "osf") parsed = parseOSF(data);
      else if (source.id === "dryad") parsed = parseDryad(data);
      else if (source.id === "mendeley") parsed = parseMendeley(data);

      // annotate
      parsed = parsed.map((r) => ({ ...r, source: source.name, type: "research" }));
      all = all.concat(parsed);

      if ((source.id === "figshare" || source.id === "zenodo") && parsed.length < 50) break;
    }
    return all;
  }

  // ==== UI BINDINGS =========================================================
  function initUI() {
    // resize year options
    const nowY = new Date().getFullYear();
    for (let y = nowY; y >= 1980; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      yearFilter.append(opt);
    }

    // source filter options
    const filterSources = [
      ...RESEARCH_SOURCES.map((s) => s.name),
      ...DSPACE_SOURCES.map((s) => s.name),
    ];
    filterSources.forEach((nm) => {
      const opt = document.createElement("option");
      opt.value = nm;
      opt.textContent = nm;
      sourceFilter.append(opt);
    });

    // toggle advanced
    $("#toggleAdvanced").addEventListener("click", () => {
      $("#advancedSearch").classList.toggle("active");
    });

    // boolean choice
    $$("#booleanOptions .boolean-option").forEach((el) =>
      el.addEventListener("click", () => {
        $$("#booleanOptions .boolean-option").forEach((e) => e.classList.remove("active"));
        el.classList.add("active");
      })
    );

    // top source buttons
    $$(".source-button").forEach((btn) =>
      btn.addEventListener("click", () => {
        $$(".source-button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.currentType = btn.dataset.type;
      })
    );

    // actions
    $("#harvestAll").addEventListener("click", () => startHarvest());
    $("#refreshPage").addEventListener("click", () => location.reload());
    $("#searchButton").addEventListener("click", () => {
      const q = $("#globalQuery").value.trim();
      if (!q) return;
      startHarvest(q);
    });

    $("#resetFilters").addEventListener("click", () => {
      yearFilter.value = "";
      sourceFilter.value = "";
      typeFilter.value = "";
      sortFilter.value = "relevance";
      searchInResults.value = "";
      applyFilters();
    });

    yearFilter.addEventListener("change", applyFilters);
    sourceFilter.addEventListener("change", applyFilters);
    typeFilter.addEventListener("change", applyFilters);
    sortFilter.addEventListener("change", applyFilters);
    $("#searchInResultsButton").addEventListener("click", searchWithin);
    searchInResults.addEventListener("keypress", (e) => { if (e.key === "Enter") searchWithin(); });

    firstBtn.addEventListener("click", () => goPage(1));
    prevBtn.addEventListener("click", () => goPage(state.page - 1));
    nextBtn.addEventListener("click", () => goPage(state.page + 1));
    lastBtn.addEventListener("click", () => goPage(state.totalPages));

    // card action delegation
    cardsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".card-action");
      if (!btn) return;
      const card = e.target.closest(".data-card");
      if (!card) return;
      const id = card.dataset.itemId;
      const it = state.items.find((x) => String(x.id) === String(id));
      if (!it) return;

      const act = btn.dataset.action;
      if (act === "view") {
        if (it.url) window.open(it.url, "_blank");
        else alert("No URL available.");
      } else if (act === "download") {
        const dl = it.downloadUrl || it.url;
        if (dl) window.open(dl, "_blank");
        else alert("No download link available.");
      } else if (act === "zotero") {
        const z = `https://www.zotero.org/select/items?uri=${encodeURIComponent(it.url || (it.identifierType === "DOI" ? `https://doi.org/${it.identifier}` : ""))}`;
        window.open(z, "_blank");
      }
    });
  }

  function startHarvest(query = "") {
    if (state.isHarvesting) return;

    resultsSection.style.display = "block";
    state.isHarvesting = true;
    state.items = [];
    setProgress(2, "Connecting to sources…");

    const wanted = [];
    if (state.currentType === "all" || state.currentType === "research") wanted.push(...RESEARCH_SOURCES);
    if (state.currentType === "all" || state.currentType === "articles" || state.currentType === "theses") wanted.push(...DSPACE_SOURCES);

    (async () => {
      let done = 0;
      for (const src of wanted) {
        try {
          setProgress(5 + (done / wanted.length) * 80, `Harvesting ${src.name}…`);

          let recs = [];
          if (src.oai) {
            // DSpace via OAI-PMH (1 page of resumptionToken for perf)
            recs = await harvestOAI(src.oai, 1);
            recs = recs.map((r) => ({ ...r, source: src.name, type: src.type.includes("theses") ? "theses" : "articles" }));
          } else {
            recs = await harvestJsonSource(src, query);
          }

          state.items = state.items.concat(recs);
          applyFilters(); // live refresh
        } catch (err) {
          console.warn(`Harvest failed for ${src.name}:`, err.message);
        }
        done++;
      }

      setProgress(100, `Harvest complete. Collected ${state.items.length} records.`);
      setTimeout(() => setProgress(0, "Ready to harvest"), 4000);
      state.isHarvesting = false;
    })();
  }

  function applyFilters() {
    let list = [...state.items];

    const y = yearFilter.value;
    const s = sourceFilter.value;
    const t = typeFilter.value;
    const sort = sortFilter.value;

    if (y) list = list.filter((i) => String(i.year) === String(y));
    if (s) list = list.filter((i) => String(i.source) === String(s));
    if (t) list = list.filter((i) => String(i.type) === String(t));

    if (sort === "year") list.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    else if (sort === "year_asc") list.sort((a, b) => Number(a.year || 0) - Number(b.year || 0));
    else if (sort === "title") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    state.filtered = list;
    state.page = 1;
    updateDisplay();
  }

  function searchWithin() {
    const q = searchInResults.value.trim().toLowerCase();
    if (!q) {
      state.filtered = [...state.items];
    } else {
      state.filtered = state.items.filter((i) =>
        (i.title || "").toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q) ||
        (i.authors || []).some((a) => a.toLowerCase().includes(q)) ||
        (i.keywords || []).some((k) => k.toLowerCase().includes(q))
      );
    }
    state.page = 1;
    updateDisplay();
  }

  function updateDisplay() {
    state.totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    resultsCountEl.textContent = `${state.filtered.length.toLocaleString()} results`;
    renderPage();
    updatePager();
  }

  function renderPage() {
    const start = (state.page - 1) * state.pageSize;
    const pageItems = state.filtered.slice(start, start + state.pageSize);
    cardsEl.innerHTML = "";

    if (!pageItems.length) {
      cardsEl.innerHTML = `
        <div class="no-results">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>Try different filters or search terms.</p>
        </div>`;
      return;
    }

    pageItems.forEach((it) => {
      const kw = (it.keywords || []).slice(0, 6).map((k) => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join("");
      const idLine = it.identifier ? `${it.identifierType}: <a class="doi-link" target="_blank" href="${it.url || (it.identifierType === 'DOI' ? `https://doi.org/${it.identifier}` : '#')}">${escapeHtml(it.identifier)}</a>` : "";

      const card = document.createElement("div");
      card.className = "data-card";
      card.dataset.itemId = it.id;

      card.innerHTML = `
        <div class="card-header">
          <div class="card-type">${(it.type || "DATA").toUpperCase()}</div>
          <div class="card-source">${escapeHtml(it.source || "")}</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(it.title || "Untitled")}</h3>
          <div class="card-authors">${(it.authors || ["Unknown"]).map(escapeHtml).join(", ")}</div>
          <p class="card-description">${escapeHtml(it.description || "")}</p>
          <div class="card-keywords">${kw}</div>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><i class="far fa-calendar"></i> ${escapeHtml(String(it.year || ""))}</span>
            <span>${idLine}</span>
          </div>
          <div class="card-actions">
            <button class="card-action" data-action="view" title="View"><i class="fas fa-eye"></i></button>
            <button class="card-action" data-action="download" title="Download"><i class="fas fa-download"></i></button>
            <button class="card-action" data-action="zotero" title="Save to Zotero"><i class="fas fa-bookmark"></i></button>
          </div>
        </div>
      `;
      cardsEl.append(card);
    });
  }

  function updatePager() {
    firstBtn.disabled = state.page === 1;
    prevBtn.disabled = state.page === 1;
    nextBtn.disabled = state.page === state.totalPages;
    lastBtn.disabled = state.page === state.totalPages;
    pageInfo.textContent = `Page ${state.page} of ${state.totalPages}`;
    pagination.style.display = state.totalPages > 1 ? "flex" : "none";
  }

  function goPage(p) {
    if (p < 1 || p > state.totalPages) return;
    state.page = p;
    renderPage();
    updatePager();
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }

  // ==== BOOT ================================================================
  document.addEventListener("DOMContentLoaded", () => {
    initUI();
    // auto-open results section so the user sees status updates
    resultsSection.style.display = "block";
  });
})();
