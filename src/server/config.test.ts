import { describe, expect, test } from "bun:test";
import { loadConfig, projectRoot } from "./config";

describe("loadConfig", () => {
  test("defaults to data/ and progress.json in the project", () => {
    const c = loadConfig({});
    expect(c.dataDir).toBe(`${projectRoot}/data`);
    expect(c.progressPath).toBe(`${projectRoot}/data/progress.json`);
    expect(c.port).toBe(3001);
  });
  test("reads overrides from the environment", () => {
    const c = loadConfig({ LT_DATA_DIR: "/tmp/d", LT_PROGRESS_PATH: "x.json", LT_API_PORT: "4000" });
    expect(c.dataDir).toBe("/tmp/d");
    expect(c.progressPath).toBe(`${projectRoot}/x.json`);
    expect(c.port).toBe(4000);
  });
  test("rejects obsolete SQLite configuration", () => {
    expect(() => loadConfig({ LT_DB_PATH: "old.sqlite" })).toThrow("LT_DB_PATH is no longer supported");
  });
});
