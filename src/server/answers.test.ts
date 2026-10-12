import { expect, test } from "bun:test";
import { FIXTURE_DATA_DIR } from "../../tests/support/fixtures";
import { loadContent, type Content } from "./content";
import { ProgressStore } from "./progress";
import { recordAnswer } from "./answers";

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
