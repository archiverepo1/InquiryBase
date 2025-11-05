/* qdata.js — InquiryBase Live Harvester (Production v3) */
/* Uses Cloudflare Worker proxy at https://inquirybase.archiverepo1.workers.dev */

(() => {
  const WORKER = "https://inquirybase.archiverepo1.workers.dev";
  const PROXY = (u) => `${WORKER}/api/proxy?url=${encodeURIComponent(u)}`;

  // ---------- SOURCES ----------
  const RESEARCH = [
    { id: "zenodo",   name: "Zenodo",        type: "research", url: (q) => `https://zenodo.org/api/records?q=${encodeURIComponent(q||"")}&&size=20` },
    { id: "figshare", name: "Figshare",      type: "research", url: () => `https://api.figshare.com/v2/articles?page_size=20` },
    { id: "osf",      name: "OSF",           type: "research", url: () => `https://api.osf.io/v2/nodes/?page[size]=20` },
    { id: "dryad",    name: "Dryad",         type: "research", url: () => `https://datadryad.org/api/v2/search?per_page=20&q=*:*` },
    { id: "mendeley", name: "Mendeley Data", type: "research", url: () => `https://data.mendeley.com/api/datasets?limit=20` },
    // ResearchGate has no stable public API, often blocks; we try but ignore failures:
    { id: "rg",       name: "ResearchGate",  type: "research", url: () => `https://www.researchgate.net/` },
  ];

  // South African DSpace OAI (articles/theses)
  const DSPACE = [
    { name: "Open UCT",                type: "articles", oai: "https://open.uct.ac.za/oai/request" },
    { name: "SUNScholar",              type: "articles", oai: "https://scholar.sun.ac.za/oai/request" },
    { name: "UP Repository",           type: "articles", oai: "https://repository.up.ac.za/oai/request" },
    { name: "UFS Scholar",             type: "articles", oai: "https://scholar.ufs.ac.za/oai/request" },
    { name: "UNISA DSpace",            type: "articles", oai: "https://uir.unisa.ac.za/oai/request" },
    { name: "SPU OpenHub",             type: "articles", oai: "https://openhub.spu.ac.za/oai/request" },
    { name: "CUT Scholar",             type: "articles", oai: "https://cutscholar.cut.ac.za/oai/request" },
    { name: "DUT OpenScholar",         type: "articles", oai: "https://openscholar.dut.ac.za/oai/request" },
    { name: "UKZN ResearchSpace",      type: "articles", oai: "https://researchspace.ukzn.ac.za/oai/request" },
    { name: "TUT VITAL",               type: "articles", oai: "https://tutvital.tut.ac.za/oai/request" },
    { name: "UWC VITAL (SEALS)",       type: "articles", oai: "https://vital.seals.ac.za/oai/request" },
  ];

  // ---------- STATE ----------
  const state = {
    items: [],
    filtered: [],
    page: 1,
    pageSize: 12,
    totalPages: 1,
    harvesting: false,
  };

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const elQ = $("#q");
  const btnSearch = $("#btnSearch");
  const btnHarvestAll = $("#btnHarvestAll");
  const btnRefresh = $("#btnRefresh");
  const tabs = $$(".tab");
  const progress = $("#progress");
  const status = $("#harvestStatus");
  const cards = $("#dataCardsContainer");
  const resultsCount = $("#resultsCount");
  const filterSource = $("#filterSource");
  const filterYear = $("#filterYear");
  const filterSort = $("#filterSort");
  const filterText = $("#filterText");
  const btnFilterText = $("#btnFilterText");
  const pagination = $("#pagination");
  const firstPage = $("#firstPage");
  const prevPage = $("#prevPage");
  const nextPage = $("#nextPage");
  const lastPage = $("#lastPage");
  const pageInfo = $("#pageInfo");

  // ---------- UTIL ----------
  const safe = (x) => (x ?? "").toString().trim();
  const strip = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  };
  const yearFrom = (s) => (s || "").match(/\d{4}/)?.[0] || "";
  const updateProgress = (done, total, msg) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    progress.style.width = `${pct}%`;
    status.textContent = msg || "";
  };

  // ---------- PARSERS (JSON) ----------
  const parseZenodo = (json) =>
    (json?.hits?.hits || []).map((rec) => ({
      id: rec.id || crypto.randomUUID(),
      title: safe(rec.metadata?.title || "Untitled"),
      authors: (rec.metadata?.creators || []).map((c) => c.name),
      description: strip(rec.metadata?.description || ""),
      year: yearFrom(rec.metadata?.publication_date),
      url: rec.links?.html || (rec.doi ? `https://doi.org/${rec.doi}` : ""),
      source: "Zenodo",
      type: "research",
    }));

  const parseFigshare = (json) =>
    (Array.isArray(json) ? json : []).map((it) => ({
      id: it.id || crypto.randomUUID(),
      title: safe(it.title),
      authors: (it.authors || []).map((a) => a.full_name),
      description: strip(it.description || ""),
      year: yearFrom(it.published_date),
      url: it.url_public_html || "",
      source: "Figshare",
      type: "research",
    }));

  const parseOSF = (json) =>
    (json?.data || []).map((it) => ({
      id: it.id || crypto.randomUUID(),
      title: safe(it.attributes?.title || "Untitled"),
      authors: ["OSF Contributor"],
      description: strip(it.attributes?.description || ""),
      year: yearFrom(it.attributes?.date_created),
      url: it?.links?.html || "",
      source: "OSF",
      type: "research",
    }));

  const parseDryad = (json) =>
    (json?.items || []).map((it) => ({
      id: it.identifier || crypto.randomUUID(),
      title: safe(it.title),
      authors: (it.authors || []).map((a) => a.name),
      description: strip(it.abstract || ""),
      year: yearFrom(it.publicationDate),
      url: it.doi ? `https://doi.org/${it.doi}` : "",
      source: "Dryad",
      type: "research",
    }));

  const parseMendeley = (json) =>
    (json?.results || []).map((it) => ({
      id: it.id || crypto.randomUUID(),
      title: safe(it.title || "Untitled"),
      authors: ["Unknown"],
      description: strip(it.description || ""),
      year: yearFrom(it.created),
      url: it.doi ? `https://doi.org/${it.doi}` : "",
      source: "Mendeley Data",
      type: "research",
    }));

  // ---------- OAI-PMH (XML) ----------
  const getText = (node, tag) =>
    safe(node.getElementsByTagNameNS("*", tag)[0]?.textContent || "");
  const getAll = (node, tag) =>
    Array.from(node.getElementsByTagNameNS("*", tag)).map((n) => safe(n.textContent));

  function linkFromIdentifiers(ids) {
    // Prefer full http(s), otherwise normalize hdl:/doi:
    const http = ids.find((i) => i.startsWith("http")) || "";
    if (http) return http;
    const hdl = ids.find((i) => i.toLowerCase().startsWith("hdl:"));
    if (hdl) return `https://hdl.handle.net/${hdl.split(":").slice(1).join(":")}`;
    const doi = ids.find((i) => i.toLowerCase().startsWith("doi:"));
    if (doi) return `https://doi.org/${doi.split(":").slice(1).join(":")}`;
    // Sometimes DSpace gives 1234/56789 without protocol
    const bare = ids.find((i) => /^\d+\/\d+/.test(i));
    if (bare) return `https://hdl.handle.net/${bare}`;
    return "";
  }

  function parseOAI(xmlText, srcName, type) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const records = Array.from(doc.getElementsByTagName("record"));
    return records.slice(0, 30).map((r) => {
      const md = r.getElementsByTagName("metadata")[0];
      if (!md) return null;
      const dc = md.getElementsByTagNameNS("*", "dc")[0] || md;

      const title = getText(dc, "title") || "Untitled";
      const creators = getAll(dc, "creator");
      const desc = strip(getText(dc, "description"));
      const ids = getAll(dc, "identifier");
      const date = getText(dc, "date");
      const url = linkFromIdentifiers(ids);

      return {
        id: crypto.randomUUID(),
        title,
        authors: creators.length ? creators : ["Unknown"],
        description: desc || "No description available.",
        year: yearFrom(date),
        url,
        source: srcName,
        type,
      };
    }).filter(Boolean);
  }

  // ---------- FETCHERS ----------
  async function fetchJSON(url) {
    const res = await fetch(PROXY(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      // Some APIs send text/plain with JSON — try anyway
      return res.json().catch(async () => JSON.parse(await res.text()));
    }
    return res.json();
  }

  async function fetchXML(url) {
    const res = await fetch(PROXY(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  // ---------- HARVEST ----------
  async function harvestAll(query = "") {
    if (state.harvesting) return;
    state.harvesting = true;
    state.items = [];
    renderStatus("Starting harvest…");
    updateProgress(0, 1);

    const all = [...RESEARCH, ...DSPACE];
    let done = 0;

    for (const src of all) {
      try {
        renderStatus(`Harvesting ${src.name || src.id}…`);
        let chunk = [];

        if (src.oai) {
          const u = `${src.oai}?verb=ListRecords&metadataPrefix=oai_dc`;
          const xml = await fetchXML(u);
          chunk = parseOAI(xml, src.name, src.type);
        } else {
          // JSON APIs
          const u = src.url(query);
          const json = await fetchJSON(u);
          if (src.id === "zenodo") chunk = parseZenodo(json);
          else if (src.id === "figshare") chunk = parseFigshare(json);
          else if (src.id === "osf") chunk = parseOSF(json);
          else if (src.id === "dryad") chunk = parseDryad(json);
          else if (src.id === "mendeley") chunk = parseMendeley(json);
          else if (src.id === "rg") chunk = []; // no API; ignore
        }

        state.items.push(...chunk);
        renderStatus(`✅ ${src.name || src.id}: ${chunk.length} records`);
      } catch (e) {
        renderStatus(`⚠️ ${src.name || src.id} failed: ${e.message}`);
      } finally {
        done++;
        updateProgress(done, all.length, `Processed ${done}/${all.length}`);
      }
    }

    // Deduplicate by URL+title
    const seen = new Set();
    state.items = state.items.filter((x) => {
      const k = `${x.url}|${x.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    renderStatus(`🎉 Harvest complete — ${state.items.length} records`);
    buildFiltersFrom(state.items);
    applyFilters();
    state.harvesting = false;
    setTimeout(() => (progress.style.width = "0%"), 2500);
  }

  // ---------- RENDER & FILTER ----------
  function renderStatus(msg) {
    status.textContent = msg;
    console.log(msg);
  }

  function buildFiltersFrom(items) {
    // Source filter
    filterSource.innerHTML = `<option value="">All</option>`;
    [...new Set(items.map((x) => x.source).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b))
      .forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s; opt.textContent = s;
        filterSource.appendChild(opt);
      });
    // Year filter
    filterYear.innerHTML = `<option value="">All</option>`;
    [...new Set(items.map((x) => x.year).filter(Boolean))]
      .sort((a,b)=>b.localeCompare(a))
      .forEach((y) => {
        const opt = document.createElement("option");
        opt.value = y; opt.textContent = y;
        filterYear.appendChild(opt);
      });
  }

  function applyFilters() {
    const src = filterSource.value;
    const yr = filterYear.value;
    const txt = filterText.value.toLowerCase().trim();
    const sort = filterSort.value;

    let list = [...state.items];

    if (src) list = list.filter((x) => x.source === src);
    if (yr) list = list.filter((x) => x.year === yr);
    if (txt) {
      list = list.filter((x) =>
        (x.title || "").toLowerCase().includes(txt) ||
        (x.description || "").toLowerCase().includes(txt) ||
        (x.authors || []).join(", ").toLowerCase().includes(txt)
      );
    }

    // Sort
    if (sort === "year_desc") list.sort((a,b)=>(b.year||"").localeCompare(a.year||""));
    else if (sort === "year_asc") list.sort((a,b)=>(a.year||"").localeCompare(b.year||""));
    else if (sort === "title") list.sort((a,b)=>(a.title||"").localeCompare(b.title||""));

    state.filtered = list;
    state.page = 1;
    state.totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    renderPage();
  }

  function renderPage() {
    const { page, pageSize, filtered } = state;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    cards.innerHTML = "";
    if (!slice.length) {
      cards.innerHTML = `
        <div class="no-results">
          <i class="fa-regular fa-circle-question"></i>
          <h3>No results</h3>
          <p>Try a different filter or new harvest.</p>
        </div>`;
    } else {
      slice.forEach((it) => {
        const el = document.createElement("div");
        el.className = "data-card";
        el.innerHTML = `
          <div class="card-header">
            <div class="card-type">${(it.type||"").toUpperCase()}</div>
            <div class="card-source">${it.source||""}</div>
          </div>
          <div class="card-body">
            <h3 class="card-title">${escapeHTML(it.title)}</h3>
            <div class="card-authors">${escapeHTML((it.authors||[]).join(", "))}</div>
            <p class="card-description">${escapeHTML(it.description||"")}</p>
          </div>
          <div class="card-footer">
            <div class="card-meta">${it.year ? `<i class="fa-regular fa-calendar"></i> ${it.year}` : ""}</div>
            <div class="card-actions">
              ${
                it.url
                  ? `<button class="btn sm" title="Open" onclick="window.open('${it.url}','_blank')">
                       <i class="fa-solid fa-up-right-from-square"></i>
                     </button>`
                  : ""
              }
              ${
                it.url
                  ? `<button class="btn sm" title="Save to Zotero" onclick="window.open('https://www.zotero.org/select/items?uri=${encodeURIComponent(it.url)}','_blank')">
                       <i class="fa-solid fa-bookmark"></i>
                     </button>`
                  : ""
              }
            </div>
          </div>`;
        cards.appendChild(el);
      });
    }

    // Count & Pagination
    resultsCount.textContent = `${state.filtered.length} results`;
    if (state.totalPages > 1) {
      pagination.hidden = false;
      pageInfo.textContent = `Page ${state.page} of ${state.totalPages}`;
      firstPage.disabled = state.page === 1;
      prevPage.disabled = state.page === 1;
      nextPage.disabled = state.page === state.totalPages;
      lastPage.disabled = state.page === state.totalPages;
    } else {
      pagination.hidden = true;
    }
  }

  function escapeHTML(s) {
    return (s||"").replace(/[&<>"']/g, (c)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }

  // ---------- EVENTS ----------
  document.addEventListener("DOMContentLoaded", () => {
    // Tabs filter (visual only; we still harvest all)
    tabs.forEach((t) =>
      t.addEventListener("click", () => {
        tabs.forEach((n)=>n.classList.remove("active"));
        t.classList.add("active");
        const f = t.dataset.filter;
        // Simple filter by type, without re-harvest:
        filterSource.value = "";
        filterYear.value = "";
        filterText.value = "";
        filterSort.value = "relevance";

        if (f === "all") {
          state.filtered = [...state.items];
        } else {
          state.filtered = state.items.filter((x) => x.type === f);
        }
        state.page = 1;
        state.totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        renderPage();
      })
    );

    btnSearch.addEventListener("click", () => harvestAll(elQ.value.trim()));
    elQ.addEventListener("keypress", (e) => { if (e.key === "Enter") harvestAll(elQ.value.trim()); });
    btnHarvestAll.addEventListener("click", () => harvestAll(""));
    btnRefresh.addEventListener("click", () => location.reload());

    filterSource.addEventListener("change", applyFilters);
    filterYear.addEventListener("change", applyFilters);
    filterSort.addEventListener("change", applyFilters);
    btnFilterText.addEventListener("click", applyFilters);
    filterText.addEventListener("keypress", (e)=>{ if (e.key==="Enter") applyFilters(); });

    firstPage.addEventListener("click", ()=>{ state.page=1; renderPage(); });
    prevPage.addEventListener("click", ()=>{ if (state.page>1){ state.page--; renderPage(); }});
    nextPage.addEventListener("click", ()=>{ if (state.page<state.totalPages){ state.page++; renderPage(); }});
    lastPage.addEventListener("click", ()=>{ state.page=state.totalPages; renderPage(); });
  });
})();
