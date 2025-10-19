// ==============================================
// InquiryBase v3.5 — SA University OAI Harvester
// Title + DOI/URL + Categories + Keywords
// ==============================================

// ✅ Your Cloudflare Worker proxy
const PROXY = "https://inquirybase.archiverepo1.workers.dev/?url=";

// ---------- OAI endpoints per institution ----------
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

// ---------- state ----------
let ALL_ITEMS = [];        // unified cards
let GROUPED = {};          // inst -> items[]
let INSTITUTIONS = new Set();
let SEARCH_TEXT = "";

// ---------- small helpers ----------
const byAlpha = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
const norm = s => (s || "").trim();
const containsSurvey = s => /\b(survey|questionnaire)s?\b/i.test(s || "");

// Heuristic: split subjects into "Categories" vs "Keywords"
// - categories often look like discipline names (Proper Case, multi-word), or match known discipline terms
const DISCIPLINE_HINTS = [
  "agronomy","agricultural","veterinary","food sciences","economics","medical virology",
  "biomedical engineering","biophysics","health","education","social sciences",
  "environment","biodiversity","informatics","epidemiology","psychology"
];

function splitSubjects(subjects) {
  const cats = [];
  const keys = [];
  subjects.forEach(s => {
    const x = s.trim();
    if (!x) return;
    const lower = x.toLowerCase();
    const isDiscipline =
      DISCIPLINE_HINTS.some(h => lower.includes(h)) ||
      (/[A-Z][a-z]+/.test(x) && x.split(" ").length >= 1 && x.length <= 80);
    // Keep short generic words as keywords
    if (isDiscipline) cats.push(x);
    else keys.push(x);
  });
  // De-duplicate while preserving order
  return {
    categories: Array.from(new Set(cats)),
    keywords: Array.from(new Set(keys))
  };
}

function firstDOIorURL(ids) {
  // Prefer DOI
  for (const id of ids) {
    if (/^10\.\d{4,9}\//.test(id) || id.startsWith("https://doi.org/")) {
      return id.startsWith("http") ? id : `https://doi.org/${id}`;
    }
  }
  // Else return first URL if present
  for (const id of ids) if (id.startsWith("http")) return id;
  // Else fallback to first id string
  return ids[0] || "";
}

function firstN(s, n = 220) {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

// ---------- OAI fetch + parse ----------
async function fetchOAIListRecords(baseUrl, resumptionToken = null) {
  const url = resumptionToken
    ? `${baseUrl}?verb=ListRecords&resumptionToken=${encodeURIComponent(resumptionToken)}`
    : `${baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`;
  const proxied = PROXY + encodeURIComponent(url);
  const r = await fetch(proxied);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const xmlText = await r.text();
  return xmlText;
}

function parseOAI(xmlText, instLabel) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");

  // Check errors
  const errorEl = xml.querySelector("OAI-PMH > error");
  if (errorEl) {
    console.warn(`[${instLabel}] OAI error:`, errorEl.textContent);
    return { items: [], next: null };
  }

  const recs = Array.from(xml.getElementsByTagName("record"));
  const items = [];

  recs.forEach(rec => {
    const md = rec.getElementsByTagName("metadata")[0];
    if (!md) return;

    // Dublin Core namespace elements
    const dc = md.getElementsByTagNameNS("*", "dc")[0] || md;
    const pick = tag => Array.from(md.getElementsByTagNameNS("*", tag)).map(n => norm(n.textContent));

    const titles = pick("title");
    const descs = pick("description");
    const subjects = pick("subject"); // includes both keywords + categories
    const idents = pick("identifier");
    const dates  = pick("date");
    const title = titles[0] || "(untitled)";
    const joinedText = `${title} ${descs.join(" ")} ${subjects.join(" ")}`;

    // Filter: only survey / questionnaire
    if (!containsSurvey(joinedText)) return;

    const { categories, keywords } = splitSubjects(subjects);
    const identifier = firstDOIorURL(idents);

    items.push({
      inst: instLabel,
      title,
      identifier,
      date: dates[0] || "",
      categories,
      keywords,
      description: firstN(descs[0] || "")
    });
  });

  // Pagination
  const tokenEl = xml.querySelector("resumptionToken");
  const next = tokenEl && tokenEl.textContent ? tokenEl.textContent.trim() : null;

  return { items, next };
}

async function harvestInstitution(source, maxBatches = 1) {
  // maxBatches=1 keeps it fast. Increase later to walk full feed.
  let token = null;
  let collected = [];
  for (let i = 0; i < maxBatches; i++) {
    const xml = await fetchOAIListRecords(source.url, token);
    const { items, next } = parseOAI(xml, source.inst);
    collected = collected.concat(items);
    if (!next) break;
    token = next;
  }
  return collected;
}

// ---------- render ----------
function groupByInstitution(items) {
  const map = {};
  items.forEach(it => {
    if (!map[it.inst]) map[it.inst] = [];
    map[it.inst].push(it);
  });
  return map;
}

function sectionTpl(inst, items) {
  const count = items.length;
  const id = `sec-${inst.replace(/\s+/g, "-").toLowerCase()}`;
  const wrap = document.createElement("section");
  wrap.className = "section";
  wrap.innerHTML = `
    <div class="section-head" data-toggle="${id}">
      <h2>${inst}</h2>
      <span class="count-pill">${count}</span>
    </div>
    <div id="${id}" class="grid" style="display: grid;"></div>
  `;

  const grid = wrap.querySelector(".grid");
  items.forEach(it => {
    const cats = it.categories.map(c => `<span class="badge">${c}</span>`).join("");
    const keys = it.keywords.map(k => `<span class="badge">${k}</span>`).join("");
    const dateStr = it.date ? ` • <span>${new Date(it.date).toISOString().slice(0,10)}</span>` : "";
    const aHref = it.identifier || "#";
    const aLabel = it.identifier ? (it.identifier.startsWith("http") ? it.identifier : `https://doi.org/${it.identifier}`) : "";

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <h3>${it.title}</h3>
      <p class="meta">${inst}${dateStr}</p>
      ${it.description ? `<p>${it.description}</p>` : ""}
      ${cats ? `<div class="badges">${cats}</div>` : ""}
      ${keys ? `<div class="badges">${keys}</div>` : ""}
      ${aLabel ? `<a class="link" href="${aHref}" target="_blank" rel="noopener">Link / DOI ↗</a>` : ""}
    `;
    grid.appendChild(card);
  });

  // collapse/expand
  wrap.querySelector(".section-head").addEventListener("click", () => {
    const panel = document.getElementById(id);
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "grid";
  });

  return wrap;
}

function render() {
  const mount = document.getElementById("results");
  mount.innerHTML = "";

  // filters
  const instSel = document.getElementById("institutionFilter").value;
  const text = (SEARCH_TEXT || "").toLowerCase();

  // filter pool
  const pool = ALL_ITEMS.filter(it => {
    const instOK = !instSel || it.inst === instSel;
    if (!instOK) return false;
    if (!text) return true;
    const hay = `${it.title} ${it.description} ${it.categories.join(" ")} ${it.keywords.join(" ")}`.toLowerCase();
    return hay.includes(text);
  });

  GROUPED = groupByInstitution(pool);

  const insts = Object.keys(GROUPED).sort(byAlpha);
  if (!insts.length) {
    mount.innerHTML = `<div class="section"><div class="section-head"><h2>No results</h2></div></div>`;
    return;
  }

  insts.forEach(inst => {
    const sec = sectionTpl(inst, GROUPED[inst]);
    mount.appendChild(sec);
  });
}

function buildInstitutionFilter() {
  const sel = document.getElementById("institutionFilter");
  sel.innerHTML = `<option value="">All</option>`;
  Array.from(INSTITUTIONS).sort(byAlpha).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", render);
}

function wireSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    SEARCH_TEXT = input.value || "";
    render();
  });
}

// ---------- load ----------
async function loadAll() {
  const mount = document.getElementById("results");
  mount.innerHTML = `<div class="section"><div class="section-head"><h2>Harvesting university OAI feeds…</h2></div></div>`;

  // Fetch sequentially (gentle on endpoints). Set batches=1 for speed.
  const items = [];
  for (const src of OAI_SOURCES) {
    try {
      const got = await harvestInstitution(src, 1);
      items.push(...got);
    } catch (e) {
      console.warn(`Failed ${src.inst}:`, e.message);
    }
  }

  ALL_ITEMS = items;
  ALL_ITEMS.forEach(i => INSTITUTIONS.add(i.inst));

  buildInstitutionFilter();
  wireSearch();
  render();
}

document.addEventListener("DOMContentLoaded", loadAll);
