let allResults = [];

async function searchFigshare() {
  const query = document.getElementById("query").value.trim();
  if (!query) return alert("Please enter a search term!");

  const url = `https://api.figshare.com/v2/articles/search?search_for=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();
  allResults = data;

  displayResults(data);
}

function displayResults(data) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  if (!data.length) {
    resultsDiv.innerHTML = "<p>No results found.</p>";
    return;
  }

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "card";
    const description = item.description ? item.description.slice(0, 200) + "..." : "No description available.";
    card.innerHTML = `
      <h3>${item.title}</h3>
      <p>${description}</p>
      <p><strong>Published:</strong> ${item.published_date || "Unknown"}</p>
      <a href="${item.url}" target="_blank">🔗 View on Figshare</a>
    `;
    resultsDiv.appendChild(card);
  });
}

function filterResults() {
  const selected = document.getElementById("categoryFilter").value.toLowerCase();
  if (!selected) {
    displayResults(allResults);
  } else {
    const filtered = allResults.filter(item =>
      (item.title + " " + (item.description || "")).toLowerCase().includes(selected)
    );
    displayResults(filtered);
  }
}
