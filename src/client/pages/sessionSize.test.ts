import { describe, expect, test } from "bun:test";
import { resolveSessionSize, sizeSuggestions } from "./sessionSize";

describe("sizeSuggestions", () => {
  test("adds the mode's default to the presets and keeps them sorted", () => {
    expect(sizeSuggestions(25, null)).toEqual([10, 20, 25, 30, 50, 100]);
  });
  test("drops sizes that would not be smaller than the pool", () => {
    expect(sizeSuggestions(30, 30)).toEqual([10, 20]);
    expect(sizeSuggestions(30, 5)).toEqual([]);
  });
});

describe("resolveSessionSize", () => {
  test("'all' is the whole pool, or the fallback when the pool is unknown", () => {
    expect(resolveSessionSize({ kind: "all" }, 42, 700)).toBe(42);
    expect(resolveSessionSize({ kind: "all" }, null, 700)).toBe(700);
  });
  test("presets and custom numbers are clamped to the pool", () => {
    expect(resolveSessionSize({ kind: "preset", count: 30 }, 12, 700)).toBe(12);
    expect(resolveSessionSize({ kind: "custom", text: "7" }, 12, 700)).toBe(7);
    expect(resolveSessionSize({ kind: "custom", text: "99" }, 12, 700)).toBe(12);
  });
  test("an empty or nonsensical custom value means one question", () => {
    expect(resolveSessionSize({ kind: "custom", text: "" }, 12, 700)).toBe(1);
    expect(resolveSessionSize({ kind: "custom", text: "-4" }, 12, 700)).toBe(1);
    expect(resolveSessionSize({ kind: "custom", text: "2.9" }, 12, 700)).toBe(2);
  });
});
