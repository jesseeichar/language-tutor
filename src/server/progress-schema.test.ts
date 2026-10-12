import { describe, expect, test } from "bun:test";
import { emptyProgress, parseProgress, type ProgressData } from "./progress-schema";

function log(): ProgressData {
  const time = "2026-10-12T12:00:00.000Z";
  return {
    version: 1,
    sessions: [{
      id: "s", modeId: "retired-mode", graded: true, categoryIds: ["deleted-category"],
      questionIds: ["deleted-question"], directions: { "deleted-question": "de-en" },
      questionTypes: null, direction: "de-en", repeatOf: null, startedAt: time, finishedAt: null,
    }],
    attempts: [{
      sessionId: "s", modeId: "retired-mode", questionId: "deleted-question", response: { answer: "ä" },
      correct: true, pointsAwarded: 1, pointsPossible: 1, direction: "de-en", answeredAt: time,
    }],
    strengths: [{ itemType: "word", itemId: "deleted-word", score: 1, attempts: 1, correct: 1, updatedAt: time }],
  };
}

describe("progress schema", () => {
  test("accepts empty progress and history whose content no longer exists", () => {
    expect(parseProgress(emptyProgress())).toEqual(emptyProgress());
    expect(parseProgress(log())).toEqual(log());
  });

  const invalid: [string, (data: ProgressData) => void][] = [
    ["duplicate session", (d) => d.sessions.push(d.sessions[0]!)],
    ["missing repeat", (d) => { d.sessions[0]!.repeatOf = "missing"; }],
    ["self repeat", (d) => { d.sessions[0]!.repeatOf = "s"; }],
    ["duplicate question", (d) => d.sessions[0]!.questionIds.push("deleted-question")],
    ["foreign direction", (d) => { d.sessions[0]!.directions.other = "en-de"; }],
    ["missing session", (d) => { d.attempts[0]!.sessionId = "missing"; }],
    ["foreign question", (d) => { d.attempts[0]!.questionId = "other"; }],
    ["wrong mode", (d) => { d.attempts[0]!.modeId = "other"; }],
    ["duplicate answer", (d) => d.attempts.push(d.attempts[0]!)],
    ["wrong direction", (d) => { d.attempts[0]!.direction = "en-de"; }],
    ["wrong grading", (d) => { d.attempts[0]!.correct = null; }],
    ["excess points", (d) => { d.attempts[0]!.pointsAwarded = 2; }],
    ["invalid timestamp", (d) => { d.attempts[0]!.answeredAt = "yesterday"; }],
    ["duplicate strength", (d) => d.strengths.push(d.strengths[0]!)],
    ["invalid score", (d) => { d.strengths[0]!.score = 11; }],
    ["invalid counters", (d) => { d.strengths[0]!.correct = 2; }],
  ];
  test.each(invalid)("rejects %s", (_, change) => {
    const data = log();
    change(data);
    expect(() => parseProgress(data)).toThrow();
  });

  test("rejects unsupported versions, missing response and unexpected fields", () => {
    expect(() => parseProgress({ ...log(), version: 2 })).toThrow();
    expect(() => parseProgress({ ...log(), extra: "must not be silently discarded" })).toThrow();
    const data = log();
    const { response, ...attempt } = data.attempts[0]!;
    expect(() => parseProgress({ ...data, attempts: [attempt] })).toThrow();
  });
});
