class QDataResearchHub {
    constructor() {
        this.isHarvesting = false;
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalResults = 0;
        this.searchResults = [];
        this.filteredResults = [];
        this.selectedItems = new Set();
        this.currentSourceType = 'all';
        this.filters = {
            year: 'all',
            author: 'all',
            contentType: 'all',
            sortBy: 'relevance'
        };
        
        this.initializeEventListeners();
        this.initializeYearFilter();
    }

    initializeEventListeners() {
        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => this.performSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Source buttons
        document.querySelectorAll('.source-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.source-button').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentSourceType = e.target.dataset.type;
                this.applyFilters();
            });
        });

        // Advanced filters
        document.getElementById('advancedToggle').addEventListener('click', () => {
            document.getElementById('advancedFilters').classList.toggle('active');
        });

        document.querySelectorAll('.boolean-option').forEach(option => {
            option.addEventListener('click', (e) => {
                document.querySelectorAll('.boolean-option').forEach(o => o.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        document.getElementById('applyFilters').addEventListener('click', () => {
            this.applyAdvancedFilters();
        });

        // Harvest controls
        document.getElementById('harvestBtn').addEventListener('click', () => this.startHarvesting());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopHarvesting());
        document.getElementById('expandBtn').addEventListener('click', () => this.expandSearch());

        // Results filters
        document.getElementById('contentTypeFilter').addEventListener('change', (e) => {
            this.filters.contentType = e.target.value;
            this.applyFilters();
        });

        document.getElementById('yearFilter').addEventListener('change', (e) => {
            this.filters.year = e.target.value;
            this.applyFilters();
        });

        document.getElementById('authorResultsFilter').addEventListener('change', (e) => {
            this.filters.author = e.target.value;
            this.applyFilters();
        });

        document.getElementById('sortFilter').addEventListener('change', (e) => {
            this.filters.sortBy = e.target.value;
            this.applyFilters();
        });

        // Zotero export
        document.getElementById('zoteroExport').addEventListener('click', () => this.exportToZotero());

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => this.previousPage());
        document.getElementById('nextPage').addEventListener('click', () => this.nextPage());

        // Email button
        document.getElementById('emailBtn').addEventListener('click', () => {
            window.location.href = 'mailto:contact@qdataresearch.com?subject=Q%20Data%20Platform%20Inquiry';
        });
    }

    initializeYearFilter() {
        const yearFilter = document.getElementById('yearFilter');
        const currentYear = new Date().getFullYear();
        
        for (let year = currentYear; year >= 1950; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        }
    }

    async performSearch() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) {
            alert('Please enter a search query');
            return;
        }

        this.showLoading();
        
        try {
            // Simulate API call - replace with actual API endpoint
            const results = await this.simulateSearch(query);
            this.searchResults = results;
            this.applyFilters();
            
            document.getElementById('resultsSection').classList.add('active');
            document.getElementById('resultsFilters').style.display = 'flex';
            
        } catch (error) {
            console.error('Search failed:', error);
            alert('Search failed. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    async simulateSearch(query) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Generate mock data
        const mockResults = [];
        const sources = ['Zenodo', 'Figshare', 'Open UCT', 'SUNScholar', 'UP Repository'];
        const types = ['research', 'articles', 'theses'];
        const authors = [
            'Smith, John', 'Johnson, Mary', 'Williams, David', 'Brown, Sarah',
            'Davis, Michael', 'Miller, Jennifer', 'Wilson, Christopher'
        ];

        for (let i = 1; i <= 50; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const year = 2015 + Math.floor(Math.random() * 10);
            
            mockResults.push({
                id: `result-${i}`,
                title: `${query} Research Paper ${i} - ${this.capitalizeFirstLetter(type)}`,
                authors: this.getRandomAuthors(authors),
                abstract: `This is a sample abstract for research about ${query}. This paper discusses important findings in the field and provides valuable insights.`,
                year: year,
                type: type,
                source: sources[Math.floor(Math.random() * sources.length)],
                keywords: [query, 'research', 'data', 'analysis', 'study'],
                doi: `10.1234/example.${i}`,
                url: `https://example.com/paper/${i}`
            });
        }

        return mockResults;
    }

    getRandomAuthors(authorsList) {
        const count = 1 + Math.floor(Math.random() * 3);
        const shuffled = [...authorsList].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    applyFilters() {
        let filtered = [...this.searchResults];

        // Apply source type filter
        if (this.currentSourceType !== 'all') {
            filtered = filtered.filter(item => item.type === this.currentSourceType);
        }

        // Apply content type filter
        if (this.filters.contentType !== 'all') {
            filtered = filtered.filter(item => item.type === this.filters.contentType);
        }

        // Apply year filter
        if (this.filters.year !== 'all') {
            filtered = filtered.filter(item => item.year === parseInt(this.filters.year));
        }

        // Apply author filter
        if (this.filters.author !== 'all') {
            filtered = filtered.filter(item => 
                item.authors.some(author => 
                    author.toLowerCase().includes(this.filters.author.toLowerCase())
                )
            );
        }

        // Apply sorting
        filtered = this.sortResults(filtered, this.filters.sortBy);

        this.filteredResults = filtered;
        this.totalResults = filtered.length;
        this.currentPage = 1;
        this.displayResults();
        this.updateFiltersUI();
    }

    sortResults(results, sortBy) {
        switch (sortBy) {
            case 'date':
                return results.sort((a, b) => b.year - a.year);
            case 'title':
                return results.sort((a, b) => a.title.localeCompare(b.title));
            case 'relevance':
            default:
                return results; // Default order (as returned by API)
        }
    }

    updateFiltersUI() {
        // Update author filter options
        const authorFilter = document.getElementById('authorResultsFilter');
        const authors = [...new Set(this.searchResults.flatMap(item => item.authors))].slice(0, 20);
        
        // Keep current selection
        const currentValue = authorFilter.value;
        authorFilter.innerHTML = '<option value="all">All Authors</option>';
        
        authors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            authorFilter.appendChild(option);
        });
        
        // Restore selection if still valid
        if (authors.includes(currentValue)) {
            authorFilter.value = currentValue;
        }
    }

    displayResults() {
        const container = document.getElementById('resultsContainer');
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageResults = this.filteredResults.slice(startIndex, endIndex);

        if (pageResults.length === 0) {
            container.innerHTML = '<div class="no-results">No results found. Try adjusting your search criteria.</div>';
            document.getElementById('pagination').style.display = 'none';
            return;
        }

        container.innerHTML = pageResults.map(result => this.createResultHTML(result)).join('');
        this.updatePagination();
        document.getElementById('pagination').style.display = 'flex';
    }

    createResultHTML(result) {
        const typeLabel = result.type === 'research' ? 'Research Data' : 
                         result.type === 'articles' ? 'Journal Article' : 'Thesis';

        return `
            <div class="result-item" data-id="${result.id}">
                <div class="zotero-meta">
                    ${this.generateZoteroMetadata(result)}
                </div>
                <div class="result-header">
                    <div>
                        <h3 class="result-title">${result.title}</h3>
                        <div class="result-meta">
                            <span class="result-authors">${result.authors.join(', ')}</span> • 
                            <span>${result.year}</span> • 
                            <span>${result.source}</span>
                        </div>
                    </div>
                    <span class="result-type">${typeLabel}</span>
                </div>
                <p class="result-abstract">${result.abstract}</p>
                <div class="result-keywords">
                    ${result.keywords.map(keyword => `<span class="keyword">${keyword}</span>`).join('')}
                </div>
                <div class="result-actions">
                    <span class="result-source">Source: ${result.source}</span>
                    <div class="action-buttons">
                        <button class="action-btn secondary" onclick="app.viewItem('${result.id}')">View</button>
                        <button class="action-btn primary" onclick="app.saveToZotero('${result.id}')">Save to Zotero</button>
                    </div>
                </div>
            </div>
        `;
    }

    generateZoteroMetadata(result) {
        // Generate COinS and other metadata for Zotero detection
        return `
            <span class="Z3988" title="ctx_ver=Z39.88-2004&amp;rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3A${result.type === 'articles' ? 'journal' : 'book'}&amp;rft.title=${encodeURIComponent(result.title)}&amp;rft.date=${result.year}&amp;rft.aulast=${encodeURIComponent(result.authors[0] || '')}"></span>
            <meta name="citation_title" content="${result.title}">
            ${result.authors.map(author => `<meta name="citation_author" content="${author}">`).join('')}
            <meta name="citation_publication_date" content="${result.year}">
            <meta name="citation_abstract" content="${result.abstract}">
            <meta name="citation_type" content="${result.type}">
            <meta name="citation_doi" content="${result.doi}">
            <meta name="citation_pdf_url" content="${result.url}">
        `;
    }

    updatePagination() {
        const totalPages = Math.ceil(this.totalResults / this.pageSize);
        document.getElementById('pageInfo').textContent = `Page ${this.currentPage} of ${totalPages}`;
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage === totalPages;
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.displayResults();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.totalResults / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.displayResults();
        }
    }

    async startHarvesting() {
        if (this.isHarvesting) return;
        
        this.isHarvesting = true;
        document.getElementById('harvestBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'inline-block';
        
        this.updateHarvestStatus('Harvesting data...', 0);
        
        // Simulate harvesting process
        let progress = 0;
        const interval = setInterval(() => {
            if (!this.isHarvesting) {
                clearInterval(interval);
                return;
            }
            
            progress += Math.random() * 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                this.harvestingComplete();
            }
            this.updateHarvestStatus('Harvesting data...', progress);
        }, 500);
    }

    stopHarvesting() {
        this.isHarvesting = false;
        document.getElementById('harvestBtn').style.display = 'inline-block';
        document.getElementById('stopBtn').style.display = 'none';
        this.updateHarvestStatus('Harvest stopped', 0);
    }

    harvestingComplete() {
        this.isHarvesting = false;
        document.getElementById('harvestBtn').style.display = 'inline-block';
        document.getElementById('stopBtn').style.display = 'none';
        this.updateHarvestStatus('Harvest complete!', 100);
        
        // Add some mock harvested data
        this.addHarvestedData();
    }

    addHarvestedData() {
        // Add some additional mock data to simulate harvested results
        const newData = [
            {
                id: `harvested-${Date.now()}-1`,
                title: 'Harvested Research Dataset',
                authors: ['Research Team A'],
                abstract: 'This dataset was harvested from external repositories and contains valuable research data.',
                year: 2024,
                type: 'research',
                source: 'Zenodo',
                keywords: ['harvested', 'dataset', 'research'],
                doi: '10.1234/harvested.1',
                url: 'https://zenodo.org/record/example'
            }
        ];
        
        this.searchResults = [...newData, ...this.searchResults];
        this.applyFilters();
    }

    expandSearch() {
        alert('Expanding search to include additional repositories...');
        // Implementation for expanding search scope
    }

    updateHarvestStatus(message, progress) {
        document.getElementById('harvestStatus').textContent = message;
        document.getElementById('progressBar').style.width = `${progress}%`;
    }

    showLoading() {
        document.getElementById('harvestStatus').textContent = 'Searching...';
        document.getElementById('progressBar').style.width = '30%';
    }

    hideLoading() {
        document.getElementById('progressBar').style.width = '0%';
    }

    applyAdvancedFilters() {
        // Apply advanced search filters
        const titleFilter = document.getElementById('titleFilter').value;
        const authorFilter = document.getElementById('authorFilter').value;
        const dateFilter = document.getElementById('dateFilter').value;
        
        if (titleFilter || authorFilter || dateFilter) {
            alert('Advanced filters applied. This would refine your search criteria.');
            // In a real implementation, this would modify the search query
        }
    }

    viewItem(itemId) {
        const item = this.searchResults.find(r => r.id === itemId);
        if (item && item.url) {
            window.open(item.url, '_blank');
        } else {
            alert('Item URL not available');
        }
    }

    saveToZotero(itemId) {
        const item = this.searchResults.find(r => r.id === itemId);
        if (!item) return;

        // Generate RIS format for Zotero
        const risContent = this.generateRIS([item]);
        
        // Create download
        const blob = new Blob([risContent], { type: 'application/x-research-info-systems' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${item.title.substring(0, 50)}.ris`.replace(/[^a-z0-9]/gi, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('Item saved as RIS file. You can import this into Zotero.');
    }

    exportToZotero() {
        if (this.filteredResults.length === 0) {
            alert('No results to export');
            return;
        }

        const risContent = this.generateRIS(this.filteredResults);
        const blob = new Blob([risContent], { type: 'application/x-research-info-systems' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qdata-export-${new Date().toISOString().split('T')[0]}.ris`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`Exported ${this.filteredResults.length} items to RIS file for Zotero import.`);
    }

    generateRIS(items) {
        let risContent = '';
        
        items.forEach(item => {
            risContent += 'TY  - ' + this.getRISType(item.type) + '\n';
            risContent += 'TI  - ' + item.title + '\n';
            
            item.authors.forEach(author => {
                risContent += 'AU  - ' + author + '\n';
            });
            
            risContent += 'PY  - ' + item.year + '\n';
            risContent += 'AB  - ' + item.abstract + '\n';
            
            if (item.doi) {
                risContent += 'DO  - ' + item.doi + '\n';
            }
            
            if (item.url) {
                risContent += 'UR  - ' + item.url + '\n';
            }
            
            risContent += 'ER  - \n\n';
        });
        
        return risContent;
    }

    getRISType(type) {
        const typeMap = {
            'articles': 'JOUR',
            'research': 'DATA',
            'theses': 'THES'
        };
        return typeMap[type] || 'GEN';
    }
}

// Initialize the application
const app = new QDataResearchHub();
