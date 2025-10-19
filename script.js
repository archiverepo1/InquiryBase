const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";
const API_ZENODO = "https://zenodo.org/api/records/?q=*&size=200";
const PAGE_SIZE_DEFAULT = 100;

// --- South African & selected global Figshare endpoints ---
const FIGSHARE_ENDPOINTS = [
  { name: "University of the Free State (UFS)", url: "https://ufs.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of Cape Town (UCT)", url: "https://uct.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of Pretoria (UP)", url: "https://up.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "Stellenbosch University (SUN)", url: "https://sun.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of Johannesburg (UJ)", url: "https://uj.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of KwaZulu-Natal (UKZN)", url: "https://ukzn.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "North-West University (NWU)", url: "https://nwu.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of the Western Cape (UWC)", url: "https://uwc.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "Rhodes University (RU)", url: "https://ru.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  // Optional: Add a few global for reference
  { name: "Monash University", url: "https://monash.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "Australia" },
  { name: "University College London (UCL)", url: "https://ucl.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "UK" }
];

// ------- Global state -------
let ALL_ITEMS = [];         // merged data (Zenodo + Figshare)
let INST_CACHE = new Map(); // institution cache
let CATEGORIES = new Set(); // global categories
let SEARCH_TEXT = "";
let CURRENT_PAGE = 1;
let PAGE_SIZE = PAGE_SIZE_DEFAULT;

// --- Utility helpers ---
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function xmlPick(node, tag) {
  return Array.from(node.getElementsByTagNameNS("*", tag)).map(n => n.textContent.trim());
}

// --- Progress bar ---
function createProgressBar() {
  if (document.getElementById("progressBar")) return document.getElementById("progressBar");
  const bar = document.createElement("div");
  bar.id = "progressBar";
  Object.assign(bar.style, {
    position: "fixed", top: "0", left: "0",
    height: "3px", background: "#007bff", width: "0%",
    zIndex: "9999", transition: "width 0.25s ease"
  });
  document.body.appendChild(bar);
  return bar;
}
const progressBar = createProgressBar();
const updateBar = (pct) => { progressBar.style.width = `${pct}%`; };
const setProgressText = (msg) => {
  document.getElementById("results").innerHTML = `<div class="loading">${msg}</div>`;
};

// --- Fetch Zenodo first (global data) ---
async function fetchZenodo(maxPages = 5) {
  let url = API_ZENODO;
  const items = [];
  let page = 0;

  while (url && page < maxPages) {
    page++;
    setProgressText(`🔹 Harvesting Zenodo page ${page}… (${items.length} records so far)`);
    updateBar((page / maxPages) * 100);

    const res = await fetch(PROXY + encodeURIComponent(url));
    const json = await res.json();

    (json.hits?.hits || []).forEach(r => {
      const md = r.metadata || {};
      const title = md.title || "(Untitled)";
      const desc = md.description || "";
      const doi = md.doi || "";
      const cats = [...(md.subjects ? md.subjects.map(s => s.term) : [])];
      const date = md.publication_date || "";
      cats.forEach(c => c && CATEGORIES.add(c));

      items.push({
        title,
        description: desc,
        identifier: doi ? `https://doi.org/${doi}` : (r.links?.html || ""),
        date,
        categories: cats,
        institution: "—",
        country: "—",
        source: "Zenodo"
      });
    });

    url = json.links?.next || null;
    await delay(200);
  }

  return items;
}

// --- Fetch selected Figshare institution (only dc:subject) ---
async function fetchFigshare(inst) {
  const url = inst.url;
  const res = await fetch(PROXY + encodeURIComponent(url));
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");

  const recs = Array.from(xml.getElementsByTagNameNS("*", "record"));
  const items = [];

  recs.forEach(r => {
    const md = r.getElementsByTagNameNS("*", "metadata")[0];
    if (!md) return;
    const title = xmlPick(md, "title")[0] || "(Untitled)";
    const desc = xmlPick(md, "description")[0] || "";
    const cats = xmlPick(md, "subject"); // only categories
    const ids = xmlPick(md, "identifier");
    const link = ids.find(i => i.startsWith("http")) || ids.find(i => /^10\./.test(i)) || "";
    const date = xmlPick(md, "date")[0] || "";

    cats.forEach(c => c && CATEGORIES.add(c));
    items.push({
      title,
      description: desc,
      identifier: link,
      date,
      categories: cats,
      institution: inst.name,
      country: inst.country,
      source: "Figshare"
    });
  });

  console.log(`✅ ${inst.name}: ${items.length} records`);
  return items;
}

// --- Build Filters ---
function buildFilters() {
  const instSel = document.getElementById("institutionFilter");
  instSel.innerHTML = "<option value=''>All</option>";
  FIGSHARE_ENDPOINTS.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.name;
    opt.textContent = f.name;
    instSel.appendChild(opt);
  });

  // page size
  const pageSel = document.getElementById("pageSizeSelect");
  if (pageSel) {
    pageSel.innerHTML = `<option value="50">50</option><option value="100" selected>100</option>`;
    pageSel.addEventListener("change", () => {
      PAGE_SIZE = parseInt(pageSel.value, 10) || PAGE_SIZE_DEFAULT;
      CURRENT_PAGE = 1; render();
    });
  }

  // search
  const searchBox = document.getElementById("searchInput");
  if (searchBox) {
    searchBox.addEventListener("input", e => {
      SEARCH_TEXT = e.target.value.toLowerCase();
      CURRENT_PAGE = 1; render();
    });
  }

  // institution selection (lazy fetch)
  instSel.addEventListener("change", async e => {
    const pick = e.target.value;
    if (!pick) return render();

    const inst = FIGSHARE_ENDPOINTS.find(x => x.name === pick);
    if (!inst) return;

    if (!INST_CACHE.has(pick)) {
      setProgressText(`🎯 Loading ${pick} datasets…`);
      updateBar(0);
      const data = await fetchFigshare(inst);
      INST_CACHE.set(pick, data);
      ALL_ITEMS.push(...data);
      updateBar(100);
      setTimeout(() => (progressBar.style.opacity = "0"), 800);
    }

    render();
  });

  // category dropdown updates dynamically
  const catSel = document.getElementById("categoryFilter");
  if (catSel) {
    catSel.innerHTML = "<option value=''>All</option>";
    Array.from(CATEGORIES).sort().forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      catSel.appendChild(opt);
    });
    catSel.addEventListener("change", () => { CURRENT_PAGE = 1; render(); });
  }

  const srcSel = document.getElementById("sourceFilter");
  if (srcSel) srcSel.addEventListener("change", () => { CURRENT_PAGE = 1; render(); });
}

// --- Filter & render ---
function filteredItems() {
  const catSel = document.getElementById("categoryFilter")?.value || "";
  const srcSel = document.getElementById("sourceFilter")?.value || "";
  const instSel = document.getElementById("institutionFilter")?.value || "";

  return ALL_ITEMS.filter(it => {
    const catOK = !catSel || it.categories?.includes(catSel);
    const srcOK = !srcSel || it.source === srcSel;
    const instOK = !instSel || it.institution === instSel;
    const textOK = !SEARCH_TEXT ||
      (it.title || "").toLowerCase().includes(SEARCH_TEXT) ||
      (it.description || "").toLowerCase().includes(SEARCH_TEXT);
    return catOK && srcOK && instOK && textOK;
  });
}

function render() {
  const mount = document.getElementById("results");
  mount.innerHTML = "";
  const pool = filteredItems();

  const totalPages = Math.ceil(pool.length / PAGE_SIZE) || 1;
  CURRENT_PAGE = Math.min(CURRENT_PAGE, totalPages);
  const start = (CURRENT_PAGE - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = pool.slice(start, end);

  if (!pageItems.length) {
    mount.innerHTML = `<div class="loading">No results found. Select an institution to load datasets.</div>`;
    updatePagination(0, 0);
    return;
  }

  pageItems.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    const link = it.identifier?.startsWith("http")
      ? it.identifier
      : (/^10\./.test(it.identifier || "") ? `https://doi.org/${it.identifier}` : "");
    card.innerHTML = `
      <div class="source-tag">${it.source}${it.institution ? ` • ${it.institution}` : ""}</div>
      <h3>${it.title}</h3>
      <p>${(it.description || "").slice(0, 220)}${(it.description || "").length > 220 ? "…" : ""}</p>
      ${link ? `<p><a href="${link}" target="_blank" rel="noopener">View Record ↗</a></p>` : ""}
    `;
    mount.appendChild(card);
  });

  updatePagination(CURRENT_PAGE, totalPages);
}

// --- Pagination ---
function updatePagination(page, total) {
  const pagination = document.getElementById("pagination");
  const info = document.getElementById("pageInfo");
  if (!pagination || !info) return;
  if (total <= 1) { pagination.classList.add("hidden"); return; }
  pagination.classList.remove("hidden");
  info.textContent = `Page ${page} of ${total}`;
  document.getElementById("prevPage").disabled = page <= 1;
  document.getElementById("nextPage").disabled = page >= total;
}

// --- Hero background animation ---
function initHeroBg() {
  const canvas = document.getElementById("heroBg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, pts;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = 260;
    pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6
    }));
  }
  resize();
  window.addEventListener("resize", resize);

  function draw() {
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "#cde3ff";
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
    });
    ctx.strokeStyle = "rgba(205,227,255,0.2)";
    for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
      const dx = pts[i].x-pts[j].x, dy = pts[i].y-pts[j].y;
      if (Math.sqrt(dx*dx+dy*dy) < 100) { ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke(); }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// --- Initialize ---
async function load() {
  initHeroBg();
  setProgressText("🚀 Loading Zenodo data…");
  try {
    const zenItems = await fetchZenodo(5);
    ALL_ITEMS = [...zenItems];
    buildFilters();
    render();
    updateBar(100);
    setTimeout(() => (progressBar.style.opacity = "0"), 1200);
  } catch (err) {
    document.getElementById("results").innerHTML = `<div class="loading">Error: ${err.message}</div>`;
  }

  // Pagination buttons
  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (CURRENT_PAGE > 1) { CURRENT_PAGE--; render(); }
  });
  document.getElementById("nextPage")?.addEventListener("click", () => {
    CURRENT_PAGE++; render();
  });
}

document.addEventListener("DOMContentLoaded", load);
