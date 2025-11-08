
const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";

// Test worker connection on load
async function testWorkerConnection() {
    try {
        console.log('Testing worker connection...');
        const response = await fetch(`${WORKER_URL}/api/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log('Worker connection successful:', data);
        return true;
    } catch (error) {
        console.error('Worker connection failed:', error);
        return false;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log('InquiryBase frontend initializing...');

    // Test worker connection first
    const isWorkerOnline = await testWorkerConnection();
    if (!isWorkerOnline) {
        showFatalError('Cannot connect to the server. Please ensure the backend service is running.');
        return;
    }

    // DOM elements
    const searchInput = document.getElementById("searchBox");
    const searchBtn = document.getElementById("searchBtn");
    const clearBtn = document.getElementById("clearBtn");
    const tabs = document.querySelectorAll(".tab");
    const progressEl = document.getElementById("progressBar");
    const cardsEl = document.getElementById("dataCardsContainer");
    const filtersSide = document.getElementById("filtersSidebar");
    const filtersWrap = document.getElementById("filtersWrap");
    const bulkRisBtn = document.getElementById("bulkRisButton");

    // State
    const state = {
        activeCategory: "all",
        page: 1,
        pageSize: 50,
        total: 0,
        allData: [],
        facets: {},
        filters: { year: "", repository: "", type: "", author: "" },
        filterKeyword: "",
        topQuery: "",
        isLoading: false,
        selected: new Set()
    };

    let currentAbort = null;

    // ----------------------- Events -----------------------

    searchBtn?.addEventListener("click", () => {
        state.topQuery = (searchInput?.value || "").trim();
        state.page = 1;
        harvest();
    });

    searchInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            state.topQuery = (searchInput.value || "").trim();
            state.page = 1;
            harvest();
        }
    });

    tabs.forEach(t => t.addEventListener("click", () => {
        tabs.forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        state.activeCategory = t.dataset.type;
        state.page = 1;
        harvest();
    }));

    clearBtn?.addEventListener("click", () => {
        resetState();
        if (cardsEl) cardsEl.innerHTML = emptyCard();
    });

    // ----------------------- Harvest -----------------------

    async function harvest() {
        if (state.isLoading && currentAbort) {
            currentAbort.abort();
        }
        
        state.isLoading = true;
        progress(0.1);
        showLoading();

        try {
            const combinedQuery = [state.topQuery, state.filterKeyword].filter(Boolean).join(" ").trim();

            const body = {
                category: state.activeCategory,
                query: combinedQuery,
                page: state.page,
                pageSize: state.pageSize,
                filters: state.filters,
                perSourceLimit: 1000
            };

            console.log("Sending harvest request:", body);

            currentAbort = new AbortController();
            const timeoutId = setTimeout(() => {
                if (currentAbort) currentAbort.abort();
            }, 30000);

            const response = await fetch(`${WORKER_URL}/api/harvest`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store"
                },
                body: JSON.stringify(body),
                signal: currentAbort.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log("Harvest response received");

            if (!data.success) {
                throw new Error(data.error || "Request failed");
            }

            state.allData = Array.isArray(data.results) ? data.results : [];
            state.facets = data.facets || {};
            state.total = Number(data.total || state.allData.length) || 0;

            progress(0.8);
            buildFilters();
            renderCards(state.allData);
            updatePagination();

            // Update UI visibility
            if (filtersSide) {
                filtersSide.style.display = state.allData.length ? "block" : "none";
            }
            if (clearBtn) {
                clearBtn.style.display = state.allData.length ? "inline-flex" : "none";
            }
            
            progress(1);
            
        } catch (error) {
            console.error("Harvest error:", error);
            handleHarvestError(error);
        } finally {
            state.isLoading = false;
            setTimeout(() => progress(0), 500);
            currentAbort = null;
        }
    }

    function handleHarvestError(error) {
        let errorMessage = "An unexpected error occurred";
        
        if (error.name === "AbortError") {
            errorMessage = "Request timed out. Please try again.";
        } else if (error.message.includes("Failed to fetch")) {
            errorMessage = "Cannot connect to server. Please check your internet connection.";
        } else if (error.message.includes("Server error")) {
            errorMessage = error.message;
        } else {
            errorMessage = error.message || "Please try again.";
        }

        if (cardsEl) {
            cardsEl.innerHTML = errorCard(errorMessage);
        }
        hidePagination();
        if (filtersSide) filtersSide.style.display = "none";
        if (clearBtn) clearBtn.style.display = "inline-flex";
    }

    function showFatalError(message) {
        if (cardsEl) {
            cardsEl.innerHTML = `
                <div class="no-results">
                    <i class="fa-solid fa-unlink" style="color: #dc2626; font-size: 48px;"></i>
                    <h3 style="color: #dc2626;">Connection Failed</h3>
                    <p>${message}</p>
                    <div style="margin-top: 20px;">
                        <button class="btn" onclick="window.location.reload()" style="margin: 5px;">
                            <i class="fa-solid fa-refresh"></i> Reload Page
                        </button>
                        <button class="btn" onclick="testConnection()" style="margin: 5px;">
                            <i class="fa-solid fa-wifi"></i> Test Connection
                        </button>
                    </div>
                    <div style="margin-top: 15px; font-size: 14px; color: #666;">
                        <p>Worker URL: <code>${WORKER_URL}</code></p>
                    </div>
                </div>
            `;
        }
    }

    // ----------------------- Filters UI -----------------------

    function buildFilters() {
        if (!filtersWrap) return;

        filtersWrap.innerHTML = "";

        const addSelect = (label, id, items) => {
            const box = document.createElement("div");
            box.className = "filter";
            const opts = (items || [])
                .map(x => `<option value="${escapeHtml(String(x.name))}">${escapeHtml(String(x.name))} (${x.count})</option>`)
                .join("");
            box.innerHTML = `
                <label>${label}</label>
                <select id="${id}">
                    <option value="">All</option>
                    ${opts}
                </select>
            `;
            return box;
        };

        const yearSel = addSelect("Year", "filterYear", state.facets.years);
        const repoSel = addSelect("Repository", "filterRepo", state.facets.repositories);
        const typeSel = addSelect("Type", "filterType", state.facets.types);
        const authSel = addSelect("Author", "filterAuthor", state.facets.authors);

        filtersWrap.append(yearSel, repoSel, typeSel, authSel);

        // Restore selections
        setVal("filterYear", state.filters.year);
        setVal("filterRepo", state.filters.repository);
        setVal("filterType", state.filters.type);
        setVal("filterAuthor", state.filters.author);

        // Bind change events
        ["filterYear", "filterRepo", "filterType", "filterAuthor"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("change", () => {
                    state.filters = {
                        year: getVal("filterYear"),
                        repository: getVal("filterRepo"),
                        type: getVal("filterType"),
                        author: getVal("filterAuthor")
                    };
                    state.page = 1;
                    harvest();
                });
            }
        });

        // Keyword box
        const kw = document.createElement("div");
        kw.className = "filter";
        kw.innerHTML = `
            <label>Keyword</label>
            <div style="display:flex;gap:8px;">
                <input id="filterKeyword" type="text" placeholder="Search title / abstract / authors / keywords"
                    style="flex:1;border:1px solid #e0e0e0;border-radius:6px;padding:10px;background:#fff">
                <button id="filterSearchBtn" class="btn" style="white-space:nowrap;">Search</button>
            </div>
            <small style="color:#666;">Tip: use quotes for exact matches, e.g. "machine learning"</small>
        `;
        filtersWrap.appendChild(kw);
        
        const keywordInput = document.getElementById("filterKeyword");
        const keywordBtn = document.getElementById("filterSearchBtn");
        
        if (keywordInput) {
            keywordInput.value = state.filterKeyword || "";
            keywordInput.addEventListener("keydown", e => {
                if (e.key === "Enter") {
                    state.filterKeyword = (keywordInput.value || "").trim();
                    state.page = 1;
                    harvest();
                }
            });
        }
        
        if (keywordBtn) {
            keywordBtn.addEventListener("click", () => {
                state.filterKeyword = (keywordInput?.value || "").trim();
                state.page = 1;
                harvest();
            });
        }
    }

    // ----------------------- Cards -----------------------

    function renderCards(records) {
        if (!cardsEl) return;
        
        if (!records || !records.length) {
            cardsEl.innerHTML = emptyCard();
            return;
        }

        const frag = document.createDocumentFragment();
        for (const item of records) {
            const card = document.createElement("div");
            card.className = "data-card";
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-type">${escapeHtml(item.type || "Unknown")}</div>
                    <div class="card-source">${escapeHtml(item.source || "Unknown")}</div>
                </div>

                <div class="card-body">
                    <input type="checkbox" class="select-record" data-id="${item.id}"
                            title="Select for bulk RIS" style="float:right;margin-left:8px">
                    <h3 class="card-title">${escapeHtml(item.title || "Untitled")}</h3>
                    <div class="card-authors">${escapeHtml(formatAuthors(item.authors))}</div>
                    <p class="card-description">
                        ${escapeHtml((item.description || "").slice(0, 320))}
                        ${(item.description || "").length > 320 ? "…" : ""}
                    </p>
                </div>

                <div class="card-footer">
                    <div class="card-meta">
                        <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(item.year || "Unknown")}</span>
                        ${item.identifier
                            ? `<span>${escapeHtml(item.identifierType || "ID")}: 
                                <a href="${escapeAttr(item.url || "#")}" target="_blank" class="doi-link">
                                    ${escapeHtml(item.identifier)}
                                </a>
                            </span>`
                            : ""}
                    </div>
                    <div class="card-actions">
                        <button class="btn sm" title="Open record"
                                onclick="window.open('${escapeAttr(item.url || "#")}','_blank')">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                        <button class="btn sm ris-btn" title="Export RIS" data-id="${item.id}">
                            <i class="fa-solid fa-file-export"></i> Export RIS
                        </button>
                    </div>
                </div>
            `;
            frag.appendChild(card);
        }

        cardsEl.innerHTML = "";
        cardsEl.appendChild(frag);

        // Bind events
        cardsEl.querySelectorAll(".ris-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const rec = state.allData.find(r => r.id === btn.dataset.id);
                if (rec) exportRIS([rec]);
            });
        });
        
        cardsEl.querySelectorAll(".select-record").forEach(cb => {
            cb.addEventListener("change", e => {
                const id = e.target.dataset.id;
                if (e.target.checked) state.selected.add(id);
                else state.selected.delete(id);
                toggleBulkButton();
            });
        });
    }

    // ----------------------- Pagination -----------------------

    function updatePagination() {
        const paginationEl = document.getElementById("pagination");
        const prevBtn = document.getElementById("prevBtn");
        const nextBtn = document.getElementById("nextBtn");
        const pageInfo = document.getElementById("pageInfo");
        const totalInfo = document.getElementById("totalInfo");
        
        if (!paginationEl || !prevBtn || !nextBtn || !pageInfo || !totalInfo) return;
        
        if (!state.total) {
            hidePagination();
            return;
        }
        
        const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
        
        // Update display
        pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
        totalInfo.textContent = `${state.total} records`;
        prevBtn.disabled = state.page <= 1;
        nextBtn.disabled = state.page >= totalPages;
        
        paginationEl.style.display = "flex";
        
        // Update event handlers
        prevBtn.onclick = () => {
            if (state.page > 1) {
                state.page--;
                harvest();
            }
        };
        
        nextBtn.onclick = () => {
            if (state.page < totalPages) {
                state.page++;
                harvest();
            }
        };
    }

    function hidePagination() {
        const paginationEl = document.getElementById("pagination");
        if (paginationEl) {
            paginationEl.style.display = "none";
        }
    }

    // ----------------------- RIS Export -----------------------

    async function exportRIS(records) {
        try {
            const response = await fetch(`${WORKER_URL}/api/ris`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ records })
            });
            
            if (!response.ok) throw new Error("Export failed");
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "inquirybase-export.ris";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert("RIS export failed: " + (error.message || "Unknown error"));
        }
    }

    // ----------------------- Helper Functions -----------------------

    function resetState() {
        state.page = 1;
        state.total = 0;
        state.allData = [];
        state.facets = {};
        state.filters = { year: "", repository: "", type: "", author: "" };
        state.filterKeyword = "";
        state.topQuery = "";
        state.selected.clear();
        
        if (searchInput) searchInput.value = "";
        if (filtersSide) filtersSide.style.display = "none";
        if (clearBtn) clearBtn.style.display = "none";
        hidePagination();
        toggleBulkButton();
    }

    function showLoading() {
        if (!cardsEl) return;
        
        cardsEl.innerHTML = `
            <div class="no-results">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <h3>Harvesting in progress…</h3>
                <p>Fetching ${escapeHtml((state.activeCategory || "").toUpperCase())} data. Please wait…</p>
            </div>
        `;
    }

    function errorCard(msg) {
        return `
            <div class="no-results">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>Harvest Failed</h3>
                <p>${escapeHtml(msg || "Unknown error")}</p>
                <button class="btn" onclick="window.location.reload()" style="margin-top: 10px;">
                    <i class="fa-solid fa-refresh"></i> Reload Page
                </button>
            </div>
        `;
    }

    function emptyCard() {
        return `
            <div class="no-results">
                <i class="fa-regular fa-circle-question"></i>
                <h3>No data available</h3>
                <p>Use the search or select a category to harvest records.</p>
            </div>
        `;
    }

    function toggleBulkButton() {
        if (bulkRisBtn) {
            bulkRisBtn.style.display = state.selected.size ? "inline-flex" : "none";
        }
    }

    function progress(ratio) {
        if (progressEl) {
            progressEl.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
        }
    }

    function setVal(id, v) {
        const el = document.getElementById(id);
        if (el) el.value = v || "";
    }

    function getVal(id) {
        const el = document.getElementById(id);
        if (!el) return "";
        const v = el.value || "";
        return v === "All" ? "" : v;
    }

    function formatAuthors(authors) {
        if (!authors || !Array.isArray(authors)) return "Unknown author";
        return authors.join(", ");
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return "";
        const str = String(text);
        return str.replace(/[&<>"']/g, 
            tag => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[tag]));
    }

    function escapeAttr(text) {
        return escapeHtml(String(text || "").replace(/"/g, ""));
    }

    // Global function for testing connection
    window.testConnection = async function() {
        const isOnline = await testWorkerConnection();
        if (isOnline) {
            alert('Connection successful! The worker is responding.');
            window.location.reload();
        } else {
            alert('Still cannot connect to the server. Please check the Worker deployment.');
        }
    };

    // Bulk RIS button handler
    bulkRisBtn?.addEventListener("click", () => {
        const records = Array.from(state.selected)
            .map(id => state.allData.find(r => r.id === id))
            .filter(Boolean);
        if (records.length) exportRIS(records);
    });

    // Initial load
    console.log('Starting initial harvest...');
    setTimeout(() => harvest(), 100);
});
