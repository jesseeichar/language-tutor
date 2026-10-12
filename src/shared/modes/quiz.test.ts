import { describe, expect, mock, test } from "bun:test";
import { QuizQuestionSchema, QuizResponseSchema, quizMode } from "./quiz";

const base = { id: "q", categories: ["c"], refs: { words: ["w"], topics: [] } };
const translation = QuizQuestionSchema.parse({ ...base, type: "translation", de: "Die Tür ist offen.", en: "The door is open." });
const blank = QuizQuestionSchema.parse({ ...base, type: "fill-in-the-blank", prompt: "Das ist ___ Tür.", answer: "die" });
const mc = QuizQuestionSchema.parse({ ...base, type: "multiple-choice", correctIndex: 2,
  de: { prompt: "Die Tür ist offen.", options: ["It is cold.", "It is hot.", "The door is open.", "The door is closed."] },
  en: { prompt: "The door is open.", options: ["Es ist kalt.", "Es ist heiss.", "Die Tür ist offen.", "Die Tür ist zu."] },
});

describe("quiz grading", () => {
  test.each(["de-en", "en-de"] as const)("translation delegates with stored direction %s and preserves literal input", async (direction) => {
    const evaluate = mock(async () => ({ correct: true, score: 1, feedback: "Accepted." }));
    const answer = " A natural alternative. ";
    expect(await quizMode.grade(translation, { type: "translation", answer }, direction, { translation: evaluate })).toMatchObject({ correct: true, score: 1 });
    expect(evaluate).toHaveBeenCalledWith({ source: direction === "de-en" ? "Die Tür ist offen." : "The door is open.",
      reference: direction === "de-en" ? "The door is open." : "Die Tür ist offen.", answer,
      targetLanguage: direction === "de-en" ? "English" : "German" });
  });
  test("translation cannot silently fall back to exact matching without a service", async () => {
    await expect(quizMode.grade(translation, { type: "translation", answer: "The door is open." }, "de-en")).rejects.toThrow("not configured");
  });
  test("blank answers check only the missing text, with exact case", async () => {
    expect((await quizMode.grade(blank, { type: "fill-in-the-blank", answer: "die" }, null)).correct).toBe(true);
    for (const answer of ["Die", "die ", "Das ist die Tür."]) {
      expect((await quizMode.grade(blank, { type: "fill-in-the-blank", answer }, null)).correct).toBe(false);
    }
  });
  test("multiple choice grades the index and explains in the target language", async () => {
    expect((await quizMode.grade(mc, { type: "multiple-choice", optionIndex: 2 }, "de-en"))).toEqual({ correct: true, score: 1, feedback: "Expected answer: The door is open." });
    expect((await quizMode.grade(mc, { type: "multiple-choice", optionIndex: 0 }, "en-de"))).toEqual({ correct: false, score: 0, feedback: "Expected answer: Die Tür ist offen." });
  });
  test("a response for a different question type cannot earn points", async () => {
    expect((await quizMode.grade(translation, { type: "fill-in-the-blank", answer: "The door is open." }, "de-en")).score).toBe(0);
    expect((await quizMode.grade(mc, { type: "translation", answer: "The door is open." }, "de-en")).score).toBe(0);
  });
  test("only the bilingual types are directional; previews and explanations are readable", async () => {
    expect(quizMode.isDirectional!(blank)).toBe(false);
    expect(quizMode.isDirectional!(mc)).toBe(true);
    expect(quizMode.isDirectional!(translation)).toBe(true);
    expect([blank, mc, translation].map(q => quizMode.questionPreview!(q))).toEqual(["Das ist ___ Tür.", "Die Tür ist offen.", "Die Tür ist offen."]);
    expect((await quizMode.grade({ ...blank, explanation: "Feminine noun." }, { type: "fill-in-the-blank", answer: "der" }, null)).feedback).toContain("Feminine noun.");
  });
});

test("schemas reject malformed questions, blanks, choices and response indexes", () => {
  for (const prompt of ["No gap", "___ and ___"]) expect(QuizQuestionSchema.safeParse({ ...blank, prompt }).success).toBe(false);
  for (const correctIndex of [-1, 4, 1.5]) expect(QuizQuestionSchema.safeParse({ ...mc, correctIndex }).success).toBe(false);
  for (const options of [["a", "b"], ["a", "b", "c", "c"], ["a", "b", "c", " "]]) {
    expect(QuizQuestionSchema.safeParse({ ...mc, de: { prompt: "Text", options } }).success).toBe(false);
  }
  expect(QuizQuestionSchema.safeParse({ ...translation, en: "" }).success).toBe(false);
  for (const response of [{ type: "multiple-choice", optionIndex: 4 }, { type: "translation", answer: "" }, { type: "translation", answer: "x", direction: "en-de" }]) {
    expect(QuizResponseSchema.safeParse(response).success).toBe(false);
  }
});

test("typed answers cannot require line breaks that a single-line input cannot enter", () => {
  for (const answer of ["One.\nTwo.", "One.\rTwo.", "One.\r\nTwo."]) {
    expect(QuizQuestionSchema.safeParse({ ...translation, en: answer }).success).toBe(false);
    expect(QuizQuestionSchema.safeParse({ ...translation, de: answer }).success).toBe(false);
    expect(QuizQuestionSchema.safeParse({ ...blank, answer }).success).toBe(false);
  }
});
