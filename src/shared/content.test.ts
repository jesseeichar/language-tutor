import { describe, expect, test } from "bun:test";
import { IdSchema, QuestionBaseSchema } from "./content";

describe("IdSchema", () => {
  test.each(["zuerst", "die-staerke", "a1"])("accepts %s", (id) => {
    expect(IdSchema.safeParse(id).success).toBe(true);
  });
  test.each(["Zuerst", "stärke", "-lead", "has space", ""])("rejects %p", (id) => {
    expect(IdSchema.safeParse(id).success).toBe(false);
  });
});

describe("QuestionBaseSchema", () => {
  test("defaults refs to empty lists", () => {
    expect(QuestionBaseSchema.parse({ id: "q", categories: ["c"] }).refs).toEqual({ words: [], topics: [] });
  });
  test("requires at least one category", () => {
    expect(QuestionBaseSchema.safeParse({ id: "q", categories: [] }).success).toBe(false);
  });
  test("rejects negative points", () => {
    expect(QuestionBaseSchema.safeParse({ id: "q", categories: ["c"], points: -1 }).success).toBe(false);
  });
});
