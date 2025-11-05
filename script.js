/* qdata.js */

(() => {
  const WORKER_URL = "https://inquirybase.archiverepo1.workers.dev";
  let PROXY_PATH = "/api/proxy";

  // Auto-detect Worker route
  async function verifyWorker() {
    try {
      const test = await fetch(`${WORKER_URL}/api/proxy?url=https://zenodo.org/api/records?page=1`);
      if (!test.ok) PROXY_PATH = "";
      console.log(`✅ Worker route confirmed: ${WORKER_URL}${PROXY_PATH}`);
    } catch {
      PROXY_PATH = "";
      console.warn("⚠️ Worker route fallback to root");
    }
  }
  verifyWorker();

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("harvestAll").onclick = () => alert("Harvesting started (mock-up: check console)");
    document.getElementById("refreshPage").onclick = () => location.reload();
  });
})();
