import { describe, expect, test } from "bun:test";
import { QuestionBaseSchema, type Category, type QuestionBase } from "../shared";
import { assignDirections, countByCategory, filterPool } from "./session-plan";

const cats: Category[] = [
  { id: "conn", label: "Connectors", group: "V" },
  { id: "time", label: "Time", group: "V", parent: "conn" },
  { id: "work", label: "Work", group: "V" },
];
const q = (id: string, category: string, type?: string): QuestionBase =>
  QuestionBaseSchema.parse({ id, categories: [category], type });

const pool = [q("a", "time", "translation"), q("b", "time", "fill"), q("c", "work", "translation"), q("d", "conn")];
const ids = (qs: QuestionBase[]) => qs.map((x) => x.id);

describe("filterPool", () => {
  test("a parent category includes its children", () => {
    expect(ids(filterPool(pool, cats, { categoryIds: ["conn"] }))).toEqual(["a", "b", "d"]);
  });
  test("several categories are combined", () => {
    expect(ids(filterPool(pool, cats, { categoryIds: ["time", "work"] }))).toEqual(["a", "b", "c"]);
  });
  test("question types narrow the selection", () => {
    expect(ids(filterPool(pool, cats, { categoryIds: ["conn", "work"], questionTypes: ["translation"] }))).toEqual(["a", "c"]);
  });
  test("questions without a type are excluded when filtering by type", () => {
    expect(ids(filterPool(pool, cats, { categoryIds: ["conn"], questionTypes: ["translation", "fill"] }))).toEqual(["a", "b"]);
  });
});

describe("countByCategory", () => {
  test("counts descendants under a parent", () => {
    expect(Object.fromEntries(countByCategory(pool, cats))).toEqual({ conn: 3, time: 2, work: 1 });
  });
});

describe("assignDirections", () => {
  const directional = (x: QuestionBase) => x.type === "translation";

  test("a fixed choice applies to every directional question, and only to those", () => {
    expect(assignDirections(pool, directional, "en-de")).toEqual({ a: "en-de", c: "en-de" });
  });
  test("random decides per question", () => {
    const rolls = [0.1, 0.9];
    expect(assignDirections(pool, directional, "random", () => rolls.shift()!)).toEqual({ a: "de-en", c: "en-de" });
  });
});
