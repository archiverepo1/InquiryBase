const WORKER_URL = 'https://inquirybase.archiverepo1.workers.dev/';

class QDataHarvester {
    constructor() {
        this.allData = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.pageSize = 12;
        this.totalPages = 1;
        this.isSearching = false;
        this.currentSourceType = 'all';
        this.currentQuery = '';
        
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeFilters();
        this.loadFromStorage();
    }
    
    initializeElements() {
        // Search elements
        this.searchInput = document.querySelector('.search-input');
        this.searchButton = document.querySelector('.search-button');
        this.sourceButtons = document.querySelectorAll('.source-button');
        this.advancedToggle = document.querySelector('.advanced-toggle');
        this.advancedSearch = document.querySelector('.advanced-search');
        this.booleanOptions = document.querySelectorAll('.boolean-option');
        
        // Results elements
        this.resultsSection = document.querySelector('.results-section');
        this.clearButton = document.querySelector('.clear-button');
        this.progressBar = document.querySelector('.progress');
        this.harvestStatus = document.querySelector('.harvest-status');
        
        // Data display elements
        this.dataCardsContainer = document.getElementById('dataCardsContainer');
        this.resultsCount = document.getElementById('resultsCount');
        this.yearFilter = document.getElementById('yearFilter');
        this.sourceFilter = document.getElementById('sourceFilter');
        this.typeFilter = document.getElementById('typeFilter');
        this.sortFilter = document.getElementById('sortFilter');
        this.searchInResults = document.getElementById('searchInResults');
        this.searchInResultsButton = document.getElementById('searchInResultsButton');
        this.pagination = document.getElementById('pagination');
        this.firstPageBtn = document.getElementById('firstPage');
        this.prevPageBtn = document.getElementById('prevPage');
        this.nextPageBtn = document.getElementById('nextPage');
        this.lastPageBtn = document.getElementById('lastPage');
        this.pageInfo = document.getElementById('pageInfo');
        this.resetFiltersBtn = document.querySelector('.reset-filters');
        
        // Other elements
        this.emailButton = document.querySelector('.email-button');
    }
    
    initializeEventListeners() {
        // Search functionality
        this.searchButton.addEventListener('click', () => this.performSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });
        
        // Source buttons
        this.sourceButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.sourceButtons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.currentSourceType = e.target.dataset.type;
                
                // If there's a current query, perform search with the selected source type
                if (this.currentQuery) {
                    this.performSearch();
                }
            });
        });
        
        // Advanced filters
        this.advancedToggle.addEventListener('click', () => {
            this.advancedSearch.classList.toggle('active');
        });
        
        // Boolean options
        this.booleanOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                this.booleanOptions.forEach(opt => opt.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // Clear results button
        this.clearButton.addEventListener('click', () => this.clearResults());
        
        // Filter events
        this.yearFilter.addEventListener('change', () => this.applyFilters());
        this.sourceFilter.addEventListener('change', () => this.applyFilters());
        this.typeFilter.addEventListener('change', () => this.applyFilters());
        this.sortFilter.addEventListener('change', () => this.applyFilters());
        
        // Reset filters button
        this.resetFiltersBtn.addEventListener('click', () => this.resetFilters());
        
        // Search within results
        this.searchInResultsButton.addEventListener('click', () => this.searchWithinResults());
        this.searchInResults.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchWithinResults();
        });
        
        // Pagination
        this.firstPageBtn.addEventListener('click', () => this.goToPage(1));
        this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        this.nextPageBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        this.lastPageBtn.addEventListener('click', () => this.goToPage(this.totalPages));
        
        // Email button
        this.emailButton.addEventListener('click', () => {
            window.location.href = 'mailto:contact@qdataresearch.com?subject=Q%20Data%20Platform%20Inquiry';
        });
        
        // Event delegation for card actions
        this.dataCardsContainer.addEventListener('click', (e) => {
            const cardAction = e.target.closest('.card-action');
            if (!cardAction) return;
            
            const card = cardAction.closest('.data-card');
            if (!card) return;
            
            const itemId = card.dataset.itemId;
            if (!itemId) return;
            
            const actionType = cardAction.dataset.action;
            
            switch (actionType) {
                case 'view':
                    this.viewItem(itemId);
                    break;
                case 'download':
                    this.downloadItem(itemId);
                    break;
                case 'zotero':
                    this.saveToZotero(itemId);
                    break;
            }
        });
    }
    
    initializeFilters() {
        // Initialize year filter
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= 2000; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            this.yearFilter.appendChild(option);
        }
        
        // Initialize source filter
        const sources = [
            'Zenodo', 'OSF', 'Figshare', 'Mendeley Data', 'Dryad',
            'Open UCT', 'SUNScholar', 'UP Repository', 'UFS Scholar', 'UNisa DSpace',
            'UCT Theses', 'SUNScholar Theses', 'UP Theses', 'UFS Theses', 'UNisa Theses'
        ];
        sources.forEach(source => {
            const option = document.createElement('option');
            option.value = source;
            option.textContent = source;
            this.sourceFilter.appendChild(option);
        });
    }
    
    async performSearch() {
        const query = this.searchInput.value.trim();
        if (!query) {
            alert('Please enter a search term');
            return;
        }
        
        this.currentQuery = query;
        this.isSearching = true;
        this.resultsSection.classList.add('active');
        this.harvestStatus.textContent = 'Searching repositories...';
        this.progressBar.style.width = '0%';
        
        try {
            // Get sources based on current selection
            const sources = this.getSourcesByType(this.currentSourceType);
            let allResults = [];
            
            // Search each source
            for (let i = 0; i < sources.length; i++) {
                const source = sources[i];
                const progress = ((i / sources.length) * 80).toFixed(0);
                this.harvestStatus.textContent = `Searching ${source.name}...`;
                this.progressBar.style.width = `${progress}%`;
                
                try {
                    const results = await this.searchSource(source, query);
                    allResults = allResults.concat(results);
                    
                    // Update display progressively
                    this.allData = allResults;
                    this.filteredData = [...this.allData];
                    this.updateResultsDisplay();
                    
                } catch (error) {
                    console.error(`Failed to search ${source.name}:`, error);
                }
                
                // Small delay between sources
                await this.delay(500);
            }
            
            this.harvestStatus.textContent = `Search complete! Found ${allResults.length} results`;
            this.progressBar.style.width = '100%';
            
            // Save to localStorage
            this.saveToStorage();
            
            setTimeout(() => {
                this.harvestStatus.textContent = 'Ready for new search';
            }, 3000);
            
        } catch (error) {
            console.error('Search failed:', error);
            this.harvestStatus.textContent = 'Search failed - check console for details';
        }
        
        this.isSearching = false;
    }
    
    async searchSource(source, query) {
        console.log(`Searching ${source.name} for: ${query}`);
        
        try {
            const apiUrl = this.getSearchApiUrl(source.id, query);
            const proxyUrl = `${WORKER_URL}/api/proxy?url=${encodeURIComponent(apiUrl)}`;
            
            console.log(`Fetching from: ${apiUrl}`);
            
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const records = this.parseApiResponse(source.id, data);
            
            console.log(`✅ Found ${records.length} records from ${source.name}`);
            return records;
            
        } catch (error) {
            console.error(`Failed to search ${source.name}:`, error);
            // Return empty array if search fails
            return [];
        }
    }
    
    getSearchApiUrl(sourceId, query) {
        const encodedQuery = encodeURIComponent(query);
        
        const searchUrls = {
            'zenodo': `https://zenodo.org/api/records?q=${encodedQuery}&size=50&sort=mostrecent`,
            'figshare': `https://api.figshare.com/v2/articles?search=${encodedQuery}&page=1&page_size=50`,
            'osf': `https://api.osf.io/v2/nodes/?filter[title]=${encodedQuery}&page=1&page_size=50`,
            'dryad': `https://datadryad.org/api/v2/search?q=${encodedQuery}&page=1&per_page=50`,
            'mendeley': `https://data.mendeley.com/api/datasets?search=${encodedQuery}&page=1&limit=50`,
            'uct': `https://open.uct.ac.za/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=collection&from=2000-01-01`,
            'sun': `https://scholar.sun.ac.za/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=collection&from=2000-01-01`,
            'up': `https://repository.up.ac.za/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=collection&from=2000-01-01`
        };
        
        return searchUrls[sourceId] || searchUrls.zenodo;
    }
    
    getSourcesByType(type) {
        const allSources = [
            { id: 'zenodo', name: 'Zenodo', type: 'research' },
            { id: 'figshare', name: 'Figshare', type: 'research' },
            { id: 'osf', name: 'OSF', type: 'research' },
            { id: 'dryad', name: 'Dryad', type: 'research' },
            { id: 'mendeley', name: 'Mendeley Data', type: 'research' },
            { id: 'uct', name: 'Open UCT', type: 'articles' },
            { id: 'sun', name: 'SUNScholar', type: 'articles' },
            { id: 'up', name: 'UP Repository', type: 'articles' },
            { id: 'ufs', name: 'UFS Scholar', type: 'articles' },
            { id: 'unisa', name: 'UNisa DSpace', type: 'articles' }
        ];
        
        if (type === 'all') return allSources;
        return allSources.filter(source => source.type === type);
    }
    
    parseApiResponse(sourceId, data) {
        switch (sourceId) {
            case 'zenodo':
                return data.hits?.hits?.map(item => ({
                    id: `zenodo-${item.id}`,
                    title: item.metadata?.title || 'Untitled',
                    authors: item.metadata?.creators?.map(c => c.name) || ['Unknown'],
                    description: this.cleanDescription(item.metadata?.description) || 'No description available',
                    keywords: item.metadata?.keywords || item.metadata?.subjects?.map(s => s.term) || ['research', 'data'],
                    year: new Date(item.metadata?.publication_date || Date.now()).getFullYear(),
                    source: 'Zenodo',
                    type: 'research',
                    identifier: item.metadata?.doi || item.links?.html,
                    identifierType: item.metadata?.doi ? 'DOI' : 'URL',
                    url: item.links?.html,
                    downloadUrl: item.links?.download
                })) || [];
                
            case 'figshare':
                return data.map(item => ({
                    id: `figshare-${item.id}`,
                    title: item.title || 'Untitled',
                    authors: item.authors ? item.authors.map(a => a.full_name) : ['Unknown'],
                    description: this.cleanDescription(item.description) || 'No description available',
                    keywords: item.tags || ['research', 'data'],
                    year: new Date(item.published_date || Date.now()).getFullYear(),
                    source: 'Figshare',
                    type: 'research',
                    identifier: item.doi || item.url_public_html,
                    identifierType: item.doi ? 'DOI' : 'URL',
                    url: item.url_public_html,
                    downloadUrl: item.files?.[0]?.download_url
                })) || [];
                
            case 'osf':
                return data.data?.map(item => ({
                    id: `osf-${item.id}`,
                    title: item.attributes?.title || 'Untitled',
                    authors: [item.relationships?.contributors?.data?.length ? 'Multiple contributors' : 'Unknown'],
                    description: this.cleanDescription(item.attributes?.description) || 'No description available',
                    keywords: item.attributes?.tags || ['research', 'data'],
                    year: new Date(item.attributes?.date_created || Date.now()).getFullYear(),
                    source: 'OSF',
                    type: 'research',
                    identifier: item.attributes?.doi || item.links?.html,
                    identifierType: item.attributes?.doi ? 'DOI' : 'URL',
                    url: item.links?.html,
                    downloadUrl: item.links?.download
                })) || [];
                
            default:
                // For other sources, try to parse generic structure
                return this.parseGenericResponse(sourceId, data);
        }
    }
    
    parseGenericResponse(sourceId, data) {
        // Try to handle various API response formats
        const records = [];
        
        // Check if data has a results array
        const resultsArray = data.results || data.records || data.data || data.hits?.hits || [data];
        
        resultsArray.forEach(item => {
            // Extract common fields from different API structures
            const record = {
                id: `${sourceId}-${item.id || item.doi || Math.random().toString(36).substr(2, 9)}`,
                title: item.title || item.metadata?.title || 'Untitled',
                authors: this.extractAuthors(item),
                description: this.cleanDescription(item.description || item.metadata?.description || item.abstract),
                keywords: this.extractKeywords(item),
                year: this.extractYear(item),
                source: this.getSourceName(sourceId),
                type: this.getSourceType(sourceId),
                identifier: item.doi || item.url || item.links?.html || item.handle,
                identifierType: item.doi ? 'DOI' : (item.handle ? 'Handle' : 'URL'),
                url: item.url || item.links?.html || (item.doi ? `https://doi.org/${item.doi}` : ''),
                downloadUrl: item.downloadUrl || item.links?.download || item.files?.[0]?.download_url
            };
            
            records.push(record);
        });
        
        return records;
    }
    
    extractAuthors(item) {
        if (item.authors) {
            return Array.isArray(item.authors) ? item.authors.map(a => a.name || a.full_name) : [item.authors];
        }
        if (item.metadata?.creators) {
            return item.metadata.creators.map(c => c.name);
        }
        return ['Unknown'];
    }
    
    extractKeywords(item) {
        if (item.keywords) return item.keywords;
        if (item.tags) return item.tags;
        if (item.metadata?.keywords) return item.metadata.keywords;
        if (item.metadata?.subjects) return item.metadata.subjects.map(s => s.term);
        return ['research', 'data'];
    }
    
    extractYear(item) {
        const dateStr = item.publication_date || item.published_date || item.date_created || item.metadata?.publication_date;
        if (dateStr) {
            return new Date(dateStr).getFullYear();
        }
        return new Date().getFullYear();
    }
    
    getSourceName(sourceId) {
        const sourceMap = {
            'zenodo': 'Zenodo',
            'figshare': 'Figshare',
            'osf': 'OSF',
            'dryad': 'Dryad',
            'mendeley': 'Mendeley Data',
            'uct': 'Open UCT',
            'sun': 'SUNScholar',
            'up': 'UP Repository',
            'ufs': 'UFS Scholar',
            'unisa': 'UNisa DSpace'
        };
        return sourceMap[sourceId] || sourceId;
    }
    
    getSourceType(sourceId) {
        const researchSources = ['zenodo', 'figshare', 'osf', 'dryad', 'mendeley'];
        return researchSources.includes(sourceId) ? 'research' : 'articles';
    }
    
    cleanDescription(description) {
        if (!description) return 'No description available';
        // Remove HTML tags and limit length
        const cleanText = description.replace(/<[^>]*>/g, '');
        return cleanText.length > 200 ? cleanText.substring(0, 200) + '...' : cleanText;
    }
    
    clearResults() {
        this.allData = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.currentQuery = '';
        
        // Reset display to initial state
        this.dataCardsContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No search results yet</h3>
                <p>Enter a search term to find research data</p>
            </div>
        `;
        
        // Reset results count
        this.resultsCount.textContent = '0 results';
        
        // Reset pagination
        this.updatePagination();
        
        // Clear search input
        this.searchInput.value = '';
        
        // Reset filters
        this.resetFilters();
        
        // Hide results section
        this.resultsSection.classList.remove('active');
        
        // Clear localStorage
        localStorage.removeItem('qDataSearch');
        
        // Reset progress bar
        this.progressBar.style.width = '0%';
        this.harvestStatus.textContent = 'Ready to search';
    }
    
    resetFilters() {
        this.yearFilter.value = '';
        this.sourceFilter.value = '';
        this.typeFilter.value = '';
        this.sortFilter.value = 'relevance';
        this.searchInResults.value = '';
        
        // Reapply filters (which will show all data)
        this.applyFilters();
    }
    
    applyFilters() {
        let filtered = [...this.allData];
        
        // Apply source type filter
        if (this.currentSourceType !== 'all') {
            filtered = filtered.filter(item => item.type === this.currentSourceType);
        }
        
        // Apply year filter
        if (this.yearFilter.value) {
            filtered = filtered.filter(item => item.year == this.yearFilter.value);
        }
        
        // Apply source filter
        if (this.sourceFilter.value) {
            filtered = filtered.filter(item => item.source === this.sourceFilter.value);
        }
        
        // Apply type filter
        if (this.typeFilter.value) {
            filtered = filtered.filter(item => item.type === this.typeFilter.value);
        }
        
        // Apply sorting
        const sortBy = this.sortFilter.value;
        if (sortBy === 'year') {
            filtered.sort((a, b) => b.year - a.year);
        } else if (sortBy === 'year_asc') {
            filtered.sort((a, b) => a.year - b.year);
        } else if (sortBy === 'title') {
            filtered.sort((a, b) => a.title.localeCompare(b.title));
        }
        // 'relevance' is the default order
        
        this.filteredData = filtered;
        this.currentPage = 1;
        this.updateResultsDisplay();
    }
    
    searchWithinResults() {
        const query = this.searchInResults.value.toLowerCase().trim();
        
        if (!query) {
            this.filteredData = [...this.allData];
        } else {
            this.filteredData = this.allData.filter(item => 
                item.title.toLowerCase().includes(query) ||
                item.description.toLowerCase().includes(query) ||
                item.authors.some(author => author.toLowerCase().includes(query)) ||
                item.keywords.some(keyword => keyword.toLowerCase().includes(query))
            );
        }
        
        this.currentPage = 1;
        this.updateResultsDisplay();
    }
    
    updateResultsDisplay() {
        this.totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        
        // Update results count
        this.resultsCount.textContent = `${this.filteredData.length.toLocaleString()} results`;
        
        // Display current page
        this.displayCurrentPage();
        
        // Update pagination
        this.updatePagination();
    }
    
    displayCurrentPage() {
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        this.displayDataCards(pageData);
    }
    
    displayDataCards(data) {
        this.dataCardsContainer.innerHTML = '';
        
        if (data.length === 0) {
            this.dataCardsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h3>No results found</h3>
                    <p>Try adjusting your filters or search terms</p>
                </div>
            `;
            return;
        }
        
        data.forEach(item => {
            const card = document.createElement('div');
            card.className = 'data-card';
            card.dataset.itemId = item.id;
            
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-type">${item.type.toUpperCase()}</div>
                    <div class="card-source">${item.source}</div>
                </div>
                <div class="card-body">
                    <h3 class="card-title">${item.title}</h3>
                    <div class="card-authors">${Array.isArray(item.authors) ? item.authors.join(', ') : item.authors}</div>
                    <p class="card-description">${item.description}</p>
                    <div class="card-keywords">
                        ${item.keywords.slice(0, 4).map(keyword => 
                            `<span class="keyword-tag">${keyword}</span>`
                        ).join('')}
                        ${item.keywords.length > 4 ? `<span class="keyword-tag">+${item.keywords.length - 4} more</span>` : ''}
                    </div>
                </div>
                <div class="card-footer">
                    <div class="card-meta">
                        <span><i class="far fa-calendar"></i> ${item.year}</span>
                        <span>${item.identifierType}: <a href="${item.url}" target="_blank" class="${item.identifierType === 'DOI' ? 'doi-link' : 'handle-link'}">${item.identifier}</a></span>
                    </div>
                    <div class="card-actions">
                        <button class="card-action" data-action="view" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="card-action" data-action="download" title="Download">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="card-action" data-action="zotero" title="Save to Zotero">
                            <i class="fas fa-bookmark"></i>
                        </button>
                    </div>
                </div>
            `;
            
            this.dataCardsContainer.appendChild(card);
        });
    }
    
    updatePagination() {
        this.firstPageBtn.disabled = this.currentPage === 1;
        this.prevPageBtn.disabled = this.currentPage === 1;
        this.nextPageBtn.disabled = this.currentPage === this.totalPages;
        this.lastPageBtn.disabled = this.currentPage === this.totalPages;
        
        this.pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        
        // Show/hide pagination
        if (this.totalPages <= 1) {
            this.pagination.style.display = 'none';
        } else {
            this.pagination.style.display = 'flex';
        }
    }
    
    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        
        this.currentPage = page;
        this.displayCurrentPage();
        this.updatePagination();
    }
    
    viewItem(itemId) {
        const item = this.allData.find(i => i.id === itemId);
        if (item && item.url) {
            window.open(item.url, '_blank');
        } else {
            alert('No URL available for this item');
        }
    }
    
    downloadItem(itemId) {
        const item = this.allData.find(i => i.id === itemId);
        if (item) {
            if (item.downloadUrl) {
                window.open(item.downloadUrl, '_blank');
            } else if (item.url) {
                window.open(item.url, '_blank');
            } else {
                alert(`Download URL not available for: ${item.title}`);
            }
        }
    }
    
    saveToZotero(itemId) {
        const item = this.allData.find(i => i.id === itemId);
        if (item) {
            // Simple Zotero integration
            const zoteroUrl = `https://www.zotero.org/select/items?uri=${encodeURIComponent(item.url)}`;
            window.open(zoteroUrl, '_blank');
        }
    }
    
    saveToStorage() {
        const data = {
            searchData: this.allData,
            query: this.currentQuery,
            timestamp: new Date().toISOString()
        };
        try {
            localStorage.setItem('qDataSearch', JSON.stringify(data));
        } catch (e) {
            console.warn('Could not save to localStorage:', e);
        }
    }
    
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('qDataSearch');
            if (saved) {
                const data = JSON.parse(saved);
                this.allData = data.searchData || [];
                this.currentQuery = data.query || '';
                this.filteredData = [...this.allData];
                
                if (this.allData.length > 0) {
                    this.resultsSection.classList.add('active');
                    this.searchInput.value = this.currentQuery;
                    this.updateResultsDisplay();
                }
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.qDataHarvester = new QDataHarvester();
});
