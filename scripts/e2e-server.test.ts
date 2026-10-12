import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyTestData } from "./e2e-server";
import { FIXTURE_DATA_DIR } from "../tests/support/fixtures";

test("editing copied E2E content leaves source fixtures untouched", () => {
  const original = readFileSync(join(FIXTURE_DATA_DIR, "categories.json"), "utf8");
  const copy = copyTestData(FIXTURE_DATA_DIR);
  try {
    expect(readFileSync(join(copy.dir, "categories.json"), "utf8")).toBe(original);
    writeFileSync(join(copy.dir, "categories.json"), "edited");
    expect(readFileSync(join(FIXTURE_DATA_DIR, "categories.json"), "utf8")).toBe(original);
  } finally { copy.cleanup(); }
  expect(existsSync(copy.dir)).toBe(false);
});
