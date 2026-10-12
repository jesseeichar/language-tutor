import { z } from "zod";
import { QuestionBaseSchema } from "../content";
import type { UngradedMode } from "../mode";

export const FlashcardQuestionSchema = QuestionBaseSchema.extend({
  /** Shown first. Use \n for line breaks. */
  front: z.string().min(1),
  /** Shown after flipping. Use \n for line breaks. */
  back: z.string().min(1),
  /** Optional extra explanation shown under the back. */
  notes: z.string().optional(),
});
export type FlashcardQuestion = z.infer<typeof FlashcardQuestionSchema>;

export const FlashcardResponseSchema = z.object({
  revealed: z.literal(true),
});
export type FlashcardResponse = z.infer<typeof FlashcardResponseSchema>;

export const flashcardsMode: UngradedMode<FlashcardQuestion, FlashcardResponse> = {
  id: "flashcards",
  title: "Flashcards",
  description: "Study tool. Read the front, flip to check the back. Not graded.",
  graded: false,
  questionSchema: FlashcardQuestionSchema,
  responseSchema: FlashcardResponseSchema,
  defaultSessionSize: 20,
};
