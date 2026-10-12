import { expect, mock, test } from "bun:test";
import { WorksheetQuestionSchema, worksheetMode } from "./worksheet";

const base = { id: "section", categories: ["worksheet"], title: "An exercise", instructions: "Complete it.", refs: { words: [], topics: [] } };
const question = WorksheetQuestionSchema.parse({ ...base, items: [
  { id: "choice", kind: "choice", prompt: "Category?", options: [{ value: "a", label: "Time" }, { value: "b", label: "Contrast" }], answer: "a" },
  { id: "blank", kind: "blank", prompt: "___ gehe ich.", answers: ["Danach"] },
] });

test("fixed worksheet grades each item, allows sentence-initial capitalization, and reports partial credit", async () => {
  expect(worksheetMode.fixedSession).toBe(true);
  expect(await worksheetMode.grade(question, { answers: { choice: "a", blank: " danach " } }, null)).toMatchObject({ correct: true, score: 1 });
  const partial = await worksheetMode.grade(question, { answers: { choice: "b", blank: "Danach" } }, null);
  expect(partial).toMatchObject({ correct: false, score: 0.5 });
  expect(partial.feedback).toContain("1. Incorrect");
  expect(partial.feedback).toContain("2. Correct");
  expect(await worksheetMode.grade(question, { answers: {} }, null)).toMatchObject({ score: 0 });
});

test("writing sends the original task, rubric and literal answer to the injected service", async () => {
  const q = WorksheetQuestionSchema.parse({ ...base, items: [{ id: "story", kind: "writing", prompt: "Mein Wochenende", rubric: "Use two time connectors.", exampleAnswer: "An example." }] });
  const exercise = mock(async () => ({ correct: true, score: 1, feedback: "Accepted." }));
  const services = { exercise, translation: async () => { throw new Error("not a translation"); } };
  const grade = await worksheetMode.grade(q, { answers: { story: " My own text. " } }, null, services);
  expect(exercise).toHaveBeenCalledWith({ prompt: "Complete it.\nMein Wochenende", rubric: "Use two time connectors.", answer: " My own text. " });
  expect(grade.feedback).toContain("Example answer: An example.");
  await expect(worksheetMode.grade(q, { answers: { story: "My text" } }, null)).rejects.toThrow("not configured");
});

test("personal preferences are checked for completion, without AI or judging the chosen words", async () => {
  const q = WorksheetQuestionSchema.parse({ ...base, items: [{ id: "one", kind: "personal", prompt: "Your word and sentence" }] });
  expect(await worksheetMode.grade(q, { answers: { one: { word: "zunächst", sentence: "Zunächst lese ich." } } }, null)).toMatchObject({ correct: true, score: 1 });
  expect(await worksheetMode.grade(q, { answers: { one: { word: "zunächst", sentence: " " } } }, null)).toMatchObject({ correct: false, score: 0 });
});

test("invalid choices, duplicate items and overly long answers are rejected", () => {
  expect(WorksheetQuestionSchema.safeParse({ ...question, items: [question.items[0], question.items[0]] }).success).toBe(false);
  expect(WorksheetQuestionSchema.safeParse({ ...question, items: [{ ...question.items[0], answer: "missing" }] }).success).toBe(false);
  expect(worksheetMode.responseSchema.safeParse({ answers: { x: "x".repeat(10001) } }).success).toBe(false);
});

test("a failed writing item keeps the section pending until its other AI calls finish", async () => {
  const q = WorksheetQuestionSchema.parse({ ...base, items: ["one", "two"].map(id => ({ id, kind: "writing", prompt: id, rubric: "Write a sentence." })) });
  let release!: () => void;
  const other = new Promise<void>(resolve => { release = resolve; });
  let finished = false;
  const grading = Promise.resolve(worksheetMode.grade(q, { answers: { one: "fail", two: "pending" } }, null, {
    translation: async () => { throw new Error("unused"); },
    exercise: async input => {
      if (input.answer === "fail") throw new Error("unavailable");
      await other; return { correct: true, score: 1 };
    },
  })).catch(error => { finished = true; expect(error.message).toBe("unavailable"); });
  await Bun.sleep(0);
  expect(finished).toBe(false);
  release(); await grading;
  expect(finished).toBe(true);
});
