const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";
const OAI_FIGSHARE = "https://api.figshare.com/v2/oai?verb=ListRecords&metadataPrefix=oai_dc";
const API_ZENODO = "https://zenodo.org/api/records/?q=*&size=200";

const PAGE_SIZE = 100;
let ALL_ITEMS = [];
let CATEGORIES = new Set();
let SEARCH_TEXT = "";
let CURRENT_PAGE = 1;

// ---------- Fetch Figshare ----------
async function fetchFigshare() {
  let url = OAI_FIGSHARE;
  const items = [];
  let page = 0;

  while (url && page < 5) { // limit to 5 pages
    page++;
    const res = await fetch(PROXY + encodeURIComponent(url));
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const records = Array.from(xml.getElementsByTagName("record"));
    const token = xml.getElementsByTagName("resumptionToken")[0];
    const nextToken = token ? token.textContent.trim() : null;

    records.forEach(r => {
      const md = r.getElementsByTagName("metadata")[0];
      if (!md) return;
      const pick = tag => Array.from(md.getElementsByTagNameNS("*", tag)).map(n => n.textContent.trim());
      const title = pick("title")[0] || "(Untitled)";
      const desc = pick("description")[0] || "";
      const subs = pick("subject");
      const ids = pick("identifier");
      const identifier = ids.find(i => i.startsWith("http")) || ids.find(i => /^10\./.test(i)) || "";
      const date = pick("date")[0] || "";

      subs.forEach(c => c && CATEGORIES.add(c));
      items.push({ title, description: desc, identifier, date, categories: subs, source: "Figshare" });
    });

    if (nextToken) url = `https://api.figshare.com/v2/oai?verb=ListRecords&resumptionToken=${nextToken}`;
    else url = null;
  }

  return items;
}

// ---------- Fetch Zenodo ----------
async function fetchZenodo() {
  let url = API_ZENODO;
  const items = [];
  let page = 0;

  while (url && page < 5) { // 5 pages = ~1000 records
    page++;
    const res = await fetch(PROXY + encodeURIComponent(url));
    const json = await res.json();

    json.hits.hits.forEach(r => {
      const md = r.metadata || {};
      const title = md.title || "(Untitled)";
      const desc = md.description || "";
      const doi = md.doi || "";
      const categories = [...(md.keywords || []), ...(md.subjects ? md.subjects.map(s => s.term) : [])];
      const date = md.publication_date || "";
      categories.forEach(c => c && CATEGORIES.add(c));
      items.push({ title, description: desc, identifier: doi ? `https://doi.org/${doi}` : r.links.html, date, categories, source: "Zenodo" });
    });

    url = json.links?.next || null;
  }

  return items;
}

// ---------- Filters ----------
function buildFilters() {
  const catSel = document.getElementById("categoryFilter");
  catSel.innerHTML = "<option value=''>All</option>";
  Array.from(CATEGORIES).sort().forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    catSel.appendChild(opt);
  });

  document.getElementById("searchInput").addEventListener("input", e => {
    SEARCH_TEXT = e.target.value.toLowerCase();
    CURRENT_PAGE = 1;
    render();
  });
  document.getElementById("categoryFilter").addEventListener("change", () => { CURRENT_PAGE = 1; render(); });
  document.getElementById("sourceFilter").addEventListener("change", () => { CURRENT_PAGE = 1; render(); });
  document.getElementById("searchInput").addEventListener("keypress", e => { if (e.key === "Enter") render(); });
}

// ---------- Render ----------
function render() {
  const mount = document.getElementById("results");
  mount.innerHTML = "";
  const catSel = document.getElementById("categoryFilter").value;
  const srcSel = document.getElementById("sourceFilter").value;
  const text = SEARCH_TEXT;

  const filtered = ALL_ITEMS.filter(it => {
    const catOK = !catSel || it.categories.includes(catSel);
    const srcOK = !srcSel || it.source === srcSel;
    const textOK = !text ||
      it.title.toLowerCase().includes(text) ||
      it.description.toLowerCase().includes(text);
    return catOK && srcOK && textOK;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  CURRENT_PAGE = Math.min(CURRENT_PAGE, totalPages);
  const start = (CURRENT_PAGE - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = filtered.slice(start, end);

  if (!pageItems.length) {
    mount.innerHTML = `<div class="loading">No results found.</div>`;
    updatePagination(0, 0);
    return;
  }

  pageItems.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    const link = it.identifier.startsWith("http") ? it.identifier :
      /^10\./.test(it.identifier) ? `https://doi.org/${it.identifier}` : "";
    card.innerHTML = `
      <div class="source-tag">${it.source}</div>
      <h3>${it.title}</h3>
      <p>${it.description.slice(0, 220)}${it.description.length > 220 ? "…" : ""}</p>
      ${link ? `<p><a href="${link}" target="_blank">View Record ↗</a></p>` : ""}
    `;
    mount.appendChild(card);
  });

  updatePagination(CURRENT_PAGE, totalPages);
  updateOverview();
}

function updatePagination(page, total) {
  const pagination = document.getElementById("pagination");
  const info = document.getElementById("pageInfo");
  if (total <= 1) { pagination.classList.add("hidden"); return; }
  pagination.classList.remove("hidden");
  info.textContent = `Page ${page} of ${total}`;
  document.getElementById("prevPage").disabled = page <= 1;
  document.getElementById("nextPage").disabled = page >= total;
}

// ---------- Overview ----------
function updateOverview() {
  const panel = document.getElementById("overview");
  const total = ALL_ITEMS.length;
  const fig = ALL_ITEMS.filter(i => i.source === "Figshare").length;
  const zen = ALL_ITEMS.filter(i => i.source === "Zenodo").length;
  document.getElementById("countTotal").textContent = total;
  document.getElementById("countFigshare").textContent = fig;
  document.getElementById("countZenodo").textContent = zen;

  const freq = {};
  ALL_ITEMS.forEach(i => i.categories.forEach(c => { if (c) freq[c] = (freq[c] || 0) + 1; }));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
  document.getElementById("topCats").innerHTML = top.map(([c, n]) => `<li>${c} (${n})</li>`).join("");
  panel.classList.remove("hidden");
}

// ---------- Hero Animation ----------
function initHeroBg() {
  const canvas = document.getElementById("heroBg");
  const ctx = canvas.getContext("2d");
  let w, h, pts;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = 260;
    pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6
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
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
    requestAnimationFrame(draw);
  }
  draw();
}

// ---------- Main ----------
async function load() {
  initHeroBg();
  const mount = document.getElementById("results");
  mount.innerHTML = `<div class="loading">Harvesting open data...</div>`;
  try {
    const [fig, zen] = await Promise.all([fetchFigshare(), fetchZenodo()]);
    ALL_ITEMS = [...fig, ...zen];
    buildFilters();
    render();
  } catch (e) {
    mount.innerHTML = `<div class="loading">Error fetching data: ${e.message}</div>`;
  }

  document.getElementById("homeBtn").addEventListener("click", () => {
    document.getElementById("categoryFilter").value = "";
    document.getElementById("sourceFilter").value = "";
    document.getElementById("searchInput").value = "";
    SEARCH_TEXT = "";
    CURRENT_PAGE = 1;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.getElementById("prevPage").addEventListener("click", () => {
    if (CURRENT_PAGE > 1) { CURRENT_PAGE--; render(); }
  });
  document.getElementById("nextPage").addEventListener("click", () => {
    CURRENT_PAGE++; render();
  });
}

document.addEventListener("DOMContentLoaded", load);
