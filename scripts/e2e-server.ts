import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, startServer } from "../src/server";

/** Editor tests may write content; never let them edit checked-in fixtures. */
export function copyTestData(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "lt-e2e-content-"));
  cpSync(source, dir, { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

if (import.meta.main) {
  const config = loadConfig();
  const copy = copyTestData(config.dataDir);
  const server = startServer({ ...config, dataDir: copy.dir });
  const stop = () => { server.stop(true); copy.cleanup(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", copy.cleanup);
}
