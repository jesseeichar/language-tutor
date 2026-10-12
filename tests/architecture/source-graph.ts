/**
 * Builds an import graph of the project's TypeScript sources for the
 * architecture tests. Regex based on purpose: no compiler needed, and it sees
 * type-only imports too, which also count as coupling.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Glob } from "bun";

export const ROOT = resolve(import.meta.dir, "../..");

export interface SourceFile {
  /** Project-relative path, e.g. "src/server/app.ts". */
  path: string;
  text: string;
  lines: number;
  isTest: boolean;
  /** Project-relative paths of imported project files. */
  internalImports: string[];
  /** Bare package names ("react", "node:fs", "bun:sqlite"). */
  externalImports: string[];
}

const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

export const isTestPath = (p: string) => /\.test\.tsx?$/.test(p) || p.startsWith("tests/");

function resolveImport(fromFile: string, spec: string): string | null {
  const base = resolve(ROOT, dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(ROOT, candidate);
  }
  return null;
}

function packageName(spec: string): string {
  if (spec.startsWith("node:")) return "node:*";
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

export function loadSources(): SourceFile[] {
  const files: SourceFile[] = [];
  for (const dir of ["src", "scripts", "tests"]) {
    for (const path of new Glob(`${dir}/**/*.{ts,tsx}`).scanSync({ cwd: ROOT })) {
      if (path.endsWith(".d.ts")) continue;
      const text = readFileSync(join(ROOT, path), "utf8");
      const specs = [...text.matchAll(IMPORT_RE), ...text.matchAll(DYNAMIC_RE)].map((m) => m[1]!);
      const internalImports: string[] = [];
      const externalImports: string[] = [];
      for (const spec of specs) {
        if (spec.startsWith(".")) {
          const target = resolveImport(path, spec);
          if (!target) throw new Error(`${path}: cannot resolve import "${spec}"`);
          internalImports.push(target);
        } else {
          externalImports.push(packageName(spec));
        }
      }
      files.push({ path, text, lines: text.split("\n").length, isTest: isTestPath(path), internalImports, externalImports });
    }
  }
  return files;
}

/** Top-level module a file belongs to. */
export function topModule(path: string): string {
  for (const m of ["src/shared", "src/server", "src/client", "scripts", "tests"]) {
    if (path === m || path.startsWith(`${m}/`)) return m;
  }
  return "other";
}

/** Every folder that has an index.ts(x) is a module whose index is its only public entry. */
export function moduleFolders(files: SourceFile[]): Map<string, string> {
  const folders = new Map<string, string>();
  for (const f of files) {
    const m = f.path.match(/^(.*)\/index\.tsx?$/);
    if (m && !f.isTest) folders.set(m[1]!, f.path);
  }
  return folders;
}

/** Names exported by an index file (values and types). Returns null if it uses `export *`. */
export function exportedNames(text: string): string[] | null {
  if (/^export\s+\*/m.test(text)) return null;
  const names: string[] = [];
  for (const m of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    names.push(...m[1]!.split(",").map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!).filter(Boolean));
  }
  for (const m of text.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function|class|interface|type|enum)\s+(\w+)/gm)) {
    names.push(m[1]!);
  }
  return names;
}

/** Returns each import cycle found, as a list of file paths. */
export function findCycles(files: SourceFile[]): string[][] {
  const graph = new Map(files.map((f) => [f.path, f.internalImports]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (node: string) => {
    state.set(node, "visiting");
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === "visiting") cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(node, "done");
  };
  for (const node of graph.keys()) if (!state.has(node)) visit(node);
  return cycles;
}
