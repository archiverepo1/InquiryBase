/* ============================================================================
   InquiryBase Frontend v3.4 (Production)
   Connects to Cloudflare Worker backend
   Maintains UI from index.html + style.css
   ========================================================================= */

const API_BASE = "https://inquirybase.archiverepo1.workers.dev/api";
let currentCategory = "all";
let currentQuery = "";
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 24;

/* ---------------- Utility Shortcuts ---------------- */
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => [...document.querySelectorAll(sel)];
const html = (el, v) => (el.innerHTML = v);
const show = (el) => (el.style.display = "");
const hide = (el) => (el.style.display = "none");

/* ---------------- Fetch + Render Data ---------------- */
async function fetchResults(category = "all", query = "", filters = {}, page = 1, pageSize = PAGE_SIZE) {
  const progress = qs("#progressBar");
  if (progress) progress.style.width = "25%";

  try {
    const res = await fetch(`${API_BASE}/harvest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, query, filters, page, pageSize }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || "No data returned");

    renderResults(data.results);
    updatePagination(data.page, Math.ceil(data.total / pageSize), data.total);
    if (progress) progress.style.width = "100%";
  } catch (err) {
    console.error("❌ Fetch error:", err);
    showError(`⚠️ ${err.message}`);
    if (progress) progress.style.width = "0";
  }
}

/* ---------------- Render Cards ---------------- */
function renderResults(records = []) {
  const container = qs("#dataCardsContainer");
  if (!container) return;
  html(container, "");

  if (!records.length) {
    html(container, `
      <div class="no-results">
        <i class="fas fa-database"></i>
        <h3>No Results Found</h3>
        <p>The harvest cache may be empty. Try again later or adjust filters.</p>
      </div>
    `);
    hide(qs("#pagination"));
    return;
  }

  for (const r of records) {
    const card = document.createElement("div");
    card.className = "data-card";
    card.innerHTML = `
      <div class="card-header">
        <span class="card-type">${r.type || "Record"}</span>
        <span class="card-source">${r.source || ""}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${r.title || "Untitled"}</h3>
        <p class="card-authors">${(r.authors || []).join(", ")}</p>
        <p class="card-description">${(r.description || "").substring(0, 300)}...</p>
      </div>
      <div class="card-footer">
        <div class="card-meta">
          <span><b>Year:</b> ${r.year || "—"}</span>
          <span><b>ID:</b> ${r.identifier || "—"}</span>
        </div>
        <div class="card-actions">
          ${r.url ? `<a href="${r.url}" target="_blank" class="btn sm">Open</a>` : ""}
          <input type="checkbox" class="select-record" data-id="${r.id}">
        </div>
      </div>
    `;
    container.appendChild(card);
  }

  show(qs("#pagination"));
}

/* ---------------- Pagination ---------------- */
function updatePagination(page, totalPagesCalc, total) {
  currentPage = page;
  totalPages = totalPagesCalc;
  qs("#pageInfo").textContent = `Page ${page} of ${totalPages}`;
  qs("#totalInfo").textContent = `${total} records`;
  qs("#prevBtn").disabled = page <= 1;
  qs("#nextBtn").disabled = page >= totalPages;
}

qs("#prevBtn")?.addEventListener("click", () => {
  if (currentPage > 1) fetchResults(currentCategory, currentQuery, {}, currentPage - 1);
});
qs("#nextBtn")?.addEventListener("click", () => {
  if (currentPage < totalPages) fetchResults(currentCategory, currentQuery, {}, currentPage + 1);
});

/* ---------------- Search + Tabs ---------------- */
qs("#searchBtn")?.addEventListener("click", () => {
  const query = qs("#searchBox")?.value.trim() || "";
  currentQuery = query;
  fetchResults(currentCategory, currentQuery, {}, 1);
});

qsa(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    qsa(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    currentCategory = btn.dataset.type;
    currentPage = 1;
    fetchResults(currentCategory, currentQuery, {}, 1);
  });
});

/* ---------------- Bulk RIS Export ---------------- */
qs("#bulkRisButton")?.addEventListener("click", async () => {
  const selected = qsa(".select-record:checked");
  if (!selected.length) return alert("Select at least one record.");

  const records = selected.map((chk) => {
    const card = chk.closest(".data-card");
    return {
      title: card.querySelector(".card-title")?.textContent || "",
      authors: (card.querySelector(".card-authors")?.textContent || "").split(", "),
      year: card.querySelector(".card-meta")?.textContent.match(/\d{4}/)?.[0] || "",
    };
  });

  const res = await fetch(`${API_BASE}/ris`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inquirybase_export.ris";
  a.click();
  URL.revokeObjectURL(url);
});

/* ---------------- Toggle Floating RIS Button ---------------- */
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("select-record")) {
    const anyChecked = qsa(".select-record:checked").length > 0;
    qs("#bulkRisButton").style.display = anyChecked ? "flex" : "none";
  }
});

/* ---------------- Error Handling ---------------- */
function showError(msg) {
  const container = qs("#dataCardsContainer");
  html(container, `
    <div class="no-results">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Error</h3>
      <p>${msg}</p>
    </div>
  `);
  hide(qs("#pagination"));
}

/* ---------------- Auto-load Cached Harvest ---------------- */
window.addEventListener("DOMContentLoaded", () => {
  fetchResults("all", "");
});
