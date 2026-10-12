import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProgressFile } from "./progress-file";
import { emptyProgress } from "./progress-schema";

let dir: string;
let path: string;
beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), "lt-progress-file-"));
  path = join(dir, "progress.json");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("ProgressFile", () => {
  test("missing files load empty, then save readable stable JSON", () => {
    const file = new ProgressFile(path);
    expect(file.load()).toEqual(emptyProgress());
    file.save(emptyProgress());
    const first = fs.readFileSync(path, "utf8");
    expect(first).toBe(`${JSON.stringify(emptyProgress(), null, 2)}\n`);
    file.save(emptyProgress());
    expect(fs.readFileSync(path, "utf8")).toBe(first);
    expect(new ProgressFile(path).load()).toEqual(emptyProgress());
    expect(fs.readdirSync(dir)).toEqual(["progress.json"]);
  });

  test("creates parent directories only on save", () => {
    const nested = join(dir, "nested", "progress.json");
    const file = new ProgressFile(nested);
    expect(fs.existsSync(join(dir, "nested"))).toBe(false);
    file.save(emptyProgress());
    expect(new ProgressFile(nested).load()).toEqual(emptyProgress());
  });

  test.each(["{broken", "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> branch", '{"version":99}'])
  ("invalid input is preserved: %s", (text) => {
    fs.writeFileSync(path, text);
    expect(() => new ProgressFile(path).load()).toThrow("Fix the file or restore it from Git");
    expect(fs.readFileSync(path, "utf8")).toBe(text);
  });

  test("does not treat other read errors as empty progress", () => {
    fs.mkdirSync(path);
    expect(() => new ProgressFile(path).load()).toThrow();
  });

  test.each(["edit", "delete", "create"])("refuses an external %s until restart", (change) => {
    const original = JSON.stringify(emptyProgress());
    if (change !== "create") fs.writeFileSync(path, original);
    const file = new ProgressFile(path);
    if (change === "delete") fs.unlinkSync(path);
    else fs.writeFileSync(path, `${original}\n`);
    expect(() => file.save(emptyProgress())).toThrow("Restart the server");
    if (change === "create") fs.unlinkSync(path);
    else fs.writeFileSync(path, original);
    expect(() => file.save(emptyProgress())).toThrow("Restart the server");
    expect(() => new ProgressFile(path).save(emptyProgress())).not.toThrow();
  });

  test.each(["writeFileSync", "fsyncSync", "renameSync"] as const)
  ("a %s failure leaves the previous file intact and cleans temporary files", (operation) => {
    const original = JSON.stringify(emptyProgress());
    fs.writeFileSync(path, original);
    const file = new ProgressFile(path);
    const failure = spyOn(fs, operation).mockImplementation(() => { throw new Error("disk failure"); });
    try {
      expect(() => file.save(emptyProgress())).toThrow("disk failure");
      expect(fs.readFileSync(path, "utf8")).toBe(original);
      expect(fs.readdirSync(dir)).toEqual(["progress.json"]);
    } finally {
      failure.mockRestore();
    }
    expect(() => file.save(emptyProgress())).not.toThrow();
  });
});
