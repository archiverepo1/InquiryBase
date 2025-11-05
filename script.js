<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, viewport-fit=cover"
  />
  <title>Library | InquiryBase</title>
  <link
    rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
  />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <!-- Header (logo far-left, "Library" centered) -->
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#">
        <!-- We apply a "make-white" filter to ensure white mark on blue -->
        <img
          src="https://raw.githubusercontent.com/archiverepo1/InquiryBase/main/logo.png"
          alt="Logo"
          class="brand-logo make-white"
        />
      </a>
      <div class="header-title">Library</div>
      <div class="header-spacer"></div>
    </div>
  </header>

  <main class="container">
    <!-- Search & controls -->
    <section class="search-section">
      <div class="search-row">
        <input
          id="q"
          class="search-input"
          type="text"
          placeholder="Search by keyword, title, or author…"
        />
        <button id="btnSearch" class="btn search-btn">
          <i class="fa-solid fa-magnifying-glass"></i> Search
        </button>
        <button id="btnHarvestAll" class="btn harvest-btn">
          <i class="fa-solid fa-database"></i> Harvest All
        </button>
        <button id="btnRefresh" class="btn refresh-btn">
          <i class="fa-solid fa-rotate"></i> Refresh Page
        </button>
      </div>

      <div class="source-tabs">
        <button class="tab active" data-filter="all">All Sources</button>
        <button class="tab" data-filter="research">Research Data</button>
        <button class="tab" data-filter="articles">Journal Articles</button>
        <button class="tab" data-filter="theses">Theses</button>
      </div>

      <div class="progress-bar"><div id="progress" class="progress"></div></div>
      <div id="harvestStatus" class="harvest-status">Ready</div>
    </section>

    <!-- Results & filters -->
    <section class="results-section">
      <div class="results-header">
        <h2 class="results-title">Results</h2>
        <div id="resultsCount" class="results-count">0 results</div>
      </div>

      <div class="filters">
        <div class="filter">
          <label for="filterSource">Source</label>
          <select id="filterSource">
            <option value="">All</option>
          </select>
        </div>
        <div class="filter">
          <label for="filterYear">Year</label>
          <select id="filterYear">
            <option value="">All</option>
          </select>
        </div>
        <div class="filter">
          <label for="filterSort">Sort by</label>
          <select id="filterSort">
            <option value="relevance">Relevance</option>
            <option value="year_desc">Year (Newest)</option>
            <option value="year_asc">Year (Oldest)</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
        <div class="filter grow">
          <label for="filterText">Search in results</label>
          <div class="inline-input">
            <input id="filterText" type="text" placeholder="Type to filter…" />
            <button id="btnFilterText" class="btn sm"><i class="fa-solid fa-search"></i></button>
          </div>
        </div>
      </div>

      <div id="dataCardsContainer" class="data-cards-container">
        <div class="no-results">
          <i class="fa-regular fa-circle-question"></i>
          <h3>No results yet</h3>
          <p>Use Search or Harvest All to begin.</p>
        </div>
      </div>

      <div class="pagination" id="pagination" hidden>
        <button class="btn sm" id="firstPage">First</button>
        <button class="btn sm" id="prevPage">Previous</button>
        <span id="pageInfo" class="page-info">Page 1 of 1</span>
        <button class="btn sm" id="nextPage">Next</button>
        <button class="btn sm" id="lastPage">Last</button>
      </div>
    </section>

    <!-- Zotero card -->
    <section class="zotero-card">
      <div class="zotero-head">
        <div class="zotero-mark">Z</div>
        <div>
          <h3>Your Referencing Manager: Zotero</h3>
          <p>
            Zotero helps you collect, organize, annotate, cite, and share research.
            Save sources directly from your browser and organize them into collections with tags.
          </p>
        </div>
      </div>
      <div class="zotero-actions">
        <a class="btn" target="_blank" href="https://www.zotero.org/">
          Visit Zotero
        </a>
        <a class="btn" target="_blank" href="https://www.youtube.com/watch?v=JG7Uq_JFDzE">
          Tutorial 1
        </a>
        <a class="btn" target="_blank" href="https://www.youtube.com/watch?v=9tnWWiX7VbU">
          Tutorial 2
        </a>
      </div>
    </section>
  </main>

  <!-- Footer (exact structure/links like sozim.vercel.app, black) -->
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="foot-col brand-col">
        <img
          src="https://raw.githubusercontent.com/archiverepo1/InquiryBase/main/logo.png"
          alt="Logo"
          class="footer-logo make-white big"
        />
        <p class="tagline">
          Sozim Trading and Consultancy stands for quality, excellent products,
          highly efficient processes and outstanding results.
        </p>
      </div>

      <div class="foot-col">
        <h4>Quick Links</h4>
        <ul>
          <li><a href="https://sozim.vercel.app/">Home</a></li>
          <li><a href="https://sozim.vercel.app/courses">Courses</a></li>
          <li><a href="https://sozim.vercel.app/about">About</a></li>
          <li><a href="https://sozim.vercel.app/contact">Contact</a></li>
        </ul>
      </div>

      <div class="foot-col">
        <h4>Programs</h4>
        <ul>
          <li><a href="https://sozim.vercel.app/programs/undergraduate">Undergraduate</a></li>
          <li><a href="https://sozim.vercel.app/programs/graduate">Graduate</a></li>
          <li><a href="https://sozim.vercel.app/programs/online-learning">Online Learning</a></li>
          <li><a href="https://sozim.vercel.app/programs/certificates">Certificates</a></li>
        </ul>
      </div>

      <div class="foot-col">
        <h4>Contact Us</h4>
        <ul class="contact-list">
          <li><a href="mailto:admin@sozim.co.za">admin@sozim.co.za</a></li>
          <li><a href="tel:+27836680104">(+27) 83 668 0104</a></li>
          <li><a href="tel:+27723023929">(+27) 72 302 3929</a></li>
          <li>4697 Modiko Street, Bochabela Location, Mangaung, 9323</li>
        </ul>
      </div>
    </div>
    <div class="copyright">
      © 2025 Excellence University. All rights reserved.
    </div>
  </footer>

  <script src="./qdata.js" defer></script>
</body>
</html>
