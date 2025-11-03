class ResearchHarvester {
    constructor() {
        this.currentPage = 1;
        this.totalPages = 1;
        this.results = [];
        this.selectedItems = new Set();
        this.filters = {
            type: [],
            year: [],
            author: [],
            relevance: 'most-relevant'
        };
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => this.performSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Control buttons
        document.getElementById('harvestBtn').addEventListener('click', () => this.startHarvesting());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopHarvesting());
        document.getElementById('expandBtn').addEventListener('click', () => this.expandSearch());

        // Filters
        document.getElementById('typeFilter').addEventListener('change', (e) => this.updateFilters('type', e));
        document.getElementById('yearFilter').addEventListener('change', (e) => this.updateFilters('year', e));
        document.getElementById('authorFilter').addEventListener('change', (e) => this.updateFilters('author', e));
        document.getElementById('relevanceFilter').addEventListener('change', (e) => this.updateFilters('relevance', e));
        document.getElementById('clearFilters').addEventListener('click', () => this.clearFilters());

        // Results actions
        document.getElementById('exportZotero').addEventListener('click', () => this.exportToZotero());
        document.getElementById('selectAll').addEventListener('click', () => this.selectAllResults());
        document.getElementById('prevPage').addEventListener('click', () => this.previousPage());
        document.getElementById('nextPage').addEventListener('click', () => this.nextPage());
    }

    async performSearch() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) return;

        this.showLoading();
        
        try {
            // Call Cloudflare Worker API
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    filters: this.filters,
                    page: this.currentPage
                })
            });

            const data = await response.json();
            this.displayResults(data);
        } catch (error) {
            console.error('Search failed:', error);
            this.showError('Search failed. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    displayResults(data) {
        this.results = data.results || [];
        this.totalPages = data.totalPages || 1;
        
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.innerHTML = '';

        this.results.forEach((result, index) => {
            const resultElement = this.createResultElement(result, index);
            resultsContainer.appendChild(resultElement);
        });

        this.updateFiltersFromResults(data.availableFilters);
        this.showResultsSection();
        this.updatePagination();
    }

    createResultElement(result, index) {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <input type="checkbox" class="result-checkbox" data-index="${index}">
            <div class="result-content">
                <a href="${result.url}" class="result-title" target="_blank">${result.title}</a>
                <div class="result-meta">
                    ${result.authors ? `Authors: ${result.authors.join(', ')} | ` : ''}
                    ${result.year ? `Year: ${result.year} | ` : ''}
                    ${result.source ? `Source: ${result.source}` : ''}
                </div>
                ${result.abstract ? `<div class="result-abstract">${result.abstract}</div>` : ''}
                <div class="result-actions">
                    <span class="result-type">${result.type}</span>
                    <button class="btn btn-link save-to-zotero" data-index="${index}">Save to Zotero</button>
                </div>
            </div>
            <!-- Zotero metadata -->
            <div class="zotero-meta">
                ${this.generateZoteroMetadata(result)}
            </div>
        `;

        // Add event listeners
        div.querySelector('.result-checkbox').addEventListener('change', (e) => {
            this.toggleItemSelection(index, e.target.checked);
        });

        div.querySelector('.save-to-zotero').addEventListener('click', () => {
            this.saveSingleToZotero(result);
        });

        return div;
    }

    generateZoteroMetadata(result) {
        // Generate COinS and other metadata for Zotero detection
        return `
            <span class="Z3988" title="ctx_ver=Z39.88-2004&amp;rft_val_fmt=info%3Aofi%2Ffmt%3Akev%3Amtx%3A${result.type === 'article' ? 'journal' : 'book'}&amp;rft.title=${encodeURIComponent(result.title)}&amp;rft.date=${result.year}&amp;${result.authors ? `rft.au=${encodeURIComponent(result.authors[0])}` : ''}"></span>
            <meta name="citation_title" content="${result.title}">
            ${result.authors ? result.authors.map(author => `<meta name="citation_author" content="${author}">`).join('') : ''}
            <meta name="citation_publication_date" content="${result.year}">
            <meta name="citation_abstract" content="${result.abstract || ''}">
            <meta name="citation_type" content="${result.type}">
            ${result.doi ? `<meta name="citation_doi" content="${result.doi}">` : ''}
            ${result.url ? `<meta name="citation_pdf_url" content="${result.url}">` : ''}
        `;
    }

    updateFiltersFromResults(availableFilters) {
        // Update year filter options
        const yearFilter = document.getElementById('yearFilter');
        if (availableFilters && availableFilters.years) {
            yearFilter.innerHTML = '';
            availableFilters.years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearFilter.appendChild(option);
            });
        }

        // Update author filter options
        const authorFilter = document.getElementById('authorFilter');
        if (availableFilters && availableFilters.authors) {
            authorFilter.innerHTML = '';
            availableFilters.authors.forEach(author => {
                const option = document.createElement('option');
                option.value = author;
                option.textContent = author;
                authorFilter.appendChild(option);
            });
        }

        // Show filters section
        document.getElementById('filtersSection').style.display = 'block';
    }

    updateFilters(filterType, event) {
        if (filterType === 'relevance') {
            this.filters.relevance = event.target.value;
        } else {
            const selectedOptions = Array.from(event.target.selectedOptions).map(option => option.value);
            this.filters[filterType] = selectedOptions;
        }
        
        // Re-run search with new filters
        this.currentPage = 1;
        this.performSearch();
    }

    clearFilters() {
        this.filters = {
            type: [],
            year: [],
            author: [],
            relevance: 'most-relevant'
        };
        
        // Reset filter UI
        document.getElementById('typeFilter').selectedIndex = -1;
        document.getElementById('yearFilter').selectedIndex = -1;
        document.getElementById('authorFilter').selectedIndex = -1;
        document.getElementById('relevanceFilter').value = 'most-relevant';
        
        this.currentPage = 1;
        this.performSearch();
    }

    toggleItemSelection(index, selected) {
        if (selected) {
            this.selectedItems.add(index);
        } else {
            this.selectedItems.delete(index);
        }
        this.updateExportButton();
    }

    selectAllResults() {
        const checkboxes = document.querySelectorAll('.result-checkbox');
        const selectAllBtn = document.getElementById('selectAll');
        
        const allSelected = this.selectedItems.size === this.results.length;
        
        checkboxes.forEach((checkbox, index) => {
            checkbox.checked = !allSelected;
            if (!allSelected) {
                this.selectedItems.add(index);
            } else {
                this.selectedItems.delete(index);
            }
        });
        
        selectAllBtn.textContent = allSelected ? 'Select All' : 'Deselect All';
        this.updateExportButton();
    }

    updateExportButton() {
        const exportBtn = document.getElementById('exportZotero');
        exportBtn.disabled = this.selectedItems.size === 0;
        exportBtn.textContent = `Export to Zotero (${this.selectedItems.size})`;
    }

    async exportToZotero() {
        if (this.selectedItems.size === 0) return;

        const selectedResults = Array.from(this.selectedItems).map(index => this.results[index]);
        
        try {
            // Create RIS format for Zotero import
            const risContent = this.generateRIS(selectedResults);
            
            // Download RIS file
            const blob = new Blob([risContent], { type: 'application/x-research-info-systems' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'research_harvest.ris';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Also try to use Zotero connector if available
            if (typeof Zotero !== 'undefined') {
                this.saveToZoteroConnector(selectedResults);
            }
            
        } catch (error) {
            console.error('Export failed:', error);
            this.showError('Export failed. Please try downloading the RIS file manually.');
        }
    }

    generateRIS(results) {
        let risContent = '';
        
        results.forEach(result => {
            risContent += 'TY  - ' + this.getRISType(result.type) + '\n';
            risContent += 'TI  - ' + result.title + '\n';
            
            if (result.authors) {
                result.authors.forEach(author => {
                    risContent += 'AU  - ' + author + '\n';
                });
            }
            
            if (result.year) {
                risContent += 'PY  - ' + result.year + '\n';
            }
            
            if (result.abstract) {
                risContent += 'AB  - ' + result.abstract + '\n';
            }
            
            if (result.doi) {
                risContent += 'DO  - ' + result.doi + '\n';
            }
            
            if (result.url) {
                risContent += 'UR  - ' + result.url + '\n';
            }
            
            risContent += 'ER  - \n\n';
        });
        
        return risContent;
    }

    getRISType(type) {
        const typeMap = {
            'article': 'JOUR',
            'dataset': 'DATA',
            'thesis': 'THES'
        };
        return typeMap[type] || 'GEN';
    }

    saveSingleToZotero(result) {
        // Implementation for saving single item to Zotero
        const risContent = this.generateRIS([result]);
        
        const blob = new Blob([risContent], { type: 'application/x-research-info-systems' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.title.substring(0, 50)}.ris`.replace(/[^a-z0-9]/gi, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    saveToZoteroConnector(results) {
        // If Zotero connector is available, use it directly
        if (typeof Zotero !== 'undefined' && Zotero.Translate) {
            const items = results.map(result => ({
                title: result.title,
                creators: result.authors ? result.authors.map(author => ({ creatorType: 'author', firstName: '', lastName: author })) : [],
                date: result.year,
                abstractNote: result.abstract,
                itemType: this.getZoteroItemType(result.type),
                url: result.url,
                DOI: result.doi
            }));
            
            Zotero.Translate.webImport(items);
        }
    }

    getZoteroItemType(type) {
        const typeMap = {
            'article': 'journalArticle',
            'dataset': 'dataset',
            'thesis': 'thesis'
        };
        return typeMap[type] || 'document';
    }

    startHarvesting() {
        document.getElementById('harvestBtn').classList.add('active');
        document.getElementById('stopBtn').classList.remove('active');
        // Implement continuous harvesting logic
    }

    stopHarvesting() {
        document.getElementById('harvestBtn').classList.remove('active');
        document.getElementById('stopBtn').classList.add('active');
        // Implement stop harvesting logic
    }

    expandSearch() {
        // Implement expand search logic
        alert('Expanding search to include more repositories...');
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.performSearch();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.performSearch();
        }
    }

    updatePagination() {
        document.getElementById('pageInfo').textContent = `Page ${this.currentPage} of ${this.totalPages}`;
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = this.currentPage === this.totalPages;
    }

    showLoading() {
        document.getElementById('loadingSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loadingSection').style.display = 'none';
    }

    showResultsSection() {
        document.getElementById('resultsSection').style.display = 'block';
    }

    showError(message) {
        // Simple error display - you might want to use a more sophisticated notification system
        alert(message);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResearchHarvester();
});
