// ============================================
// InquiryBase v11.0 — Clean Modern Interface
// ============================================

class InquiryBase {
    constructor() {
        this.proxy = "https://inquirybase.archiverepo1.workers.dev/?url=";
        this.datasets = new Map();
        this.isHarvesting = false;
        this.currentPage = 1;
        this.pageSize = 12;
        this.searchTerm = '';
        this.currentFilter = 'all';
        this.filters = {
            yearFrom: '',
            yearTo: '',
            contentType: 'all',
            sortBy: 'relevance'
        };
        
        this.sources = this.initializeSources();
        this.initializeApp();
    }

    initializeSources() {
        return [
            // Research Data
            { id: 'zenodo', name: 'Zenodo', type: 'research', enabled: true, category: 'research' },
            { id: 'figshare', name: 'Figshare', type: 'research', enabled: true, category: 'research' },
            { id: 'dryad', name: 'Dryad', type: 'research', enabled: false, category: 'research' },
            { id: 'osf', name: 'OSF', type: 'research', enabled: false, category: 'research' },
            { id: 'mendeley', name: 'Mendeley Data', type: 'research', enabled: false, category: 'research' },
            
            // Journal Articles
            { id: 'uct', name: 'Open UCT', type: 'articles', enabled: false, category: 'articles' },
            { id: 'sun', name: 'SUNScholar', type: 'articles', enabled: false, category: 'articles' },
            { id: 'up', name: 'UP Repository', type: 'articles', enabled: false, category: 'articles' },
            { id: 'nwu', name: 'NWU Repository', type: 'articles', enabled: false, category: 'articles' },
            
            // Theses
            { id: 'sun-theses', name: 'SUN Theses', type: 'thesis', enabled: false, category: 'thesis' },
            { id: 'up-theses', name: 'UP Theses', type: 'thesis', enabled: false, category: 'thesis' },
            { id: 'ukzn-theses', name: 'UKZN Theses', type: 'thesis', enabled: false, category: 'thesis' },
            { id: 'ufs-theses', name: 'UFS Theses', type: 'thesis', enabled: false, category: 'thesis' }
        ];
    }

    initializeApp() {
        this.initializeEventListeners();
        this.initializeYearFilters();
        this.renderSourceGrid();
        this.loadCachedData();
        this.updateUI();
    }

    initializeEventListeners() {
        // Search
        document.getElementById('searchButton').addEventListener('click', () => this.performSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.setActiveFilter(filter);
            });
        });

        // Advanced filters
        document.getElementById('toggleAdvanced').addEventListener('click', () => {
            this.toggleAdvancedFilters();
        });

        // Filter changes
        document.getElementById('yearFrom').addEventListener('change', (e) => {
            this.filters.yearFrom = e.target.value;
            this.performSearch();
        });
        document.getElementById('yearTo').addEventListener('change', (e) => {
            this.filters.yearTo = e.target.value;
            this.performSearch();
        });
        document.getElementById('contentType').addEventListener('change', (e) => {
            this.filters.contentType = e.target.value;
            this.performSearch();
        });
        document.getElementById('sortBy').addEventListener('change', (e) => {
            this.filters.sortBy = e.target.value;
            this.performSearch();
        });

        // Harvest control
        document.getElementById('startHarvest').addEventListener('click', () => this.startHarvesting());

        // Source toggles
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('source-toggle-input')) {
                const sourceId = e.target.dataset.sourceId;
                this.toggleSource(sourceId, e.target.checked);
            }
        });

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => this.previousPage());
        document.getElementById('nextPage').addEventListener('click', () => this.nextPage());

        // Actions
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('clearResults').addEventListener('click', () => this.clearResults());
    }

    setActiveFilter(filter) {
        this.currentFilter = filter;
        
        // Update button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.performSearch();
    }

    toggleAdvancedFilters() {
        const advancedFilters = document.getElementById('advancedFilters');
        advancedFilters.classList.toggle('hidden');
        
        const toggleBtn = document.getElementById('toggleAdvanced');
        const icon = toggleBtn.querySelector('i');
        
        if (advancedFilters.classList.contains('hidden')) {
            icon.className = 'fas fa-sliders-h';
        } else {
            icon.className = 'fas fa-times';
        }
    }

    initializeYearFilters() {
        const currentYear = new Date().getFullYear();
        const yearFrom = document.getElementById('yearFrom');
        const yearTo = document.getElementById('yearTo');

        for (let year = currentYear; year >= 1950; year--) {
            yearFrom.innerHTML += `<option value="${year}">${year}</option>`;
            yearTo.innerHTML += `<option value="${year}">${year}</option>`;
        }
    }

    renderSourceGrid() {
        const grid = document.getElementById('sourceGrid');
        const categories = {
            research: 'Research Data',
            articles: 'Journal Articles', 
            thesis: 'Theses & Dissertations'
        };

        let html = '';
        
        Object.entries(categories).forEach(([category, title]) => {
            const categorySources = this.sources.filter(s => s.category === category);
            
            html += `
                <div class="source-category">
                    <h4>${title}</h4>
                    <div class="source-category-grid">
                        ${categorySources.map(source => `
                            <div class="source-card ${source.enabled ? 'active' : ''}">
                                <div class="source-header-row">
                                    <span class="source-name">${source.name}</span>
                                    <label class="source-toggle">
                                        <input type="checkbox" class="source-toggle-input" 
                                               data-source-id="${source.id}" 
                                               ${source.enabled ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="source-type">${source.type}</div>
                                <div class="source-stats">Ready to harvest</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    }

    toggleSource(sourceId, enabled) {
        const source = this.sources.find(s => s.id === sourceId);
        if (source) {
            source.enabled = enabled;
            this.updateSourceCount();
        }
    }

    updateSourceCount() {
        const activeSources = this.sources.filter(s => s.enabled).length;
        document.getElementById('activeSources').textContent = activeSources;
    }

    async startHarvesting() {
        if (this.isHarvesting) {
            alert('Harvesting is already in progress');
            return;
        }

        const selectedSources = this.sources.filter(s => s.enabled);
        if (selectedSources.length === 0) {
            alert('Please enable at least one data source');
            return;
        }

        this.isHarvesting = true;
        this.updateHarvestStatus('Starting harvest...', 0);

        let totalHarvested = 0;
        const totalSources = selectedSources.length;

        for (let i = 0; i < selectedSources.length; i++) {
            const source = selectedSources[i];
            const progress = ((i / totalSources) * 100).toFixed(0);
            this.updateHarvestStatus(`Harvesting ${source.name}...`, progress);

            try {
                const items = await this.harvestSource(source);
                totalHarvested += items.length;
                
                // Store in datasets
                if (!this.datasets.has(source.type)) {
                    this.datasets.set(source.type, []);
                }
                this.datasets.get(source.type).push(...items);

                this.updateUI();
                this.saveToCache();
            } catch (error) {
                console.error(`Failed to harvest ${source.name}:`, error);
            }
        }

        this.isHarvesting = false;
        this.updateHarvestStatus('Harvest completed!', 100);
        this.performSearch();
    }

    async harvestSource(source) {
        console.log(`Harvesting from ${source.name}...`);
        
        // This would call the actual harvesting methods
        // For now, return empty array as placeholder
        return [];
    }

    // Search functionality
    performSearch() {
        this.searchTerm = document.getElementById('searchInput').value.toLowerCase();
        this.currentPage = 1;
        this.displayResults();
    }

    getFilteredItems() {
        let allItems = [];
        for (const [type, items] of this.datasets) {
            allItems = allItems.concat(items);
        }

        return allItems.filter(item => {
            // Category filter
            if (this.currentFilter !== 'all' && item.type !== this.currentFilter) {
                return false;
            }

            // Text search
            if (this.searchTerm) {
                const searchableText = [
                    item.title,
                    item.description,
                    item.authors?.join(' '),
                    item.keywords?.join(' '),
                    item.doi,
                    item.publisher,
                    item.source
                ].join(' ').toLowerCase();

                if (!searchableText.includes(this.searchTerm)) {
                    return false;
                }
            }

            // Year filter
            if (this.filters.yearFrom && item.year < parseInt(this.filters.yearFrom)) {
                return false;
            }
            if (this.filters.yearTo && item.year > parseInt(this.filters.yearTo)) {
                return false;
            }

            // Content type filter
            if (this.filters.contentType !== 'all') {
                if (this.filters.contentType === 'dataset' && item.type !== 'research') return false;
                if (this.filters.contentType === 'article' && item.type !== 'articles') return false;
                if (this.filters.contentType === 'thesis' && item.type !== 'thesis') return false;
                if (this.filters.contentType === 'software' && item.content_type !== 'Software') return false;
            }

            return true;
        });
    }

    displayResults() {
        const container = document.getElementById('resultsContainer');
        const items = this.getFilteredItems();
        const totalItems = items.length;
        const totalPages = Math.ceil(totalItems / this.pageSize);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const pageItems = items.slice(startIndex, startIndex + this.pageSize);

        // Update results count
        const resultsCount = document.getElementById('resultsCount');
        if (totalItems === 0 && !this.searchTerm) {
            resultsCount.textContent = 'Start your search';
        } else {
            resultsCount.textContent = `${totalItems.toLocaleString()} Results`;
        }

        if (totalItems === 0) {
            if (this.searchTerm) {
                container.innerHTML = this.getNoResultsHTML();
            } else {
                container.innerHTML = this.getWelcomeHTML();
            }
        } else {
            container.innerHTML = `
                <div class="results-grid">
                    ${pageItems.map(item => this.createResultCard(item)).join('')}
                </div>
            `;
        }

        this.updatePagination(totalPages);
        this.updateUI();
    }

    createResultCard(item) {
        const badgeClass = `badge-${item.type}`;
        const badgeText = item.type === 'research' ? 'Dataset' : 
                         item.type === 'articles' ? 'Article' : 'Thesis';

        return `
            <div class="result-card">
                <div class="card-header">
                    <span class="card-badge ${badgeClass}">${badgeText}</span>
                    <span class="card-source">${item.source}</span>
                </div>
                <h3 class="card-title">${item.title}</h3>
                <div class="card-authors">${item.authors?.slice(0, 3).join(', ') || 'Unknown authors'}</div>
                <p class="card-description">${item.description || 'No description available'}</p>
                ${item.keywords && item.keywords.length > 0 ? `
                    <div class="card-keywords">
                        ${item.keywords.slice(0, 5).map(keyword => 
                            `<span class="keyword-tag">${keyword}</span>`
                        ).join('')}
                    </div>
                ` : ''}
                <div class="card-footer">
                    <div class="card-meta">
                        <span>${item.year || 'Unknown year'}</span>
                        <span>${item.content_type || 'Research'}</span>
                    </div>
                    <div class="card-actions">
                        <button class="card-action" onclick="app.downloadItem('${item.id}')">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="card-action" onclick="app.viewItem('${item.id}')">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    getWelcomeHTML() {
        return `
            <div class="welcome-state">
                <div class="welcome-icon">
                    <i class="fas fa-search fa-4x"></i>
                </div>
                <h3>Explore Research Data</h3>
                <p>Use the search bar above to discover datasets, articles, and theses from global repositories</p>
                <div class="welcome-features">
                    <div class="feature">
                        <i class="fas fa-database"></i>
                        <span>Research Data</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-file-alt"></i>
                        <span>Journal Articles</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-graduation-cap"></i>
                        <span>Theses & Dissertations</span>
                    </div>
                </div>
            </div>
        `;
    }

    getNoResultsHTML() {
        return `
            <div class="welcome-state">
                <div class="welcome-icon">
                    <i class="fas fa-search fa-4x"></i>
                </div>
                <h3>No Results Found</h3>
                <p>Try adjusting your search terms or filters</p>
                <div class="welcome-features">
                    <div class="feature">
                        <i class="fas fa-sync-alt"></i>
                        <span>Check your spelling</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-filter"></i>
                        <span>Try different filters</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-database"></i>
                        <span>Harvest more data</span>
                    </div>
                </div>
            </div>
        `;
    }

    updatePagination(totalPages) {
        const pagination = document.getElementById('pagination');
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const pageInfo = document.getElementById('pageInfo');

        if (totalPages <= 1) {
            pagination.classList.add('hidden');
        } else {
            pagination.classList.remove('hidden');
        }

        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages || totalPages === 0;
        pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.displayResults();
        }
    }

    nextPage() {
        const totalItems = this.getFilteredItems().length;
        const totalPages = Math.ceil(totalItems / this.pageSize);
        
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.displayResults();
        }
    }

    // Utility methods
    updateHarvestStatus(message, progress) {
        document.getElementById('harvestStatus').textContent = message;
        
        if (progress !== null) {
            document.getElementById('progressFill').style.width = `${progress}%`;
        }

        this.updateUI();
    }

    updateUI() {
        let totalRecords = 0;
        for (const [type, items] of this.datasets) {
            totalRecords += items.length;
        }
        
        document.getElementById('totalRecords').textContent = totalRecords.toLocaleString();
        this.updateSourceCount();
    }

    // Data management
    saveToCache() {
        const data = {
            datasets: Array.from(this.datasets.entries()),
            sources: this.sources,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('inquiryBaseData', JSON.stringify(data));
    }

    loadCachedData() {
        try {
            const cached = localStorage.getItem('inquiryBaseData');
            if (cached) {
                const data = JSON.parse(cached);
                this.datasets = new Map(data.datasets);
                this.sources = data.sources || this.sources;
                this.updateUI();
                this.renderSourceGrid();
            }
        } catch (error) {
            console.error('Error loading cached data:', error);
        }
    }

    exportData() {
        const allItems = this.getFilteredItems();
        if (allItems.length === 0) {
            alert('No data to export');
            return;
        }

        const dataStr = JSON.stringify(allItems, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `inquirybase-export-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    clearResults() {
        if (confirm('Are you sure you want to clear all results?')) {
            this.datasets.clear();
            localStorage.removeItem('inquiryBaseData');
            this.currentPage = 1;
            this.searchTerm = '';
            document.getElementById('searchInput').value = '';
            this.updateUI();
            this.displayResults();
        }
    }

    downloadItem(itemId) {
        console.log('Download item:', itemId);
        // Implementation for item download
    }

    viewItem(itemId) {
        console.log('View item:', itemId);
        // Implementation for viewing item in original source
    }
}

// Initialize the application
const app = new InquiryBase();
