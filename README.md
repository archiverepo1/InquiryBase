
Library Harvester System

A comprehensive system that aggregates academic research data from multiple repositories, including E-LIS, South African DSpace repositories, and global research data sources such as Dryad, Zenodo, and Mendeley Data.

For collaboration or support:
jobs.vuyo [at] gmail [dot] com
(Email intentionally obfuscated for security.)

Features

🔍 Multi-source harvesting
Harvests metadata from:

9 South African DSpace repositories

E-LIS (live search)

Dryad, Zenodo, Mendeley Data

⚡ Live E-LIS search
Real-time searching of Library & Information Science content.
Supports failover between primary and backup endpoints.

⏱ Automatic daily harvesting
Scheduled to run every day at 02:00, collecting up to N new records per repository.

📄 RIS export
Export selected results directly into RIS format for EndNote/Zotero/Mendeley.

🎛 Advanced filtering
Filter results by:

Year

Repository

Document Type

Author

Keywords

📱 Fully responsive UI
Optimized for mobile, tablet, and desktop.
Masonry-style layout for compact, clean browsing.

Deployment

This project can be deployed on:

Cloudflare Workers (original environment)

Vercel (Serverless / Edge Functions)

Appwrite Functions (for long-running harvesting tasks)

Prerequisites

Cloudflare or Vercel account

Wrangler CLI installed (if deploying to Cloudflare)

Environment variables configured for your backend

Storage/KV/database available (Cloudflare KV or Appwrite Collections)

Setup (Cloudflare Deployment)

Install Wrangler

npm install -g wrangler


Authenticate Cloudflare

wrangler login


Publish the Worker

wrangler deploy


Configure KV Storage
Ensure a KV namespace is added for:

harvest_theses

harvest_articles

harvest_research

harvest_meta

Set environment variables

wrangler secret put API_KEY
wrangler secret put APPWRITE_PROJECT
wrangler secret put APPWRITE_API_KEY

Key Endpoints
Endpoint	Purpose
/api/harvest	Returns cached results (fast search)
/api/harvest-now	Forces full harvesting from all repositories
/api/harvest-incremental	Mini-harvest (fast update)
/api/health	Shows system status & record counts
/api/ris	Export selected records to RIS
/api/elis-live-search	Real-time E-LIS search (no caching)
Security Notes

Email is obfuscated to reduce spam.

No API keys or secrets are included in this repository.

All sensitive values must be stored in environment variables.

Do not share Cloudflare account credentials when handing over the project.

Safe to share the Worker code as long as secrets are removed.

License

MIT License — free to use, modify, and distribute with attribution.

If you'd like, I can also generate:

✅ A professional LICENSE.md
✅ A CONTRIBUTING.md
✅ API documentation page
✅ Screenshots for the GitHub page
