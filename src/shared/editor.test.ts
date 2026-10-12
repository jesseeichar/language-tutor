import { expect, test } from "bun:test";
import { ContentEditSchema } from "./editor";

test("content edits require a revision, stable references, and nonempty unique assignments", () => {
  const base = { revision: "abc", change: { kind: "assign-categories", modeId: "flashcards", questionId: "q", categoryIds: ["a"] } };
  expect(ContentEditSchema.safeParse(base).success).toBe(true);
  expect(ContentEditSchema.safeParse({ ...base, revision: "" }).success).toBe(false);
  for (const ids of [[], ["a", "a"], ["../escape"]]) {
    expect(ContentEditSchema.safeParse({ ...base, change: { ...base.change, categoryIds: ids } }).success).toBe(false);
  }
  expect(ContentEditSchema.safeParse({ revision: "a", change: { kind: "create-category", category: { label: "  ", group: "g" } } }).success).toBe(false);
  expect(ContentEditSchema.safeParse({ revision: "a", change: { kind: "update-category", id: "a", category: { id: "renamed", label: "A", group: "G" } } }).success).toBe(false);
});
