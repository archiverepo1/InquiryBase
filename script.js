// ============================================
// InquiryBase v8.2 — Dynamic Figshare + Zenodo + Spinner Fade
// ============================================

const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";
const API_ZENODO = "https://zenodo.org/api/records/?q=*&size=200";

const FIGSHARE_ENDPOINTS = [
  { name: "University of the Free State (UFS)", url: "https://ufs.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of Cape Town (UCT)", url: "https://uct.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "Stellenbosch University", url: "https://sun.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of Pretoria (UP)", url: "https://up.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of Johannesburg", url: "https://uj.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of KwaZulu-Natal (UKZN)", url: "https://ukzn.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "University of the Western Cape (UWC)", url: "https://uwc.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "South Africa" },
  { name: "Monash University", url: "https://monash.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "Australia" },
  { name: "Imperial College London", url: "https://imperialcollegelondon.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "UK" },
  { name: "University College London (UCL)", url: "https://ucl.figshare.com/oai?verb=ListRecords&metadataPrefix=oai_dc", country: "UK" }
];

const PAGE_SIZE = 100;
let ALL_ITEMS = [];
let INST_CACHE = new Map();
let INSTITUTIONS = [];
let SEARCH_TEXT = "";
let CURRENT_PAGE = 1;

// --- Spinner message helper ---
const setProgressText = (msg) => {
  document.getElementById("results").innerHTML = `
    <div class="loading" id="loadingSpinner">
      <div class="spinner"></div>
      <div>${msg}</div>
    </div>`;
};

// --- Helpers ---
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const xmlPick = (n, tag) => Array.from(n.getElementsByTagNameNS("*", tag)).map(t => t.textContent.trim());

// --- Fetch Figshare Institutions ---
async function fetchFigshareInstitution(inst) {
  try {
    const res = await fetch(PROXY + encodeURIComponent(inst.url));
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const recs = Array.from(xml.getElementsByTagNameNS("*", "record"));
    if (!recs.length) return [];

    const items = recs.map(r => {
      const md = r.getElementsByTagNameNS("*", "metadata")[0];
      if (!md) return null;
      const title = xmlPick(md, "title")[0] || "(Untitled)";
      const desc = xmlPick(md, "description")[0] || "";
      const cats = xmlPick(md, "subject");
      const ids = xmlPick(md, "identifier");
      const identifier = ids.find(i => i.startsWith("http")) || ids.find(i => /^10\./.test(i)) || "";
      const date = xmlPick(md, "date")[0] || "";
      return { title, description: desc, identifier, date, categories: cats, source: "Figshare", institution: inst.name, country: inst.country };
    }).filter(Boolean);

    console.log(`✅ ${inst.name}: ${items.length} records`);
    INST_CACHE.set(inst.name, items);
    return items;
  } catch (err) {
    console.warn(`⚠️ Failed ${inst.name}`, err);
    return [];
  }
}

// --- Fetch Zenodo ---
async function fetchZenodo() {
  let url = API_ZENODO;
  const items = [];
  let page = 0;

  while (url && page < 5) {
    page++;
    setProgressText(`🔹 Harvesting Zenodo page ${page}… (${items.length} records so far)`);
    const res = await fetch(PROXY + encodeURIComponent(url));
    const json = await res.json();

    (json.hits?.hits || []).forEach(r => {
      const md = r.metadata || {};
      const title = md.title || "(Untitled)";
      const desc = md.description || "";
      const doi = md.doi || "";
      const cats = [...(md.subjects?.map(s => s.term) || []), ...(md.keywords || [])];
      const date = md.publication_date || "";
      items.push({
        title, description: desc,
        identifier: doi ? `https://doi.org/${doi}` : (r.links?.html || ""),
        date, categories: cats,
        source: "Zenodo",
        institution: "—",
        country: "—"
      });
    });

    url = json.links?.next || null;
    await delay(200);
  }
  return items;
}

// --- Build Filters ---
function buildFilters() {
  const instSel = document.getElementById("institutionFilter");
  instSel.innerHTML = `<option value="">All</option>` + INSTITUTIONS.map(n => `<option value="${n}">${n}</option>`).join("");
  instSel.addEventListener("change", () => { CURRENT_PAGE = 1; render(); });

  const searchBox = document.getElementById("searchInput");
  searchBox.addEventListener("input", e => { SEARCH_TEXT = e.target.value.toLowerCase(); CURRENT_PAGE = 1; render(); });
}

// --- Filtering ---
function filteredItems() {
  const instSel = document.getElementById("institutionFilter")?.value || "";
  const text = SEARCH_TEXT;
  let pool = [...ALL_ITEMS];
  INST_CACHE.forEach((v, k) => { if (!instSel || instSel === k) pool.push(...v); });

  return pool.filter(it =>
    (!instSel || it.institution === instSel) &&
    (!text ||
      it.title.toLowerCase().includes(text) ||
      it.description.toLowerCase().includes(text) ||
      (it.categories || []).some(c => c.toLowerCase().includes(text)) ||
      (it.institution || "").toLowerCase().includes(text)
    )
  );
}

// --- Render Results ---
function render() {
  const mount = document.getElementById("results");
  mount.innerHTML = "";
  const items = filteredItems();

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  CURRENT_PAGE = Math.min(CURRENT_PAGE, totalPages);
  const start = (CURRENT_PAGE - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  if (!pageItems.length) {
    mount.innerHTML = `<div class="loading">No results found.</div>`;
    return;
  }

  pageItems.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    const link = it.identifier?.startsWith("http") ? it.identifier : (/^10\./.test(it.identifier) ? `https://doi.org/${it.identifier}` : "");
    card.innerHTML = `
      <div class="source-tag">${it.source}${it.institution ? ` • ${it.institution}` : ""}</div>
      <h3>${it.title}</h3>
      <p>${(it.description || "").slice(0, 220)}${(it.description || "").length > 220 ? "…" : ""}</p>
      ${link ? `<p><a href="${link}" target="_blank" rel="noopener">View Record ↗</a></p>` : ""}
    `;
    mount.appendChild(card);
  });

  updateOverview();
  fadeOutSpinner();
}

// --- Fade-out Spinner ---
function fadeOutSpinner() {
  const spinner = document.getElementById("loadingSpinner");
  if (spinner) spinner.classList.add("fade-out");
  setTimeout(() => spinner?.remove(), 700);
}

// --- Overview Panel ---
function updateOverview() {
  const total = [...ALL_ITEMS, ...Array.from(INST_CACHE.values()).flat()].length;
  const fig = Array.from(INST_CACHE.values()).flat().length;
  const zen = ALL_ITEMS.length;
  document.getElementById("countTotal").textContent = total;
  document.getElementById("countFigshare").textContent = fig;
  document.getElementById("countZenodo").textContent = zen;
}

// --- Hero Background Animation ---
function initHeroBg() {
  const canvas = document.getElementById("heroBg");
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
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#cde3ff";
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = "rgba(205,227,255,0.2)";
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < 100) {
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
    requestAnimationFrame(draw);
  }
  draw();
}

// --- Main ---
async function load() {
  initHeroBg();
  setProgressText("🚀 Loading InquiryBase: Harvesting Zenodo first…");
  const zenPromise = fetchZenodo().then(items => { ALL_ITEMS = items; render(); });

  for (const inst of FIGSHARE_ENDPOINTS) {
    fetchFigshareInstitution(inst).then(records => {
      if (records.length > 0) {
        INSTITUTIONS.push(inst.name);
        buildFilters();
        render();
      }
    });
  }

  await zenPromise;
}

document.addEventListener("DOMContentLoaded", load);
