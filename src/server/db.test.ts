import { beforeEach, describe, expect, test } from "bun:test";
import { openDatabase, ProgressStore, type StoredSession } from "./db";

let store: ProgressStore;
beforeEach(() => {
  store = new ProgressStore(openDatabase(":memory:"));
});

const plan = (over: Partial<StoredSession> = {}) => ({
  modeId: "m", graded: true, categoryIds: ["c"], questionIds: ["q1", "q2"], directions: { q1: "en-de" as const },
  questionTypes: null, direction: "en-de" as const, repeatOf: null, ...over,
});
const newSession = (graded = true) => store.createSession(plan({ graded }));

const attempt = (sessionId: string, questionId: string, correct: boolean | null, words: string[] = ["w"]) =>
  store.recordAttempt({
    sessionId, modeId: "m", questionId, response: { a: 1 }, correct,
    pointsAwarded: correct ? 1 : 0, pointsPossible: correct === null ? 0 : 1, direction: null, refs: { words, topics: [] },
  });

describe("ProgressStore", () => {
  test("round-trips a session", () => {
    const s = newSession();
    expect(store.getSession(s.id)).toEqual(s);
    expect(store.getSession("missing")).toBeNull();
  });

  test("stores the direction of each directional question", () => {
    expect(store.getSession(newSession().id)!.directions).toEqual({ q1: "en-de" });
  });

  test("records the direction an attempt was asked in", () => {
    const db = openDatabase(":memory:");
    const s = new ProgressStore(db);
    const session = s.createSession(plan({ graded: false, questionIds: ["q1"], directions: { q1: "de-en" } }));
    s.recordAttempt({
      sessionId: session.id, modeId: "m", questionId: "q1", response: {}, correct: null,
      pointsAwarded: 0, pointsPossible: 0, direction: "de-en", refs: { words: [], topics: [] },
    });
    expect(db.query("SELECT direction FROM attempts").get()).toEqual({ direction: "de-en" });
  });

  test("stores the learner's choices and the session it repeats", () => {
    const original = newSession();
    const repeat = store.createSession(plan({ questionTypes: ["t1"], direction: "random", repeatOf: original.id }));
    expect(store.getSession(repeat.id)).toMatchObject({ questionTypes: ["t1"], direction: "random", repeatOf: original.id });
    expect(store.getSession(original.id)).toMatchObject({ questionTypes: null, repeatOf: null });
  });

  test("lists sessions newest first", () => {
    const first = newSession();
    const second = newSession();
    expect(store.listSessions().map((x) => x.id)).toEqual([second.id, first.id]);
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
