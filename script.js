// ---------- CONFIG: sources ----------
const SOURCES = [
  // Zenodo
  {
    key: "Zenodo",
    type: "zenodo",
    url: () => `https://zenodo.org/api/records/?q=(survey OR questionnaire) AND South Africa&size=40`,
  },

  // Figshare (Institutions)
  { key: "UCT (ZivaHub)",      type: "figshare", url: () => `https://zivahub.uct.ac.za/api/articles?search_for=survey+questionnaire&page_size=40` },
  { key: "UP",                  type: "figshare", url: () => `https://researchdata.up.ac.za/api/articles?search_for=survey+questionnaire&page_size=40` },
  { key: "UKZN",                type: "figshare", url: () => `https://ukzn.figshare.com/api/articles?search_for=survey+questionnaire&page_size=40` },
  { key: "Stellenbosch (SUN)", type: "figshare", url: () => `https://sun.figshare.com/api/articles?search_for=survey+questionnaire&page_size=40` },
  { key: "NWU (Dayta)",         type: "figshare", url: () => `https://dayta.nwu.ac.za/api/articles?search_for=survey+questionnaire&page_size=40` },
  { key: "Rhodes (RU)",         type: "figshare", url: () => `https://researchdata.ru.ac.za/api/articles?search_for=survey+questionnaire&page_size=40` },
  { key: "UFH",                 type: "figshare", url: () => `https://ufh.figshare.com/api/articles?search_for=survey+questionnaire&page_size=40` },
  { key: "UFS",                 type: "figshare", url: () => `https://ufs.figshare.com/api/articles?search_for=survey+questionnaire&page_size=40` },
];

// ---------- state ----------
let ALL_ITEMS = [];        // unified items
let SUBJECT_MAP = {};      // subject -> items[]
let INSTITUTIONS = new Set();

// ---------- helpers ----------
const byAlpha = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

function firstN(s, n=180){
  if(!s) return "No description available.";
  const clean = s.replace(/<[^>]*>/g,'').trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

// Extract subjects/keywords across platforms
function extractSubjects(record) {
  const subj = new Set();

  // Figshare
  if (record.__source === "figshare") {
    if (Array.isArray(record.categories)) {
      record.categories.forEach(c => c?.title && subj.add(c.title.trim()));
    }
    if (Array.isArray(record.tags)) {
      record.tags.slice(0, 6).forEach(t => typeof t === "string" && subj.add(cap(t.trim())));
    }
  }

  // Zenodo
  if (record.__source === "zenodo") {
    const m = record.metadata || {};
    if (Array.isArray(m.subjects)) {
      m.subjects.forEach(s => (s?.term || s?.title) && subj.add((s.term || s.title).trim()));
    }
    if (Array.isArray(m.keywords)) {
      m.keywords.slice(0, 6).forEach(k => typeof k === "string" && subj.add(cap(k.trim())));
    }
    // fallback: communities
    if (Array.isArray(record.communities)) {
      record.communities.forEach(c => c?.id && subj.add(cap(c.id.replace(/-/g,' '))));
    }
  }

  // If still nothing, very light classifier from title
  if (subj.size === 0) {
    const text = ((record.title || "") + " " + (record.description || "")).toLowerCase();
    if (/\b(health|clinic|covid|hiv|epidemiology|patient)\b/.test(text)) subj.add("Health");
    else if (/\b(education|school|student|learning|teacher)\b/.test(text)) subj.add("Education");
    else if (/\b(social|community|society|behaviour|behavior)\b/.test(text)) subj.add("Social Sciences");
    else if (/\b(environment|climate|water|biodiversity)\b/.test(text)) subj.add("Environment");
    else subj.add("Uncategorized");
  }

  return Array.from(subj).slice(0, 6);
}

function normalizeFigshareItem(raw, sourceKey){
  return {
    __source: "figshare",
    __institution: sourceKey,
    id: raw.id,
    title: raw.title,
    description: raw.description || "",
    url: raw.url,
    published: raw.published_date || raw.modified_date || "",
    categories: raw.categories || [],
    tags: raw.tags || [],
    raw,
  };
}

function normalizeZenodoItem(raw){
  const m = raw.metadata || {};
  const link = raw.links?.html || raw.links?.latest_html || `https://zenodo.org/records/${raw.id}`;
  return {
    __source: "zenodo",
    __institution: "Zenodo",
    id: raw.id,
    title: m.title || raw.title,
    description: m.description || "",
    url: link,
    published: m.publication_date || raw.created || "",
    metadata: m,
    raw,
  };
}

async function fetchSource(source){
  const url = source.url();
  try{
    const r = await fetch(url);
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const data = await r.json();

    if(source.type === "figshare"){
      return (Array.isArray(data) ? data : []).map(d => normalizeFigshareItem(d, source.key));
    }
    if(source.type === "zenodo"){
      const hits = Array.isArray(data?.hits?.hits) ? data.hits.hits : (Array.isArray(data?.hits) ? data.hits : (Array.isArray(data?.records) ? data.records : []));
      // Zenodo API returns { hits: { hits: [...] } } OR { hits: [...] } depending on endpoint
      const list = Array.isArray(hits) ? hits.map(h => h?.metadata ? h : h) : (Array.isArray(data?.hits?.records) ? data.hits.records : []);
      // Normalize different shapes
      const records = (data.records || (data.hits?.hits?.map(h=>h) ?? []) || list);
      const flat = (records.length ? records : (data.hits?.hits || [])).map(z => normalizeZenodoItem(z));
      return flat;
    }
    return [];
  }catch(e){
    console.warn(`Failed ${source.key}:`, e.message);
    return [];
  }
}

function buildInstitutionFilter(){
  const sel = document.getElementById("institutionFilter");
  // clear
  sel.innerHTML = `<option value="">All</option>`;
  Array.from(INSTITUTIONS).sort(byAlpha).forEach(name=>{
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", render);
}

function regroup(){
  SUBJECT_MAP = {};
  const instFilter = document.getElementById("institutionFilter").value;
  const pool = instFilter ? ALL_ITEMS.filter(i => i.__institution === instFilter) : ALL_ITEMS;

  pool.forEach(item=>{
    const subjects = extractSubjects(item);
    subjects.forEach(s=>{
      if(!SUBJECT_MAP[s]) SUBJECT_MAP[s] = [];
      SUBJECT_MAP[s].push(item);
    });
  });
}

function sectionTpl(subject, items){
  const count = items.length;
  const id = `sec-${subject.replace(/\s+/g,'-').toLowerCase()}`;
  const wrap = document.createElement("section");
  wrap.className = "section";
  wrap.innerHTML = `
    <div class="section-head" data-toggle="${id}">
      <h2>${subject}</h2>
      <span class="count-pill">${count}</span>
    </div>
    <div id="${id}" class="grid" style="display: grid;"></div>
  `;

  const grid = wrap.querySelector(".grid");
  items.forEach(it=>{
    const tags = extractSubjects(it).slice(0,3).map(t=>`<span class="badge">${t}</span>`).join(" ");
    const meta = `
      <span>${it.__institution}</span>
      ${it.published ? ` • <span>${new Date(it.published).toISOString().slice(0,10)}</span>` : ""}
    `;
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <h3>${it.title}</h3>
      <p class="meta">${meta}</p>
      <p>${firstN(it.description)}</p>
      <div>${tags}</div>
      <a href="${it.url}" target="_blank" rel="noopener">View record ↗</a>
    `;
    grid.appendChild(card);
  });

  // toggle collapse
  wrap.querySelector(".section-head").addEventListener("click", (e)=>{
    const panel = document.getElementById(id);
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "grid";
  });

  return wrap;
}

function render(){
  regroup();

  const mount = document.getElementById("results");
  mount.innerHTML = "";

  const subjects = Object.keys(SUBJECT_MAP).sort(byAlpha);
  if(!subjects.length){
    mount.innerHTML = `<div class="section"><div class="section-head"><h2>No results</h2></div></div>`;
    return;
  }

  subjects.forEach(sub=>{
    const sec = sectionTpl(sub, SUBJECT_MAP[sub]);
    mount.appendChild(sec);
  });
}

async function loadAll(){
  const mount = document.getElementById("results");
  mount.innerHTML = `<div class="section"><div class="section-head"><h2>Loading…</h2></div></div>`;

  const results = await Promise.all(SOURCES.map(fetchSource));
  ALL_ITEMS = results.flat();

  // track institutions for filter
  ALL_ITEMS.forEach(i => INSTITUTIONS.add(i.__institution || i.__source));
  buildInstitutionFilter();

  render();
}

// Kick off
document.addEventListener("DOMContentLoaded", loadAll);
