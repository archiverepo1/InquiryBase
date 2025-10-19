// ==============================================
// InquiryBase v4 — South African Open Research Atlas
// ==============================================

const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";

const OAI_SOURCES = [
  { inst: "UCT (ZivaHub)", url: "https://zivahub.uct.ac.za/oai" },
  { inst: "University of Pretoria (UP)", url: "https://researchdata.up.ac.za/oai" },
  { inst: "University of KwaZulu-Natal (UKZN)", url: "https://ukzn.figshare.com/oai" },
  { inst: "Stellenbosch University (SUN)", url: "https://sun.figshare.com/oai" },
  { inst: "North-West University (NWU, Dayta)", url: "https://dayta.nwu.ac.za/oai" },
  { inst: "Rhodes University (RU)", url: "https://researchdata.ru.ac.za/oai" },
  { inst: "University of Fort Hare (UFH)", url: "https://ufh.figshare.com/oai" },
  { inst: "University of the Free State (UFS)", url: "https://ufs.figshare.com/oai" },
];

let ALL_ITEMS = [];
let INSTITUTIONS = new Set();
let CATEGORIES = new Set();
let SEARCH_TEXT = "";

// helpers
const norm = s => (s || "").trim();
const byAlpha = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
const firstN = (s, n = 250) => s && s.length > n ? s.slice(0, n) + "…" : s;
const isDOI = s => /^10\.\d{4,9}\//.test(s) || s.startsWith("https://doi.org/");
const pick = (xml, tag) => Array.from(xml.getElementsByTagNameNS("*", tag)).map(n => norm(n.textContent));

// ---------- Fetch + parse ----------
async function fetchOAI(baseUrl, token = null) {
  const url = token
    ? `${baseUrl}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`
    : `${baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`;
  const proxied = PROXY + encodeURIComponent(url);
  const r = await fetch(proxied);
  return await r.text();
}

function parseOAI(xmlText, instLabel) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");
  const recs = Array.from(xml.getElementsByTagName("record"));
  const items = [];

  recs.forEach(rec => {
    const md = rec.getElementsByTagName("metadata")[0];
    if (!md) return;
    const titles = pick(md, "title");
    const descs = pick(md, "description");
    const subs = pick(md, "subject");
    const ids = pick(md, "identifier");
    const dates = pick(md, "date");

    const title = titles[0] || "(untitled)";
    const desc = descs[0] || "";
    const identifier = ids.find(i => isDOI(i) || i.startsWith("http")) || ids[0] || "";
    const date = dates[0] || "";
    const cats = [];
    const keys = [];

    subs.forEach(s => {
      if (!s) return;
      // Basic heuristic: treat longer or Proper-case entries as categories
      if (/[A-Z][a-z]/.test(s) && s.split(" ").length <= 6) cats.push(s);
      else keys.push(s);
    });

    cats.forEach(c => CATEGORIES.add(c));
    items.push({ inst: instLabel, title, description: desc, identifier, date, categories: cats, keywords: keys });
  });

  return items;
}

async function harvestInstitution(source, maxBatch = 1) {
  let token = null, all = [];
  for (let i = 0; i < maxBatch; i++) {
    const xml = await fetchOAI(source.url, token);
    const parsed = parseOAI(xml, source.inst);
    all.push(...parsed);
    const next = xml.match(/<resumptionToken>([^<]+)<\/resumptionToken>/);
    if (!next) break;
    token = next[1];
  }
  return all;
}

// ---------- Rendering ----------
function buildFilters() {
  const instSel = document.getElementById("institutionFilter");
  const catSel = document.getElementById("categoryFilter");
  instSel.innerHTML = `<option value="">All</option>`;
  catSel.innerHTML = `<option value="">All</option>`;

  Array.from(INSTITUTIONS).sort(byAlpha).forEach(i => {
    const o = document.createElement("option");
    o.value = i; o.textContent = i;
    instSel.appendChild(o);
  });
  Array.from(CATEGORIES).sort(byAlpha).forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });

  instSel.addEventListener("change", render);
  catSel.addEventListener("change", render);
  document.getElementById("searchInput").addEventListener("input", e => {
    SEARCH_TEXT = e.target.value.toLowerCase();
    render();
  });
}

function sectionTpl(inst, items) {
  const wrap = document.createElement("section");
  wrap.className = "section";
  wrap.innerHTML = `
    <div class="section-head"><h2>${inst}</h2><span class="count-pill">${items.length}</span></div>
    <div class="grid"></div>`;
  const grid = wrap.querySelector(".grid");

  items.forEach(it => {
    const cats = it.categories.map(c => `<span class="badge">${c}</span>`).join("");
    const keys = it.keywords.map(k => `<span class="badge">${k}</span>`).join("");
    const link = it.identifier && it.identifier.startsWith("http") ? it.identifier
      : it.identifier && isDOI(it.identifier) ? `https://doi.org/${it.identifier}` : "";
    const linkHtml = link ? `<a class="link" href="${link}" target="_blank" rel="noopener">Link / DOI ↗</a>` : "";
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <h3>${it.title}</h3>
      <p class="meta">${it.inst}${it.date ? " • " + new Date(it.date).toISOString().slice(0,10) : ""}</p>
      ${it.description ? `<p>${firstN(it.description)}</p>` : ""}
      ${cats ? `<div class="badges">${cats}</div>` : ""}
      ${keys ? `<div class="badges">${keys}</div>` : ""}
      ${linkHtml}`;
    grid.appendChild(card);
  });

  return wrap;
}

function render() {
  const instSel = document.getElementById("institutionFilter").value;
  const catSel = document.getElementById("categoryFilter").value;
  const text = SEARCH_TEXT;
  const mount = document.getElementById("results");
  mount.innerHTML = "";

  const pool = ALL_ITEMS.filter(it => {
    const instOK = !instSel || it.inst === instSel;
    const catOK = !catSel || it.categories.includes(catSel);
    const textOK = !text || (
      it.title.toLowerCase().includes(text) ||
      it.description.toLowerCase().includes(text) ||
      it.keywords.join(" ").toLowerCase().includes(text) ||
      it.categories.join(" ").toLowerCase().includes(text)
    );
    return instOK && catOK && textOK;
  });

  if (!pool.length) {
    mount.innerHTML = `<div class="section"><div class="section-head"><h2>No results</h2></div></div>`;
    return;
  }

  const grouped = {};
  pool.forEach(it => {
    if (!grouped[it.inst]) grouped[it.inst] = [];
    grouped[it.inst].push(it);
  });

  Object.keys(grouped).sort(byAlpha).forEach(inst => {
    mount.appendChild(sectionTpl(inst, grouped[inst]));
  });
}

// ---------- Load ----------
async function loadAll() {
  const mount = document.getElementById("results");
  mount.innerHTML = `<div class="section"><div class="section-head"><h2>Harvesting feeds...</h2></div></div>`;
  const items = [];

  for (const src of OAI_SOURCES) {
    try {
      const got = await harvestInstitution(src, 1);
      got.forEach(i => INSTITUTIONS.add(i.inst));
      items.push(...got);
    } catch (e) {
      console.warn(`Failed ${src.inst}: ${e.message}`);
    }
  }

  ALL_ITEMS = items;
  buildFilters();
  render();
}

document.addEventListener("DOMContentLoaded", loadAll);
