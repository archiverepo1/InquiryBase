// ============================================
// InquiryBase v11.0 — Clean Modern Interface
// ============================================

class InquiryBase {
    constructor() {
        // UPDATE THIS LINE WITH YOUR ACTUAL WORKER URL
        // Get your worker URL from Cloudflare dashboard
        this.proxy = "https://inquirybase.your-subdomain.workers.dev/?url=";
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
        this.updateSourceCount();
        this.loadCachedData();
        this.updateUI();
        this.testWorkerConnection();
    }

    async testWorkerConnection() {
        try {
            const testUrl = 'https://zenodo.org/api/records';
            console.log('Testing worker connection to:', this.proxy + encodeURIComponent(testUrl));
            const response = await fetch(this.proxy + encodeURIComponent(testUrl));
            
            if (response.ok) {
                console.log('✅ Worker connection successful');
                return true;
            } else {
                console.error('❌ Worker returned error:', response.status);
                return false;
            }
        } catch (error) {
            console.error('❌ Worker connection failed:', error);
            return false;
        }
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
        document.getElementById('manageSources').addEventListener('click', () => this.manageSources());
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
            toggleBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Advanced Filters';
        } else {
            icon.className = 'fas fa-times';
            toggleBtn.innerHTML = '<i class="fas fa-times"></i> Hide Filters';
        }
    }

    initializeYearFilters() {
        const currentYear = new Date().getFullYear();
        const yearFrom = document.getElementById('yearFrom');
        const yearTo = document.getElementById('yearTo');

        // Clear existing options
        yearFrom.innerHTML = '<option value="">From Year</option>';
        yearTo.innerHTML = '<option value="">To Year</option>';

        for (let year = currentYear; year >= 1950; year--) {
            yearFrom.innerHTML += `<option value="${year}">${year}</option>`;
            yearTo.innerHTML += `<option value="${year}">${year}</option>`;
        }
    }

    toggleSource(sourceId, enabled) {
        const source = this.sources.find(s => s.id === sourceId);
        if (source) {
            source.enabled = enabled;
            
            // Update card appearance
            const sourceCard = document.querySelector(`[data-source-id="${sourceId}"]`).closest('.source-card');
            if (sourceCard) {
                sourceCard.classList.toggle('active', enabled);
            }
            
            this.updateSourceCount();
            this.saveToCache();
        }
    }

    updateSourceCount() {
        const activeSources = this.sources.filter(s => s.enabled).length;
        document.getElementById('activeSources').textContent = activeSources;
    }

    manageSources() {
        // Simple select all/none functionality
        const allEnabled = this.sources.every(s => s.enabled);
        
        this.sources.forEach(source => {
            source.enabled = !allEnabled;
            const checkbox = document.querySelector(`[data-source-id="${source.id}"]`);
            if (checkbox) {
                checkbox.checked = !allEnabled;
            }
            const sourceCard = document.querySelector(`[data-source-id="${source.id}"]`).closest('.source-card');
            if (sourceCard) {
                sourceCard.classList.toggle('active', !allEnabled);
            }
        });
        
        this.updateSourceCount();
        this.saveToCache();
        
        // Update button text
        const manageBtn = document.getElementById('manageSources');
        manageBtn.innerHTML = allEnabled 
            ? '<i class="fas fa-cog"></i> Enable All Sources' 
            : '<i class="fas fa-cog"></i> Disable All Sources';
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
                
                // Small delay to avoid rate limiting
                await this.delay(1000);
            } catch (error) {
                console.error(`Failed to harvest ${source.name}:`, error);
                this.updateHarvestStatus(`Error harvesting ${source.name}`, progress);
            }
        }

        this.isHarvesting = false;
        this.updateHarvestStatus('Harvest completed!', 100);
        this.performSearch();
    }

    async harvestSource(source) {
        console.log(`Harvesting from ${source.name}...`);
        
        try {
            if (source.id === 'zenodo') {
                return await this.harvestZenodo();
            }
            // Add other source harvesting methods here
            // For now, return mock data for demonstration
            return this.generateMockData(source);
        } catch (error) {
            console.error(`Error harvesting ${source.name}:`, error);
            return [];
        }
    }

    async harvestZenodo() {
        const items = [];
        try {
            const url = 'https://zenodo.org/api/records?size=50&sort=mostrecent';
            const response = await fetch(this.proxy + encodeURIComponent(url));
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            data.hits?.hits?.forEach(item => {
                const metadata = item.metadata || {};
                items.push({
                    id: item.id,
                    title: metadata.title || 'Untitled',
                    authors: metadata.creators?.map(c => c.name) || [],
                    description: this.cleanDescription(metadata.description),
                    keywords: [...(metadata.keywords || []), ...(metadata.subjects?.map(s => s.term) || [])],
                    year: new Date(metadata.publication_date || Date.now()).getFullYear(),
                    doi: metadata.doi,
                    url: item.links?.html,
                    source: 'Zenodo',
                    type: 'research',
                    content_type: metadata.resource_type?.title || 'Dataset'
                });
            });
            
            console.log(`✅ Harvested ${items.length} items from Zenodo`);
        } catch (error) {
            console.error('Error fetching Zenodo:', error);
        }
        
        return items;
    }

    generateMockData(source) {
        // Generate mock data for demonstration
        const mockItems = [];
        const types = {
            research: ['Dataset', 'Software', 'Collection'],
            articles: ['Research Article', 'Review Paper', 'Conference Paper'],
            thesis: ['PhD Thesis', 'Master Thesis', 'Dissertation']
        };
        
        for (let i = 0; i < 5; i++) {
            mockItems.push({
                id: `${source.id}-${i}-${Date.now()}`,
                title: `Sample ${source.type} from ${source.name} - ${i + 1}`,
                authors: ['Researcher A', 'Researcher B', 'Researcher C'],
                description: `This is a sample ${source.type} item harvested from ${source.name}. It contains research data and metadata for demonstration purposes.`,
                keywords: ['sample', 'research', 'data', 'demonstration'],
                year: 2023 + (i % 3),
                doi: `10.1234/sample-${source.id}-${i}`,
                url: `https://example.com/${source.id}/${i}`,
                source: source.name,
                type: source.type,
                content_type: types[source.type]?.[i % types[source.type].length] || 'Research'
            });
        }
        
        console.log(`✅ Generated ${mockItems.length} mock items from ${source.name}`);
        return mockItems;
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

    cleanDescription(description) {
        if (!description) return 'No description available';
        // Remove HTML tags and limit length
        return description.replace(/<[^>]*>/g, '').substring(0, 200) + '...';
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
                
                // Update UI to reflect loaded sources
                this.sources.forEach(source => {
                    const checkbox = document.querySelector(`[data-source-id="${source.id}"]`);
                    if (checkbox) {
                        checkbox.checked = source.enabled;
                    }
                    const sourceCard = document.querySelector(`[data-source-id="${source.id}"]`)?.closest('.source-card');
                    if (sourceCard) {
                        sourceCard.classList.toggle('active', source.enabled);
                    }
                });
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
        alert('Download functionality would be implemented here');
    }

    viewItem(itemId) {
        console.log('View item:', itemId);
        // Find the item and open its URL
        let targetItem = null;
        for (const [type, items] of this.datasets) {
            const item = items.find(i => i.id === itemId);
            if (item) {
                targetItem = item;
                break;
            }
        }
        
        if (targetItem && targetItem.url) {
            window.open(targetItem.url, '_blank');
        } else {
            alert('No URL available for this item');
        }
    }
}

// Initialize the application
const app = new InquiryBase();
