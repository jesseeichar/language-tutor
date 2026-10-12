import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceFile } from "./atomic-file";

test("a concurrent edit during a write is preserved and the temporary file is removed", () => {
  const dir = mkdtempSync(join(tmpdir(), "lt-atomic-"));
  const path = join(dir, "content.json");
  writeFileSync(path, "old");
  let checks = 0;
  try {
    expect(() => replaceFile(path, "ours", () => {
      if (++checks === 2) { writeFileSync(path, "external"); throw new Error("changed"); }
    })).toThrow("changed");
    expect(readFileSync(path, "utf8")).toBe("external");
    expect(readdirSync(dir)).toEqual(["content.json"]);
    replaceFile(path, "saved", () => {});
    expect(readFileSync(path, "utf8")).toBe("saved");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
