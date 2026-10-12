import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";
import { copyFixtureData } from "../../tests/support/fixtures";
import { type ContentEdit } from "../shared";
import { ContentEditor } from "./content-editor";
import { loadContent } from "./content";

let copy: ReturnType<typeof copyFixtureData>;
let editor: ContentEditor;
beforeEach(() => { copy = copyFixtureData(); editor = new ContentEditor(copy.dir); });
afterEach(() => copy.cleanup());
const save = async (change: ContentEdit["change"]) => editor.edit({ revision: (await editor.read()).revision, change });

test("creates, renames, reparents and deletes unused categories with stable ids", async () => {
  let snapshot = await save({ kind: "create-category", category: { label: "My practice", group: "Custom" } });
  const id = snapshot.categories.at(-1)!.id;
  snapshot = await save({ kind: "update-category", id, category: { label: "Practice again", group: "Review", parent: "vocab-time", description: "Keep this" } });
  expect(snapshot.categories.find((c) => c.id === id)).toMatchObject({ label: "Practice again", parent: "vocab-time" });
  expect((await new ContentEditor(copy.dir).read()).categories).toEqual(snapshot.categories);
  snapshot = await save({ kind: "update-category", id, category: { label: "Practice", group: "Review" } });
  expect(snapshot.categories.find((c) => c.id === id)!.parent).toBeUndefined();
  snapshot = await save({ kind: "delete-category", id });
  expect(snapshot.categories.some((c) => c.id === id)).toBe(false);
});

test("reassigns questions, retaining mode-specific fields and file metadata", async () => {
  const path = join(copy.dir, "questions/flashcards.json");
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  raw.editorNote = "retain this";
  raw.questions[0].extraMetadata = "retain this too";
  fs.writeFileSync(path, JSON.stringify(raw));
  const id = raw.questions[0].id;
  await save({ kind: "assign-categories", modeId: "flashcards", questionId: id, categoryIds: ["vocab-work", "grammar-cases"] });
  expect(JSON.parse(fs.readFileSync(path, "utf8"))).toEqual({ ...raw, questions: raw.questions.map((q: { id: string }) => q.id === id ? { ...q, categories: ["vocab-work", "grammar-cases"] } : q) });
  expect((await loadContent(copy.dir)).questions.get("flashcards")!.find((q) => q.id === id)!.categories).toEqual(["vocab-work", "grammar-cases"]);
});

test("rejects stale revisions without losing another edit", async () => {
  const original = await editor.read();
  await save({ kind: "create-category", category: { label: "First", group: "Custom" } });
  await expect(editor.edit({ revision: original.revision, change: { kind: "create-category", category: { label: "Stale", group: "Custom" } } })).rejects.toThrow("Reload the editor");
  expect((await editor.read()).categories.some((c) => c.label === "First")).toBe(true);
  expect((await editor.read()).categories.some((c) => c.label === "Stale")).toBe(false);
});

test("rejects parent cycles, missing references and deletion of categories in use", async () => {
  const original = await editor.read();
  const parent = original.categories.find((c) => c.id === "vocab-connectors")!;
  await expect(save({ kind: "update-category", id: parent.id, category: { label: parent.label, group: parent.group, parent: "vocab-time" } })).rejects.toThrow("parent cycle");
  await expect(save({ kind: "create-category", category: { label: "Bad", group: "Custom", parent: "missing" } })).rejects.toThrow("unknown parent");
  await expect(save({ kind: "delete-category", id: "vocab-time" })).rejects.toThrow("still used");
  await expect(save({ kind: "assign-categories", modeId: "flashcards", questionId: "fc-zuerst", categoryIds: ["missing"] })).rejects.toThrow("existing categories");
  expect((await editor.read()).revision).toBe(original.revision);
});

test("failed writes leave content intact and permit retry", async () => {
  const original = await editor.read();
  const failure = spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("disk failure"); });
  try { await expect(save({ kind: "create-category", category: { label: "New", group: "G" } })).rejects.toThrow("disk failure"); }
  finally { failure.mockRestore(); }
  expect((await editor.read()).revision).toBe(original.revision);
  expect((await save({ kind: "create-category", category: { label: "New", group: "G" } })).categories.at(-1)!.label).toBe("New");
});

test("duplicate labels receive distinct ids and referenced category definitions stay intact", async () => {
  await save({ kind: "create-category", category: { label: "Review", group: "G" } });
  const result = await save({ kind: "create-category", category: { label: "Review", group: "G" } });
  expect(result.categories.slice(-2).map((c) => c.id)).toEqual(["custom-review", "custom-review-2"]);
});
