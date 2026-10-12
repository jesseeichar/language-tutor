import { beforeEach, describe, expect, test } from "bun:test";
import { openDatabase, ProgressStore } from "./db";

let store: ProgressStore;
beforeEach(() => {
  store = new ProgressStore(openDatabase(":memory:"));
});

const newSession = (graded = true) =>
  store.createSession({ modeId: "m", graded, categoryIds: ["c"], questionIds: ["q1", "q2"] });

const attempt = (sessionId: string, questionId: string, correct: boolean | null, words: string[] = ["w"]) =>
  store.recordAttempt({
    sessionId, modeId: "m", questionId, response: { a: 1 }, correct,
    pointsAwarded: correct ? 1 : 0, pointsPossible: correct === null ? 0 : 1, refs: { words, topics: [] },
  });

describe("ProgressStore", () => {
  test("round-trips a session", () => {
    const s = newSession();
    expect(store.getSession(s.id)).toEqual(s);
    expect(store.getSession("missing")).toBeNull();
  });

  test("finishing sets finishedAt once", () => {
    const s = newSession();
    store.finishSession(s.id);
    const first = store.getSession(s.id)!.finishedAt;
    expect(first).not.toBeNull();
    store.finishSession(s.id);
    expect(store.getSession(s.id)!.finishedAt).toBe(first);
  });

  test("graded attempts update strengths", () => {
    const s = newSession();
    attempt(s.id, "q1", true);
    expect(store.getStrength("word", "w")).toBe(1);
    attempt(s.id, "q2", false);
    expect(store.getStrength("word", "w")).toBe(-1);
    expect(store.allStrengths().get("word:w")).toBe(-1);
  });

  test("ungraded attempts are recorded but leave strengths alone", () => {
    const s = newSession(false);
    attempt(s.id, "q1", null);
    expect(store.hasAttempt(s.id, "q1")).toBe(true);
    expect(store.allStrengths().size).toBe(0);
  });

  test("a question can only be answered once per session", () => {
    const s = newSession();
    attempt(s.id, "q1", true);
    expect(() => attempt(s.id, "q1", true)).toThrow();
  });

  test("history counts attempts across sessions", () => {
    attempt(newSession().id, "q1", true);
    attempt(newSession().id, "q1", false);
    const h = store.questionHistory("m").get("q1")!;
    expect(h.timesSeen).toBe(2);
    expect(typeof h.lastSeen).toBe("string");
    expect(store.questionHistory("other").size).toBe(0);
  });

  test("session totals add up", () => {
    const s = newSession();
    attempt(s.id, "q1", true);
    attempt(s.id, "q2", false);
    expect(store.sessionTotals(s.id)).toEqual({ answered: 2, correct: 1, pointsAwarded: 1, pointsPossible: 2 });
  });
});
