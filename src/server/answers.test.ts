import { expect, mock, test } from "bun:test";
import { FIXTURE_DATA_DIR } from "../../tests/support/fixtures";
import { loadContent, type Content } from "./content";
import { ProgressStore } from "./progress";
import { recordAnswer as record } from "./answers";
import type { GradingServices } from "./jev";
const services: GradingServices = { translation: async () => ({ correct: true, score: 1, feedback: "Accepted." }) };
const recordAnswer: typeof record = (store, id, body, content, grading = services) => record(store, id, body, content, grading);

const content = await loadContent(FIXTURE_DATA_DIR);
const questionId = "quiz-translate-zuerst-report";
const body = { questionId, response: { type: "translation", answer: "First, we read the report." } };
function setup() {
  const store = new ProgressStore(null);
  const session = store.createSession({ modeId: "quiz", graded: true, categoryIds: ["vocab-time"],
    questionIds: [questionId], questionPoints: { [questionId]: 2 }, directions: { [questionId]: "de-en" },
    questionTypes: ["translation"], direction: "de-en", repeatOf: null });
  return { store, session };
}

test("identical retries return the saved grade after finish without rereading content or adding strength", async () => {
  const { store, session } = setup();
  const result = await recordAnswer(store, session.id, body, async () => content);
  store.finishSession(session.id);
  const retry = await recordAnswer(store, session.id, body, async () => { throw new Error("content was removed"); });
  expect(retry).toEqual(result);
  expect(result).toMatchObject({ pointsAwarded: 2, pointsPossible: 2 });
  expect(store.getStrength("word", "zuerst")).toBe(1);
  expect(store.sessionTotals(session.id).answered).toBe(1);
  await expect(recordAnswer(store, session.id, { ...body, response: { ...body.response, answer: "changed" } }, async () => content)).rejects.toMatchObject({ status: 409 });
});

test("finishing while content is being read prevents the pending answer from committing", async () => {
  const { store, session } = setup();
  let release!: (content: Content) => void;
  const reading = new Promise<Content>(resolve => { release = resolve; });
  const answer = recordAnswer(store, session.id, body, () => reading);
  store.finishSession(session.id);
  release(content);
  await expect(answer).rejects.toMatchObject({ status: 409 });
  expect(store.sessionTotals(session.id).answered).toBe(0);
  expect(store.getStrength("word", "zuerst")).toBe(0);
});

test("concurrent identical requests commit once; concurrent changed answers cannot overwrite it", async () => {
  const { store, session } = setup();
  const [first, second] = await Promise.all([
    recordAnswer(store, session.id, body, async () => content),
    recordAnswer(store, session.id, body, async () => content),
  ]);
  expect(first).toEqual(second);
  expect(store.sessionTotals(session.id)).toMatchObject({ answered: 1, correct: 1 });
  expect(store.getStrength("word", "zuerst")).toBe(1);
});

test("legacy attempts without saved feedback still return their recorded grade", async () => {
  const { store, session } = setup();
  store.recordAttempt({ sessionId: session.id, modeId: "quiz", questionId, response: body.response,
    correct: false, pointsAwarded: 0, pointsPossible: 2, direction: "de-en", refs: { words: ["zuerst"], topics: [] } });
  expect(await recordAnswer(store, session.id, body, async () => content)).toEqual({
    grade: { correct: false, score: 0 }, pointsAwarded: 0, pointsPossible: 2,
  });
});

function deferredGrader() {
  let resolve!: (grade: { correct: boolean; score: number; feedback: string }) => void;
  let reject!: (error: Error) => void;
  let entered!: () => void;
  const started = new Promise<void>(done => { entered = done; });
  const promise = new Promise<{ correct: boolean; score: number; feedback: string }>((done, fail) => { resolve = done; reject = fail; });
  const translation = mock(() => { entered(); return promise; });
  return { grading: { translation }, started, resolve, reject };
}

test("pending identical answers share one AI call; conflicting answers fail and saved retries never grade again", async () => {
  const { store, session } = setup();
  const grader = deferredGrader();
  const first = recordAnswer(store, session.id, body, async () => content, grader.grading);
  await grader.started;
  const second = recordAnswer(store, session.id, body, async () => content, grader.grading);
  await expect(recordAnswer(store, session.id, { ...body, response: { ...body.response, answer: "other" } }, async () => content, grader.grading)).rejects.toMatchObject({ status: 409 });
  expect(grader.grading.translation).toHaveBeenCalledTimes(1);
  expect(store.sessionTotals(session.id).answered).toBe(0);
  grader.resolve({ correct: true, score: 1, feedback: "Jev result" });
  const result = await first;
  expect(await second).toEqual(result);
  expect(await recordAnswer(store, session.id, body, async () => content, grader.grading)).toEqual(result);
  expect(grader.grading.translation).toHaveBeenCalledTimes(1);
  expect(store.getStrength("word", "zuerst")).toBe(1);
});

test("finishing during AI grading prevents a late grade from committing", async () => {
  const { store, session } = setup();
  const grader = deferredGrader();
  const answer = recordAnswer(store, session.id, body, async () => content, grader.grading);
  await grader.started;
  store.finishSession(session.id);
  grader.resolve({ correct: true, score: 1, feedback: "Jev result" });
  await expect(answer).rejects.toMatchObject({ status: 409 });
  expect(store.sessionTotals(session.id).answered).toBe(0);
  expect(store.getStrength("word", "zuerst")).toBe(0);
});

test("failed grading leaves no attempt or penalty and releases the pending slot for retry", async () => {
  const { store, session } = setup();
  const grader = deferredGrader();
  const answer = recordAnswer(store, session.id, body, async () => content, grader.grading);
  await grader.started;
  grader.reject(new Error("unavailable"));
  await expect(answer).rejects.toThrow("unavailable");
  expect(store.sessionTotals(session.id).answered).toBe(0);
  expect(store.getStrength("word", "zuerst")).toBe(0);
  const retry = await recordAnswer(store, session.id, body, async () => content);
  expect(retry.pointsAwarded).toBe(2);
  expect(store.sessionTotals(session.id).answered).toBe(1);
});

test("pruning a session during AI grading returns a clear error without recording a late answer", async () => {
  const { store, session } = setup();
  const grader = deferredGrader();
  const answer = recordAnswer(store, session.id, body, async () => content, grader.grading);
  await grader.started;
  for (let i = 0; i < 50; i++) store.createSession({ ...session, repeatOf: null });
  grader.resolve({ correct: true, score: 1, feedback: "Accepted" });
  await expect(answer).rejects.toMatchObject({ status: 404 });
  expect(store.getSession(session.id)).toBeNull();
  expect(store.getStrength("word", "zuerst")).toBe(0);
});
