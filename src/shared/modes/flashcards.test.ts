import { describe, expect, test } from "bun:test";
import { flashcardsMode } from "./flashcards";

describe("flashcards mode", () => {
  test("is an ungraded study tool", () => {
    expect(flashcardsMode.graded).toBe(false);
  });
  test("accepts a card with front and back", () => {
    const r = flashcardsMode.questionSchema.safeParse({ id: "c", categories: ["x"], front: "f", back: "b" });
    expect(r.success).toBe(true);
  });
  test("rejects a card without a back", () => {
    expect(flashcardsMode.questionSchema.safeParse({ id: "c", categories: ["x"], front: "f" }).success).toBe(false);
  });
  test("only accepts a reveal as response", () => {
    expect(flashcardsMode.responseSchema.safeParse({ revealed: true }).success).toBe(true);
    expect(flashcardsMode.responseSchema.safeParse({ revealed: false }).success).toBe(false);
  });
});
