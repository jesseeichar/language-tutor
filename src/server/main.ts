import { startServer } from "./app";
import { loadConfig } from "./config";
import { ContentError, loadContent } from "./content";

const config = loadConfig();

// Fail loudly at startup if the data is broken, but keep serving so the UI can show the problems.
try {
  await loadContent(config.dataDir);
} catch (e) {
  if (e instanceof ContentError) console.error(e.message);
  else throw e;
}

const server = startServer(config);
console.log(`API listening on http://localhost:${server.port}`);
console.log(`  data:     ${config.dataDir}`);
console.log(`  progress: ${config.dbPath}`);
