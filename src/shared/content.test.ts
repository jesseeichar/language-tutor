import { describe, expect, test } from "bun:test";
import { IdSchema, QuestionBaseSchema, QuestionFileSchema } from "./content";

describe("IdSchema", () => {
  test.each(["zuerst", "die-staerke", "a1"])("accepts %s", (id) => {
    expect(IdSchema.safeParse(id).success).toBe(true);
  });
  test.each(["Zuerst", "stärke", "-lead", "has space", ""])("rejects %p", (id) => {
    expect(IdSchema.safeParse(id).success).toBe(false);
  });
});

describe("QuestionFileSchema", () => {
  test("question types default to none", () => {
    expect(QuestionFileSchema.parse({ questions: [] }).types).toEqual([]);
  });
  test("question types need an id and a label", () => {
    expect(QuestionFileSchema.safeParse({ types: [{ id: "t" }], questions: [] }).success).toBe(false);
    expect(QuestionFileSchema.safeParse({ types: [{ id: "t", label: "T" }], questions: [] }).success).toBe(true);
  });
});

describe("QuestionBaseSchema", () => {
  test("type is optional but must be a valid id", () => {
    expect(QuestionBaseSchema.safeParse({ id: "q", categories: ["c"], type: "translation" }).success).toBe(true);
    expect(QuestionBaseSchema.safeParse({ id: "q", categories: ["c"], type: "Not Valid" }).success).toBe(false);
  });
  test("defaults refs to empty lists", () => {
    expect(QuestionBaseSchema.parse({ id: "q", categories: ["c"] }).refs).toEqual({ words: [], topics: [] });
  });
  test("requires at least one category", () => {
    expect(QuestionBaseSchema.safeParse({ id: "q", categories: [] }).success).toBe(false);
  });
  test("rejects negative points", () => {
    expect(QuestionBaseSchema.safeParse({ id: "q", categories: ["c"], points: -1 }).success).toBe(false);
  });
  test("word and topic references cannot count the same item twice", () => {
    for (const refs of [{ words: ["word", "word"] }, { topics: ["topic", "topic"] }]) {
      expect(QuestionBaseSchema.safeParse({ id: "q", categories: ["c"], refs }).success).toBe(false);
    }
    expect(QuestionBaseSchema.safeParse({ id: "q", categories: ["c"], refs: { words: ["same"], topics: ["same"] } }).success).toBe(true);
  });
});
