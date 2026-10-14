import type { FlashcardQuestion, FlashcardResponse } from "../../../shared";
import type { ClientMode } from "../types";
import { FlashcardView } from "./FlashcardView";

export const flashcardsClient: ClientMode<FlashcardQuestion, FlashcardResponse> = {
  id: "flashcards",
  allowBack: true,
  allowLists: true,
  QuestionView: FlashcardView,
};
