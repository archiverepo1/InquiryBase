const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";
const OAI_FIGSHARE = "https://api.figshare.com/v2/oai?verb=ListRecords&metadataPrefix=oai_dc";
const API_ZENODO = "https://zenodo.org/api/records/?q=*&size=200";
const FIGSHARE_LISTSETS = "https://api.figshare.com/v2/oai?verb=ListSets";

let ALL_ITEMS = [];
let CATEGORIES = new Set();
let CATEGORY_MAP = {}; // "category_28930" -> "Medical virology"
let SEARCH_TEXT = "";

// ---------- Progress ----------
function logProgress(msg) {
  const box = document.getElementById("progressBox");
  if (box) box.textContent = msg;
}
function fadeOutProgress() {
  const box = document.getElementById("progressBox");
  if (!box) return;
  setTimeout(() => box.classList.add("fade-out"), 1200);
  setTimeout(() => (box.style.display = "none"), 1700);
}

// ---------- Figshare category map ----------
async function fetchFigshareSets() {
  try {
    logProgress("🔄 Loading Figshare categories…");
    const res = await fetch(PROXY + encodeURIComponent(FIGSHARE_LISTSETS));
    const text = await res.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    const sets = Array.from(xml.getElementsByTagName("set"));
    sets.forEach(s => {
      const spec = s.getElementsByTagName("setSpec")[0]?.textContent?.trim();
      const name = s.getElementsByTagName("setName")[0]?.textContent?.trim();
      if (spec && name && spec.startsWith("category_")) {
        CATEGORY_MAP[spec] = name;
      }
    });
    logProgress(`✅ Figshare categories loaded (${Object.keys(CATEGORY_MAP).length})`);
  } catch (e) {
    console.warn("ListSets failed:", e);
  }
}

// ---------- Fetch Figshare (pagination + categories) ----------
async function fetchFigshare() {
  await fetchFigshareSets();

  let url = OAI_FIGSHARE;
  const items = [];
  let page = 1;

  while (url) {
    logProgress(`🔄 Harvesting Figshare page ${page}…`);
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

      // Extract category_ setSpecs -> human names
      const setSpecs = Array.from(r.getElementsByTagName("setSpec"))
        .map(n => n.textContent.trim())
        .filter(s => s.startsWith("category_"))
        .map(s => CATEGORY_MAP[s] || s.replace("category_", ""));

      const cats = Array.from(new Set([...(subs || []), ...setSpecs]));
      cats.forEach(c => c && CATEGORIES.add(c));

      items.push({
        title,
        description: desc,
        identifier,
        date,
        categories: cats,
        source: "Figshare",
      });
    });

    if (nextToken) {
      url = `https://api.figshare.com/v2/oai?verb=ListRecords&resumptionToken=${nextToken}`;
      page++;
    } else {
      url = null;
    }
  }

  logProgress(`✅ Figshare complete — ${items.length} records`);
  return items;
}

// ---------- Fetch Zenodo (pagination) ----------
async function fetchZenodo() {
  let url = API_ZENODO;
  const items = [];
  let page = 1;

  while (url) {
    logProgress(`🔄 Harvesting Zenodo page ${page}…`);
    const res = await fetch(PROXY + encodeURIComponent(url));
    const json = await res.json();

    (json.hits?.hits || []).forEach(r => {
      const md = r.metadata || {};
      const title = md.title || "(Untitled)";
      const desc = md.description || "";
      const doi = md.doi || (r.doi ? r.doi : "");
      const date = md.publication_date || "";
      const keywords = md.keywords || [];
      const subjects = md.subjects ? md.subjects.map(s => s.term) : [];
      const categories = [...keywords, ...subjects];

      categories.forEach(c => c && CATEGORIES.add(c));
      items.push({
        title,
        description: desc,
        identifier: doi ? `https://doi.org/${doi}` : r.links.html,
        date,
        categories,
        source: "Zenodo",
      });
    });

    url = json.links?.next || null;
    if (url) page++;
  }

  logProgress(`✅ Zenodo complete — ${items.length} records`);
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

  const input = document.getElementById("searchInput");
  input.addEventListener("input", e => {
    SEARCH_TEXT = e.target.value.toLowerCase();
    render();
  });
  input.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      SEARCH_TEXT = input.value.toLowerCase();
      render();
    }
  });

  document.getElementById("categoryFilter").addEventListener("change", render);
  document.getElementById("sourceFilter").addEventListener("change", render);
}

// ---------- Render ----------
function render() {
  const mount = document.getElementById("results");
  mount.innerHTML = "";
  const catSel = document.getElementById("categoryFilter").value;
  const srcSel = document.getElementById("sourceFilter").value;
  const text = SEARCH_TEXT;

  const pool = ALL_ITEMS.filter(it => {
    const catOK = !catSel || it.categories.includes(catSel);
    const srcOK = !srcSel || it.source === srcSel;
    const textOK =
      !text ||
      it.title.toLowerCase().includes(text) ||
      it.description.toLowerCase().includes(text) ||
      it.categories.join(" ").toLowerCase().includes(text);
    return catOK && srcOK && textOK;
  });

  if (!pool.length) {
    mount.innerHTML = `<div class="loading">No results found.</div>`;
    updateOverview();
    return;
  }

  pool.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    const link =
      it.identifier.startsWith("http")
        ? it.identifier
        : /^10\./.test(it.identifier)
        ? `https://doi.org/${it.identifier}`
        : "";
    card.innerHTML = `
      <div class="source-tag">${it.source}</div>
      <h3>${it.title}</h3>
      <p>${it.description.slice(0, 250)}${it.description.length > 250 ? "…" : ""}</p>
      ${link ? `<p><a href='${link}' target='_blank'>View Record ↗</a></p>` : ""}
    `;
    mount.appendChild(card);
  });

  updateOverview();
}

// ---------- Overview ----------
function updateOverview() {
  const panel = document.getElementById("overview");
  if (!panel) return;

  const total = ALL_ITEMS.length;
  const fig = ALL_ITEMS.filter(i => i.source === "Figshare").length;
  const zen = ALL_ITEMS.filter(i => i.source === "Zenodo").length;

  document.getElementById("countTotal").textContent = total;
  document.getElementById("countFigshare").textContent = fig;
  document.getElementById("countZenodo").textContent = zen;

  // Top Categories
  const freq = {};
  ALL_ITEMS.forEach(i => {
    (i.categories || []).forEach(c => {
      if (!c) return;
      freq[c] = (freq[c] || 0) + 1;
    });
  });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const ul = document.getElementById("topCats");
  if (ul) ul.innerHTML = top.map(([c, n]) => `<li>${c} (${n})</li>`).join("");

  panel.classList.remove("hidden");
}

// ---------- Hero ----------
function initHeroBg() {
  const canvas = document.getElementById("heroBg");
  const ctx = canvas.getContext("2d");
  let width, height, points;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = 260;
    points = Array.from({ length: 60 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
    }));
  }
  resize();
  window.addEventListener("resize", resize);

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#cde3ff";
    points.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = "rgba(205,227,255,0.2)";
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(points[i].x, points[i].y);
          ctx.lineTo(points[j].x, points[j].y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ---------- Main ----------
async function load() {
  initHeroBg();
  try {
    logProgress("🚀 Starting data harvest…");
    const [fig, zen] = await Promise.all([fetchFigshare(), fetchZenodo()]);
    ALL_ITEMS = [...fig, ...zen];
    buildFilters();
    render();
    logProgress(`✅ Harvest complete — ${ALL_ITEMS.length} total records`);
    fadeOutProgress();
  } catch (e) {
    logProgress(`❌ Error: ${e.message}`);
  }

  document.getElementById("homeBtn").addEventListener("click", () => {
    document.getElementById("categoryFilter").value = "";
    document.getElementById("sourceFilter").value = "";
    document.getElementById("searchInput").value = "";
    SEARCH_TEXT = "";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

document.addEventListener("DOMContentLoaded", load);
