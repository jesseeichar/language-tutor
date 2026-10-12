import { z } from "zod";
import { QuestionBaseSchema } from "../content";
import type { Direction, UngradedMode } from "../mode";

const text = z.string().min(1);

/**
 * A card is one of two shapes:
 *  - de + en: a translation card. It can be shown German-first or English-first.
 *  - front + back: a fixed card (fill in the blank, usage, word forms). Always front first.
 * Use \n for line breaks in any side.
 */
export const FlashcardQuestionSchema = QuestionBaseSchema.extend({
  de: text.optional(),
  en: text.optional(),
  front: text.optional(),
  back: text.optional(),
  /** Optional extra explanation shown under the answer. */
  notes: z.string().optional(),
}).refine(
  (c) => {
    const bilingual = c.de !== undefined && c.en !== undefined;
    const fixed = c.front !== undefined && c.back !== undefined;
    const mixed = (c.de ?? c.en) !== undefined && (c.front ?? c.back) !== undefined;
    return (bilingual || fixed) && !mixed;
  },
  { message: "a card needs either de + en (both directions) or front + back (fixed), not both" },
);
export type FlashcardQuestion = z.infer<typeof FlashcardQuestionSchema>;

export const FlashcardResponseSchema = z.object({
  revealed: z.literal(true),
});
export type FlashcardResponse = z.infer<typeof FlashcardResponseSchema>;

export interface CardSides {
  front: string;
  back: string;
  /** Set for translation cards; null for fixed cards. */
  direction: Direction | null;
}

/** What to show first and second. Translation cards follow the direction; fixed cards ignore it. */
export function cardSides(card: FlashcardQuestion, direction: Direction | null): CardSides {
  if (card.de !== undefined && card.en !== undefined) {
    const shown = direction ?? "de-en";
    return shown === "de-en"
      ? { front: card.de, back: card.en, direction: shown }
      : { front: card.en, back: card.de, direction: shown };
  }
  return { front: card.front ?? "", back: card.back ?? "", direction: null };
}

export const flashcardsMode: UngradedMode<FlashcardQuestion, FlashcardResponse> = {
  id: "flashcards",
  title: "Flashcards",
  description: "Study tool. Read the front, flip to check the back. Not graded.",
  graded: false,
  questionSchema: FlashcardQuestionSchema,
  responseSchema: FlashcardResponseSchema,
  defaultSessionSize: 20,
  isDirectional: (card) => card.de !== undefined,
};
