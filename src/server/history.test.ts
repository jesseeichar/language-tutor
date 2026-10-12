import { describe, expect, test } from "bun:test";
import { FIXTURE_DATA_DIR } from "../../tests/support/fixtures";
import { loadContent } from "./content";
import type { StoredSession } from "./db";
import { logEntry, summarize, toSessionInfo } from "./history";

const content = await loadContent(FIXTURE_DATA_DIR);

const session: StoredSession = {
  id: "s1", modeId: "flashcards", graded: false, categoryIds: ["vocab-time", "gone-category"],
  questionTypes: ["translation", "gone-type"], direction: "random", repeatOf: "s0",
  questionIds: ["fc-zuerst", "fc-deleted"], directions: { "fc-zuerst": "de-en" },
  startedAt: "2026-10-12T10:00:00Z", finishedAt: "2026-10-12T10:05:00Z",
};
const totals = { answered: 1, correct: 0, pointsAwarded: 0 };

describe("toSessionInfo", () => {
  test("keeps only the public fields", () => {
    expect(Object.keys(toSessionInfo(session)).sort()).toEqual(
      ["categoryIds", "direction", "graded", "id", "modeId", "questionTypes", "repeatOf", "startedAt"],
    );
  });
});

describe("summarize", () => {
  test("ungraded sessions have no correct count and no points", () => {
    expect(summarize(session, totals, content)).toMatchObject({ totalQuestions: 2, answered: 1, correct: null, pointsPossible: 0 });
  });
  test("graded sessions report the correct count", () => {
    expect(summarize({ ...session, graded: true }, { ...totals, correct: 1 }, content).correct).toBe(1);
  });
});

describe("logEntry", () => {
  const entry = logEntry(session, totals, content);
  test("resolves labels and falls back to ids for removed data", () => {
    expect(entry.modeTitle).toBe("Flashcards");
    expect(entry.categoryLabels).toEqual(["Time", "gone-category"]);
    expect(entry.questionTypeLabels).toEqual(["Translation", "gone-type"]);
  });
  test("null question types mean all types", () => {
    expect(logEntry({ ...session, questionTypes: null }, totals, content).questionTypeLabels).toBeNull();
  });
  test("carries finish time and the repeated session", () => {
    expect(entry.finishedAt).toBe("2026-10-12T10:05:00Z");
    expect(entry.session.repeatOf).toBe("s0");
  });
});
