import { expect, test } from "bun:test";
import { emptyProgress, parseProgress, type ProgressData } from "./progress-schema";
import { retainRecentSessions } from "./progress-retention";

function history(count: number): ProgressData {
  const data = emptyProgress();
  const time = "2026-10-12T12:00:00.000Z";
  for (let i = 0; i < count; i++) {
    data.sessions.push({ id: `s${i}`, modeId: "flashcards", graded: false, categoryIds: ["c"], questionIds: ["q"],
      directions: { q: "de-en" }, direction: "de-en", questionTypes: null, repeatOf: i ? `s${i - 1}` : null,
      startedAt: time, finishedAt: i % 2 ? time : null });
    data.attempts.push({ sessionId: `s${i}`, modeId: "flashcards", questionId: "q", response: { revealed: true },
      correct: null, pointsAwarded: 0, pointsPossible: 0, direction: "de-en", answeredAt: time });
  }
  data.strengths.push({ itemType: "word", itemId: "w", score: 8, attempts: 90, correct: 80, updatedAt: time });
  return parseProgress(data);
}

test("50 sessions remain untouched, including repeats and unfinished sessions", () => {
  const data = history(50);
  const before = structuredClone(data);
  expect(retainRecentSessions(data)).toBe(false);
  expect(data).toEqual(before);
});

test("prunes sessions and answers, preserves scores and repeat snapshots, and compacts learning history", () => {
  const data = history(53);
  const strengths = structuredClone(data.strengths);
  expect(retainRecentSessions(data)).toBe(true);
  expect(data.sessions.map(s => s.id)).toEqual(Array.from({ length: 50 }, (_, i) => `s${i + 3}`));
  expect(data.attempts).toHaveLength(50);
  expect(data.attempts.some(a => a.sessionId === "s0")).toBe(false);
  expect(data.sessions[0]).toMatchObject({ repeatOf: null, questionIds: ["q"], directions: { q: "de-en" } });
  expect(data.sessions[1]!.repeatOf).toBe("s3");
  expect(data.strengths).toEqual(strengths);
  expect(data.archivedQuestionHistory).toEqual([{ modeId: "flashcards", questionId: "q", timesSeen: 3, lastSeen: "2026-10-12T12:00:00.000Z" }]);
  expect(parseProgress(data)).toEqual(data);
  const before = structuredClone(data);
  expect(retainRecentSessions(data)).toBe(false);
  expect(data).toEqual(before);
});

test("compaction accumulates counts per mode and question and keeps the latest answer date", () => {
  const data = history(52);
  data.archivedQuestionHistory = [
    { modeId: "flashcards", questionId: "q", timesSeen: 7, lastSeen: "2026-10-13T12:00:00.000Z" },
    { modeId: "quiz", questionId: "q", timesSeen: 2, lastSeen: "2026-10-11T12:00:00.000Z" },
  ];
  retainRecentSessions(data);
  expect(data.archivedQuestionHistory).toEqual([
    { modeId: "flashcards", questionId: "q", timesSeen: 9, lastSeen: "2026-10-13T12:00:00.000Z" },
    { modeId: "quiz", questionId: "q", timesSeen: 2, lastSeen: "2026-10-11T12:00:00.000Z" },
  ]);
});
