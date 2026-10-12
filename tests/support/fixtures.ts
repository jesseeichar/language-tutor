/** Helpers for tests that need a data/ directory. */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const FIXTURE_DATA_DIR = resolve(import.meta.dir, "../fixtures/data");

/** Copies the fixture data to a temp dir so a test can break it. Returns the dir and a cleanup function. */
export function copyFixtureData(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "lt-data-"));
  cpSync(FIXTURE_DATA_DIR, dir, { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeJson(dir: string, file: string, value: unknown): void {
  writeFileSync(join(dir, file), typeof value === "string" ? value : JSON.stringify(value, null, 2));
}
