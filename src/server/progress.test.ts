import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProgressStore, type StoredSession } from "./progress";
import { parseProgress } from "./progress-schema";

let store: ProgressStore;
let dir: string;
let path: string;
beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), "lt-progress-store-"));
  path = join(dir, "progress.json");
  store = new ProgressStore(path);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  setSystemTime();
});

const plan = (over: Partial<StoredSession> = {}) => ({
  modeId: "m", graded: true, categoryIds: ["c"], questionIds: ["q1", "q2"], directions: { q1: "en-de" as const },
  questionTypes: null, direction: "en-de" as const, repeatOf: null, ...over,
});
const newSession = (graded = true) => store.createSession(plan({ graded }));

const attempt = (sessionId: string, questionId: string, correct: boolean | null, words: string[] = ["w"]) =>
  store.recordAttempt({
    sessionId, modeId: "m", questionId, response: { a: 1 }, correct,
    pointsAwarded: correct ? 1 : 0, pointsPossible: correct === null ? 0 : 1, direction: store.getSession(sessionId)!.directions[questionId] ?? null, refs: { words, topics: [] },
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

  test("stores the learner's choices and the session it repeats", () => {
    const original = newSession();
    const repeat = store.createSession(plan({ questionTypes: ["t1"], direction: "random", repeatOf: original.id }));
    expect(store.getSession(repeat.id)).toMatchObject({ questionTypes: ["t1"], direction: "random", repeatOf: original.id });
    expect(store.getSession(original.id)).toMatchObject({ questionTypes: null, repeatOf: null });
  });

  test("lists sessions newest first", () => {
    setSystemTime(new Date("2026-10-12T12:00:00.000Z"));
    const first = newSession();
    const second = newSession();
    expect(store.listSessions().map((x) => x.id)).toEqual([second.id, first.id]);
    expect(new ProgressStore(path).listSessions().map((x) => x.id)).toEqual([second.id, first.id]);
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
    const saved = fs.readFileSync(path, "utf8");
    expect(() => attempt(s.id, "q1", true)).toThrow();
    expect(fs.readFileSync(path, "utf8")).toBe(saved);
    expect(store.getStrength("word", "w")).toBe(1);
  });

  test("a finished session cannot gain a late answer or strength update", () => {
    const s = newSession();
    store.finishSession(s.id);
    const saved = fs.readFileSync(path, "utf8");
    expect(() => attempt(s.id, "q1", true)).toThrow("Session is already finished");
    expect(fs.readFileSync(path, "utf8")).toBe(saved);
    expect(store.getStrength("word", "w")).toBe(0);
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

describe("persistence and recovery", () => {
  test("restores complete progress in a fresh location without question content", () => {
    const graded = newSession();
    attempt(graded.id, "q1", true);
    attempt(graded.id, "q2", false);
    store.finishSession(graded.id);
    const ungraded = newSession(false);
    attempt(ungraded.id, "q1", null);
    const repeat = store.createSession(plan({ repeatOf: graded.id }));
    const restoredPath = join(dir, "fresh-checkout", "data", "progress.json");
    fs.mkdirSync(join(dir, "fresh-checkout", "data"), { recursive: true });
    fs.copyFileSync(path, restoredPath);
    const restored = new ProgressStore(restoredPath);
    expect(restored.listSessions()).toEqual(store.listSessions());
    expect(restored.allStrengths()).toEqual(store.allStrengths());
    expect(restored.questionHistory("m")).toEqual(store.questionHistory("m"));
    for (const session of store.listSessions()) {
      expect(restored.sessionTotals(session.id)).toEqual(store.sessionTotals(session.id));
    }
    expect(restored.getSession(ungraded.id)!.finishedAt).toBeNull();
    expect(restored.getSession(repeat.id)!.repeatOf).toBe(graded.id);
    expect(restored.getSession(graded.id)!.finishedAt).not.toBeNull();
    const saved = parseProgress(JSON.parse(fs.readFileSync(restoredPath, "utf8")));
    expect(saved.attempts[0]).toMatchObject({ response: { a: 1 }, direction: "en-de" });
    expect(saved.strengths[0]).toMatchObject({ score: -1, attempts: 2, correct: 1 });
    const newRepeat = restored.createSession(plan({ repeatOf: repeat.id }));
    expect(new ProgressStore(restoredPath).getSession(newRepeat.id)).toEqual(newRepeat);
  });

  test("failed answer save changes neither memory nor disk, and can be retried", () => {
    const session = newSession();
    const saved = fs.readFileSync(path, "utf8");
    const failure = spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("disk failure"); });
    try {
      expect(() => attempt(session.id, "q1", true)).toThrow("disk failure");
      expect(store.hasAttempt(session.id, "q1")).toBe(false);
      expect(store.getStrength("word", "w")).toBe(0);
      expect(fs.readFileSync(path, "utf8")).toBe(saved);
    } finally {
      failure.mockRestore();
    }
    attempt(session.id, "q1", true);
    const restarted = new ProgressStore(path);
    expect(restarted.hasAttempt(session.id, "q1")).toBe(true);
    expect(restarted.getStrength("word", "w")).toBe(1);
  });

  test("failed session creation and completion leave memory and disk unchanged", () => {
    const session = newSession();
    const saved = fs.readFileSync(path, "utf8");
    const failure = spyOn(fs, "fsyncSync").mockImplementation(() => { throw new Error("disk failure"); });
    try {
      expect(() => newSession()).toThrow("disk failure");
      expect(() => store.finishSession(session.id)).toThrow("disk failure");
      expect(store.listSessions()).toEqual([session]);
      expect(fs.readFileSync(path, "utf8")).toBe(saved);
    } finally {
      failure.mockRestore();
    }
  });

  test("invalid references cannot change saved progress", () => {
    const session = newSession();
    const saved = fs.readFileSync(path, "utf8");
    expect(() => store.createSession(plan({ repeatOf: "missing" }))).toThrow("invalid repeatOf");
    expect(() => attempt(session.id, "foreign-question", true)).toThrow("invalid session or question reference");
    expect(() => store.recordAttempt({
      sessionId: "missing", modeId: "m", questionId: "q1", response: {}, correct: true,
      pointsAwarded: 1, pointsPossible: 1, direction: null, refs: { words: ["w"], topics: [] },
    })).toThrow("invalid session or question reference");
    expect(store.allStrengths().size).toBe(0);
    expect(fs.readFileSync(path, "utf8")).toBe(saved);
  });

  test("external changes cannot advance in-memory progress", () => {
    const session = newSession();
    const edited = `${fs.readFileSync(path, "utf8")}\n`;
    fs.writeFileSync(path, edited);
    expect(() => attempt(session.id, "q1", true)).toThrow("Restart the server");
    expect(store.hasAttempt(session.id, "q1")).toBe(false);
    expect(store.getStrength("word", "w")).toBe(0);
    expect(fs.readFileSync(path, "utf8")).toBe(edited);
  });

  test("returned sessions and input objects cannot mutate stored state", () => {
    const input = plan();
    const session = store.createSession(input);
    input.questionIds.push("other");
    session.directions.q1 = "de-en";
    store.getSession(session.id)!.questionIds.length = 0;
    store.listSessions()[0]!.categoryIds.length = 0;
    expect(store.getSession(session.id)).toEqual(new ProgressStore(path).getSession(session.id));
  });
});

describe("50-session retention", () => {
  test("creating session 51 prunes its source but returns a valid repeat and preserves learning", () => {
    const original = newSession();
    attempt(original.id, "q1", true);
    for (let i = 1; i < 50; i++) newSession();
    const repeat = store.createSession(plan({ repeatOf: original.id }));
    expect(repeat.repeatOf).toBeNull();
    expect(repeat.questionIds).toEqual(original.questionIds);
    expect(store.getSession(original.id)).toBeNull();
    expect(store.hasAttempt(original.id, "q1")).toBe(false);
    expect(store.listSessions()).toHaveLength(50);
    expect(store.getStrength("word", "w")).toBe(1);
    expect(store.questionHistory("m").get("q1")!.timesSeen).toBe(1);
    attempt(repeat.id, "q1", false);
    const restored = new ProgressStore(path);
    expect(restored.listSessions()).toEqual(store.listSessions());
    expect(restored.questionHistory("m").get("q1")!.timesSeen).toBe(2);
    expect(restored.getStrength("word", "w")).toBe(-1);
  });

  test("existing oversized files are compacted on load and compaction is not counted twice", () => {
    const original = newSession();
    attempt(original.id, "q1", true);
    const data = parseProgress(JSON.parse(fs.readFileSync(path, "utf8")));
    for (let i = 1; i < 60; i++) data.sessions.push({ ...original, id: `legacy-${i}`, repeatOf: original.id });
    fs.writeFileSync(path, JSON.stringify(data));
    const restored = new ProgressStore(path);
    const saved = parseProgress(JSON.parse(fs.readFileSync(path, "utf8")));
    expect(saved.sessions).toHaveLength(50);
    expect(saved.attempts).toHaveLength(0);
    expect(saved.strengths).toEqual(data.strengths);
    expect(saved.sessions.every(s => s.repeatOf === null)).toBe(true);
    expect(restored.questionHistory("m").get("q1")!.timesSeen).toBe(1);
    expect(new ProgressStore(path).questionHistory("m")).toEqual(restored.questionHistory("m"));
  });

  test("a failed pruning save leaves both the old history and learning data intact", () => {
    for (let i = 0; i < 50; i++) newSession();
    const before = store.listSessions();
    const saved = fs.readFileSync(path, "utf8");
    const failure = spyOn(fs, "renameSync").mockImplementation(() => { throw new Error("disk failure"); });
    try {
      expect(() => newSession()).toThrow("disk failure");
      expect(store.listSessions()).toEqual(before);
      expect(fs.readFileSync(path, "utf8")).toBe(saved);
    } finally { failure.mockRestore(); }
  });
});
