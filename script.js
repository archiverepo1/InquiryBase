const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev';

document.addEventListener('DOMContentLoaded', () => {
  // DOM
  const searchInput   = document.querySelector('.search-input');
  const searchBtn     = document.querySelector('.search-btn');
  const tabs          = document.querySelectorAll('.tab');
  const clearBtn      = document.querySelector('.clear-btn'); // hidden until results exist
  const progressBar   = document.querySelector('.progress');
  const cards         = document.getElementById('dataCardsContainer');
  const filtersMount  = document.getElementById('filtersMount');

  // State
  const state = {
    activeCategory: 'all',
    isHarvesting: false,
    allData: [],
    facets: {},
    selected: new Set(),
  };

  // Events
  searchBtn.addEventListener('click', () => {
    startHarvest(state.activeCategory, searchInput.value.trim());
  });

  tabs.forEach(tb => {
    tb.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tb.classList.add('active');
      state.activeCategory = tb.dataset.type;
      // All Sources doubles as "Harvest All"
      startHarvest(state.activeCategory, searchInput.value.trim());
    });
  });

  clearBtn.addEventListener('click', clearResults);

  // Core
  async function startHarvest(category = 'all', query = '') {
    if (state.isHarvesting) return;
    state.isHarvesting = true;
    showLoading(category);

    try {
      const res = await fetch(`${WORKER_URL}/api/harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, query, perSourceLimit: 1000 }),
      });

      if (!res.ok) throw new Error(`Worker responded with ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unknown error');

      state.allData = data.results || [];
      state.facets  = data.facets || {};
      buildFilters();
      renderCards(state.allData);

      // show clear button only when results are present
      clearBtn.style.display = state.allData.length ? 'inline-flex' : 'none';
      progressBar.style.width = '100%';
    } catch (e) {
      cards.innerHTML = errorCard(e.message);
      clearBtn.style.display = 'none';
      progressBar.style.width = '0%';
      console.error(e);
    } finally {
      state.isHarvesting = false;
    }
  }

  // Display helpers
  function showLoading(cat) {
    cards.innerHTML = `
      <div class="data-card" style="padding:24px;text-align:center;">
        <i class="fas fa-spinner fa-spin"></i>
        <div style="margin-top:6px;">Fetching ${cat.toUpperCase()} data…</div>
      </div>`;
    filtersMount.innerHTML = '';
    progressBar.style.width = '25%';
  }

  function renderCards(records) {
    if (!records || !records.length) {
      cards.innerHTML = '';
      return;
    }

    const frag = document.createDocumentFragment();
    records.forEach(item => {
      const div = document.createElement('div');
      div.className = 'data-card';
      div.innerHTML = `
        <div class="card-header">
          <div class="card-type">${escapeHtml(item.type || '')}</div>
          <div class="card-source">${escapeHtml(item.source || '')}</div>
        </div>
        <div class="card-body">
          <input type="checkbox" class="select-record" data-id="${item.id}" style="float:right;margin-left:8px;">
          <h3 class="card-title">${escapeHtml(item.title || 'Untitled')}</h3>
          <div class="card-authors">${(item.authors || []).join(', ')}</div>
          <p class="card-description">${escapeHtml(String(item.description || '').slice(0, 320))}${(item.description||'').length>320?'…':''}</p>
          <div>
            ${(item.keywords || []).slice(0, 6).map(k=>`<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
          </div>
        </div>
        <div class="card-footer">
          <div class="card-meta">
            <span><i class="far fa-calendar"></i> ${item.year || ''}</span>
            ${item.identifier ? `<span>${item.identifierType || ''}: <a href="${item.url || '#'}" target="_blank" class="doi-link">${escapeHtml(item.identifier)}</a></span>` : ''}
          </div>
          <div class="card-actions">
            <button class="card-action" title="View" onclick="window.open('${item.url || '#'}','_blank')">
              <i class="fas fa-external-link-alt"></i>
            </button>
            <button class="card-action ris-btn" data-id="${item.id}" title="Export RIS">
              <i class="fas fa-file-export"></i>
            </button>
          </div>
        </div>
      `;
      frag.appendChild(div);
    });
    cards.innerHTML = '';
    cards.appendChild(frag);

    document.querySelectorAll('.select-record').forEach(cb=>{
      cb.addEventListener('change',(e)=>{
        const id = e.target.dataset.id;
        if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
      });
    });
    document.querySelectorAll('.ris-btn').forEach(btn=>{
      btn.addEventListener('click',()=>exportRIS([findRecord(btn.dataset.id)]));
    });
  }

  // Filters
  function buildFilters() {
    filtersMount.innerHTML = '';
    const f = state.facets || {};
    if (!Object.keys(f).length) return;

    const wrap = document.createElement('div');
    wrap.className = 'filters';

    const selYear  = makeSelect('Year', f.years,   v => applyFilter('year', v));
    const selRepo  = makeSelect('Repository', f.repositories, v => applyFilter('source', v));
    const selType  = makeSelect('Type', f.types,  v => applyFilter('type', v));
    const selAuth  = makeSelect('Author', f.authors, v => applyFilter('author', v));

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn harvest-btn';
    exportBtn.textContent = 'Export Selected to RIS';
    exportBtn.onclick = () => {
      const selected = Array.from(state.selected).map(id => findRecord(id)).filter(Boolean);
      if (!selected.length) return alert('No records selected.');
      exportRIS(selected);
    };

    wrap.append(selYear, selRepo, selType, selAuth, exportBtn);
    filtersMount.appendChild(wrap);
  }

  function makeSelect(label, items, onChange) {
    const d = document.createElement('div'); d.className = 'filter';
    d.innerHTML = `<label>${label}</label>
      <select>
        <option value="">All</option>
        ${(items||[]).map(x=>`<option value="${escapeHtml(x.name)}">${escapeHtml(x.name)} (${x.count})</option>`).join('')}
      </select>`;
    d.querySelector('select').addEventListener('change', e => onChange(e.target.value));
    return d;
  }

  function applyFilter(field, value) {
    let list = state.allData;
    if (value) {
      list = state.allData.filter(r => {
        if (field==='year') return String(r.year) === String(value);
        if (field==='source') return r.source === value;
        if (field==='type') return r.type === value;
        if (field==='author') return (r.authors||[]).includes(value);
        return true;
      });
    }
    renderCards(list);
  }

  // RIS export
  async function exportRIS(records) {
    try {
      const res = await fetch(`${WORKER_URL}/api/ris`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ records })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'qdata-export.ris'; a.click();
      URL.revokeObjectURL(url);
    } catch(e) {
      alert('RIS export failed: ' + e.message);
    }
  }

  // misc
  function clearResults(){
    cards.innerHTML = '';
    filtersMount.innerHTML = '';
    state.allData = []; state.selected.clear();
    progressBar.style.width = '0%';
    clearBtn.style.display = 'none';
  }
  function findRecord(id){return state.allData.find(r=>r.id===id)}
  function escapeHtml(t){return t?.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))||''}
  function errorCard(msg){return `<div class="data-card" style="padding:24px;text-align:center;color:#a00;">
    <i class="fa fa-triangle-exclamation"></i> ${escapeHtml(msg)}</div>`}
});
