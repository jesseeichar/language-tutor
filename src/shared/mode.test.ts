import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { QuestionBaseSchema } from "./content";
import { DirectionChoiceSchema, pointsFor, type GradedMode, type UngradedMode } from "./mode";

const base = { questionSchema: QuestionBaseSchema, responseSchema: z.unknown(), description: "", defaultSessionSize: 5 };
const ungraded: UngradedMode = { ...base, id: "u", title: "U", graded: false };
const graded: GradedMode = { ...base, id: "g", title: "G", graded: true, defaultPoints: 2, grade: () => ({ correct: true, score: 1 }) };
const q = QuestionBaseSchema.parse({ id: "q", categories: ["c"] });

describe("DirectionChoiceSchema", () => {
  test("accepts the three choices only", () => {
    for (const c of ["de-en", "en-de", "random"]) expect(DirectionChoiceSchema.safeParse(c).success).toBe(true);
    expect(DirectionChoiceSchema.safeParse("de-fr").success).toBe(false);
  });
});

describe("pointsFor", () => {
  test("ungraded modes are always worth 0", () => {
    expect(pointsFor(ungraded, { ...q, points: 5 })).toBe(0);
  });
  test("graded modes use the mode default", () => {
    expect(pointsFor(graded, q)).toBe(2);
  });
  test("a question can override the default", () => {
    expect(pointsFor(graded, { ...q, points: 3 })).toBe(3);
  });
});
