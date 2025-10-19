// ===========================================
// InquiryBase v5 — Global Figshare OAI Parser
// ===========================================

const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";
const OAI_URL = "https://api.figshare.com/v2/oai?verb=ListRecords&metadataPrefix=oai_dc";

let ALL_ITEMS = [];
let CATEGORIES = new Set();
let SEARCH_TEXT = "";

// --- Helpers ---
const norm = s => (s || "").trim();
const firstN = (s, n = 250) => s.length > n ? s.slice(0, n) + "…" : s;
const pick = (xml, tag) => Array.from(xml.getElementsByTagNameNS("*", tag)).map(n => norm(n.textContent));
const isDOI = s => /^10\./.test(s) || s.startsWith("https://doi.org/");
const byAlpha = (a,b) => a.localeCompare(b, undefined, { sensitivity: "base" });

// --- Fetch & Parse ---
async function fetchOAI() {
  const res = await fetch(PROXY + encodeURIComponent(OAI_URL));
  const text = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/xml");
  const records = Array.from(xml.getElementsByTagName("record"));
  const items = [];

  records.forEach(r => {
    const md = r.getElementsByTagName("metadata")[0];
    if (!md) return;
    const titles = pick(md, "title");
    const descs = pick(md, "description");
    const subs = pick(md, "subject");
    const ids = pick(md, "identifier");
    const dates = pick(md, "date");

    const title = titles[0] || "(Untitled)";
    const desc = descs[0] || "";
    const identifier = ids.find(i => isDOI(i) || i.startsWith("http")) || ids[0] || "";
    const date = dates[0] || "";

    subs.forEach(c => {
      if (c) CATEGORIES.add(c);
    });

    items.push({
      title,
      description: desc,
      identifier,
      date,
      categories: subs
    });
  });

  return items;
}

// --- Render ---
function buildCategoryFilter() {
  const sel = document.getElementById("categoryFilter");
  sel.innerHTML = "<option value=''>All</option>";
  Array.from(CATEGORIES).sort(byAlpha).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", render);
  document.getElementById("searchInput").addEventListener("input", e => {
    SEARCH_TEXT = e.target.value.toLowerCase();
    render();
  });
}

function render() {
  const mount = document.getElementById("results");
  mount.innerHTML = "";
  const catSel = document.getElementById("categoryFilter").value;
  const text = SEARCH_TEXT;

  const pool = ALL_ITEMS.filter(it => {
    const catOK = !catSel || it.categories.includes(catSel);
    const textOK = !text || (
      it.title.toLowerCase().includes(text) ||
      it.description.toLowerCase().includes(text) ||
      it.categories.join(" ").toLowerCase().includes(text)
    );
    return catOK && textOK;
  });

  if (!pool.length) {
    mount.innerHTML = `<div class="loading">No results found.</div>`;
    return;
  }

  pool.forEach(it => {
    const card = document.createElement("div");
    card.className = "card";
    const cats = it.categories.map(c => `<span class='badge'>${c}</span>`).join(" ");
    const link = it.identifier.startsWith("http")
      ? it.identifier
      : isDOI(it.identifier)
      ? `https://doi.org/${it.identifier}`
      : "";
    card.innerHTML = `
      <h3>${it.title}</h3>
      <p>${firstN(it.description)}</p>
      ${cats ? `<div class='badges'>${cats}</div>` : ""}
      ${link ? `<p><a href='${link}' target='_blank'>View Record ↗</a></p>` : ""}
    `;
    mount.appendChild(card);
  });
}

// --- Main Load ---
async function load() {
  const mount = document.getElementById("results");
  mount.innerHTML = `<div class="loading">Fetching from Figshare OAI feed...</div>`;
  try {
    ALL_ITEMS = await fetchOAI();
    buildCategoryFilter();
    render();
  } catch (e) {
    mount.innerHTML = `<div class="loading">Error fetching data: ${e.message}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", load);
