// ============================================
// InquiryBase v6 — Figshare + Zenodo Aggregator
// ============================================

const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";
const OAI_FIGSHARE = "https://api.figshare.com/v2/oai?verb=ListRecords&metadataPrefix=oai_dc";
const API_ZENODO = "https://zenodo.org/api/records/?q=*&size=200";

let ALL_ITEMS = [];
let CATEGORIES = new Set();
let SEARCH_TEXT = "";

// ---------- Fetch Figshare ----------
async function fetchFigshare() {
  const res = await fetch(PROXY + encodeURIComponent(OAI_FIGSHARE));
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const records = Array.from(xml.getElementsByTagName("record"));
  const items = [];

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

  return items;
}

// ---------- Fetch Zenodo ----------
async function fetchZenodo() {
  const res = await fetch(PROXY + encodeURIComponent(API_ZENODO));
  const json = await res.json();
  const items = [];

  json.hits.hits.forEach(r => {
    const md = r.metadata || {};
    const title = md.title || "(Untitled)";
    const desc = md.description || "";
    const doi = md.doi || (r.doi ? r.doi : "");
    const keywords = md.keywords || [];
    const subjects = md.subjects ? md.subjects.map(s => s.term) : [];
    const categories = [...keywords, ...subjects];
    const date = md.publication_date || "";

    categories.forEach(c => c && CATEGORIES.add(c));
    items.push({ title, description: desc, identifier: doi ? `https://doi.org/${doi}` : r.links.html, date, categories, source: "Zenodo" });
  });

  return items;
}

// ---------- Rendering ----------
function buildFilters() {
  const catSel = document.getElementById("categoryFilter");
  catSel.innerHTML = "<option value=''>All</option>";
  Array.from(CATEGORIES).sort().forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    catSel.appendChild(opt);
  });

  document.getElementById("searchInput").addEventListener("input", e => {
    SEARCH_TEXT = e.target.value.toLowerCase();
    render();
  });
  document.getElementById("categoryFilter").addEventListener("change", render);
  document.getElementById("sourceFilter").addEventListener("change", render);
}

function render() {
  const mount = document.getElementById("results");
  mount.innerHTML = "";
  const catSel = document.getElementById("categoryFilter").value;
  const srcSel = document.getElementById("sourceFilter").value;
  const text = SEARCH_TEXT;

  const pool = ALL_ITEMS.filter(it => {
    const catOK = !catSel || it.categories.includes(catSel);
    const srcOK = !srcSel || it.source === srcSel;
    const textOK = !text || (
      it.title.toLowerCase().includes(text) ||
      it.description.toLowerCase().includes(text) ||
      it.categories.join(" ").toLowerCase().includes(text)
    );
    return catOK && srcOK && textOK;
  });

  if (!pool.length) {
    mount.innerHTML = `<div class="loading">No results found.</div>`;
    return;
  }

  pool.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    const cats = it.categories.map(c => `<span class='badge' data-key='${c}'>${c}</span>`).join(" ");
    const link = it.identifier.startsWith("http") ? it.identifier :
                 /^10\./.test(it.identifier) ? `https://doi.org/${it.identifier}` : "";
    card.innerHTML = `
      <div class="source-tag">${it.source}</div>
      <h3>${it.title}</h3>
      <p>${it.description.slice(0, 250)}${it.description.length > 250 ? "…" : ""}</p>
      ${cats ? `<div class='badges'>${cats}</div>` : ""}
      ${link ? `<p><a href='${link}' target='_blank'>View Record ↗</a></p>` : ""}
    `;
    mount.appendChild(card);
  });

  // Make badges clickable
  document.querySelectorAll(".badge").forEach(b => {
    b.addEventListener("click", () => {
      document.getElementById("categoryFilter").value = b.dataset.key;
      render();
    });
  });
}

// ---------- Hero Animation ----------
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
      vy: (Math.random() - 0.5) * 0.6
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
    for (let i=0; i<points.length; i++) {
      for (let j=i+1; j<points.length; j++) {
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
  const mount = document.getElementById("results");
  mount.innerHTML = `<div class="loading">Fetching Figshare + Zenodo datasets...</div>`;
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
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

document.addEventListener("DOMContentLoaded", load);
