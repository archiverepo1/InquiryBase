/* qdata.js — InquiryBase Harvester with Live Logging (Production v2) */

(() => {
  const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";
  const PROXY = (url) => `${WORKER_URL}/api/proxy?url=${encodeURIComponent(url)}`;

  // -------------------- SOURCES --------------------
  const RESEARCH_SOURCES = [
    { id: "zenodo", name: "Zenodo", api: "https://zenodo.org/api/records", type: "research" },
    { id: "figshare", name: "Figshare", api: "https://api.figshare.com/v2/articles", type: "research" },
    { id: "osf", name: "OSF", api: "https://api.osf.io/v2/nodes", type: "research" },
    { id: "dryad", name: "Dryad", api: "https://datadryad.org/api/v2/search", type: "research" },
    { id: "mendeley", name: "Mendeley Data", api: "https://data.mendeley.com/api/datasets", type: "research" }
  ];

  const DSPACE_SOURCES = [
    { name: "Open UCT", oai: "https://open.uct.ac.za/oai/request", type: "articles" },
    { name: "SUNScholar", oai: "https://scholar.sun.ac.za/oai/request", type: "articles" },
    { name: "UP Repository", oai: "https://repository.up.ac.za/oai/request", type: "articles" },
    { name: "UFS Scholar", oai: "https://scholar.ufs.ac.za/oai/request", type: "articles" },
    { name: "UNISA DSpace", oai: "https://uir.unisa.ac.za/oai/request", type: "articles" },
    { name: "SPU OpenHub", oai: "https://openhub.spu.ac.za/oai/request", type: "articles" },
    { name: "CUT Scholar", oai: "https://cutscholar.cut.ac.za/oai/request", type: "articles" },
    { name: "DUT OpenScholar", oai: "https://openscholar.dut.ac.za/oai/request", type: "articles" },
    { name: "UKZN ResearchSpace", oai: "https://researchspace.ukzn.ac.za/oai/request", type: "articles" },
    { name: "TUT VITAL", oai: "https://tutvital.tut.ac.za/oai/request", type: "articles" },
    { name: "UWC VITAL (SEALS)", oai: "https://vital.seals.ac.za/oai/request", type: "articles" }
  ];

  // -------------------- STATE --------------------
  const state = {
    items: [],
    filtered: [],
    isHarvesting: false,
    totalSources: 0,
    completed: 0,
  };

  const $ = (s) => document.querySelector(s);
  const cardsEl = $("#dataCardsContainer");
  const resultsCount = $("#resultsCount");
  const progress = $("#progress");
  const status = $("#harvestStatus");

  // -------------------- HELPERS --------------------
  const safe = (t) => (t || "").trim();
  const strip = (h) => {
    const div = document.createElement("div");
    div.innerHTML = h || "";
    return (div.textContent || "").replace(/\s+/g, " ").trim();
  };

  const updateProgress = (msg) => {
    const pct = Math.round((state.completed / state.totalSources) * 100);
    progress.style.width = `${pct}%`;
    status.textContent = msg;
  };

  const appendLog = (msg) => {
    console.log(msg);
    status.textContent = msg;
  };

  // -------------------- HARVEST CONTROLLERS --------------------
  async function startHarvest(query = "") {
    if (state.isHarvesting) return;
    state.isHarvesting = true;
    state.items = [];
    state.totalSources = RESEARCH_SOURCES.length + DSPACE_SOURCES.length;
    state.completed = 0;
    updateProgress("Starting harvest...");

    const allSources = [...RESEARCH_SOURCES, ...DSPACE_SOURCES];
    for (const src of allSources) {
      try {
        appendLog(`🔍 Harvesting ${src.name}...`);
        const data = src.oai
          ? await harvestOAI(src)
          : await harvestJSON(src, query);
        appendLog(`✅ ${src.name}: ${data.length} records`);
        state.items.push(...data);
      } catch (err) {
        appendLog(`⚠️ ${src.name} failed: ${err.message}`);
      } finally {
        state.completed++;
        updateProgress(`${src.name} complete`);
      }
    }

    appendLog(`🎉 Harvest complete — ${state.items.length} total records`);
    progress.style.width = "100%";
    renderCards(state.items);
    resultsCount.textContent = `${state.items.length} results`;
    setTimeout(() => (progress.style.width = "0%"), 4000);
    state.isHarvesting = false;
  }

  // -------------------- HARVESTERS --------------------
  async function harvestOAI(src) {
    const endpoint = `${src.oai}?verb=ListRecords&metadataPrefix=oai_dc`;
    const res = await fetch(PROXY(endpoint));
    if (!res.ok) throw new Error(`OAI ${res.status}`);
    const xml = await res.text();

    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const records = Array.from(doc.getElementsByTagName("record"));
    return records.slice(0, 10).map((r) => {
      const md = r.getElementsByTagName("metadata")[0];
      if (!md) return null;
      const dc = md.getElementsByTagNameNS("*", "dc")[0] || md;

      const title = getText(dc, "title");
      const author = getAll(dc, "creator").join(", ");
      const desc = strip(getText(dc, "description"));
      const date = getText(dc, "date");
      const ids = getAll(dc, "identifier");
      const url = ids.find((i) => i.includes("http")) || "";
      const year = date.slice(0, 4);

      return {
        id: Math.random().toString(36).slice(2),
        title: title || "Untitled",
        authors: [author || "Unknown"],
        description: desc || "No description available.",
        year,
        url,
        source: src.name,
        type: src.type,
      };
    }).filter(Boolean);
  }

  async function harvestJSON(src, query) {
    let url = src.api;
    if (src.id === "zenodo") url += `?q=${encodeURIComponent(query)}&size=10`;
    if (src.id === "figshare") url += `?page_size=10`;
    if (src.id === "osf") url += `/?page[size]=10`;
    if (src.id === "dryad") url += `?per_page=10`;
    if (src.id === "mendeley") url += `?limit=10`;

    const res = await fetch(PROXY(url));
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();

    if (src.id === "zenodo") return parseZenodo(json, src);
    if (src.id === "figshare") return parseFigshare(json, src);
    if (src.id === "osf") return parseOSF(json, src);
    if (src.id === "dryad") return parseDryad(json, src);
    if (src.id === "mendeley") return parseMendeley(json, src);
    return [];
  }

  // -------------------- PARSERS --------------------
  const parseZenodo = (json, src) =>
    (json?.hits?.hits || []).map((it) => ({
      title: it.metadata?.title || "Untitled",
      authors: (it.metadata?.creators || []).map((c) => c.name),
      description: strip(it.metadata?.description || ""),
      year: (it.metadata?.publication_date || "").slice(0, 4),
      url: it.links?.html || "",
      source: src.name,
      type: src.type,
    }));

  const parseFigshare = (json, src) =>
    (Array.isArray(json) ? json : []).map((it) => ({
      title: it.title,
      authors: (it.authors || []).map((a) => a.full_name),
      description: strip(it.description || ""),
      year: (it.published_date || "").slice(0, 4),
      url: it.url_public_html || "",
      source: src.name,
      type: src.type,
    }));

  const parseOSF = (json, src) =>
    (json.data || []).map((it) => ({
      title: it.attributes?.title || "Untitled",
      authors: ["OSF Contributor"],
      description: strip(it.attributes?.description || ""),
      year: (it.attributes?.date_created || "").slice(0, 4),
      url: it.links?.html || "",
      source: src.name,
      type: src.type,
    }));

  const parseDryad = (json, src) =>
    (json.items || []).map((it) => ({
      title: it.title,
      authors: (it.authors || []).map((a) => a.name),
      description: strip(it.abstract || ""),
      year: (it.publicationDate || "").slice(0, 4),
      url: it.doi ? `https://doi.org/${it.doi}` : "",
      source: src.name,
      type: src.type,
    }));

  const parseMendeley = (json, src) =>
    (json.results || []).map((it) => ({
      title: it.title,
      authors: ["Unknown"],
      description: strip(it.description || ""),
      year: (it.created || "").slice(0, 4),
      url: it.doi ? `https://doi.org/${it.doi}` : "",
      source: src.name,
      type: src.type,
    }));

  const getText = (n, tag) =>
    safe(n.getElementsByTagNameNS("*", tag)[0]?.textContent || "");
  const getAll = (n, tag) =>
    Array.from(n.getElementsByTagNameNS("*", tag)).map((x) => safe(x.textContent));

  // -------------------- RENDER --------------------
  function renderCards(items) {
    cardsEl.innerHTML = "";
    if (!items.length) {
      cardsEl.innerHTML = `<div class="no-results"><i class="fas fa-database"></i><p>No records found.</p></div>`;
      return;
    }
    items.forEach((it) => {
      const card = document.createElement("div");
      card.className = "data-card";
      card.innerHTML = `
        <div class="card-header">
          <div class="card-type">${(it.type || "").toUpperCase()}</div>
          <div class="card-source">${it.source}</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${it.title}</h3>
          <div class="card-authors">${(it.authors || []).join(", ")}</div>
          <p class="card-description">${it.description}</p>
        </div>
        <div class="card-footer">
          <div class="card-meta">${it.year ? `<i class="fa-regular fa-calendar"></i> ${it.year}` : ""}</div>
          <div class="card-actions">
            ${it.url ? `<button class="card-action" onclick="window.open('${it.url}','_blank')"><i class='fas fa-eye'></i></button>` : ""}
          </div>
        </div>`;
      cardsEl.append(card);
    });
  }

  // -------------------- INIT --------------------
  document.addEventListener("DOMContentLoaded", () => {
    $("#harvestAll").onclick = () => startHarvest();
    $("#refreshPage").onclick = () => location.reload();
  });
})();
