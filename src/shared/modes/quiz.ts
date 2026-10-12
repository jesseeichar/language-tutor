import { z } from "zod";
import { QuestionBaseSchema } from "../content";
import type { GradedMode } from "../mode";

const text = z.string().min(1).refine((s) => s.trim().length > 0, "text must not be blank");
const answerText = text.refine((s) => !/[\r\n]/.test(s), "typed answers must be on a single line");
const base = QuestionBaseSchema.extend({ explanation: text.optional() });
const choices = z.array(text).length(4).refine((items) => new Set(items).size === items.length, "options must be distinct");
const side = z.object({ prompt: text, options: choices });

export const QuizQuestionSchema = z.discriminatedUnion("type", [
  base.extend({
    type: z.literal("multiple-choice"), de: side, en: side,
    correctIndex: z.number().int().min(0).max(3),
  }),
  base.extend({
    type: z.literal("fill-in-the-blank"),
    prompt: text.refine((s) => s.split("___").length === 2, "prompt must contain exactly one ___ blank"),
    answer: answerText,
  }),
  base.extend({ type: z.literal("translation"), de: answerText, en: answerText }),
]);
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const QuizResponseSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("multiple-choice"), optionIndex: z.number().int().min(0).max(3) }),
  z.strictObject({ type: z.literal("fill-in-the-blank"), answer: z.string().min(1) }),
  z.strictObject({ type: z.literal("translation"), answer: z.string().min(1) }),
]);
export type QuizResponse = z.infer<typeof QuizResponseSchema>;

export const quizMode: GradedMode<QuizQuestion, QuizResponse> = {
  id: "quiz",
  title: "Quiz",
  description: "Multiple choice, fill in the blank, and AI-graded translation. The default mix aims for 25 vocabulary and 5 grammar questions; select Translation to include it.",
  graded: true,
  defaultPoints: 1,
  defaultSessionSize: 30,
  defaultQuestionTypes: ["multiple-choice", "fill-in-the-blank"],
  sessionQuota: { share: 1 / 6, matches: (q) => q.refs.topics.length > 0 },
  questionSchema: QuizQuestionSchema,
  responseSchema: QuizResponseSchema,
  isDirectional: (q) => q.type !== "fill-in-the-blank",
  questionPreview: (q) => q.type === "multiple-choice" ? q.de.prompt : q.type === "translation" ? q.de : q.prompt,
  async grade(question, response, direction, services) {
    const germanFirst = direction !== "en-de";
    if (question.type === "translation" && response.type === "translation") {
      if (!services) throw new Error("Translation grading is not configured.");
      const grade = await services.translation({ source: germanFirst ? question.de : question.en,
        reference: germanFirst ? question.en : question.de, answer: response.answer,
        targetLanguage: germanFirst ? "English" : "German" });
      return { ...grade, feedback: `${grade.feedback ?? ""}${question.explanation ? `\n${question.explanation}` : ""}` };
    }
    const expected = question.type === "multiple-choice"
      ? (germanFirst ? question.de : question.en).options[question.correctIndex]!
      : question.type === "translation" ? (germanFirst ? question.en : question.de) : question.answer;
    const correct = question.type === response.type && (question.type === "multiple-choice"
      ? response.type === "multiple-choice" && response.optionIndex === question.correctIndex
      : response.type !== "multiple-choice" && response.answer === expected);
    return { correct, score: correct ? 1 : 0, feedback: `Expected answer: ${expected}${question.explanation ? `\n${question.explanation}` : ""}` };
  },
};
