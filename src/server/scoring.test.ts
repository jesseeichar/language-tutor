import { describe, expect, test } from "bun:test";
import { MAX_STRENGTH, MIN_STRENGTH, nextStrength } from "./scoring";

describe("nextStrength", () => {
  test("a correct answer raises the score by 1", () => expect(nextStrength(0, true)).toBe(1));
  test("a wrong answer lowers the score by 2", () => expect(nextStrength(0, false)).toBe(-2));
  test("stays within -10..10", () => {
    expect(nextStrength(MAX_STRENGTH, true)).toBe(MAX_STRENGTH);
    expect(nextStrength(MIN_STRENGTH + 1, false)).toBe(MIN_STRENGTH);
  });
});
