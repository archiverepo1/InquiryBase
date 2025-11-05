/* Q Data Harvester – Github JS (standalone)
   - Harvests SA DSpace (OAI-PMH) for Articles/Theses
   - Harvests Zenodo, Figshare, OSF for Research Data
   - Uses Cloudflare Worker as CORS proxy
*/

const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";

// --------- Sources ---------
const SOUTH_AFRICA_DSPACE = [
  // Confirmed by you
  { id: "uct",   name: "Open UCT",                   host: "open.uct.ac.za",           oai: "https://open.uct.ac.za/oai/request" },
  { id: "sun",   name: "SUNScholar",                 host: "scholar.sun.ac.za",        oai: "https://scholar.sun.ac.za/oai/request" },
  { id: "up",    name: "UP Repository",              host: "repository.up.ac.za",      oai: "https://repository.up.ac.za/oai/request" },
  { id: "ufs",   name: "UFS Scholar",                host: "scholar.ufs.ac.za",        oai: "https://scholar.ufs.ac.za/oai/request" },
  { id: "unisa", name: "UNISA DSpace",               host: "uir.unisa.ac.za",          oai: "https://uir.unisa.ac.za/oai/request" },
  // Newly provided by you
  { id: "spu",   name: "SPU OpenHub",                host: "openhub.spu.ac.za",        oai: "https://openhub.spu.ac.za/oai/request" },
  { id: "cut",   name: "CUT Scholar",                host: "cutscholar.cut.ac.za",     oai: "https://cutscholar.cut.ac.za/oai/request" },
  { id: "dut",   name: "DUT OpenScholar",            host: "openscholar.dut.ac.za",    oai: "https://openscholar.dut.ac.za/oai/request" },
  // Widely used, currently live (common endpoints)
  { id: "ukzn",  name: "UKZN ResearchSpace",         host: "researchspace.ukzn.ac.za", oai: "https://researchspace.ukzn.ac.za/oai/request" },
  { id: "wits",  name: "Wits WIReDSpace",            host: "wiredspace.wits.ac.za",    oai: "https://wiredspace.wits.ac.za/oai/request" },
  { id: "nwu",   name: "NWU Repository",             host: "repository.nwu.ac.za",     oai: "https://repository.nwu.ac.za/oai/request" },
  { id: "uwc",   name: "UWC Repository",             host: "repository.uwc.ac.za",     oai: "https://repository.uwc.ac.za/oai/request" },
  { id: "ul",    name: "ULSpace (Limpopo)",          host: "ulspace.ul.ac.za",         oai: "https://ulspace.ul.ac.za/oai/request" },
  { id: "ufh",   name: "UFH Repository",             host: "dspace.ufh.ac.za",         oai: "https://dspace.ufh.ac.za/oai/request" },
];

const RESEARCH_DATA_SOURCES = [
  { id: "zenodo",  name: "Zenodo",  type: "research" },
  { id: "figshare",name: "Figshare",type: "research" },
  { id: "osf",     name: "OSF",     type: "research" }
];

// --------- State ---------
const state = {
  all: [],
  filtered: [],
  page: 1,
  pageSize: 12,
  totalPages: 1,
  isHarvesting: false,
  currentType: "all"
};

// --------- Helpers ---------
const el = (sel) => document.querySelector(sel);
const els = (sel) => document.querySelectorAll(sel);
function setProgress(p) { el("#progress").style.width = `${p}%`; }
function setStatus(t) { el("#harvestStatus").textContent = t; }

function yearOptionsInit() {
  const y = new Date().getFullYear();
  const sel = el("#yearFilter");
  for (let yr = y; yr >= 1980; yr--) {
    const o = document.createElement("option");
    o.value = String(yr);
    o.textContent = String(yr);
    sel.appendChild(o);
  }
}
function sourceOptionsInit() {
  const sel = el("#sourceFilter");
  const names = [...SOUTH_AFRICA_DSPACE.map(s => s.name), ...RESEARCH_DATA_SOURCES.map(s=>s.name)];
  names.forEach(n => {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  });
}

function saveLocal() {
  try {
    localStorage.setItem("qDataHarvest", JSON.stringify({ data: state.all, ts: Date.now() }));
  } catch {}
}
function loadLocal() {
  try {
    const raw = localStorage.getItem("qDataHarvest");
    if (!raw) return;
    const { data } = JSON.parse(raw);
    if (Array.isArray(data) && data.length) {
      state.all = data;
      state.filtered = data.slice();
      el("#resultsSection").classList.add("active");
      render();
    }
  } catch {}
}

// Prefer a repo-local URL, then DOI, then Handle
function pickBestUrl(identifiers = [], hostHint = "") {
  const clean = (s) => (s || "").trim();
  const urls = identifiers.map(clean).filter(Boolean);

  // repo-local
  const byHost = urls.find(u => u.startsWith("http") && hostHint && u.includes(hostHint));
  if (byHost) return byHost;

  // doi
  const doi = urls.find(u => u.includes("doi.org")) || urls.find(u => /^10\./.test(u));
  if (doi) return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;

  // handle
  const handle = urls.find(u => u.includes("hdl.handle.net")) || urls.find(u => /^\d+\/\d+/.test(u));
  if (handle) return handle.startsWith("http") ? handle : `https://hdl.handle.net/${handle}`;

  // fall back to first http-like
  const http = urls.find(u => u.startsWith("http"));
  if (http) return http;

  return "";
}

function xmlText(node, sel) {
  const n = node.querySelector(sel);
  return n ? n.textContent.trim() : "";
}
function xmlTexts(node, sel) {
  return Array.from(node.querySelectorAll(sel)).map(n => n.textContent.trim()).filter(Boolean);
}

// --------- Harvesters ---------
async function harvestAll() {
  if (state.isHarvesting) return alert("Harvest already in progress");
  state.isHarvesting = true;
  el("#resultsSection").classList.add("active");
  state.all = [];
  setProgress(0); setStatus("Starting harvest...");

  // Build source list by type
  const wantType = state.currentType;
  const dspaceList = (wantType === "all" || wantType === "articles" || wantType === "theses") ? SOUTH_AFRICA_DSPACE : [];
  const dataList   = (wantType === "all" || wantType === "research") ? RESEARCH_DATA_SOURCES : [];
  const sources = [...dspaceList, ...dataList];

  let idx = 0;
  for (const src of sources) {
    idx++;
    setStatus(`Harvesting: ${src.name}`);
    setProgress(Math.min(90, Math.round((idx - 1) / Math.max(1, sources.length) * 90)));

    try {
      let recs = [];
      if (src.oai) {
        // DSpace OAI
        recs = await harvestOAI(src, wantType);
      } else {
        // Research data platforms
        recs = await harvestDataPlatforms(src);
      }
      state.all = state.all.concat(recs);
      state.filtered = state.all.slice();
      render();
    } catch (e) {
      console.warn(`Failed ${src.name}:`, e);
    }
  }

  setProgress(100);
  setStatus(`Harvest complete! Collected ${state.all.length} records`);
  saveLocal();
  state.isHarvesting = false;
}

async function harvestOAI(source, wantType) {
  // Fetch first page, then follow resumptionToken if present
  const pageSize = 100; // XML page size
  const out = [];
  let url = `${source.oai}?verb=ListRecords&metadataPrefix=oai_dc`;
  let guard = 0;

  while (url && guard < 20) {
    guard++;

    const proxyUrl = `${WORKER_URL}/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    const text = await res.text();

    const xml = new DOMParser().parseFromString(text, "text/xml");
    const recs = Array.from(xml.getElementsByTagName("record"));

    recs.forEach(r => {
      const meta = r.querySelector("metadata");
      if (!meta) return;

      const dc = meta.querySelector("dc\\:dc, dc");
      if (!dc) return;

      const title = xmlText(dc, "dc\\:title, title") || "Untitled";
      const creators = xmlTexts(dc, "dc\\:creator, creator");
      const desc = xmlText(dc, "dc\\:description, description");
      const subjects = xmlTexts(dc, "dc\\:subject, subject");
      const types = xmlTexts(dc, "dc\\:type, type").map(t => t.toLowerCase());
      const dates = xmlTexts(dc, "dc\\:date, date");
      const identifiers = xmlTexts(dc, "dc\\:identifier, identifier");
      const year = (dates.join(" ").match(/\b(19|20)\d{2}\b/) || [])[0] || "";

      // Filter by type if user clicked Articles/Theses
      let logicalType = "articles";
      if (types.some(t => t.includes("thesis"))) logicalType = "theses";
      if (types.some(t => t.includes("article"))) logicalType = "articles";

      if (wantType === "theses" && logicalType !== "theses") return;
      if (wantType === "articles" && logicalType !== "articles") return;

      const urlBest = pickBestUrl(identifiers, source.host);
      const id = `${source.id}-${(Math.random()*1e9|0)}`;
      out.push({
        id,
        title,
        authors: creators.length ? creators : ["Unknown"],
        description: desc || "No description available",
        keywords: subjects.length ? subjects : ["dspace", "repository"],
        year: year || "",
        source: source.name,
        type: logicalType,
        identifier: urlBest.includes("doi.org") ? urlBest.replace(/^https?:\/\/doi\.org\//,'') : (identifiers[0] || ""),
        identifierType: urlBest.includes("doi.org") ? "DOI" : (urlBest.includes("hdl.handle.net") ? "Handle" : "URL"),
        url: urlBest,
        downloadUrl: "" // DSpace often needs another call; open item page for download
      });
    });

    // Next page via resumptionToken
    const token = xmlText(xml, "resumptionToken");
    if (token) {
      url = `${source.oai}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
      await delay(250);
    } else {
      url = "";
    }

    if (out.length >= pageSize * 5) break; // prevent runaway (500 items/source)
  }

  return out;
}

async function harvestDataPlatforms(source) {
  switch (source.id) {
    case "zenodo": {
      const api = "https://zenodo.org/api/records?q=*&size=100&sort=mostrecent";
      const data = await proxyJson(api);
      const hits = data.hits?.hits || [];
      return hits.map(it => ({
        id: `zenodo-${it.id}`,
        title: it.metadata?.title || "Untitled",
        authors: (it.metadata?.creators || []).map(c => c.name),
        description: stripHtml(it.metadata?.description || ""),
        keywords: it.metadata?.keywords || [],
        year: (it.metadata?.publication_date || "").slice(0,4),
        source: "Zenodo",
        type: "research",
        identifier: it.metadata?.doi || "",
        identifierType: it.metadata?.doi ? "DOI" : "URL",
        url: it.links?.html || (it.metadata?.doi ? `https://doi.org/${it.metadata.doi}` : ""),
        downloadUrl: it.links?.download || ""
      }));
    }
    case "figshare": {
      const api = "https://api.figshare.com/v2/articles?page_size=100&page=1";
      const arr = await proxyJson(api);
      return arr.map(it => ({
        id: `figshare-${it.id}`,
        title: it.title || "Untitled",
        authors: (it.authors || []).map(a => a.full_name),
        description: stripHtml(it.description || ""),
        keywords: it.tags || [],
        year: (it.published_date || "").slice(0,4),
        source: "Figshare",
        type: "research",
        identifier: it.doi || "",
        identifierType: it.doi ? "DOI" : "URL",
        url: it.url_public_html || (it.doi ? `https://doi.org/${it.doi}` : ""),
        downloadUrl: (it.files && it.files[0] && it.files[0].download_url) || ""
      }));
    }
    case "osf": {
      const api = "https://api.osf.io/v2/nodes/?page[size]=100&fields[notes]=title,description,date_created,doi,tags";
      const json = await proxyJson(api);
      const arr = json.data || [];
      return arr.map(it => ({
        id: `osf-${it.id}`,
        title: it.attributes?.title || "Untitled",
        authors: ["Multiple contributors"],
        description: stripHtml(it.attributes?.description || ""),
        keywords: it.attributes?.tags || [],
        year: (it.attributes?.date_created || "").slice(0,4),
        source: "OSF",
        type: "research",
        identifier: it.attributes?.doi || "",
        identifierType: it.attributes?.doi ? "DOI" : "URL",
        url: it.links?.html || (it.attributes?.doi ? `https://doi.org/${it.attributes.doi}` : ""),
        downloadUrl: ""
      }));
    }
    default: return [];
  }
}

// --------- Proxy helpers ---------
async function proxyJson(url) {
  const res = await fetch(`${WORKER_URL}/api/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Proxy ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  // Some endpoints may still return text; try to parse
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return {}; }
}
const delay = (ms)=>new Promise(r=>setTimeout(r,ms));
const stripHtml = (s)=> (s||"").replace(/<[^>]+>/g,"").trim();

// --------- UI, filters, rendering ---------
function applyFilters() {
  let data = state.all.slice();
  const y = el("#yearFilter").value;
  const src = el("#sourceFilter").value;
  const typ = el("#typeFilter").value;
  const sort = el("#sortFilter").value;

  if (y) data = data.filter(d => String(d.year) === y);
  if (src) data = data.filter(d => d.source === src);
  if (typ) data = data.filter(d => d.type === typ);

  if (sort === "year") data.sort((a,b)=>String(b.year).localeCompare(String(a.year)));
  else if (sort === "year_asc") data.sort((a,b)=>String(a.year).localeCompare(String(b.year)));
  else if (sort === "title") data.sort((a,b)=> (a.title||"").localeCompare(b.title||""));

  state.filtered = data;
  state.page = 1;
  render();
}

function render() {
  const count = state.filtered.length;
  el("#resultsCount").textContent = `${count.toLocaleString()} results`;
  const total = Math.max(1, Math.ceil(count / state.pageSize));
  state.totalPages = total;

  const start = (state.page - 1) * state.pageSize;
  const pageData = state.filtered.slice(start, start + state.pageSize);
  renderCards(pageData);

  el("#firstPage").disabled = state.page === 1;
  el("#prevPage").disabled = state.page === 1;
  el("#nextPage").disabled = state.page === total;
  el("#lastPage").disabled = state.page === total;
  el("#pageInfo").textContent = `Page ${state.page} of ${total}`;
}

function renderCards(items) {
  const box = el("#dataCardsContainer");
  box.innerHTML = "";

  if (!items.length) {
    box.innerHTML = `<div class="no-results"><i class="fas fa-search"></i><h3>No results found</h3><p>Try adjusting your filters or harvest more data</p></div>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.className = "data-card";
    div.dataset.itemId = item.id;
    div.innerHTML = `
      <div class="card-header">
        <div class="card-type">${(item.type||"").toUpperCase()}</div>
        <div class="card-source">${item.source||""}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.title||"Untitled")}</h3>
        <div class="card-authors">${Array.isArray(item.authors)? item.authors.join(", ") : (item.authors||"")}</div>
        <p class="card-description">${escapeHtml(item.description||"")}</p>
        <div class="card-keywords">
          ${(item.keywords||[]).slice(0,4).map(k=>`<span class="keyword-tag">${escapeHtml(k)}</span>`).join("")}
          ${(item.keywords||[]).length>4? `<span class="keyword-tag">+${(item.keywords||[]).length-4} more</span>`: ""}
        </div>
      </div>
      <div class="card-footer">
        <div class="card-meta">
          <span><i class="far fa-calendar"></i> ${item.year||""}</span>
          <span>${item.identifierType||"ID"}: ${item.identifier ? `<a class="doi-link" href="${item.url||'#'}" target="_blank" rel="noopener">${escapeHtml(item.identifier)}</a>` : "-"}</span>
        </div>
        <div class="card-actions">
          <button class="card-action" data-action="view" title="View"><i class="fas fa-eye"></i></button>
          <button class="card-action" data-action="download" title="Download"><i class="fas fa-download"></i></button>
          <button class="card-action" data-action="zotero" title="Save to Zotero"><i class="fas fa-bookmark"></i></button>
        </div>
      </div>`;
    box.appendChild(div);
  });
}

function escapeHtml(s){return (s||"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]))}

// --------- Events ---------
document.addEventListener("DOMContentLoaded", () => {
  // buttons, inputs
  el("#doSearch").addEventListener("click", () => {
    state.currentType = "all";
    harvestAll();
  });

  els(".source-button").forEach(b=>{
    b.addEventListener("click", e=>{
      els(".source-button").forEach(x=>x.classList.remove("active"));
      e.currentTarget.classList.add("active");
      state.currentType = e.currentTarget.dataset.type;
      harvestAll();
    });
  });

  el(".advanced-toggle").addEventListener("click", ()=> el("#advancedBox").classList.toggle("active"));
  el("#applyFilters").addEventListener("click", applyFilters);

  el("#harvestAll").addEventListener("click", harvestAll);
  el("#clearResults").addEventListener("click", ()=>{
    state.all = [];
    state.filtered = [];
    state.page = 1;
    document.getElementById("dataCardsContainer").innerHTML = `
      <div class="no-results">
        <i class="fas fa-search"></i>
        <h3>No data harvested yet</h3>
        <p>Use the harvest button to collect research data</p>
      </div>`;
    el("#resultsCount").textContent = "0 results";
    localStorage.removeItem("qDataHarvest");
    render();
  });

  // filters
  ["yearFilter","sourceFilter","typeFilter","sortFilter"].forEach(id => el(`#${id}`).addEventListener("change", applyFilters));
  el("#resetFilters").addEventListener("click", ()=>{
    ["yearFilter","sourceFilter","typeFilter"].forEach(id => el(`#${id}`).value = "");
    el("#sortFilter").value = "relevance";
    applyFilters();
  });

  el("#searchInResultsButton").addEventListener("click", ()=>{
    const q = el("#searchInResults").value.trim().toLowerCase();
    if (!q) { state.filtered = state.all.slice(); render(); return; }
    state.filtered = state.all.filter(it =>
      (it.title||"").toLowerCase().includes(q) ||
      (it.description||"").toLowerCase().includes(q) ||
      (Array.isArray(it.authors)? it.authors.join(" ").toLowerCase(): "").includes(q) ||
      (it.keywords||[]).join(" ").toLowerCase().includes(q)
    );
    state.page = 1; render();
  });

  // pagination
  el("#firstPage").addEventListener("click", ()=>{ state.page = 1; render(); });
  el("#prevPage").addEventListener("click", ()=>{ if (state.page>1) { state.page--; render(); }});
  el("#nextPage").addEventListener("click", ()=>{ if (state.page<state.totalPages) { state.page++; render(); }});
  el("#lastPage").addEventListener("click", ()=>{ state.page = state.totalPages; render(); });

  // card actions
  el("#dataCardsContainer").addEventListener("click", (e)=>{
    const btn = e.target.closest(".card-action"); if (!btn) return;
    const card = btn.closest(".data-card"); if (!card) return;
    const id = card.dataset.itemId;
    const it = state.all.find(x=>x.id===id);
    if (!it) return;

    const action = btn.dataset.action;
    if (action === "view") {
      if (it.url) window.open(it.url, "_blank");
      else alert("No URL available for this item");
    } else if (action === "download") {
      window.open(it.downloadUrl || it.url || "#", "_blank");
    } else if (action === "zotero") {
      const z = `https://www.zotero.org/select/items?uri=${encodeURIComponent(it.url || (it.identifier? `https://doi.org/${it.identifier}` : ""))}`;
      window.open(z, "_blank");
    }
  });

  yearOptionsInit();
  sourceOptionsInit();
  loadLocal();
});
