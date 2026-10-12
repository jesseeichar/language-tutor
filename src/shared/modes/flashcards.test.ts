import { describe, expect, test } from "bun:test";
import { cardSides, flashcardsMode, type FlashcardQuestion } from "./flashcards";

const base = { id: "c", categories: ["x"] };
const parse = (card: object) => flashcardsMode.questionSchema.safeParse({ ...base, ...card });

describe("flashcards mode", () => {
  test("is an ungraded study tool", () => {
    expect(flashcardsMode.graded).toBe(false);
  });

  test("accepts a translation card (de + en) and a fixed card (front + back)", () => {
    expect(parse({ de: "zuerst", en: "first" }).success).toBe(true);
    expect(parse({ front: "f", back: "b" }).success).toBe(true);
  });

  test.each([
    ["only a front", { front: "f" }],
    ["only German", { de: "zuerst" }],
    ["both shapes at once", { de: "a", en: "b", front: "c", back: "d" }],
    ["half of each", { de: "a", back: "b" }],
  ])("rejects a card with %s", (_, card) => {
    expect(parse(card).success).toBe(false);
  });

  test("only accepts a reveal as response", () => {
    expect(flashcardsMode.responseSchema.safeParse({ revealed: true }).success).toBe(true);
    expect(flashcardsMode.responseSchema.safeParse({ revealed: false }).success).toBe(false);
  });

  test("only translation cards are directional", () => {
    const card = (x: object) => ({ ...base, refs: { words: [], topics: [] }, ...x }) as FlashcardQuestion;
    expect(flashcardsMode.isDirectional!(card({ de: "a", en: "b" }))).toBe(true);
    expect(flashcardsMode.isDirectional!(card({ front: "a", back: "b" }))).toBe(false);
  });
});

describe("cardSides", () => {
  const refs = { words: [], topics: [] };
  const translation: FlashcardQuestion = { ...base, refs, de: "zuerst", en: "first" };
  const fixed: FlashcardQuestion = { ...base, refs, front: "Q", back: "A" };

  test("follows the direction for translation cards", () => {
    expect(cardSides(translation, "de-en")).toEqual({ front: "zuerst", back: "first", direction: "de-en" });
    expect(cardSides(translation, "en-de")).toEqual({ front: "first", back: "zuerst", direction: "en-de" });
  });
  test("defaults translation cards to German first", () => {
    expect(cardSides(translation, null).direction).toBe("de-en");
  });
  test("fixed cards ignore the direction", () => {
    expect(cardSides(fixed, "en-de")).toEqual({ front: "Q", back: "A", direction: null });
  });
});
