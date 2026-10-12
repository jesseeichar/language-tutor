import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { CreateSessionResponse, QuizQuestion, SessionSummary, SubmitAnswerResponse } from "../shared";
import { copyFixtureData } from "../../tests/support/fixtures";
import { startServer } from "./app";

let copy: ReturnType<typeof copyFixtureData>;
let server: ReturnType<typeof startServer>;
let progressPath: string;
beforeEach(() => {
  copy = copyFixtureData(); progressPath = join(copy.dir, "progress.json");
  server = startServer({ dataDir: copy.dir, progressPath, port: 0 });
});
afterEach(() => { server.stop(true); copy.cleanup(); });
const post = (path: string, body: unknown) => fetch(`http://localhost:${server.port}${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
async function start(questionTypes: string[], direction = "de-en") {
  const res = await post("/api/sessions", { modeId: "quiz", categoryIds: ["vocab-connectors", "grammar-cases"], questionTypes, direction });
  expect(res.status).toBe(200);
  return await res.json() as CreateSessionResponse;
}

test.each(["de-en", "en-de"])("the server grades translation using session direction %s, and repeat preserves it", async (direction) => {
  const session = await start(["translation"], direction);
  const question = session.questions[0] as Extract<QuizQuestion, { type: "translation" }>;
  const answer = direction === "de-en" ? question.en : question.de;
  const res = await post(`/api/sessions/${session.session.id}/answers`, { questionId: question.id, response: { type: "translation", answer } });
  expect(res.status).toBe(200);
  expect((await res.json() as SubmitAnswerResponse).grade).toMatchObject({ correct: true, score: 1 });
  const repeated = await (await post(`/api/sessions/${session.session.id}/repeat`, {})).json() as CreateSessionResponse;
  expect(repeated.directions).toEqual(session.directions);
  expect(repeated.questions).toEqual(session.questions);
});

test("graded attempts, exact mismatches, scores, strengths and history survive a restart", async () => {
  const session = await start(["multiple-choice", "fill-in-the-blank", "translation"], "en-de");
  for (const base of session.questions) {
    const q = base as QuizQuestion;
    const response = q.type === "multiple-choice" ? { type: q.type, optionIndex: q.correctIndex }
      : { type: q.type, answer: q.type === "translation" ? `${q.de} ` : "wrong" };
    const res = await post(`/api/sessions/${session.session.id}/answers`, { questionId: q.id, response });
    expect(res.status).toBe(200);
    expect((await res.json() as SubmitAnswerResponse).grade?.correct).toBe(q.type === "multiple-choice");
  }
  const summary = await (await post(`/api/sessions/${session.session.id}/finish`, {})).json() as SessionSummary;
  expect(summary).toMatchObject({ answered: 7, correct: 4, pointsAwarded: 4, pointsPossible: 7 });
  const saved = await Bun.file(progressPath).json();
  expect(saved.attempts).toHaveLength(7);
  expect(saved.strengths.find((s: any) => s.itemId === "kasus")).toMatchObject({ score: -2, attempts: 1, correct: 0 });
  expect(saved.strengths.find((s: any) => s.itemId === "zuerst")).toMatchObject({ score: 0, attempts: 3, correct: 2 });
  server.stop(true);
  server = startServer({ dataDir: copy.dir, progressPath, port: 0 });
  const history = await (await fetch(`http://localhost:${server.port}/api/sessions`)).json() as SessionSummary[];
  expect(history[0]).toMatchObject(summary);
});

test("invalid responses do not consume the attempt; identical retries are safe and changed answers are rejected", async () => {
  const session = await start(["multiple-choice"], "en-de");
  const question = session.questions[0] as Extract<QuizQuestion, { type: "multiple-choice" }>;
  const path = `/api/sessions/${session.session.id}/answers`;
  for (const response of [{ type: "multiple-choice", optionIndex: 99 }, { type: "multiple-choice", optionIndex: question.correctIndex, direction: "de-en" }]) {
    expect((await post(path, { questionId: question.id, response })).status).toBe(400);
  }
  const body = { questionId: question.id, response: { type: "multiple-choice", optionIndex: question.correctIndex } };
  expect((await post(path, body)).status).toBe(200);
  expect((await post(path, body)).status).toBe(200);
  expect((await post(path, { ...body, response: { ...body.response, optionIndex: (question.correctIndex + 1) % 4 } })).status).toBe(409);
});

test("a translation-only bank defaults to its available questions", async () => {
  const path = join(copy.dir, "questions/quiz.json");
  const file = await Bun.file(path).json();
  file.types = file.types.filter((t: { id: string }) => t.id === "translation");
  file.questions = file.questions.filter((q: QuizQuestion) => q.type === "translation");
  await Bun.write(path, JSON.stringify(file));
  const res = await post("/api/sessions", { modeId: "quiz", categoryIds: ["vocab-connectors"] });
  expect(res.status).toBe(200);
  const session = await res.json() as CreateSessionResponse;
  expect(session.questions).toHaveLength(2);
  expect(session.questions.every(q => q.type === "translation")).toBe(true);
});

test("saved feedback and possible points survive restart and question edits or deletion", async () => {
  const session = await start(["translation"]);
  const q = session.questions[0] as Extract<QuizQuestion, { type: "translation" }>;
  const body = { questionId: q.id, response: { type: "translation", answer: q.en } };
  const path = `/api/sessions/${session.session.id}/answers`;
  const first = await (await post(path, body)).json();
  const original = await (await post(`/api/sessions/${session.session.id}/finish`, {})).json() as SessionSummary;
  const filePath = join(copy.dir, "questions/quiz.json");
  const file = await Bun.file(filePath).json();
  file.questions = file.questions.filter((other: QuizQuestion) => other.id !== q.id).map((other: QuizQuestion) => ({ ...other, points: 100 }));
  await Bun.write(filePath, JSON.stringify(file));
  server.stop(true);
  server = startServer({ dataDir: copy.dir, progressPath, port: 0 });
  expect(await (await post(path, body)).json()).toEqual(first);
  const log = await (await fetch(`http://localhost:${server.port}/api/sessions`)).json() as SessionSummary[];
  expect(log[0]).toMatchObject(original);
  expect(log[0]!.pointsPossible).toBe(2);
  expect((await Bun.file(progressPath).json()).attempts).toHaveLength(1);
});

test("the default session selects 25 vocabulary multiple-choice questions and 5 grammar questions", async () => {
  const path = join(copy.dir, "questions/quiz.json");
  const file = await Bun.file(path).json();
  const choice = file.questions.find((q: QuizQuestion) => q.type === "multiple-choice");
  const blank = file.questions.find((q: QuizQuestion) => q.type === "fill-in-the-blank");
  file.questions.push(...Array.from({ length: 30 }, (_, i) => ({ ...choice, id: `extra-choice-${i}` })),
    ...Array.from({ length: 5 }, (_, i) => ({ ...blank, id: `extra-blank-${i}` })));
  await Bun.write(path, JSON.stringify(file));
  const res = await post("/api/sessions", { modeId: "quiz", categoryIds: ["vocab-connectors", "grammar-cases"] });
  expect(res.status).toBe(200);
  const session = await res.json() as CreateSessionResponse;
  expect(session.questions.filter(q => q.type === "multiple-choice")).toHaveLength(25);
  expect(session.questions.filter(q => q.refs.topics.length > 0)).toHaveLength(5);
  expect(session.questions.some(q => q.type === "translation")).toBe(false);
});
