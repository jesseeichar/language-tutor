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
  // Deterministic fake grading for browser tests; never spend a real API key loaded from .env.
  const server = startServer({ ...config, dataDir: copy.dir, gradingServices: {
    async translation(input) {
      const correct = input.answer !== "This sentence has the opposite meaning.";
      return { correct, score: correct ? 1 : 0,
        feedback: `${correct ? "Meaning and grammar accepted." : "The meaning does not match the source sentence."}\nReference translation: ${input.reference}` };
    },
  } });
  const stop = () => { server.stop(true); copy.cleanup(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", copy.cleanup);
}
