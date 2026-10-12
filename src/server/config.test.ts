import { describe, expect, test } from "bun:test";
import { loadConfig, projectRoot } from "./config";

describe("loadConfig", () => {
  test("defaults to data/ and storage/ in the project", () => {
    const c = loadConfig({});
    expect(c.dataDir).toBe(`${projectRoot}/data`);
    expect(c.dbPath).toBe(`${projectRoot}/storage/progress.sqlite`);
    expect(c.port).toBe(3001);
  });
  test("reads overrides from the environment", () => {
    const c = loadConfig({ LT_DATA_DIR: "/tmp/d", LT_DB_PATH: "x.sqlite", LT_API_PORT: "4000" });
    expect(c.dataDir).toBe("/tmp/d");
    expect(c.dbPath).toBe(`${projectRoot}/x.sqlite`);
    expect(c.port).toBe(4000);
  });
});
