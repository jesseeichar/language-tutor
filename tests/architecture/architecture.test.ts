/**
 * Architecture rules. These fail the build when the structure drifts.
 * The rules and their reasons are documented in docs/architecture.md.
 * Change a rule only together with that document.
 */
import { describe, expect, test } from "bun:test";
import { exportedNames, findCycles, loadSources, moduleFolders, topModule } from "./source-graph";

const files = loadSources();
const production = files.filter((f) => !f.isTest);

/** Which top-level modules each module may import. Dependencies point inward to shared. */
const ALLOWED_DEPENDENCIES: Record<string, string[]> = {
  "src/shared": [],
  "src/server": ["src/shared"],
  "src/client": ["src/shared"],
  scripts: ["src/shared", "src/server"],
};

/** Third-party and runtime imports allowed in production code, per module. */
const ALLOWED_EXTERNALS: Record<string, string[]> = {
  "src/shared": ["zod"], // must run in both browser and Bun
  "src/server": ["zod", "bun", "bun:sqlite", "node:*"],
  "src/client": ["react", "react-dom"],
  scripts: ["bun", "node:*"],
};

/**
 * Maximum public names per module index. Keeps interfaces narrow (deep modules, not wide ones).
 * Raising a budget needs a reason in docs/architecture.md.
 */
const INTERFACE_BUDGET: Record<string, number> = {
  "src/shared": 40, // the contract between server and client: schemas and types
  "src/server": 8,
  "src/client/modes": 2,
  "src/client/modes/flashcards": 1,
  "scripts/lib": 8,
};

/** Minimum lines of implementation per public name, so modules hide more than they expose. shared is a contract module and exempt. */
const MIN_DEPTH = 15;
const MAX_FILE_LINES = 300;

const folders = moduleFolders(files);

describe("layering", () => {
  test("modules depend only on the modules they are allowed to", () => {
    const violations = production.flatMap((f) => {
      const from = topModule(f.path);
      const allowed = [from, ...(ALLOWED_DEPENDENCIES[from] ?? [])];
      return f.internalImports.filter((t) => !allowed.includes(topModule(t))).map((t) => `${f.path} -> ${t}`);
    });
    expect(violations).toEqual([]);
  });

  test("production code never imports test code", () => {
    const violations = production.flatMap((f) => f.internalImports.filter((t) => topModule(t) === "tests" || t.includes(".test.")).map((t) => `${f.path} -> ${t}`));
    expect(violations).toEqual([]);
  });

  test("each module uses only its allowed external packages", () => {
    const violations = production.flatMap((f) => {
      const allowed = ALLOWED_EXTERNALS[topModule(f.path)] ?? [];
      return f.externalImports.filter((p) => !allowed.includes(p)).map((p) => `${f.path} imports ${p}`);
    });
    expect(violations).toEqual([]);
  });
});

describe("module interfaces", () => {
  test("code outside a module imports only the module's index", () => {
    const violations = files.flatMap((f) =>
      f.internalImports.flatMap((target) =>
        [...folders.entries()]
          .filter(([folder, index]) => target.startsWith(`${folder}/`) && target !== index && !f.path.startsWith(`${folder}/`))
          .map(([folder]) => `${f.path} -> ${target} (use ${folder}/index)`),
      ),
    );
    expect(violations).toEqual([]);
  });

  test("index files list their exports explicitly (no export *)", () => {
    const wildcard = [...folders.values()].filter((index) => exportedNames(files.find((f) => f.path === index)!.text) === null);
    expect(wildcard).toEqual([]);
  });

  test("every module index has an interface budget", () => {
    expect([...folders.keys()].filter((folder) => !(folder in INTERFACE_BUDGET))).toEqual([]);
  });

  test.each(Object.entries(INTERFACE_BUDGET))("%s stays within its interface budget", (folder, budget) => {
    const index = folders.get(folder);
    expect(index).toBeDefined();
    const names = exportedNames(files.find((f) => f.path === index)!.text) ?? [];
    expect(names.length).toBeLessThanOrEqual(budget);
  });

  test.each(Object.keys(INTERFACE_BUDGET).filter((m) => m !== "src/shared"))("%s is deep: enough implementation per public name", (folder) => {
    const index = files.find((f) => f.path === folders.get(folder))!;
    const names = exportedNames(index.text)!.length;
    const implementation = production.filter((f) => f.path.startsWith(`${folder}/`)).reduce((sum, f) => sum + f.lines, 0);
    expect(implementation / Math.max(names, 1)).toBeGreaterThanOrEqual(MIN_DEPTH);
  });
});

describe("hygiene", () => {
  test("no import cycles", () => {
    expect(findCycles(production).map((c) => c.join(" -> "))).toEqual([]);
  });

  test(`source files stay under ${MAX_FILE_LINES} lines`, () => {
    expect(production.filter((f) => f.lines > MAX_FILE_LINES).map((f) => `${f.path}: ${f.lines}`)).toEqual([]);
  });

  test("every production source file has a unit test, or is listed as exempt", () => {
    // Entry points, pure type/contract files and re-export indexes have nothing to unit test on their own.
    const exempt = new Set([
      "src/server/main.ts", "src/server/index.ts", "src/shared/index.ts", "src/shared/api.ts",
      "src/client/main.tsx", "src/client/modes/types.ts", "src/client/modes/flashcards/index.ts",
      "scripts/lib/index.ts", "scripts/dev.ts", "scripts/import-notes.ts", "scripts/validate-data.ts",
    ]);
    const testPaths = new Set(files.filter((f) => f.isTest).map((f) => f.path));
    const missing = production
      .filter((f) => f.path.startsWith("src/") || f.path.startsWith("scripts/"))
      .filter((f) => !exempt.has(f.path))
      .filter((f) => {
        const stem = f.path.replace(/\.tsx?$/, "");
        return !testPaths.has(`${stem}.test.ts`) && !testPaths.has(`${stem}.test.tsx`);
      })
      .map((f) => f.path);
    expect(missing).toEqual([]);
  });
});
