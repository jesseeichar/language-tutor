import { z } from "zod";
import { QuestionBaseSchema } from "../content";
import type { GradedMode, GradingServices } from "../mode";

const text = z.string().trim().min(1);
const itemBase = z.object({ id: text, prompt: text });
const itemSchema = z.discriminatedUnion("kind", [
  itemBase.extend({ kind: z.literal("choice"), options: z.array(z.object({ value: text, label: text })).min(2), answer: text }),
  itemBase.extend({ kind: z.literal("blank"), answers: z.array(text).min(1) }),
  itemBase.extend({ kind: z.literal("writing"), rubric: text, exampleAnswer: text.optional(), rows: z.number().int().min(1).max(12).default(3) }),
  itemBase.extend({ kind: z.literal("personal") }),
]);
export const WorksheetQuestionSchema = QuestionBaseSchema.extend({
  title: text, instructions: text, wordBank: z.array(text).optional(), example: text.optional(),
  items: z.array(itemSchema).min(1),
}).superRefine((question, ctx) => {
  if (new Set(question.items.map(i => i.id)).size !== question.items.length) ctx.addIssue({ code: "custom", message: "worksheet item ids must be unique" });
  for (const item of question.items) {
    if (item.kind === "choice" && (!item.options.some(o => o.value === item.answer) || new Set(item.options.map(o => o.value)).size !== item.options.length)) {
      ctx.addIssue({ code: "custom", message: `invalid options or answer for ${item.id}` });
    }
  }
});
export type WorksheetQuestion = z.infer<typeof WorksheetQuestionSchema>;
const responseSchema = z.strictObject({ answers: z.record(z.string(), z.union([
  z.string().max(10000), z.strictObject({ word: z.string().max(200), sentence: z.string().max(2000) }),
])) });

type WorksheetAnswer = z.infer<typeof responseSchema>["answers"][string];

async function gradeItem(question: WorksheetQuestion, item: WorksheetQuestion["items"][number], answer: WorksheetAnswer | undefined, services?: GradingServices) {
  if (item.kind === "personal") {
    const correct = typeof answer === "object" && !!answer.word.trim() && !!answer.sentence.trim();
    return { correct, feedback: correct ? "Completed (personal choice, not judged)." : "Enter both a word and your own sentence." };
  }
  if (typeof answer !== "string" || !answer.trim()) return { correct: false, feedback: "No answer supplied." };
  if (item.kind === "writing") {
    if (!services?.exercise) throw new Error("Worksheet writing assessment is not configured.");
    const grade = await services.exercise({ prompt: `${question.instructions}\n${item.prompt}`, rubric: item.rubric, answer });
    return { correct: grade.correct, feedback: `${grade.feedback ?? ""}${item.exampleAnswer ? `\nExample answer: ${item.exampleAnswer}` : ""}` };
  }
  const correct = item.kind === "choice" ? answer === item.answer : item.answers.some(expected => expected.toLocaleLowerCase("de") === answer.trim().toLocaleLowerCase("de"));
  const expected = item.kind === "choice" ? item.options.find(o => o.value === item.answer)!.label : item.answers.join(" / ");
  return { correct, feedback: `Answer: ${expected}` };
}

export const worksheetMode: GradedMode<WorksheetQuestion, z.infer<typeof responseSchema>> = {
  id: "worksheet", title: "Zeitlicher Ablauf & Verbindungswörter",
  description: "The complete worksheet: 10 exercises in order. Start immediately, with no setup. Writing is checked by Jev.",
  graded: true, defaultPoints: 1, defaultSessionSize: 10, fixedSession: true,
  questionSchema: WorksheetQuestionSchema, responseSchema,
  questionPreview: q => q.title,
  async grade(question, response, _direction, services) {
    const settled = await Promise.allSettled(question.items.map(item => gradeItem(question, item, response.answers[item.id], services)));
    // Keep the section pending until every request finishes, even if one provider call fails.
    const results = settled.map(result => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    const count = results.filter(r => r.correct).length;
    return { correct: count === results.length, score: count / results.length,
      feedback: results.map((result, i) => `${i + 1}. ${result.correct ? "Correct" : "Incorrect"} — ${result.feedback}`).join("\n\n") };
  },
};
