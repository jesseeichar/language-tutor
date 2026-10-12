import { describe, expect, test } from "bun:test";
import { flashcardsMode } from "./flashcards";
import { getMode, modes } from "./registry";

describe("mode registry", () => {
  test("finds registered modes by id", () => {
    expect(getMode("flashcards")).toBe(flashcardsMode);
    expect(getMode("nope")).toBeUndefined();
  });
  test("mode ids are unique", () => {
    expect(new Set(modes.map((m) => m.id)).size).toBe(modes.length);
  });
});
