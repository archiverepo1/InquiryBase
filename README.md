# Q Data Research Hub

A professional research data harvesting platform that collects data from multiple repositories including Zenodo, Figshare, OSF, Dryad, Mendeley Data, and institutional repositories.

## Features

- **Multi-Source Harvesting**: Collect research data from 8+ repositories
- **Professional UI**: Clean, responsive design
- **Advanced Filtering**: Filter by year, source, and relevance
- **Pagination**: Navigate large datasets efficiently
- **Real Data**: Harvests actual research data (no mock data)
- **Zotero Integration**: Save records directly to Zotero
- **Local Storage**: Data persists between sessions

## Setup Instructions

### 1. Frontend Deployment

1. Upload these files to your GitHub repository:
   - `index.html`
   - `styles.css` 
   - `script.js`

2. Enable GitHub Pages in your repository settings

### 2. Cloudflare Worker Setup

1. Create a new Cloudflare Worker
2. Copy the code from `worker.js`
3. Deploy the worker
4. Update the `WORKER_URL` in `script.js` with your worker URL

### 3. Configuration

Update the following in `script.js`:

```javascript
const WORKER_URL = 'https://your-worker-name.your-subdomain.workers.dev';
