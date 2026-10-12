import { describe, expect, test } from "bun:test";
import { expandCategories, matchesCategories } from "./categories";
import type { Category } from "./content";

const cats: Category[] = [
  { id: "a", label: "A", group: "g" },
  { id: "a1", label: "A1", group: "g", parent: "a" },
  { id: "a1x", label: "A1x", group: "g", parent: "a1" },
  { id: "b", label: "B", group: "g" },
];

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
