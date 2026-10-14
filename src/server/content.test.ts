import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { copyFixtureData, FIXTURE_DATA_DIR, writeJson } from "../../tests/support/fixtures";
import { ContentError, loadContent } from "./content";

async function problemsFor(dir: string): Promise<string[]> {
  try {
    await loadContent(dir);
    return [];
  } catch (e) {
    if (e instanceof ContentError) return e.problems;
    throw e;
  }
}

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function brokenCopy() {
  const copy = copyFixtureData();
  cleanup = copy.cleanup;
  return copy.dir;
}

describe("loadContent", () => {
  test("loads the fixture data", async () => {
    const c = await loadContent(FIXTURE_DATA_DIR);
    expect(c.categories).toHaveLength(8);
    expect(c.questions.get("worksheet")).toHaveLength(10);
    expect(c.words.map((w) => w.id)).toContain("zuerst");
    expect(c.questions.get("flashcards")).toHaveLength(4);
    expect(c.questionTypes.get("flashcards")!.map((t) => t.id)).toEqual(["translation", "fill-in-the-blank"]);
  });

  test("reports a missing file", async () => {
    const dir = brokenCopy();
    rmSync(join(dir, "vocabulary.json"));
    expect(await problemsFor(dir)).toContain("vocabulary.json: file is missing");
  });

  test("reports invalid JSON", async () => {
    const dir = brokenCopy();
    writeJson(dir, "categories.json", "{ nope");
    expect((await problemsFor(dir)).some((p) => p.startsWith("categories.json:"))).toBe(true);
  });

  test("reports unknown references and duplicate ids", async () => {
    const dir = brokenCopy();
    writeJson(dir, "questions/flashcards.json", {
      questions: [
        { id: "a", categories: ["nope"], refs: { words: ["ghost"], topics: ["ghost-topic"] }, front: "f", back: "b" },
        { id: "a", categories: ["vocab-time"], front: "f", back: "b" },
      ],
    });
    const problems = await problemsFor(dir);
    expect(problems).toContain('questions/flashcards.json: "a" uses unknown category "nope"');
    expect(problems).toContain('questions/flashcards.json: "a" refers to unknown word "ghost"');
    expect(problems).toContain('questions/flashcards.json: "a" refers to unknown topic "ghost-topic"');
    expect(problems).toContain('questions/flashcards.json: duplicate question id "a"');
  });

  test("reports schema errors with the question id", async () => {
    const dir = brokenCopy();
    writeJson(dir, "questions/flashcards.json", { questions: [{ id: "x", categories: ["vocab-time"], front: "f" }] });
    expect((await problemsFor(dir)).some((p) => p.startsWith("questions/flashcards.json [x]:") && p.includes("de + en"))).toBe(true);
  });

  test("questions must use a declared type", async () => {
    const dir = brokenCopy();
    writeJson(dir, "questions/flashcards.json", {
      types: [{ id: "translation", label: "T" }, { id: "translation", label: "T again" }],
      questions: [
        { id: "untyped", categories: ["vocab-time"], de: "a", en: "b" },
        { id: "odd", type: "riddle", categories: ["vocab-time"], de: "a", en: "b" },
      ],
    });
    const problems = await problemsFor(dir);
    expect(problems).toContain('questions/flashcards.json: duplicate question type "translation"');
    expect(problems).toContain('questions/flashcards.json: "untyped" needs a type (one of: translation)');
    expect(problems).toContain('questions/flashcards.json: "odd" has unknown type "riddle"');
  });

  test("question types are optional for a mode", async () => {
    const dir = brokenCopy();
    writeJson(dir, "questions/flashcards.json", { questions: [{ id: "x", categories: ["vocab-time"], de: "a", en: "b" }] });
    expect((await loadContent(dir)).questionTypes.get("flashcards")).toEqual([]);
  });

  test("rejects points in an ungraded mode", async () => {
    const dir = brokenCopy();
    writeJson(dir, "questions/flashcards.json", {
      questions: [{ id: "x", categories: ["vocab-time"], front: "f", back: "b", points: 1 }],
    });
    expect((await problemsFor(dir)).some((p) => p.includes("ungraded"))).toBe(true);
  });

  test("reports question files for unregistered modes", async () => {
    const dir = brokenCopy();
    writeJson(dir, "questions/mystery.json", { questions: [] });
    expect((await problemsFor(dir)).some((p) => p.includes('no mode with id "mystery"'))).toBe(true);
  });

  test("a mode without a question file has no questions", async () => {
    const dir = brokenCopy();
    rmSync(join(dir, "questions"), { recursive: true });
    mkdirSync(join(dir, "questions"));
    expect((await loadContent(dir)).questions.get("flashcards")).toEqual([]);
  });

  test("reports unknown parent categories", async () => {
    const dir = brokenCopy();
    writeJson(dir, "categories.json", { categories: [{ id: "x", label: "X", group: "G", parent: "missing" }] });
    expect(await problemsFor(dir)).toContain('categories.json: "x" has unknown parent "missing"');
  });
});
