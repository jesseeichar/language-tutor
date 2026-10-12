import { describe, expect, test } from "bun:test";
import { categoryProblems, expandCategories, matchesCategories } from "./categories";
import type { Category } from "./content";

const cats: Category[] = [
  { id: "a", label: "A", group: "g" },
  { id: "a1", label: "A1", group: "g", parent: "a" },
  { id: "a1x", label: "A1x", group: "g", parent: "a1" },
  { id: "b", label: "B", group: "g" },
];

test("category trees reject duplicates, missing parents and cycles", () => {
  expect(categoryProblems(cats)).toEqual([]);
  expect(categoryProblems([...cats, cats[0]!]).join(" ")).toContain("unique");
  expect(categoryProblems([{ id: "a", label: "A", group: "g", parent: "missing" }]).join(" ")).toContain("unknown parent");
  expect(categoryProblems(cats.map((c) => c.id === "a" ? { ...c, parent: "a1x" } : c)).join(" ")).toContain("cycle");
});

describe("expandCategories", () => {
  test("includes all descendants of a selected parent", () => {
    expect([...expandCategories(["a"], cats)].sort()).toEqual(["a", "a1", "a1x"]);
  });
  test("leaf selection stays a leaf", () => {
    expect([...expandCategories(["a1x"], cats)]).toEqual(["a1x"]);
  });
  test("keeps unknown ids and handles overlapping selections", () => {
    expect([...expandCategories(["zzz", "a1", "a1x"], cats)].sort()).toEqual(["a1", "a1x", "zzz"]);
  });
});

describe("matchesCategories", () => {
  test("matches when any category is selected", () => {
    expect(matchesCategories(["b", "a1"], new Set(["a1"]))).toBe(true);
    expect(matchesCategories(["b"], new Set(["a1"]))).toBe(false);
  });
});
