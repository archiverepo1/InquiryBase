class ResearchHub {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalResults = 0;
        this.searchResults = [];
        this.filteredResults = [];
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
        document.getElementById('searchButton').addEventListener('click', () => this.performSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Source tabs
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentSourceType = e.target.dataset.type;
                if (this.searchResults.length > 0) {
                    this.applyFilters();
                }
            });
        });

        // Advanced filters
        document.getElementById('advancedToggle').addEventListener('click', () => {
            document.getElementById('advancedFilters').classList.toggle('active');
        });

        // Boolean operators
        document.querySelectorAll('.bool-operator').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.bool-operator').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // Harvest controls
        document.getElementById('readyHarvest').addEventListener('click', () => this.startHarvesting());
        document.getElementById('expandSearch').addEventListener('click', () => this.expandSearch());

        // Email button
        document.getElementById('emailButton').addEventListener('click', () => {
            window.location.href = 'mailto:contact@dallaresearch.com?subject=Research%20Hub%20Inquiry';
        });

        // Results modal
        document.getElementById('closeModal').addEventListener('click', () => this.closeResultsModal());
        document.getElementById('resultsModal').addEventListener('click', (e) => {
            if (e.target.id === 'resultsModal') {
                this.closeResultsModal();
            }
        });

        // Results filters
        document.getElementById('contentTypeFilter').addEventListener('change', (e) => {
            this.filters.contentType = e.target.value;
            this.applyFilters();
        });

        document.getElementById('yearFilter').addEventListener('change', (e) => {
            this.filters.year = e.target.value;
            this.applyFilters();
        });

        document.getElementById('authorFilter').addEventListener('change', (e) => {
            this.filters.author = e.target.value;
            this.applyFilters();
        });

        document.getElementById('sortFilter').addEventListener('change', (e) => {
            this.filters.sortBy = e.target.value;
            this.applyFilters();
        });

        // Zotero export
        document.getElementById('exportZotero').addEventListener('click', () => this.exportToZotero());

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => this.previousPage());
        document.getElementById('nextPage').addEventListener('click', () => this.nextPage());
    }

    initializeYearFilter() {
        const yearFilter = document.getElementById('yearFilter');
        const currentYear = new Date().getFullYear();
        
        for (let year = currentYear; year >= 2000; year--) {
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
            const results = await this.simulateSearch(query);
            this.searchResults = results;
            this.openResultsModal();
            this.applyFilters();
            
        } catch (error) {
            console.error('Search failed:', error);
            alert('Search failed. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    async simulateSearch(query) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Generate mock search results
        const mockResults = [];
        const sources = ['Zenodo', 'Figshare', 'PubMed', 'IEEE Xplore', 'arXiv'];
        const types = ['research', 'articles', 'theses'];
        const authors = [
            'Smith, J.', 'Johnson, M.', 'Williams, D.', 'Brown, S.',
            'Davis, M.', 'Miller, J.', 'Wilson, C.', 'Anderson, R.'
        ];

        for (let i = 1; i <= 35; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const year = 2018 + Math.floor(Math.random() * 7);
            
            mockResults.push({
                id: `result-${i}`,
                title: `Research on ${query}: ${this.getTypeDescription(type)} Study ${i}`,
                authors: this.getRandomAuthors(authors),
                abstract: `This study examines various aspects of ${query} using advanced research methodologies. The findings contribute significantly to the field and provide insights for future research directions.`,
                year: year,
                type: type,
                source: sources[Math.floor(Math.random() * sources.length)],
                keywords: [query, 'research', 'analysis', 'study', type, 'academic'],
                doi: `10.1234/research.${i}`,
                url: `https://example.com/research/${i}`
            });
        }

        return mockResults;
    }

    getTypeDescription(type) {
        const descriptions = {
            'research': 'Data-Driven',
            'articles': 'Comprehensive',
            'theses': 'Academic'
        };
        return descriptions[type] || 'Research';
    }

    getRandomAuthors(authorsList) {
        const count = 1 + Math.floor(Math.random() * 3);
        const shuffled = [...authorsList].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    openResultsModal() {
        document.getElementById('resultsModal').classList.add('active');
    }

    closeResultsModal() {
        document.getElementById('resultsModal').classList.remove('active');
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
            case 'relevance':
            default:
                return results;
        }
    }

    updateFiltersUI() {
        // Update author filter options
        const authorFilter = document.getElementById('authorFilter');
        const authors = [...new Set(this.searchResults.flatMap(item => item.authors))].slice(0, 15);
        
        const currentValue = authorFilter.value;
        authorFilter.innerHTML = '<option value="all">All Authors</option>';
        
        authors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            authorFilter.appendChild(option);
        });
        
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
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6c757d;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                    <h4 style="margin-bottom: 8px;">No results found</h4>
                    <p>Try adjusting your search criteria or filters</p>
                </div>
            `;
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
                        <button class="action-btn" onclick="app.viewItem('${result.id}')">View</button>
                        <button class="action-btn primary" onclick="app.saveToZotero('${result.id}')">Save to Zotero</button>
                    </div>
                </div>
            </div>
        `;
    }

    generateZoteroMetadata(result) {
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

    startHarvesting() {
        alert('Harvesting process started. This would connect to research repositories and gather data.');
        // In a real implementation, this would trigger the harvesting process
    }

    expandSearch() {
        alert('Expanding search to include additional research repositories and databases.');
        // In a real implementation, this would broaden the search scope
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

        const risContent = this.generateRIS([item]);
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
        a.download = `researchhub-export-${new Date().toISOString().split('T')[0]}.ris`;
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
            risContent += 'AB  - ' + (item.abstract || 'No abstract available') + '\n';
            
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

    showLoading() {
        const searchBtn = document.getElementById('searchButton');
        const originalText = searchBtn.textContent;
        searchBtn.textContent = 'Searching...';
        searchBtn.disabled = true;
        searchBtn.dataset.originalText = originalText;
    }

    hideLoading() {
        const searchBtn = document.getElementById('searchButton');
        searchBtn.textContent = searchBtn.dataset.originalText || 'Search';
        searchBtn.disabled = false;
    }
}

// Initialize the application
const app = new ResearchHub();
