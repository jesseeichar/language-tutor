import { describe, expect, test } from "bun:test";
import { summary } from "../../tests/support/mock-api";
import { formatDateTime, resultText } from "./sessionText";

describe("resultText", () => {
  test("ungraded sessions count cards studied", () => {
    expect(resultText(summary(1))).toBe("Studied 1 of 2 cards");
  });
  test("graded sessions show score and points", () => {
    const graded = { ...summary(2), session: { ...summary(2).session, graded: true }, correct: 1, pointsAwarded: 1, pointsPossible: 2 };
    expect(resultText(graded)).toBe("1 / 2 correct · 1 of 2 points");
  });
});

describe("formatDateTime", () => {
  test("includes the year and the time", () => {
    const text = formatDateTime("2026-10-12T14:05:00");
    expect(text).toContain("2026");
    expect(text).toMatch(/\d{1,2}[:.]05/);
  });
});
